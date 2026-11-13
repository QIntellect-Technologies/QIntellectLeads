import { Hono } from 'hono'

import { privateJson } from '../auth'
import type { AppContext } from '../env'
import { addInteraction, asText, findDuplicateLeads, nextLeadCode, upsertOrganization } from '../lead-core'
import { id, now } from '../db'
import { isCallDirection, isCallResult, normalizePhone } from '../../shared/leads'
import { isOutreachStatus, resultToStatus } from '../../shared/calling-list'
import type { CallingListCounts, CallingListData, CallingListDetail, OutreachCall, OutreachContact } from '../../shared/types'

export const callingList = new Hono<AppContext>()

type Row = Record<string, unknown>

function mapContact(row: Row): OutreachContact {
  return {
    id: row.id as string,
    phone: row.phone as string,
    personName: (row.person_name as string | null) ?? null,
    companyName: (row.company_name as string | null) ?? null,
    designation: (row.designation as string | null) ?? null,
    city: (row.city as string | null) ?? null,
    address: (row.address as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    sourceList: row.source_list as string,
    status: (row.status as string) ?? 'Not called',
    lastResult: (row.last_result as string | null) ?? null,
    lastCalledAt: row.last_called_at === null || row.last_called_at === undefined ? null : Number(row.last_called_at),
    notes: (row.notes as string | null) ?? null,
    convertedLeadId: (row.converted_lead_id as string | null) ?? null,
    convertedLeadCode: (row.converted_lead_code as string | null) ?? null,
    createdAt: Number(row.created_at ?? 0),
    updatedAt: Number(row.updated_at ?? 0),
  }
}

const CONTACT_SELECT = `
  SELECT oc.*, l.lead_code AS converted_lead_code
  FROM outreach_contacts oc
  LEFT JOIN leads l ON l.id = oc.converted_lead_id AND l.owner_sub = oc.owner_sub`

callingList.get('/calling-list', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const q = (c.req.query('q') ?? '').trim()
  const status = c.req.query('status') ?? ''
  const source = c.req.query('source') ?? ''
  const page = Math.max(0, Number(c.req.query('page') ?? 0))
  const pageSize = Math.min(100, Math.max(10, Number(c.req.query('pageSize') ?? 50)))

  const where = ['oc.owner_sub = ?']
  const binds: unknown[] = [owner]

  if (status === 'Called') {
    where.push('oc.last_called_at IS NOT NULL')
  } else if (isOutreachStatus(status)) {
    where.push('oc.status = ?')
    binds.push(status)
  }
  if (source) {
    where.push('oc.source_list LIKE ?')
    binds.push(`%${source}%`)
  }
  if (q) {
    const like = `%${q.toLowerCase()}%`
    const digits = q.replace(/\D/g, '')
    where.push(
      `(lower(COALESCE(oc.person_name, '')) LIKE ?
        OR lower(COALESCE(oc.company_name, '')) LIKE ?
        OR lower(COALESCE(oc.city, '')) LIKE ?
        OR lower(COALESCE(oc.email, '')) LIKE ?
        OR lower(COALESCE(oc.address, '')) LIKE ?
        OR lower(oc.source_list) LIKE ?
        OR oc.phone_key LIKE ?)`,
    )
    binds.push(like, like, like, like, like, like, `%${digits}%`)
  }
  const clause = where.join(' AND ')

  const [countsRow, totalRow, sourceRows, itemRows] = await db.batch([
    db
      .prepare(
        `SELECT COUNT(*) AS total,
           SUM(CASE WHEN status = 'Not called' THEN 1 ELSE 0 END) AS not_called,
           SUM(CASE WHEN last_called_at IS NOT NULL THEN 1 ELSE 0 END) AS called,
           SUM(CASE WHEN status = 'Interested' THEN 1 ELSE 0 END) AS interested,
           SUM(CASE WHEN status = 'Not interested' THEN 1 ELSE 0 END) AS not_interested,
           SUM(CASE WHEN status = 'Converted' THEN 1 ELSE 0 END) AS converted,
           SUM(CASE WHEN status = 'Wrong number' THEN 1 ELSE 0 END) AS wrong_number,
           SUM(CASE WHEN status = 'Callback' THEN 1 ELSE 0 END) AS callback
         FROM outreach_contacts WHERE owner_sub = ?`,
      )
      .bind(owner),
    db.prepare(`SELECT COUNT(*) AS total FROM outreach_contacts oc WHERE ${clause}`).bind(...binds),
    db.prepare(`SELECT source_list FROM outreach_contacts WHERE owner_sub = ?`).bind(owner),
    db
      .prepare(
        `${CONTACT_SELECT} WHERE ${clause}
         ORDER BY CASE WHEN oc.status = 'Not called' THEN 0 ELSE 1 END,
           COALESCE(oc.last_called_at, 0) DESC,
           COALESCE(oc.company_name, oc.person_name, oc.phone) COLLATE NOCASE ASC,
           oc.id ASC
         LIMIT ? OFFSET ?`,
      )
      .bind(...binds, pageSize, page * pageSize),
  ])

  const rawCounts = (countsRow.results[0] ?? {}) as Row
  const counts: CallingListCounts = {
    total: Number(rawCounts.total ?? 0),
    notCalled: Number(rawCounts.not_called ?? 0),
    called: Number(rawCounts.called ?? 0),
    interested: Number(rawCounts.interested ?? 0),
    notInterested: Number(rawCounts.not_interested ?? 0),
    converted: Number(rawCounts.converted ?? 0),
    wrongNumber: Number(rawCounts.wrong_number ?? 0),
    callback: Number(rawCounts.callback ?? 0),
  }

  // One number can exist on several sheets, so source_list holds every list it
  // came from. Split those back out for the filter, with a count per list.
  const sourceCounts = new Map<string, number>()
  for (const row of sourceRows.results as Row[]) {
    for (const name of String(row.source_list ?? '').split(', ')) {
      if (name) sourceCounts.set(name, (sourceCounts.get(name) ?? 0) + 1)
    }
  }
  const sources = [...sourceCounts.entries()]
    .map(([name, count]) => ({ source: name, count }))
    .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source))

  const body: CallingListData = {
    items: (itemRows.results as Row[]).map(mapContact),
    total: Number((totalRow.results[0] as Row | undefined)?.total ?? 0),
    page,
    pageSize,
    counts,
    sources,
  }
  return privateJson(c, body)
})

