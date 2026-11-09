import { Hono } from 'hono'

import { privateJson } from '../auth'
import { applyCadence } from '../cadence'
import { id, now } from '../db'
import type { AppContext } from '../env'
import { loadCadence } from '../settings'
import { DAY, LeadRuleError, addInteraction, applyStatusChange, asText, findDuplicateLeads, getLeadListRow, listLeads, loadLeadDetail, nextLeadCode, normalizeStatusInput, parseHeadcount, refreshPriority, upsertOrganization, upsertRequirement } from '../lead-core'
import { LEAD_STATUSES, PRIORITY_LEVELS, isClosedStatus, normalizePhone, phoneKey, todayISO } from '../../shared/leads'
import type { LeadListItem } from '../../shared/types'

export const leads = new Hono<AppContext>()

const isPriority = (value: string): boolean => PRIORITY_LEVELS.includes(value as never)

leads.get('/', async (c) => {
  const archived = c.req.query('archived') ?? '0'
  const where: string[] = ['l.owner_sub = ?']
  const binds: unknown[] = [c.get('user').sub]
  if (archived === '1') where.push('l.archived = 1')
  else if (archived !== 'all') where.push('l.archived = 0')
  let items = await listLeads(c.get('db'), c.get('user').sub, where.join(' AND '), binds)

  const q = (c.req.query('q') ?? '').trim().toLowerCase()
  const status = c.req.query('status') ?? ''
  const priority = c.req.query('priority') ?? ''
  const source = c.req.query('source') ?? ''
  const product = c.req.query('product') ?? ''
  const orgType = c.req.query('orgType') ?? ''
  const followUp = c.req.query('followUp') ?? ''
  const stale = c.req.query('stale') ?? ''
  const sort = c.req.query('sort') ?? 'newest'

  if (q) {
    const digits = q.replace(/\D/g, '')
    const numeric = /^[\d\s+\-()]+$/.test(q)
    const needle = digits.replace(/^\+?92/, '').replace(/^0/, '')
    items = items.filter((lead) => {
      const haystack = [lead.code, lead.orgName, lead.contactName, lead.city, lead.contactDesignation, lead.contactPhone]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (haystack.includes(q)) return true
      return numeric && needle.length >= 3 && phoneKey(lead.contactPhone).endsWith(needle)
    })
  }
  if (status) items = items.filter((lead) => lead.status === status)
  if (priority && isPriority(priority)) items = items.filter((lead) => lead.priorityLevel === priority)
  if (source) items = items.filter((lead) => lead.source === source)
  if (product) items = items.filter((lead) => lead.product === product)
  if (orgType) items = items.filter((lead) => lead.orgType === orgType)
  if (followUp === 'overdue') items = items.filter((lead) => lead.overdue)
  else if (followUp === 'today') items = items.filter((lead) => lead.dueToday)
  else if (followUp === 'upcoming') items = items.filter((lead) => lead.nextFollowUp && !lead.overdue && !lead.dueToday)
  else if (followUp === 'none') items = items.filter((lead) => !lead.nextFollowUp)
  if (stale === '1') {
    const cutoff = now() - 14 * DAY
    items = items.filter((lead) => {
      if (lead.priorityScore < 60) return false
      const last = new Date(lead.lastInteractionAt ?? `${lead.createdDate}T00:00:00`).getTime()
      return Number.isFinite(last) && last < cutoff
    })
  }

  const missingLast = (a: LeadListItem, b: LeadListItem) => (a.nextFollowUp?.dueDate ?? '9999').localeCompare(b.nextFollowUp?.dueDate ?? '9999')
  if (sort === 'priority') items.sort((a, b) => b.priorityScore - a.priorityScore)
  else if (sort === 'followup') items.sort(missingLast)
  else if (sort === 'name') items.sort((a, b) => (a.contactName ?? a.orgName ?? a.code).localeCompare(b.contactName ?? b.orgName ?? b.code))
  else if (sort === 'created') items.sort((a, b) => b.createdDate.localeCompare(a.createdDate))
  else items.sort((a, b) => b.createdDate.localeCompare(a.createdDate) || b.code.localeCompare(a.code))

  return privateJson(c, { items, total: items.length })
})

