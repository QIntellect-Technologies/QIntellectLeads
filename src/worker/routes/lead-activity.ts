import { Hono } from 'hono'

import { privateJson } from '../auth'
import { applyCadence } from '../cadence'
import { id, now } from '../db'
import type { AppContext } from '../env'
import { LeadRuleError, addInteraction, applyStatusChange, asText, findDuplicateLeads, listLeads, normalizeStatusInput, refreshPriority } from '../lead-core'
import { loadCadence } from '../settings'
import { CHANNELS, MEETING_STATUSES, MEETING_TYPES, addDaysISO, isCallDirection, isCallResult, isClosedStatus, normalizePhone, todayISO } from '../../shared/leads'
import type { FollowUpRow, MeetingRow } from '../../shared/types'

export const leadActivity = new Hono<AppContext>()

const DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d/

async function leadExists(db: D1Database, owner: string, leadId: string): Promise<boolean> {
  const row = await db.prepare(`SELECT id FROM leads WHERE owner_sub = ? AND id = ?`).bind(owner, leadId).first()
  return Boolean(row)
}

// Interactions --------------------------------------------------------------

leadActivity.post('/leads/:id/interactions', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const leadId = c.req.param('id')
  const input = await c.req.json<{ channel?: string; outcome?: string | null; note?: string | null; status?: string; lossReason?: string | null; nextFollowUpDate?: string | null; nextFollowUpTime?: string | null; followUpId?: string | null; callResult?: string | null; callDirection?: string | null; contactId?: string | null; contactName?: string | null; phoneNumber?: string | null }>()
  if (!(await leadExists(db, owner, leadId))) return c.json({ error: 'Not found.' }, 404)
  const channel = CHANNELS.includes(input.channel as never) ? (input.channel as string) : null
  if (!channel) return c.json({ error: 'Choose a channel.' }, 400)
  const note = asText(input.note, 2000)
  const callResult = channel === 'Call' && isCallResult(input.callResult) && input.callResult !== 'Unknown' ? input.callResult : null
  if (channel === 'Call' && !callResult) return c.json({ error: 'Choose a call result.' }, 400)
  const callDirection = channel === 'Call' ? (isCallDirection(input.callDirection) ? input.callDirection : 'Outbound') : null
  const outcome = asText(input.outcome, 200) ?? callResult
  if (!note && !outcome) return c.json({ error: 'Add a note or an outcome.' }, 400)

  const nextStatus = input.status === undefined ? null : normalizeStatusInput(input.status)
  if (input.status !== undefined && !nextStatus) return c.json({ error: 'Unknown status.' }, 400)

  const existing = await db.prepare(`SELECT status FROM leads WHERE owner_sub = ? AND id = ?`).bind(owner, leadId).first<{ status: string }>()
  if (!existing) return c.json({ error: 'Not found.' }, 404)

  let contactId: string | null = null
  let contactName: string | null = null
  let phoneNumber: string | null = null
  if (channel === 'Call') {
    phoneNumber = normalizePhone(input.phoneNumber)
    contactName = asText(input.contactName, 120)
    if (input.contactId) {
      const contact = await db
        .prepare(`SELECT id, full_name, phone_number FROM lead_contacts WHERE owner_sub = ? AND lead_id = ? AND id = ?`)
        .bind(owner, leadId, input.contactId)
        .first<{ id: string; full_name: string; phone_number: string | null }>()
      if (!contact) return c.json({ error: 'Contact not found.' }, 404)
      contactId = contact.id
      contactName = contact.full_name
      phoneNumber = phoneNumber ?? contact.phone_number
    }
  }

  try {
    if (nextStatus && nextStatus !== existing.status) {
      await applyStatusChange(db, owner, leadId, nextStatus, { channel, lossReason: asText(input.lossReason, 120), recordInteraction: false })
      if (nextStatus === 'proposal_sent') {
        const cadence = await loadCadence(db, owner, c.env)
        await applyCadence(db, owner, leadId, 'proposal', todayISO(), cadence)
      }
    }
    await addInteraction(db, owner, leadId, { channel, outcome, note, statusAfter: nextStatus ?? existing.status, callResult, callDirection, contactId, contactName, phoneNumber })

    const closed = isClosedStatus((nextStatus ?? existing.status) as never)
    let followUpId: string | null = null
    if (!closed) {
      // Default is +2 days, per the follow-up rule.
      const dueDate = input.nextFollowUpDate === undefined ? addDaysISO(2) : input.nextFollowUpDate
      if (dueDate && DATE.test(dueDate)) {
        const dueTime = asText(input.nextFollowUpTime, 5)
        followUpId = id()
        await db
          .prepare(`INSERT INTO follow_ups (id, owner_sub, lead_id, due_date, due_time, creation_mode, is_completed, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)`)
          .bind(followUpId, owner, leadId, dueDate, dueTime && TIME.test(dueTime) ? dueTime : null, input.nextFollowUpDate === undefined ? 'Auto' : 'Manual', now())
          .run()
      }
    }
    if (input.followUpId) {
      await db
        .prepare(
          `UPDATE follow_ups SET is_completed = 1, completed_on = ?, completed_at = ?
           WHERE owner_sub = ? AND lead_id = ? AND id = ? AND is_completed = 0`,
        )
        .bind(todayISO(), now(), owner, leadId, input.followUpId)
        .run()
    }
    await refreshPriority(db, owner, leadId)
    return privateJson(c, { ok: true, followUpId }, 201)
  } catch (error) {
    if (error instanceof LeadRuleError) return c.json({ error: error.message }, 400)
    throw error
  }
})