callingList.get('/calling-list/:id', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const contactId = c.req.param('id')
  const row = await db.prepare(`${CONTACT_SELECT} WHERE oc.owner_sub = ? AND oc.id = ?`).bind(owner, contactId).first()
  if (!row) return c.json({ error: 'Number not found.' }, 404)
  const callRows = await db
    .prepare(`SELECT * FROM outreach_calls WHERE owner_sub = ? AND contact_id = ? ORDER BY called_at DESC LIMIT 100`)
    .bind(owner, contactId)
    .all<Row>()
  const calls: OutreachCall[] = (callRows.results as Row[]).map((call) => ({
    id: call.id as string,
    contactId: call.contact_id as string,
    calledAt: Number(call.called_at),
    result: call.result as OutreachCall['result'],
    direction: (call.direction as OutreachCall['direction']) ?? null,
    note: (call.note as string | null) ?? null,
    createdAt: Number(call.created_at),
  }))
  const body: CallingListDetail = { contact: mapContact(row as Row), calls }
  return privateJson(c, body)
})

callingList.post('/calling-list/:id/calls', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const contactId = c.req.param('id')
  const input = await c.req.json<{ result?: unknown; direction?: unknown; note?: unknown }>()

  if (!isCallResult(input.result)) return c.json({ error: 'Choose a call result.' }, 400)
  const direction = input.direction === null || input.direction === undefined || input.direction === '' ? 'Outbound' : input.direction
  if (!isCallDirection(direction)) return c.json({ error: 'Unknown call direction.' }, 400)

  const existing = await db
    .prepare(`SELECT id, status FROM outreach_contacts WHERE owner_sub = ? AND id = ?`)
    .bind(owner, contactId)
    .first<{ id: string; status: string }>()
  if (!existing) return c.json({ error: 'Number not found.' }, 404)

  const t = now()
  await db
    .prepare(
      `INSERT INTO outreach_calls (id, owner_sub, contact_id, called_at, result, direction, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id(), owner, contactId, t, input.result, direction, asText(input.note, 2000), t)
    .run()

  // A converted number keeps its Converted status: the lead is the record of
  // truth from then on, and logging another call should not undo that.
  const nextStatus = existing.status === 'Converted' ? 'Converted' : resultToStatus(input.result)
  await db
    .prepare(
      `UPDATE outreach_contacts
       SET status = COALESCE(?, status), last_result = ?, last_called_at = ?, updated_at = ?
       WHERE owner_sub = ? AND id = ?`,
    )
    .bind(nextStatus, input.result, t, t, owner, contactId)
    .run()

  return privateJson(c, { ok: true })
})

callingList.patch('/calling-list/:id', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const contactId = c.req.param('id')
  const input = await c.req.json<{ status?: unknown; notes?: unknown; personName?: unknown; companyName?: unknown; city?: unknown; email?: unknown }>()

  const updates: string[] = []
  const binds: unknown[] = []
  if (input.status !== undefined) {
    if (!isOutreachStatus(input.status)) return c.json({ error: 'Unknown status.' }, 400)
    updates.push('status = ?')
    binds.push(input.status)
  }
  if (input.notes !== undefined) {
    updates.push('notes = ?')
    binds.push(asText(input.notes, 2000))
  }
  if (input.personName !== undefined) {
    updates.push('person_name = ?')
    binds.push(asText(input.personName, 120))
  }
  if (input.companyName !== undefined) {
    updates.push('company_name = ?')
    binds.push(asText(input.companyName, 160))
  }
  if (input.city !== undefined) {
    updates.push('city = ?')
    binds.push(asText(input.city, 80))
  }
  if (input.email !== undefined) {
    updates.push('email = ?')
    binds.push(asText(input.email, 160))
  }
  if (!updates.length) return c.json({ error: 'Nothing to update.' }, 400)

  const result = await db
    .prepare(`UPDATE outreach_contacts SET ${updates.join(', ')}, updated_at = ? WHERE owner_sub = ? AND id = ?`)
    .bind(...binds, now(), owner, contactId)
    .run()
  if (!result.meta.changes) return c.json({ error: 'Number not found.' }, 404)
  return privateJson(c, { ok: true })
})

callingList.post('/calling-list/:id/convert', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const contactId = c.req.param('id')
  const row = await db
    .prepare(
      `SELECT oc.*, l.lead_code AS converted_lead_code
       FROM outreach_contacts oc
       LEFT JOIN leads l ON l.id = oc.converted_lead_id AND l.owner_sub = oc.owner_sub
       WHERE oc.owner_sub = ? AND oc.id = ?`,
    )
    .bind(owner, contactId)
    .first<Row>()
  if (!row) return c.json({ error: 'Number not found.' }, 404)

  if (row.converted_lead_id) {
    return privateJson(c, {
      leadId: row.converted_lead_id as string,
      code: (row.converted_lead_code as string | null) ?? '',
      existing: true,
    })
  }

  const phone = normalizePhone(row.phone as string)
  if (!phone) return c.json({ error: 'This number cannot be converted.' }, 400)
  const personName = asText(row.person_name, 120)
  const companyName = asText(row.company_name, 160)
  const fullName = personName ?? companyName ?? phone

  // The number may already be a lead. Link to it instead of creating a
  // duplicate, which keeps both lists pointing at one history.
  const duplicates = await findDuplicateLeads(db, owner, phone)
  let leadId: string
  let code: string
  const t = now()

  if (duplicates.length) {
    leadId = duplicates[0].id
    code = duplicates[0].code
  } else {
    leadId = id()
    code = await nextLeadCode(db, owner)
    const createdDate = new Date(t).toISOString().slice(0, 10)
    await db
      .prepare(
        `INSERT INTO leads (id, owner_sub, lead_code, created_date, lead_source, product_interest, status, priority_score, assigned_to, b2b, archived, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'Cold Call', 'AI Attendance System', 'new', 0, ?, 1, 0, ?, ?)`,
      )
      .bind(leadId, owner, code, createdDate, c.get('user').name ?? null, t, t)
      .run()
    await db
      .prepare(
        `INSERT INTO lead_contacts (id, owner_sub, lead_id, full_name, phone_number, designation, contact_role, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'Primary', ?)`,
      )
      .bind(id(), owner, leadId, fullName, phone, asText(row.designation, 80), t)
      .run()
    await upsertOrganization(db, owner, leadId, {
      name: companyName,
      type: null,
      city: asText(row.city, 80),
    })
    await addInteraction(db, owner, leadId, {
      channel: 'System',
      outcome: 'Lead created',
      note: `Converted from the calling list (${row.source_list as string}).`,
      statusAfter: 'new',
    })
  }

  await db
    .prepare(`UPDATE outreach_contacts SET status = 'Converted', converted_lead_id = ?, updated_at = ? WHERE owner_sub = ? AND id = ?`)
    .bind(leadId, t, owner, contactId)
    .run()

  return privateJson(c, { leadId, code, existing: duplicates.length > 0 })
})
