import { now } from './db'
import {
  LEAD_STATUSES,
  computePriority,
  fillTemplate,
  isClosedStatus,
  isLeadStatus,
  normalizePhone,
  phoneKey,
  priorityLevel,
  shouldSuppressPricing,
  statusLabel,
  todayISO,
} from '../shared/leads'
import type { LeadStatusKey } from '../shared/leads'
import type { Lead, LeadContact, LeadDetail, LeadFollowUp, LeadInteraction, LeadListItem, LeadMeeting, LeadOrganization, LeadRequirement, LeadTemplate } from '../shared/types'

type Row = Record<string, unknown>

export class LeadRuleError extends Error {}

export const DAY = 86_400_000

/**
 * One row per lead with its organization, requirement, primary contact, newest
 * interaction and next open follow-up. Priority is always computed here, never
 * trusted from the input, so it follows status, headcount and dates.
 */
export const LEAD_LIST_SELECT = `
  SELECT l.*,
    o.organization_name, o.organization_type, o.city, o.headcount, o.existing_system,
    r.requirement_summary, r.requirement_details, r.objection_type, r.loss_reason, r.internal_remarks,
    pc.id AS contact_id, pc.full_name AS contact_name, pc.phone_number AS contact_phone,
    pc.designation AS contact_designation, pc.contact_role,
    li.interaction_date AS last_interaction_date, li.note AS last_note, li.channel AS last_channel,
    fu.id AS follow_up_id, fu.due_date AS follow_up_date, fu.due_time AS follow_up_time,
    (SELECT COUNT(*) FROM interactions ic WHERE ic.owner_sub = l.owner_sub AND ic.lead_id = l.id) AS interaction_count
  FROM leads l
  LEFT JOIN organizations o ON o.lead_id = l.id AND o.owner_sub = l.owner_sub
  LEFT JOIN requirements r ON r.lead_id = l.id AND r.owner_sub = l.owner_sub
  LEFT JOIN lead_contacts pc ON pc.id = (
    SELECT c.id FROM lead_contacts c WHERE c.lead_id = l.id AND c.owner_sub = l.owner_sub
    ORDER BY CASE c.contact_role WHEN 'Primary' THEN 0 ELSE 1 END, c.created_at ASC LIMIT 1
  )
  LEFT JOIN interactions li ON li.id = (
    SELECT i.id FROM interactions i WHERE i.lead_id = l.id AND i.owner_sub = l.owner_sub
    ORDER BY i.interaction_date DESC, i.created_at DESC LIMIT 1
  )
  LEFT JOIN follow_ups fu ON fu.id = (
    SELECT f.id FROM follow_ups f WHERE f.lead_id = l.id AND f.owner_sub = l.owner_sub AND f.is_completed = 0
    ORDER BY f.due_date ASC, COALESCE(f.due_time, '') ASC LIMIT 1
  )`