leadActivity.delete('/interactions/:id', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const row = await db.prepare(`SELECT lead_id, channel FROM interactions WHERE owner_sub = ? AND id = ?`).bind(owner, c.req.param('id')).first<{ lead_id: string; channel: string }>()
  if (!row) return c.json({ error: 'Not found.' }, 404)
  if (row.channel === 'System') return c.json({ error: 'Status history cannot be deleted.' }, 400)
  await db.prepare(`DELETE FROM interactions WHERE owner_sub = ? AND id = ?`).bind(owner, c.req.param('id')).run()
  await refreshPriority(db, owner, row.lead_id)
  return privateJson(c, { ok: true })
})

// Follow-ups ----------------------------------------------------------------

leadActivity.post('/leads/:id/follow-ups', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const leadId = c.req.param('id')
  if (!(await leadExists(db, owner, leadId))) return c.json({ error: 'Not found.' }, 404)
  const input = await c.req.json<{ dueDate?: string; dueTime?: string | null }>()
  if (!input.dueDate || !DATE.test(input.dueDate)) return c.json({ error: 'Pick a follow-up date.' }, 400)
  const followUpId = id()
  const dueTime = asText(input.dueTime, 5)
  await db
    .prepare(`INSERT INTO follow_ups (id, owner_sub, lead_id, due_date, due_time, creation_mode, is_completed, created_at) VALUES (?, ?, ?, ?, ?, 'Manual', 0, ?)`)
    .bind(followUpId, owner, leadId, input.dueDate, dueTime && TIME.test(dueTime) ? dueTime : null, now())
    .run()
  await refreshPriority(db, owner, leadId)
  return privateJson(c, { ok: true, followUpId }, 201)
})

