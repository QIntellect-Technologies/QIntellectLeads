import { Hono } from 'hono'

import { privateJson } from '../auth'
import type { AppContext } from '../env'
import { asText, listLeads } from '../lead-core'
import { NO_RESPONSE_CALL_RESULTS, addDaysISO, isCallDirection, isCallResult, normalizePhone, todayISO } from '../../shared/leads'
import type { CallRow, CallsData, DirectoryData, DirectoryRow } from '../../shared/types'

export const calls = new Hono<AppContext>()

const DATE = /^\d{4}-\d{2}-\d{2}$/
const NO_RESPONSE = new Set<string>(NO_RESPONSE_CALL_RESULTS)

calls.get('/calls', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const today = todayISO()
  const yesterday = addDaysISO(-1)
  const weekStart = addDaysISO(-((new Date().getDay() + 6) % 7))
  const when = c.req.query('when') ?? 'today'
  const date = c.req.query('date') ?? ''
  const resultFilter = c.req.query('result') ?? ''
  const directionFilter = c.req.query('direction') ?? ''
  const q = (c.req.query('q') ?? '').trim().toLowerCase()

  const leads = await listLeads(db, owner, 'l.owner_sub = ? AND l.archived = 0', [owner])
  const leadMap = new Map(leads.map((lead) => [lead.id, lead]))
  const rows = await db
    .prepare(
      `SELECT * FROM interactions
       WHERE owner_sub = ? AND channel = 'Call'
       ORDER BY interaction_date DESC, created_at DESC LIMIT 3000`,
    )
    .bind(owner)
    .all<Record<string, unknown>>()

  const all: CallRow[] = rows.results
    .map((row): CallRow | null => {
      const lead = leadMap.get(row.lead_id as string)
      if (!lead) return null
      const storedPhone = (row.phone_number as string | null) ?? null
      const phoneNumber = storedPhone ?? lead.contactPhone
      return {
        id: row.id as string,
        date: row.interaction_date as string,
        result: isCallResult(row.call_result) ? row.call_result : 'Unknown',
        direction: isCallDirection(row.call_direction) ? row.call_direction : 'Unknown',
        contactId: (row.contact_id as string | null) ?? null,
        contactName: (row.contact_name as string | null) ?? lead.contactName,
        phoneNumber,
        phoneInferred: !storedPhone && Boolean(lead.contactPhone),
        note: (row.note as string | null) ?? null,
        outcome: (row.outcome as string | null) ?? null,
        lead: {
          id: lead.id,
          code: lead.code,
          contactName: lead.contactName,
          contactPhone: lead.contactPhone,
          orgName: lead.orgName,
          orgType: lead.orgType,
          status: lead.status,
          nextFollowUp: lead.nextFollowUp,
        },
      }
    })
    .filter((row): row is CallRow => row !== null)

  let period = all
  if (DATE.test(date)) period = all.filter((row) => row.date.slice(0, 10) === date)
  else if (when === 'yesterday') period = all.filter((row) => row.date.slice(0, 10) === yesterday)
  else if (when === 'week') period = all.filter((row) => row.date.slice(0, 10) >= weekStart && row.date.slice(0, 10) <= today)
  else if (when === 'all') period = all
  else if (when === 'today') period = all.filter((row) => row.date.slice(0, 10) === today)

  const responded = period.filter((row) => row.result === 'Connected').length
  const noResponse = period.filter((row) => NO_RESPONSE.has(row.result)).length
  const counts = {
    calls: period.length,
    responded,
    noResponse,
    responseRate: responded + noResponse ? Math.round((responded / (responded + noResponse)) * 100) : 0,
    callbacks: period.filter((row) => row.result === 'Callback requested').length,
    wrongNumber: period.filter((row) => row.result === 'Wrong number').length,
    unknown: period.filter((row) => row.result === 'Unknown').length,
  }

  let items = period
  if (resultFilter === 'no_response') items = items.filter((row) => NO_RESPONSE.has(row.result))
  else if (isCallResult(resultFilter)) items = items.filter((row) => row.result === resultFilter)

  if (directionFilter === 'Unknown') items = items.filter((row) => row.direction === 'Unknown')
  else if (isCallDirection(directionFilter)) items = items.filter((row) => row.direction === directionFilter)

  if (q) {
    items = items.filter((row) =>
      [row.lead.code, row.lead.orgName, row.contactName, row.phoneNumber, row.note, row.outcome]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q),
    )
  }

  const body: CallsData = { items, counts }
  return privateJson(c, body)
})