type LeadInput = {
  fullName?: string
  phone?: string
  source?: string
  product?: string
  companyName?: string | null
  orgType?: string | null
  city?: string | null
  headcount?: number | string | null
  existingSystem?: string | null
  b2b?: boolean
  status?: string
  assignedTo?: string | null
  requirementSummary?: string | null
  requirementDetails?: string | null
  objectionType?: string | null
  lossReason?: string | null
  internalRemarks?: string | null
  followUpDate?: string | null
  followUpTime?: string | null
  designation?: string | null
  createdDate?: string
  archived?: boolean
  allowDuplicate?: boolean
}

leads.post('/', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const input = await c.req.json<LeadInput>()
  const fullName = asText(input.fullName, 120)
  const source = asText(input.source, 60)
  const product = asText(input.product, 60)
  if (!fullName) return c.json({ error: 'Contact name is required.' }, 400)
  const phone = normalizePhone(input.phone)
  if (!phone) return c.json({ error: 'Phone number is required.' }, 400)
  if (!source) return c.json({ error: 'Lead source is required.' }, 400)
  if (!product) return c.json({ error: 'Product interest is required.' }, 400)

  if (!input.allowDuplicate) {
    const duplicates = await findDuplicateLeads(db, owner, phone)
    if (duplicates.length) {
      return privateJson(
        c,
        { error: 'duplicate_phone', message: `This number is already on ${duplicates.map((d) => d.code).join(', ')}.`, duplicates },
        409,
      )
    }
  }

  const leadId = id()
  const t = now()
  const code = await nextLeadCode(db, owner)
  const status = normalizeStatusInput(input.status) ?? 'new'
  const createdDate = input.createdDate && /^\d{4}-\d{2}-\d{2}$/.test(input.createdDate) ? input.createdDate : todayISO()
  const assignedTo = asText(input.assignedTo, 80) ?? c.get('user').name ?? null
  const b2b = Boolean(input.b2b)
  if (status === 'lost' && !asText(input.lossReason, 120)) return c.json({ error: 'Closed Lost needs a loss reason.' }, 400)

  await db
    .prepare(
      `INSERT INTO leads (id, owner_sub, lead_code, created_date, lead_source, product_interest, status, priority_score, assigned_to, b2b, archived, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 0, ?, ?)`,
    )
    .bind(leadId, owner, code, createdDate, source, product, status, assignedTo, b2b ? 1 : 0, t, t)
    .run()

  await db
    .prepare(
      `INSERT INTO lead_contacts (id, owner_sub, lead_id, full_name, phone_number, designation, contact_role, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'Primary', ?)`,
    )
    .bind(id(), owner, leadId, fullName, phone, asText(input.designation, 80), t)
    .run()

  await upsertOrganization(db, owner, leadId, {
    name: asText(input.companyName, 160),
    type: asText(input.orgType, 60),
    city: asText(input.city, 80),
    headcount: parseHeadcount(input.headcount),
    existingSystem: asText(input.existingSystem, 120),
  })

  if (input.requirementSummary || input.requirementDetails || input.objectionType || input.internalRemarks) {
    await upsertRequirement(db, owner, leadId, {
      summary: asText(input.requirementSummary, 500),
      details: asText(input.requirementDetails, 2000),
      objectionType: asText(input.objectionType, 60),
      internalRemarks: asText(input.internalRemarks, 2000),
    })
  }

  await addInteraction(db, owner, leadId, { channel: 'System', outcome: 'Lead created', note: `Lead created from ${source}.`, statusAfter: status })

  if (input.followUpDate && /^\d{4}-\d{2}-\d{2}$/.test(input.followUpDate)) {
    await db
      .prepare(`INSERT INTO follow_ups (id, owner_sub, lead_id, due_date, due_time, creation_mode, is_completed, created_at) VALUES (?, ?, ?, ?, ?, 'Manual', 0, ?)`)
      .bind(id(), owner, leadId, input.followUpDate, asText(input.followUpTime, 5), t)
      .run()
  }

  if (status === 'lost') {
    await upsertRequirement(db, owner, leadId, { lossReason: asText(input.lossReason, 120) })
  }
  if (status !== 'won' && status !== 'lost') {
    const cadence = await loadCadence(db, owner, c.env)
    await applyCadence(db, owner, leadId, 'new-lead', createdDate, cadence)
    // A lead captured directly at Proposal Sent also needs the proposal chase.
    if (status === 'proposal_sent') await applyCadence(db, owner, leadId, 'proposal', createdDate, cadence)
  }
  await refreshPriority(db, owner, leadId)
  const item = await getLeadListRow(db, owner, leadId)
  return privateJson(c, { lead: item }, 201)
})