leadActivity.patch('/follow-ups/:id', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const followUpId = c.req.param('id')
  const existing = await db.prepare(`SELECT * FROM follow_ups WHERE owner_sub = ? AND id = ?`).bind(owner, followUpId).first<Record<string, unknown>>()
  if (!existing) return c.json({ error: 'Not found.' }, 404)
  const input = await c.req.json<{
    isCompleted?: boolean
    dueDate?: string
    dueTime?: string | null
    nextStepDate?: string
    nextStepTime?: string | null
    rescheduleReason?: string | null
  }>()
  const completed = input.isCompleted === undefined ? Number(existing.is_completed) : input.isCompleted ? 1 : 0
  const dueDate = input.dueDate && DATE.test(input.dueDate) ? input.dueDate : (existing.due_date as string)
  const dueTime = input.dueTime === undefined ? (existing.due_time as string | null) : asText(input.dueTime, 5)
  const lead = await db.prepare(`SELECT status FROM leads WHERE owner_sub = ? AND id = ?`).bind(owner, existing.lead_id as string).first<{ status: string }>()
  const leadOpen = lead ? lead.status !== 'won' && lead.status !== 'lost' : false

  if (completed && !Number(existing.is_completed)) {
    if (leadOpen && !(input.nextStepDate && DATE.test(input.nextStepDate))) {
      return c.json(
        { error: 'Choose the next step before completing this follow-up. Closing the lead won or lost is the only exception.' },
        400,
      )
    }
    if (input.nextStepDate && input.nextStepDate < todayISO()) {
      return c.json({ error: 'The next step cannot be in the past.' }, 400)
    }
  }

  const rescheduling = input.dueDate && input.dueDate !== existing.due_date
  await db
    .prepare(
      `UPDATE follow_ups SET is_completed = ?, due_date = ?, due_time = ?,
         completed_on = CASE WHEN ? = 1 THEN COALESCE(completed_on, ?) ELSE NULL END,
         completed_at = CASE WHEN ? = 1 THEN COALESCE(completed_at, ?) ELSE NULL END,
         reschedule_reason = CASE WHEN ? = 1 THEN ? ELSE reschedule_reason END,
         rescheduled_at = CASE WHEN ? = 1 THEN ? ELSE rescheduled_at END,
         rescheduled_count = CASE WHEN ? = 1 THEN rescheduled_count + 1 ELSE rescheduled_count END
       WHERE owner_sub = ? AND id = ?`,
    )
    .bind(
      completed,
      dueDate,
      dueTime && TIME.test(dueTime) ? dueTime : null,
      completed,
      todayISO(),
      completed,
      now(),
      rescheduling ? 1 : 0,
      asText(input.rescheduleReason, 240),
      rescheduling ? 1 : 0,
      now(),
      rescheduling ? 1 : 0,
      owner,
      followUpId,
    )
    .run()

  let nextFollowUpId: string | null = null
  if (completed && input.nextStepDate && DATE.test(input.nextStepDate)) {
    nextFollowUpId = id()
    const nextTime = asText(input.nextStepTime, 5)
    await db
      .prepare(`INSERT INTO follow_ups (id, owner_sub, lead_id, due_date, due_time, creation_mode, is_completed, created_at) VALUES (?, ?, ?, ?, ?, 'Manual', 0, ?)`)
      .bind(nextFollowUpId, owner, existing.lead_id as string, input.nextStepDate, nextTime && TIME.test(nextTime) ? nextTime : null, now())
      .run()
  }
  await refreshPriority(db, owner, existing.lead_id as string)
  return privateJson(c, { ok: true, nextFollowUpId })
})