export function mapLeadListRow(row: Row, at = now()): LeadListItem {
  const status = (isLeadStatus(row.status) ? row.status : 'new') as LeadStatusKey
  const followDate = (row.follow_up_date as string | null) ?? null
  const today = todayISO(new Date(at))
  const overdue = Boolean(followDate && followDate < today)
  const dueToday = Boolean(followDate && followDate === today)
  const headcount = row.headcount === null || row.headcount === undefined ? null : Number(row.headcount)
  const score = computePriority({
    status,
    b2b: Boolean(Number(row.b2b ?? 0)),
    headcount,
    overdueFollowUp: overdue,
    lastActivityAt: (row.last_interaction_date as string | null) ?? null,
    createdAt: Number(row.created_at ?? at),
    now: at,
  })
  return {
    id: row.id as string,
    code: row.lead_code as string,
    createdDate: row.created_date as string,
    source: row.lead_source as string,
    product: (row.product_interest as string) ?? '',
    status,
    priorityScore: score,
    priorityLevel: priorityLevel(score),
    assignedTo: (row.assigned_to as string | null) ?? null,
    b2b: Boolean(Number(row.b2b ?? 0)),
    archived: Boolean(Number(row.archived ?? 0)),
    orgName: (row.organization_name as string | null) ?? null,
    orgType: (row.organization_type as string | null) ?? null,
    city: (row.city as string | null) ?? null,
    headcount,
    existingSystem: (row.existing_system as string | null) ?? null,
    requirementSummary: (row.requirement_summary as string | null) ?? null,
    requirementDetails: (row.requirement_details as string | null) ?? null,
    objectionType: (row.objection_type as string | null) ?? null,
    internalRemarks: (row.internal_remarks as string | null) ?? null,
    contactName: (row.contact_name as string | null) ?? null,
    contactPhone: (row.contact_phone as string | null) ?? null,
    contactDesignation: (row.contact_designation as string | null) ?? null,
    contactRole: (row.contact_role as string | null) ?? null,
    lastNote: (row.last_note as string | null) ?? null,
    lastChannel: (row.last_channel as string | null) ?? null,
    lastInteractionAt: (row.last_interaction_date as string | null) ?? null,
    interactionCount: Number(row.interaction_count ?? 0),
    lossReason: (row.loss_reason as string | null) ?? null,
    nextFollowUp: followDate ? { id: row.follow_up_id as string, dueDate: followDate, dueTime: (row.follow_up_time as string | null) ?? null } : null,
    overdue,
    dueToday,
  }
}

export async function listLeads(db: D1Database, _owner: string, where = '', binds: unknown[] = [], limit = 2000): Promise<LeadListItem[]> {
  const rows = await db
    .prepare(`${LEAD_LIST_SELECT} ${where ? `WHERE ${where}` : ''} ORDER BY l.created_at DESC LIMIT ?`)
    .bind(...binds, limit)
    .all()
  const at = now()
  return (rows.results as Row[]).map((row) => mapLeadListRow(row, at))
}

export async function getLeadListRow(db: D1Database, owner: string, leadId: string, at = now()): Promise<LeadListItem | null> {
  const row = await db.prepare(`${LEAD_LIST_SELECT} WHERE l.owner_sub = ? AND l.id = ?`).bind(owner, leadId).first()
  return row ? mapLeadListRow(row as Row, at) : null
}

export function toLead(item: LeadListItem): Lead {
  return {
    id: item.id,
    code: item.code,
    createdDate: item.createdDate,
    source: item.source,
    product: item.product,
    status: item.status,
    priorityScore: item.priorityScore,
    priorityLevel: item.priorityLevel,
    assignedTo: item.assignedTo,
    b2b: item.b2b,
    archived: item.archived,
    createdAt: 0,
    updatedAt: 0,
    lastInteractionAt: item.lastInteractionAt,
  }
}

const mapContact = (r: Row): LeadContact => ({
  id: r.id as string,
  fullName: r.full_name as string,
  phone: (r.phone_number as string | null) ?? null,
  designation: (r.designation as string | null) ?? null,
  role: (r.contact_role as 'Primary' | 'Point of Contact') ?? 'Point of Contact',
  createdAt: Number(r.created_at ?? 0),
})

const mapInteraction = (r: Row): LeadInteraction => {
  const statusAfter = (r.status_after as string | null) ?? null
  const rawOutcome = (r.outcome as string | null) ?? null
  // Imported history rows used the sheet's status as both the outcome and the
  // status-after value, which made the timeline read "Connected status:
  // Connected". Keep the outcome only when it adds information.
  const duplicate = rawOutcome && statusAfter && rawOutcome.trim().toLowerCase() === statusLabel(statusAfter).toLowerCase()
  return {
    id: r.id as string,
    date: r.interaction_date as string,
    channel: r.channel as string,
    outcome: duplicate ? null : rawOutcome,
    note: (r.note as string | null) ?? null,
    statusAfter,
    createdAt: Number(r.created_at ?? 0),
    callResult: (r.call_result as LeadInteraction['callResult']) ?? null,
    contactId: (r.contact_id as string | null) ?? null,
    contactName: (r.contact_name as string | null) ?? null,
    phoneNumber: (r.phone_number as string | null) ?? null,
  }
}

