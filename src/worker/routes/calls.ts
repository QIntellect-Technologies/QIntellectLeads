import { Hono } from 'hono'

import { privateJson } from '../auth'
import type { AppContext } from '../env'
import { listLeads } from '../lead-core'
import { NO_RESPONSE_CALL_RESULTS, addDaysISO, isCallResult, todayISO } from '../../shared/leads'
import type { CallRow, CallsData } from '../../shared/types'

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