// Completing a follow-up must always leave a next step for an open lead. The
// dialog uses this endpoint; the PATCH above keeps older clients honest too.
leadActivity.post('/follow-ups/:id/complete', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const followUpId = c.req.param('id')
  const existing = await db
    .prepare(
      `SELECT f.*, l.status AS lead_status FROM follow_ups f JOIN leads l ON l.id = f.lead_id AND l.owner_sub = f.owner_sub
       WHERE f.owner_sub = ? AND f.id = ?`,
    )
    .bind(owner, followUpId)
    .first<Record<string, unknown>>()
  if (!existing) return c.json({ error: 'Not found.' }, 404)
  if (Number(existing.is_completed)) return privateJson(c, { ok: true, alreadyCompleted: true })

  const input = await c.req.json<{
    outcome?: string | null
    note?: string | null
    channel?: string | null
    nextStepDate?: string | null
    nextStepTime?: string | null
    nextStepNote?: string | null
    status?: string | null
    lossReason?: string | null
    postponeTo?: string | null
    postponeReason?: string | null
    callResult?: string | null
    callDirection?: string | null
  }>()
  const leadId = existing.lead_id as string
  const today = todayISO()
  const channel = CHANNELS.includes(input.channel as never) ? (input.channel as string) : 'Call'
  const callResult = channel === 'Call' && isCallResult(input.callResult) && input.callResult !== 'Unknown' ? input.callResult : null
  const callDirection = channel === 'Call' ? (isCallDirection(input.callDirection) ? input.callDirection : 'Outbound') : null

  // Postponing is a reschedule with a reason, not a completed touch.
  if (input.postponeTo) {
    if (!DATE.test(input.postponeTo)) return c.json({ error: 'Pick a valid postponed date.' }, 400)
    if (input.postponeTo < today) return c.json({ error: 'A postponed date cannot be in the past.' }, 400)
    const reason = asText(input.postponeReason, 240)
    if (!reason) return c.json({ error: 'Add a reason for postponing this follow-up.' }, 400)
    await db
      .prepare(
        `UPDATE follow_ups SET due_date = ?, due_time = ?, reschedule_reason = ?, rescheduled_at = ?, rescheduled_count = rescheduled_count + 1
         WHERE owner_sub = ? AND id = ?`,
      )
      .bind(input.postponeTo, asText(input.nextStepTime, 5), reason, now(), owner, followUpId)
      .run()
    await addInteraction(db, owner, leadId, {
      channel,
      outcome: 'Follow-up postponed',
      note: asText(input.note, 2000) ?? `Postponed to ${input.postponeTo}: ${reason}`,
      callResult,
      callDirection,
    })
    await refreshPriority(db, owner, leadId)
    return privateJson(c, { ok: true, postponedTo: input.postponeTo })
  }

  const closing = input.status === 'won' || input.status === 'lost'
  if (closing && input.status === 'lost' && !asText(input.lossReason, 120)) {
    return c.json({ error: 'Add a loss reason before closing this lead.' }, 400)
  }
  if (!closing && input.status !== undefined && input.status !== null && input.status !== '') {
    return c.json({ error: 'Only won or lost can be selected while completing a follow-up.' }, 400)
  }

  const leadWasOpen = existing.lead_status !== 'won' && existing.lead_status !== 'lost'
  const nextDate = asText(input.nextStepDate, 10)
  if (leadWasOpen && !closing) {
    if (!nextDate || !DATE.test(nextDate)) return c.json({ error: 'Choose the next step date before completing.' }, 400)
    if (nextDate < today) return c.json({ error: 'The next step cannot be in the past.' }, 400)
  }

  await db
    .prepare(`UPDATE follow_ups SET is_completed = 1, completed_on = ?, completed_at = ? WHERE owner_sub = ? AND id = ?`)
    .bind(today, now(), owner, followUpId)
    .run()

  if (closing) {
    try {
      await applyStatusChange(db, owner, leadId, input.status as 'won' | 'lost', {
        channel,
        lossReason: asText(input.lossReason, 120),
        note: asText(input.note, 2000) ?? undefined,
        recordInteraction: false,
      })
    } catch (error) {
      if (error instanceof LeadRuleError) return c.json({ error: error.message }, 400)
      throw error
    }
  }

  const noteParts = [asText(input.note, 2000), asText(input.nextStepNote, 300)].filter(Boolean)
  await addInteraction(db, owner, leadId, {
    channel,
    outcome: asText(input.outcome, 200) ?? (closing ? `Lead closed ${input.status}` : 'Follow-up completed'),
    note: noteParts.length ? noteParts.join(' · ') : null,
    statusAfter: closing ? input.status : null,
    callResult,
    callDirection,
  })

  let nextFollowUpId: string | null = null
  if (!closing && leadWasOpen && nextDate) {
    nextFollowUpId = id()
    const nextTime = asText(input.nextStepTime, 5)
    await db
      .prepare(`INSERT INTO follow_ups (id, owner_sub, lead_id, due_date, due_time, creation_mode, is_completed, created_at) VALUES (?, ?, ?, ?, ?, 'Manual', 0, ?)`)
      .bind(nextFollowUpId, owner, leadId, nextDate, nextTime && TIME.test(nextTime) ? nextTime : null, now())
      .run()
  }
  await refreshPriority(db, owner, leadId)
  return privateJson(c, { ok: true, nextFollowUpId })
})