const mapFollowUp = (r: Row): LeadFollowUp => ({
  id: r.id as string,
  dueDate: r.due_date as string,
  dueTime: (r.due_time as string | null) ?? null,
  mode: (r.creation_mode as 'Auto' | 'Manual' | 'Cadence') ?? 'Manual',
  completed: Boolean(Number(r.is_completed ?? 0)),
  completedOn: (r.completed_on as string | null) ?? null,
  rescheduleReason: (r.reschedule_reason as string | null) ?? null,
  createdAt: Number(r.created_at ?? 0),
})

const mapMeeting = (r: Row): LeadMeeting => ({
  id: r.id as string,
  scheduledAt: r.scheduled_at as string,
  type: (r.meeting_type as string) ?? 'Call',
  status: (r.meeting_status as string) ?? 'Scheduled',
  notes: (r.meeting_notes as string | null) ?? null,
  createdAt: Number(r.created_at ?? 0),
})

export async function loadLeadDetail(db: D1Database, owner: string, leadId: string, myName?: string | null): Promise<LeadDetail | null> {
  const at = now()
  const leadRow = await db.prepare(`${LEAD_LIST_SELECT} WHERE l.owner_sub = ? AND l.id = ?`).bind(owner, leadId).first()
  if (!leadRow) return null
  const item = mapLeadListRow(leadRow as Row, at)
  const raw = leadRow as Row
  const [contactRows, interactionRows, followRows, meetingRows, templateRows] = await db.batch([
    db.prepare(`SELECT * FROM lead_contacts WHERE owner_sub = ? AND lead_id = ? ORDER BY CASE contact_role WHEN 'Primary' THEN 0 ELSE 1 END, created_at ASC`).bind(owner, leadId),
    db.prepare(`SELECT * FROM interactions WHERE owner_sub = ? AND lead_id = ? ORDER BY interaction_date DESC, created_at DESC LIMIT 200`).bind(owner, leadId),
    db.prepare(`SELECT * FROM follow_ups WHERE owner_sub = ? AND lead_id = ? ORDER BY is_completed ASC, due_date ASC, COALESCE(due_time, '') ASC LIMIT 100`).bind(owner, leadId),
    db.prepare(`SELECT * FROM meetings WHERE owner_sub = ? AND lead_id = ? ORDER BY scheduled_at DESC LIMIT 100`).bind(owner, leadId),
    db.prepare(`SELECT * FROM message_templates WHERE owner_sub = ? ORDER BY template_name ASC`).bind(owner),
  ])

  const organization: LeadOrganization | null = raw.organization_name
    ? {
        id: `${leadId}-org`,
        name: raw.organization_name as string,
        type: (raw.organization_type as string | null) ?? null,
        city: (raw.city as string | null) ?? null,
        headcount: raw.headcount === null || raw.headcount === undefined ? null : Number(raw.headcount),
        existingSystem: (raw.existing_system as string | null) ?? null,
      }
    : null

  const requirement: LeadRequirement | null =
    raw.requirement_summary || raw.requirement_details || raw.objection_type || raw.loss_reason || raw.internal_remarks
      ? {
          id: `${leadId}-req`,
          summary: (raw.requirement_summary as string | null) ?? null,
          details: (raw.requirement_details as string | null) ?? null,
          objectionType: (raw.objection_type as string | null) ?? null,
          lossReason: (raw.loss_reason as string | null) ?? null,
          internalRemarks: (raw.internal_remarks as string | null) ?? null,
        }
      : null

  const primary = item.contactName
  const context = {
    name: primary,
    company: item.orgName,
    product: item.product,
    city: item.city,
    orgType: item.orgType,
    leadCode: item.code,
    designation: item.contactDesignation,
    myName: myName ?? '',
  }
  const suppressPricing = shouldSuppressPricing(item.status, requirement?.internalRemarks ?? item.lastNote)
  const leadHaystack = `${item.orgName ?? ''} ${item.orgType ?? ''}`.toLowerCase()
  // The shared template sheet contains every segment and script. A lead panel
  // shows only scripts that fit this lead, not the whole library; the Templates
  // screen still has all of them.
  const templates: LeadTemplate[] = (templateRows.results as Row[])
    .filter((r) => {
      if (suppressPricing && isPricingTemplate(r)) return false
      const product = String(r.product ?? '')
      if (product && product !== item.product) return false
      const name = String(r.template_name ?? '').toLowerCase()
      if (name.startsWith('call:')) return false
      if (name.includes('restaurant') && !leadHaystack.includes('restaurant')) return false
      return true
    })
    .map((r) => {
      const body = r.message_body as string
      return {
        id: r.id as string,
        name: r.template_name as string,
        segment: (r.segment as string | null) ?? null,
        product: (r.product as string | null) ?? null,
        usageScenario: (r.usage_scenario as string | null) ?? null,
        body,
        message: fillTemplate(body, context),
        suggested: !suppressPricing && (!r.product || r.product === item.product),
        createdAt: Number(r.created_at ?? 0),
      }
    })
    .sort((a, b) => {
      const order = ['Intro', 'Follow-up', 'Demo', 'Pricing', 'Postponed', 'Closing', 'Other']
      const rank = (template: LeadTemplate) => (template.product === item.product ? 0 : template.product ? 1 : 2)
      const segment = (template: LeadTemplate) => {
        const index = order.indexOf(template.segment ?? 'Other')
        return index < 0 ? order.length : index
      }
      return rank(a) - rank(b) || segment(a) - segment(b) || a.name.localeCompare(b.name)
    })
    .slice(0, 8)

  const lead: Lead = { ...toLead(item), createdAt: Number(raw.created_at), updatedAt: Number(raw.updated_at) }
  return {
    lead,
    organization,
    contacts: (contactRows.results as Row[]).map(mapContact),
    requirement,
    interactions: (interactionRows.results as Row[]).map(mapInteraction),
    followUps: (followRows.results as Row[]).map(mapFollowUp),
    meetings: (meetingRows.results as Row[]).map(mapMeeting),
    templates,
  }
}