calls.get('/calls/directory', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const q = (c.req.query('q') ?? '').trim().toLowerCase()
  const rows = await db
    .prepare(
      `SELECT c.id, c.full_name, c.phone_number, c.designation, c.contact_role,
         l.id AS lead_id, l.lead_code, l.status,
         o.organization_name, o.organization_type
       FROM lead_contacts c
       JOIN leads l ON l.id = c.lead_id AND l.owner_sub = c.owner_sub
       LEFT JOIN organizations o ON o.lead_id = l.id AND o.owner_sub = l.owner_sub
       WHERE c.owner_sub = ? AND l.archived = 0
         AND c.phone_number IS NOT NULL AND TRIM(c.phone_number) <> ''
       ORDER BY l.lead_code ASC, CASE c.contact_role WHEN 'Primary' THEN 0 ELSE 1 END, c.created_at ASC
       LIMIT 2000`,
    )
    .bind(owner)
    .all<Record<string, unknown>>()

  const items: DirectoryRow[] = rows.results
    .map((row) => ({
      id: row.id as string,
      personName: row.full_name as string,
      phone: row.phone_number as string,
      designation: (row.designation as string | null) ?? null,
      role: ((row.contact_role as string) === 'Primary' ? 'Primary' : 'Point of Contact') as DirectoryRow['role'],
      lead: {
        id: row.lead_id as string,
        code: row.lead_code as string,
        orgName: (row.organization_name as string | null) ?? null,
        orgType: (row.organization_type as string | null) ?? null,
        status: row.status as DirectoryRow['lead']['status'],
      },
    }))
    .filter((row) =>
      q
        ? [row.personName, row.phone, row.lead.code, row.lead.orgName, row.designation]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(q)
        : true,
    )

  const body: DirectoryData = { items }
  return privateJson(c, body)
})

calls.patch('/calls/:id', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const interactionId = c.req.param('id')
  const input = await c.req.json<{
    callResult?: string | null
    callDirection?: string | null
    contactName?: string | null
    phoneNumber?: string | null
    note?: string | null
  }>()

  const existing = await db
    .prepare(`SELECT id FROM interactions WHERE owner_sub = ? AND id = ? AND channel = 'Call'`)
    .bind(owner, interactionId)
    .first<{ id: string }>()
  if (!existing) return c.json({ error: 'Call not found.' }, 404)

  const updates: string[] = []
  const binds: unknown[] = []
  if (input.callResult !== undefined) {
    if (!isCallResult(input.callResult)) return c.json({ error: 'Unknown call result.' }, 400)
    updates.push('call_result = ?')
    binds.push(input.callResult)
  }
  if (input.callDirection !== undefined) {
    const direction = input.callDirection === 'Unknown' ? null : input.callDirection
    if (direction !== null && !isCallDirection(direction)) return c.json({ error: 'Unknown call direction.' }, 400)
    updates.push('call_direction = ?')
    binds.push(direction)
  }
  if (input.contactName !== undefined) {
    updates.push('contact_name = ?')
    binds.push(asText(input.contactName, 120))
  }
  if (input.phoneNumber !== undefined) {
    updates.push('phone_number = ?')
    binds.push(normalizePhone(input.phoneNumber))
  }
  if (input.note !== undefined) {
    updates.push('note = ?')
    binds.push(asText(input.note, 2000))
  }

  if (updates.length) {
    await db
      .prepare(`UPDATE interactions SET ${updates.join(', ')} WHERE owner_sub = ? AND id = ? AND channel = 'Call'`)
      .bind(...binds, owner, interactionId)
      .run()
  }
  return privateJson(c, { ok: true })
})