leads.get('/:id', async (c) => {
  const detail = await loadLeadDetail(c.get('db'), c.get('user').sub, c.req.param('id'), c.get('user').name)
  if (!detail) return c.json({ error: 'Not found.' }, 404)
  return privateJson(c, detail)
})

leads.patch('/:id', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const leadId = c.req.param('id')
  const input = await c.req.json<LeadInput>()
  const existing = await db.prepare(`SELECT * FROM leads WHERE owner_sub = ? AND id = ?`).bind(owner, leadId).first<Record<string, unknown>>()
  if (!existing) return c.json({ error: 'Not found.' }, 404)

  try {
    if (input.status !== undefined) {
      const next = normalizeStatusInput(input.status)
      if (next) {
        await applyStatusChange(db, owner, leadId, next, { lossReason: asText(input.lossReason, 120) })
        if (next === 'proposal_sent') {
          const cadence = await loadCadence(db, owner, c.env)
          await applyCadence(db, owner, leadId, 'proposal', todayISO(), cadence)
        }
      }
    }
    const updates: string[] = []
    const binds: unknown[] = []
    if (input.source !== undefined && asText(input.source, 60)) {
      updates.push('lead_source = ?')
      binds.push(asText(input.source, 60))
    }
    if (input.product !== undefined && asText(input.product, 60)) {
      updates.push('product_interest = ?')
      binds.push(asText(input.product, 60))
    }
    if (input.assignedTo !== undefined) {
      updates.push('assigned_to = ?')
      binds.push(asText(input.assignedTo, 80))
    }
    if (input.b2b !== undefined) {
      updates.push('b2b = ?')
      binds.push(input.b2b ? 1 : 0)
    }
    if (input.createdDate !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(String(input.createdDate))) {
      updates.push('created_date = ?')
      binds.push(input.createdDate)
    }
    if (input.archived !== undefined) {
      updates.push('archived = ?')
      binds.push(input.archived ? 1 : 0)
    }
    if (updates.length) {
      updates.push('updated_at = ?')
      binds.push(now(), owner, leadId)
      await db.prepare(`UPDATE leads SET ${updates.join(', ')} WHERE owner_sub = ? AND id = ?`).bind(...binds).run()
    }

    if (
      input.companyName !== undefined ||
      input.orgType !== undefined ||
      input.city !== undefined ||
      input.headcount !== undefined ||
      input.existingSystem !== undefined
    ) {
      await upsertOrganization(db, owner, leadId, {
        name: input.companyName === undefined ? undefined : asText(input.companyName, 160),
        type: input.orgType === undefined ? undefined : asText(input.orgType, 60),
        city: input.city === undefined ? undefined : asText(input.city, 80),
        headcount: input.headcount === undefined ? undefined : parseHeadcount(input.headcount),
        existingSystem: input.existingSystem === undefined ? undefined : asText(input.existingSystem, 120),
      })
    }

    if (
      input.requirementSummary !== undefined ||
      input.requirementDetails !== undefined ||
      input.objectionType !== undefined ||
      input.lossReason !== undefined ||
      input.internalRemarks !== undefined
    ) {
      await upsertRequirement(db, owner, leadId, {
        summary: input.requirementSummary === undefined ? undefined : asText(input.requirementSummary, 500),
        details: input.requirementDetails === undefined ? undefined : asText(input.requirementDetails, 2000),
        objectionType: input.objectionType === undefined ? undefined : asText(input.objectionType, 60),
        lossReason: input.lossReason === undefined ? undefined : asText(input.lossReason, 120),
        internalRemarks: input.internalRemarks === undefined ? undefined : asText(input.internalRemarks, 2000),
      })
    }

    if (input.phone !== undefined && input.phone !== null) {
      const nextPhone = normalizePhone(input.phone)
      if (nextPhone) {
        if (!input.allowDuplicate) {
          const duplicates = await findDuplicateLeads(db, owner, nextPhone, leadId)
          if (duplicates.length) {
            return privateJson(
              c,
              { error: 'duplicate_phone', message: `This number is already on ${duplicates.map((d) => d.code).join(', ')}.`, duplicates },
              409,
            )
          }
        }
        const primary = await db
          .prepare(`SELECT id FROM lead_contacts WHERE owner_sub = ? AND lead_id = ? ORDER BY CASE contact_role WHEN 'Primary' THEN 0 ELSE 1 END, created_at ASC LIMIT 1`)
          .bind(owner, leadId)
          .first<{ id: string }>()
        if (primary) {
          await db
            .prepare(`UPDATE lead_contacts SET phone_number = ?, full_name = COALESCE(?, full_name), designation = COALESCE(?, designation) WHERE owner_sub = ? AND id = ?`)
            .bind(nextPhone, asText(input.fullName, 120), asText(input.designation, 80), owner, primary.id)
            .run()
        } else if (asText(input.fullName, 120)) {
          await db
            .prepare(`INSERT INTO lead_contacts (id, owner_sub, lead_id, full_name, phone_number, designation, contact_role, created_at) VALUES (?, ?, ?, ?, ?, ?, 'Primary', ?)`)
            .bind(id(), owner, leadId, asText(input.fullName, 120), nextPhone, asText(input.designation, 80), now())
            .run()
        }
      }
    } else if (input.fullName !== undefined || input.designation !== undefined) {
      const primary = await db
        .prepare(`SELECT id FROM lead_contacts WHERE owner_sub = ? AND lead_id = ? ORDER BY CASE contact_role WHEN 'Primary' THEN 0 ELSE 1 END, created_at ASC LIMIT 1`)
        .bind(owner, leadId)
        .first<{ id: string }>()
      if (primary) {
        await db
          .prepare(`UPDATE lead_contacts SET full_name = COALESCE(?, full_name), designation = COALESCE(?, designation) WHERE owner_sub = ? AND id = ?`)
          .bind(asText(input.fullName, 120), asText(input.designation, 80), owner, primary.id)
          .run()
      }
    }

    await refreshPriority(db, owner, leadId)
  } catch (error) {
    if (error instanceof LeadRuleError) return c.json({ error: error.message }, 400)
    throw error
  }

  const detail = await loadLeadDetail(db, owner, leadId, c.get('user').name)
  return privateJson(c, detail)
})

leads.post('/:id/archive', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const leadId = c.req.param('id')
  const input = await c.req.json<{ archived?: boolean }>().catch(() => ({ archived: true }))
  const archived = input.archived === false ? 0 : 1
  await db.prepare(`UPDATE leads SET archived = ?, updated_at = ? WHERE owner_sub = ? AND id = ?`).bind(archived, now(), owner, leadId).run()
  return privateJson(c, { ok: true, archived: Boolean(archived) })
})

export const LEAD_OPTIONS = {
  statuses: LEAD_STATUSES,
  today: todayISO(),
  closed: isClosedStatus,
}