export function isPricingTemplate(row: Row): boolean {
  const haystack = `${row.template_name ?? ''} ${row.segment ?? ''} ${row.usage_scenario ?? ''}`.toLowerCase()
  return /pric|discount|offer|quotation|quote/.test(haystack)
}

/** Next QT-### code, keeping the team's existing numbering. */
export async function nextLeadCode(db: D1Database, owner: string): Promise<string> {
  const rows = await db.prepare(`SELECT lead_code FROM leads WHERE owner_sub = ?`).bind(owner).all<{ lead_code: string }>()
  let max = 0
  for (const row of rows.results) {
    const match = /(\d+)\s*$/.exec(row.lead_code ?? '')
    if (match) max = Math.max(max, Number(match[1]))
  }
  return `QT-${String(max + 1).padStart(3, '0')}`
}

export async function nextCodes(db: D1Database, owner: string, count: number): Promise<string[]> {
  const rows = await db.prepare(`SELECT lead_code FROM leads WHERE owner_sub = ?`).bind(owner).all<{ lead_code: string }>()
  let max = 0
  for (const row of rows.results) {
    const match = /(\d+)\s*$/.exec(row.lead_code ?? '')
    if (match) max = Math.max(max, Number(match[1]))
  }
  return Array.from({ length: count }, (_, i) => `QT-${String(max + 1 + i).padStart(3, '0')}`)
}

export interface DuplicateLead {
  id: string
  code: string
  name: string | null
  phone: string | null
  orgName: string | null
}