leadActivity.post('/follow-ups/bulk-reschedule', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const input = await c.req.json<{ ids?: string[]; dueDate?: string; dueTime?: string | null; reason?: string | null }>()
  const ids = Array.isArray(input.ids) ? [...new Set(input.ids.filter((item) => typeof item === 'string'))].slice(0, 200) : []
  if (!ids.length) return c.json({ error: 'Select at least one follow-up.' }, 400)
  if (!input.dueDate || !DATE.test(input.dueDate)) return c.json({ error: 'Pick a valid new date.' }, 400)
  if (input.dueDate < todayISO()) return c.json({ error: 'The new date cannot be in the past.' }, 400)
  const reason = asText(input.reason, 240)
  if (!reason) return c.json({ error: 'Add a reason for moving these follow-ups.' }, 400)
  const dueTime = asText(input.dueTime, 5)
  let changed = 0
  for (const followUpId of ids) {
    const row = await db
      .prepare(`SELECT lead_id FROM follow_ups WHERE owner_sub = ? AND id = ? AND is_completed = 0`)
      .bind(owner, followUpId)
      .first<{ lead_id: string }>()
    if (!row) continue
    await db
      .prepare(
        `UPDATE follow_ups SET due_date = ?, due_time = ?, reschedule_reason = ?, rescheduled_at = ?, rescheduled_count = rescheduled_count + 1
         WHERE owner_sub = ? AND id = ? AND is_completed = 0`,
      )
      .bind(input.dueDate, dueTime && TIME.test(dueTime) ? dueTime : null, reason, now(), owner, followUpId)
      .run()
    await addInteraction(db, owner, row.lead_id, {
      channel: 'System',
      outcome: 'Follow-up rescheduled',
      note: `Moved to ${input.dueDate}: ${reason}`,
    })
    changed += 1
  }
  return privateJson(c, { ok: true, changed })
})

leadActivity.delete('/follow-ups/:id', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const row = await db.prepare(`SELECT lead_id FROM follow_ups WHERE owner_sub = ? AND id = ?`).bind(owner, c.req.param('id')).first<{ lead_id: string }>()
  if (!row) return c.json({ error: 'Not found.' }, 404)
  await db.prepare(`DELETE FROM follow_ups WHERE owner_sub = ? AND id = ?`).bind(owner, c.req.param('id')).run()
  await refreshPriority(db, owner, row.lead_id)
  return privateJson(c, { ok: true })
})

leadActivity.get('/follow-ups', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const today = todayISO()
  const yesterday = addDaysISO(-1)
  const tomorrow = addDaysISO(1)
  const when = c.req.query('when') ?? 'pending'
  const date = c.req.query('date') ?? ''
  const q = (c.req.query('q') ?? '').trim().toLowerCase()
  const leads = await listLeads(db, owner, 'l.owner_sub = ? AND l.archived = 0', [owner])
  const leadMap = new Map(leads.map((lead) => [lead.id, lead]))
  const rows = await db
    .prepare(
      `SELECT f.* FROM follow_ups f JOIN leads l ON l.id = f.lead_id AND l.owner_sub = f.owner_sub
       WHERE f.owner_sub = ? AND l.archived = 0 ORDER BY f.due_date ASC, COALESCE(f.due_time, '') ASC LIMIT 2000`,
    )
    .bind(owner)
    .all<Record<string, unknown>>()

  const all: FollowUpRow[] = rows.results
    .map((row): FollowUpRow | null => {
      const lead = leadMap.get(row.lead_id as string)
      if (!lead) return null
      return {
        lead,
        followUp: {
          id: row.id as string,
          dueDate: row.due_date as string,
          dueTime: (row.due_time as string | null) ?? null,
          mode: (row.creation_mode as 'Auto' | 'Manual' | 'Cadence') ?? 'Manual',
          completed: Boolean(Number(row.is_completed ?? 0)),
          completedOn: (row.completed_on as string | null) ?? null,
          rescheduleReason: (row.reschedule_reason as string | null) ?? null,
          createdAt: Number(row.created_at ?? 0),
        },
      }
    })
    .filter((row): row is FollowUpRow => row !== null)

  const open = all.filter((row) => !row.followUp.completed)
  const counts = {
    total: all.length,
    pending: open.length,
    overdue: open.filter((row) => row.followUp.dueDate < today).length,
    today: open.filter((row) => row.followUp.dueDate === today).length,
    yesterday: all.filter((row) => row.followUp.dueDate === yesterday).length,
    tomorrow: open.filter((row) => row.followUp.dueDate === tomorrow).length,
    upcoming: open.filter((row) => row.followUp.dueDate > today).length,
    previous: all.filter((row) => row.followUp.dueDate < today).length,
    completed: all.length - open.length,
  }

  let items = all
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) items = all.filter((row) => row.followUp.dueDate === date)
  else if (when === 'pending') items = open
  else if (when === 'overdue') items = open.filter((row) => row.followUp.dueDate < today)
  else if (when === 'today') items = open.filter((row) => row.followUp.dueDate === today)
  else if (when === 'yesterday') items = all.filter((row) => row.followUp.dueDate === yesterday)
  else if (when === 'tomorrow') items = open.filter((row) => row.followUp.dueDate === tomorrow)
  else if (when === 'upcoming') items = open.filter((row) => row.followUp.dueDate > today)
  else if (when === 'previous') items = all.filter((row) => row.followUp.dueDate < today)
  else if (when === 'completed') items = all.filter((row) => row.followUp.completed)

  if (q) {
    items = items.filter((row) =>
      [row.lead.code, row.lead.contactName, row.lead.orgName, row.lead.contactPhone]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q),
    )
  }
  if (when === 'completed' || date) items = [...items].sort((a, b) => b.followUp.dueDate.localeCompare(a.followUp.dueDate))

  return privateJson(c, { items, counts })
})