/** Same person under a different number: compare the last 10 digits. */
export async function findDuplicateLeads(db: D1Database, owner: string, phone: string, excludeLeadId?: string): Promise<DuplicateLead[]> {
  const key = phoneKey(phone)
  if (key.length < 7) return []
  const rows = await db
    .prepare(
      `SELECT l.id, l.lead_code, c.full_name, c.phone_number, o.organization_name
       FROM lead_contacts c
       JOIN leads l ON l.id = c.lead_id AND l.owner_sub = c.owner_sub
       LEFT JOIN organizations o ON o.lead_id = l.id AND o.owner_sub = l.owner_sub
       WHERE c.owner_sub = ? AND c.phone_number IS NOT NULL`,
    )
    .bind(owner)
    .all()
  return (rows.results as Row[])
    .filter((r) => phoneKey(r.phone_number as string) === key && r.id !== excludeLeadId)
    .map((r) => ({
      id: r.id as string,
      code: r.lead_code as string,
      name: (r.full_name as string | null) ?? null,
      phone: (r.phone_number as string | null) ?? null,
      orgName: (r.organization_name as string | null) ?? null,
    }))
}

export async function refreshPriority(db: D1Database, owner: string, leadId: string): Promise<number> {
  const item = await getLeadListRow(db, owner, leadId)
  if (!item) return 0
  await db.prepare(`UPDATE leads SET priority_score = ?, updated_at = ? WHERE owner_sub = ? AND id = ?`).bind(item.priorityScore, now(), owner, leadId).run()
  return item.priorityScore
}

export async function addInteraction(
  db: D1Database,
  owner: string,
  leadId: string,
  input: {
    channel: string
    outcome?: string | null
    note?: string | null
    statusAfter?: string | null
    date?: string
    callResult?: string | null
    contactId?: string | null
    contactName?: string | null
    phoneNumber?: string | null
  },
): Promise<string> {
  const interactionId = crypto.randomUUID()
  const date = input.date ?? new Date().toISOString()
  await db
    .prepare(
      `INSERT INTO interactions (id, owner_sub, lead_id, interaction_date, channel, outcome, note, status_after, call_result, contact_id, contact_name, phone_number, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      interactionId,
      owner,
      leadId,
      date,
      input.channel,
      input.outcome ?? null,
      input.note ?? null,
      input.statusAfter ?? null,
      input.callResult ?? null,
      input.contactId ?? null,
      input.contactName ?? null,
      input.phoneNumber ?? null,
      now(),
    )
    .run()
  return interactionId
}

export async function upsertRequirement(
  db: D1Database,
  owner: string,
  leadId: string,
  values: Partial<{ summary: string | null; details: string | null; objectionType: string | null; lossReason: string | null; internalRemarks: string | null }>,
): Promise<void> {
  const existing = await db.prepare(`SELECT * FROM requirements WHERE owner_sub = ? AND lead_id = ?`).bind(owner, leadId).first<Row>()
  if (existing) {
    await db
      .prepare(
        `UPDATE requirements SET requirement_summary = ?, requirement_details = ?, objection_type = ?, loss_reason = ?, internal_remarks = ?, updated_at = ?
         WHERE owner_sub = ? AND lead_id = ?`,
      )
      .bind(
        values.summary === undefined ? (existing.requirement_summary as string | null) : values.summary,
        values.details === undefined ? (existing.requirement_details as string | null) : values.details,
        values.objectionType === undefined ? (existing.objection_type as string | null) : values.objectionType,
        values.lossReason === undefined ? (existing.loss_reason as string | null) : values.lossReason,
        values.internalRemarks === undefined ? (existing.internal_remarks as string | null) : values.internalRemarks,
        now(),
        owner,
        leadId,
      )
      .run()
    return
  }
  await db
    .prepare(
      `INSERT INTO requirements (id, owner_sub, lead_id, requirement_summary, requirement_details, objection_type, loss_reason, internal_remarks, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      owner,
      leadId,
      values.summary ?? null,
      values.details ?? null,
      values.objectionType ?? null,
      values.lossReason ?? null,
      values.internalRemarks ?? null,
      now(),
    )
    .run()
}

export async function upsertOrganization(
  db: D1Database,
  owner: string,
  leadId: string,
  values: Partial<{ name: string | null; type: string | null; city: string | null; headcount: number | null; existingSystem: string | null }>,
): Promise<void> {
  const existing = await db.prepare(`SELECT * FROM organizations WHERE owner_sub = ? AND lead_id = ?`).bind(owner, leadId).first<Row>()
  if (existing) {
    await db
      .prepare(`UPDATE organizations SET organization_name = ?, organization_type = ?, city = ?, headcount = ?, existing_system = ? WHERE owner_sub = ? AND lead_id = ?`)
      .bind(
        values.name === undefined ? (existing.organization_name as string) : values.name ?? '',
        values.type === undefined ? (existing.organization_type as string | null) : values.type,
        values.city === undefined ? (existing.city as string | null) : values.city,
        values.headcount === undefined ? (existing.headcount as number | null) : values.headcount,
        values.existingSystem === undefined ? (existing.existing_system as string | null) : values.existingSystem,
        owner,
        leadId,
      )
      .run()
    return
  }
  if (!values.name) return
  await db
    .prepare(
      `INSERT INTO organizations (id, owner_sub, lead_id, organization_name, organization_type, city, headcount, existing_system)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(crypto.randomUUID(), owner, leadId, values.name, values.type ?? null, values.city ?? null, values.headcount ?? null, values.existingSystem ?? null)
    .run()
}

export async function clearOpenFollowUps(db: D1Database, owner: string, leadId: string): Promise<void> {
  await db.prepare(`UPDATE follow_ups SET is_completed = 1 WHERE owner_sub = ? AND lead_id = ? AND is_completed = 0`).bind(owner, leadId).run()
}

/**
 * Applies a status change with the agreed rules: Closed Lost needs a reason,
 * closed statuses clear open follow-ups, and every change leaves an
 * interaction so history is never overwritten.
 */
export async function applyStatusChange(
  db: D1Database,
  owner: string,
  leadId: string,
  nextStatus: LeadStatusKey,
  options: { lossReason?: string | null; note?: string | null; channel?: string; outcome?: string | null; recordInteraction?: boolean } = {},
): Promise<void> {
  const existing = await db.prepare(`SELECT status, lead_code FROM leads WHERE owner_sub = ? AND id = ?`).bind(owner, leadId).first<{ status: string; lead_code: string }>()
  if (!existing) throw new LeadRuleError('Lead not found.')
  if (existing.status === nextStatus) {
    if (nextStatus === 'lost' && options.lossReason) await upsertRequirement(db, owner, leadId, { lossReason: options.lossReason })
    return
  }
  if (nextStatus === 'lost' && !options.lossReason?.trim()) {
    throw new LeadRuleError('Closed Lost needs a loss reason.')
  }
  await db.prepare(`UPDATE leads SET status = ?, updated_at = ? WHERE owner_sub = ? AND id = ?`).bind(nextStatus, now(), owner, leadId).run()
  if (nextStatus === 'lost') {
    await upsertRequirement(db, owner, leadId, { lossReason: options.lossReason?.trim() ?? null })
  }
  if (isClosedStatus(nextStatus)) await clearOpenFollowUps(db, owner, leadId)
  if (options.recordInteraction !== false) {
    await addInteraction(db, owner, leadId, {
      channel: options.channel ?? 'System',
      outcome: options.outcome ?? 'Status changed',
      note: options.note ?? `Status changed from "${statusLabel(existing.status)}" to "${statusLabel(nextStatus)}".`,
      statusAfter: nextStatus,
    })
  }
  await refreshPriority(db, owner, leadId)
}

export function parseHeadcount(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(String(value).replace(/[^\d]/g, ''))
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null
}

export const asText = (value: unknown, max = 2000): string | null => {
  const text = String(value ?? '').trim().slice(0, max)
  return text ? text : null
}

export const normalizeStatusInput = (value: unknown): LeadStatusKey | null => (isLeadStatus(value) ? value : null)

export const statusOrder = (status: string): number => {
  const index = LEAD_STATUSES.findIndex((s) => s.key === status)
  return index < 0 ? 99 : index
}

export const cleanPhone = normalizePhone