// Meetings ------------------------------------------------------------------

leadActivity.post('/leads/:id/meetings', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const leadId = c.req.param('id')
  if (!(await leadExists(db, owner, leadId))) return c.json({ error: 'Not found.' }, 404)
  const input = await c.req.json<{ scheduledAt?: string; meetingType?: string; meetingStatus?: string; meetingNotes?: string | null }>()
  if (!input.scheduledAt || !DATE_TIME.test(input.scheduledAt)) return c.json({ error: 'Pick a date and time.' }, 400)
  const meetingType = MEETING_TYPES.includes(input.meetingType as never) ? (input.meetingType as string) : 'Call'
  const meetingStatus = MEETING_STATUSES.includes(input.meetingStatus as never) ? (input.meetingStatus as string) : 'Scheduled'
  const meetingId = id()
  await db
    .prepare(`INSERT INTO meetings (id, owner_sub, lead_id, scheduled_at, meeting_type, meeting_status, meeting_notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(meetingId, owner, leadId, input.scheduledAt, meetingType, meetingStatus, asText(input.meetingNotes, 2000), now())
    .run()
  return privateJson(c, { ok: true, meetingId }, 201)
})

leadActivity.patch('/meetings/:id', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const meetingId = c.req.param('id')
  const existing = await db.prepare(`SELECT * FROM meetings WHERE owner_sub = ? AND id = ?`).bind(owner, meetingId).first<Record<string, unknown>>()
  if (!existing) return c.json({ error: 'Not found.' }, 404)
  const input = await c.req.json<{ scheduledAt?: string; meetingType?: string; meetingStatus?: string; meetingNotes?: string | null }>()
  const scheduledAt = input.scheduledAt && DATE_TIME.test(input.scheduledAt) ? input.scheduledAt : (existing.scheduled_at as string)
  const meetingType = MEETING_TYPES.includes(input.meetingType as never) ? (input.meetingType as string) : (existing.meeting_type as string)
  const meetingStatus = MEETING_STATUSES.includes(input.meetingStatus as never) ? (input.meetingStatus as string) : (existing.meeting_status as string)
  const notes = input.meetingNotes === undefined ? (existing.meeting_notes as string | null) : asText(input.meetingNotes, 2000)
  await db
    .prepare(`UPDATE meetings SET scheduled_at = ?, meeting_type = ?, meeting_status = ?, meeting_notes = ? WHERE owner_sub = ? AND id = ?`)
    .bind(scheduledAt, meetingType, meetingStatus, notes, owner, meetingId)
    .run()
  return privateJson(c, { ok: true })
})

leadActivity.delete('/meetings/:id', async (c) => {
  await c.get('db').prepare(`DELETE FROM meetings WHERE owner_sub = ? AND id = ?`).bind(c.get('user').sub, c.req.param('id')).run()
  return privateJson(c, { ok: true })
})

leadActivity.get('/meetings', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const today = todayISO()
  const yesterday = addDaysISO(-1)
  const tomorrow = addDaysISO(1)
  const when = c.req.query('when') ?? 'all'
  const date = c.req.query('date') ?? ''
  const q = (c.req.query('q') ?? '').trim().toLowerCase()
  const leads = await listLeads(db, owner, 'l.owner_sub = ? AND l.archived = 0', [owner])
  const leadMap = new Map(leads.map((lead) => [lead.id, lead]))
  const rows = await db
    .prepare(
      `SELECT m.* FROM meetings m JOIN leads l ON l.id = m.lead_id AND l.owner_sub = m.owner_sub
       WHERE m.owner_sub = ? AND l.archived = 0 ORDER BY m.scheduled_at ASC LIMIT 500`,
    )
    .bind(owner)
    .all<Record<string, unknown>>()

  const all: MeetingRow[] = rows.results
    .map((row) => {
      const lead = leadMap.get(row.lead_id as string)
      if (!lead) return null
      return {
        lead: { id: lead.id, code: lead.code, contactName: lead.contactName, contactPhone: lead.contactPhone, orgName: lead.orgName },
        meeting: {
          id: row.id as string,
          scheduledAt: row.scheduled_at as string,
          type: (row.meeting_type as string) ?? 'Call',
          status: (row.meeting_status as string) ?? 'Scheduled',
          notes: (row.meeting_notes as string | null) ?? null,
          createdAt: Number(row.created_at ?? 0),
        },
      }
    })
    .filter((row): row is MeetingRow => row !== null)
    .filter((row) => {
      if (!q) return true
      return [row.lead.code, row.lead.contactName, row.lead.orgName, row.meeting.type]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q)
    })

  const counts = {
    today: all.filter((row) => row.meeting.scheduledAt.startsWith(today)).length,
    yesterday: all.filter((row) => row.meeting.scheduledAt.startsWith(yesterday)).length,
    tomorrow: all.filter((row) => row.meeting.scheduledAt.startsWith(tomorrow)).length,
    pending: all.filter((row) => row.meeting.status === 'Scheduled').length,
    upcoming: all.filter((row) => row.meeting.status === 'Scheduled' && row.meeting.scheduledAt.slice(0, 10) >= today).length,
    previous: all.filter((row) => row.meeting.scheduledAt.slice(0, 10) < today).length,
    completed: all.filter((row) => row.meeting.status !== 'Scheduled').length,
    all: all.length,
  }

  let items = all
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) items = all.filter((row) => row.meeting.scheduledAt.startsWith(date))
  else if (when === 'today') items = all.filter((row) => row.meeting.scheduledAt.startsWith(today))
  else if (when === 'yesterday') items = all.filter((row) => row.meeting.scheduledAt.startsWith(yesterday))
  else if (when === 'tomorrow') items = all.filter((row) => row.meeting.scheduledAt.startsWith(tomorrow))
  else if (when === 'pending') items = all.filter((row) => row.meeting.status === 'Scheduled')
  else if (when === 'upcoming') items = all.filter((row) => row.meeting.status === 'Scheduled' && row.meeting.scheduledAt.slice(0, 10) >= today)
  else if (when === 'previous') items = all.filter((row) => row.meeting.scheduledAt.slice(0, 10) < today)
  else if (when === 'completed') items = all.filter((row) => row.meeting.status !== 'Scheduled')

  return privateJson(c, { items, counts })
})

// Contacts ------------------------------------------------------------------

leadActivity.post('/leads/:id/contacts', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const leadId = c.req.param('id')
  if (!(await leadExists(db, owner, leadId))) return c.json({ error: 'Not found.' }, 404)
  const input = await c.req.json<{ fullName?: string; phoneNumber?: string; designation?: string | null; contactRole?: string; allowDuplicate?: boolean }>()
  const fullName = asText(input.fullName, 120)
  if (!fullName) return c.json({ error: 'Contact name is required.' }, 400)
  const phone = normalizePhone(input.phoneNumber)
  if (phone && !input.allowDuplicate) {
    const duplicates = await findDuplicateLeads(db, owner, phone, leadId)
    if (duplicates.length) {
      return privateJson(c, { error: 'duplicate_phone', message: `This number is already on ${duplicates.map((d) => d.code).join(', ')}.`, duplicates }, 409)
    }
  }
  const role = input.contactRole === 'Primary' ? 'Primary' : 'Point of Contact'
  if (role === 'Primary') {
    await db.prepare(`UPDATE lead_contacts SET contact_role = 'Point of Contact' WHERE owner_sub = ? AND lead_id = ?`).bind(owner, leadId).run()
  }
  const contactId = id()
  await db
    .prepare(`INSERT INTO lead_contacts (id, owner_sub, lead_id, full_name, phone_number, designation, contact_role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(contactId, owner, leadId, fullName, phone || null, asText(input.designation, 80), role, now())
    .run()
  return privateJson(c, { ok: true, contactId }, 201)
})

leadActivity.patch('/lead-contacts/:id', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const contactId = c.req.param('id')
  const existing = await db.prepare(`SELECT * FROM lead_contacts WHERE owner_sub = ? AND id = ?`).bind(owner, contactId).first<Record<string, unknown>>()
  if (!existing) return c.json({ error: 'Not found.' }, 404)
  const input = await c.req.json<{ fullName?: string; phoneNumber?: string; designation?: string | null; contactRole?: string; allowDuplicate?: boolean }>()
  const fullName = asText(input.fullName, 120) ?? (existing.full_name as string)
  const phone = input.phoneNumber === undefined ? (existing.phone_number as string | null) : normalizePhone(input.phoneNumber) || null
  if (phone && phone !== existing.phone_number && !input.allowDuplicate) {
    const duplicates = await findDuplicateLeads(db, owner, phone, existing.lead_id as string)
    if (duplicates.length) {
      return privateJson(c, { error: 'duplicate_phone', message: `This number is already on ${duplicates.map((d) => d.code).join(', ')}.`, duplicates }, 409)
    }
  }
  const role = input.contactRole === 'Primary' ? 'Primary' : input.contactRole === 'Point of Contact' ? 'Point of Contact' : (existing.contact_role as string)
  if (role === 'Primary') {
    await db.prepare(`UPDATE lead_contacts SET contact_role = 'Point of Contact' WHERE owner_sub = ? AND lead_id = ? AND id <> ?`).bind(owner, existing.lead_id as string, contactId).run()
  }
  await db
    .prepare(`UPDATE lead_contacts SET full_name = ?, phone_number = ?, designation = ?, contact_role = ? WHERE owner_sub = ? AND id = ?`)
    .bind(fullName, phone, input.designation === undefined ? (existing.designation as string | null) : asText(input.designation, 80), role, owner, contactId)
    .run()
  return privateJson(c, { ok: true })
})

leadActivity.delete('/lead-contacts/:id', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const contactId = c.req.param('id')
  const existing = await db.prepare(`SELECT lead_id, contact_role FROM lead_contacts WHERE owner_sub = ? AND id = ?`).bind(owner, contactId).first<{ lead_id: string; contact_role: string }>()
  if (!existing) return c.json({ error: 'Not found.' }, 404)
  await db.prepare(`DELETE FROM lead_contacts WHERE owner_sub = ? AND id = ?`).bind(owner, contactId).run()
  if (existing.contact_role === 'Primary') {
    const next = await db
      .prepare(`SELECT id FROM lead_contacts WHERE owner_sub = ? AND lead_id = ? ORDER BY created_at ASC LIMIT 1`)
      .bind(owner, existing.lead_id)
      .first<{ id: string }>()
    if (next) await db.prepare(`UPDATE lead_contacts SET contact_role = 'Primary' WHERE owner_sub = ? AND id = ?`).bind(owner, next.id).run()
  }
  return privateJson(c, { ok: true })
})
