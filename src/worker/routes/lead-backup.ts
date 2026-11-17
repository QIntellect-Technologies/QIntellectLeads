import { Hono } from 'hono'

import { privateJson } from '../auth'
import { id, now } from '../db'
import type { AppContext } from '../env'
import { computePriority, isLeadStatus, normalizePhone, todayISO } from '../../shared/leads'
import type { LeadStatusKey } from '../../shared/leads'

/**
 * Restores a complete lead backup — leads with their organization, contacts,
 * requirement, full interaction history, follow-ups, meetings and templates.
 * The regular CSV import flattens history; this one keeps it so a sheet
 * migration (or a later backup restore) does not lose context.
 */
export const leadBackup = new Hono<AppContext>()

type BackupContact = {
  fullName?: string | null
  phone?: string | null
  designation?: string | null
  role?: string | null
}

type BackupInteraction = {
  date?: string | null
  channel?: string | null
  outcome?: string | null
  note?: string | null
  statusAfter?: string | null
}

type BackupFollowUp = {
  dueDate?: string | null
  dueTime?: string | null
  mode?: 'Auto' | 'Manual' | string | null
  completed?: boolean | null
}

type BackupMeeting = {
  scheduledAt?: string | null
  type?: string | null
  status?: string | null
  notes?: string | null
}

type BackupLead = {
  code?: string
  createdDate?: string
  source?: string | null
  product?: string | null
  status?: string | null
  assignedTo?: string | null
  b2b?: boolean
  archived?: boolean
  createdAt?: number
  updatedAt?: number
  organization?: {
    name?: string | null
    type?: string | null
    city?: string | null
    headcount?: number | string | null
    existingSystem?: string | null
  } | null
  contacts?: BackupContact[]
  requirement?: {
    summary?: string | null
    details?: string | null
    objectionType?: string | null
    lossReason?: string | null
    internalRemarks?: string | null
  } | null
  interactions?: BackupInteraction[]
  followUps?: BackupFollowUp[]
  meetings?: BackupMeeting[]
}

type BackupTemplate = {
  name?: string
  segment?: string | null
  product?: string | null
  usageScenario?: string | null
  body?: string
}

type BackupBody = {
  replace?: boolean
  leads?: BackupLead[]
  templates?: BackupTemplate[]
}

const text = (value: unknown, max = 5000): string | null => {
  const clean = String(value ?? '').trim().slice(0, max)
  return clean ? clean : null
}

const isoDate = (value: unknown, fallback: string): string => {
  const raw = String(value ?? '').trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10)
  const parsed = Date.parse(raw)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : fallback
}

const isoStamp = (value: unknown, fallback: string): string => {
  const raw = String(value ?? '').trim()
  if (!raw) return fallback
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw}T12:00:00.000Z`
  const parsed = Date.parse(raw)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback
}

const epoch = (value: unknown, fallback: number): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const raw = String(value ?? '').trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const parsed = Date.parse(raw)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

const headcountNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null
  const n = Number(String(value).replace(/[^\d]/g, ''))
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null
}

const dueTime = (value: unknown): string | null => {
  const raw = String(value ?? '').trim()
  return /^\d{2}:\d{2}$/.test(raw) ? raw : null
}

leadBackup.post('/import/backup', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const body = await c.req.json<BackupBody>()
  const leads = Array.isArray(body.leads) ? body.leads : []
  const templates = Array.isArray(body.templates) ? body.templates : []
  if (!leads.length) return c.json({ error: 'The backup has no leads.' }, 400)
  if (leads.length > 1500) return c.json({ error: 'Restore at most 1500 leads at a time.' }, 400)

  const today = todayISO()
  const t = now()

  if (body.replace) {
    const tables = ['follow_ups', 'meetings', 'interactions', 'requirements', 'organizations', 'lead_contacts', 'leads', 'message_templates']
    await db.batch(tables.map((table) => db.prepare(`DELETE FROM ${table} WHERE owner_sub = ?`).bind(owner)))
    await db.prepare(`DELETE FROM lead_workspace WHERE owner_sub = ?`).bind(owner).run()
  }

  const existing = await db.prepare(`SELECT lead_code FROM leads WHERE owner_sub = ?`).bind(owner).all<{ lead_code: string }>()
  const codes = new Set(existing.results.map((row) => row.lead_code.toUpperCase()))

  const counts = { leads: 0, interactions: 0, followUps: 0, meetings: 0, templates: 0, skipped: 0 }

  for (const lead of leads) {
    const code = text(lead.code, 40)?.toUpperCase() ?? ''
    if (!code) {
      counts.skipped++
      continue
    }
    if (codes.has(code)) {
      counts.skipped++
      continue
    }
    codes.add(code)

    const status: LeadStatusKey = isLeadStatus(lead.status) ? lead.status : 'new'
    const createdDate = isoDate(lead.createdDate, today)
    const createdAt = epoch(lead.createdAt, new Date(`${createdDate}T00:00:00Z`).getTime())
    const requirement = lead.requirement ?? null
    const organization = lead.organization ?? null
    const contacts = (lead.contacts ?? []).filter((contact) => text(contact.fullName, 160) || text(contact.phone, 40))
    const interactions = (lead.interactions ?? []).filter((row) => text(row.note, 5000) || text(row.outcome, 160))
    const followUps = (lead.followUps ?? []).filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(String(row.dueDate ?? '')))
    const meetings = (lead.meetings ?? []).filter((row) => text(row.scheduledAt, 40))

    const lastActivity = interactions
      .map((row) => isoStamp(row.date, `${createdDate}T00:00:00.000Z`))
      .sort((a, b) => b.localeCompare(a))[0]
    const updatedAt = epoch(lead.updatedAt, lastActivity ? Date.parse(lastActivity) : createdAt)
    const overdue = followUps.some((row) => !row.completed && String(row.dueDate).slice(0, 10) < today)
    const score = computePriority({
      status,
      b2b: Boolean(lead.b2b),
      headcount: headcountNumber(organization?.headcount),
      overdueFollowUp: overdue,
      lastActivityAt: lastActivity ?? null,
      createdAt,
      now: t,
    })

    const leadId = id()
    const statements: D1PreparedStatement[] = [
      db
        .prepare(
          `INSERT INTO leads (id, owner_sub, lead_code, created_date, lead_source, product_interest, status, priority_score, assigned_to, b2b, archived, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          leadId,
          owner,
          code,
          createdDate,
          text(lead.source, 60) ?? 'Other',
          text(lead.product, 60) ?? '',
          status,
          score,
          text(lead.assignedTo, 80),
          lead.b2b ? 1 : 0,
          lead.archived ? 1 : 0,
          createdAt,
          updatedAt,
        ),
    ]

    if (text(organization?.name, 160)) {
      statements.push(
        db
          .prepare(`INSERT INTO organizations (id, owner_sub, lead_id, organization_name, organization_type, city, headcount, existing_system) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(
            id(),
            owner,
            leadId,
            text(organization?.name, 160),
            text(organization?.type, 80),
            text(organization?.city, 80),
            headcountNumber(organization?.headcount),
            text(organization?.existingSystem, 160),
          ),
      )
    }

    contacts.forEach((contact, index) => {
      statements.push(
        db
          .prepare(`INSERT INTO lead_contacts (id, owner_sub, lead_id, full_name, phone_number, designation, contact_role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(
            id(),
            owner,
            leadId,
            text(contact.fullName, 160) ?? text(organization?.name, 160) ?? code,
            normalizePhone(text(contact.phone, 40)) || null,
            text(contact.designation, 120),
            index === 0 ? 'Primary' : 'Point of Contact',
            createdAt,
          ),
      )
    })

    if (
      text(requirement?.summary, 500) ||
      text(requirement?.details, 5000) ||
      text(requirement?.objectionType, 500) ||
      text(requirement?.lossReason, 500) ||
      text(requirement?.internalRemarks, 5000)
    ) {
      statements.push(
        db
          .prepare(`INSERT INTO requirements (id, owner_sub, lead_id, requirement_summary, requirement_details, objection_type, loss_reason, internal_remarks, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(
            id(),
            owner,
            leadId,
            text(requirement?.summary, 500),
            text(requirement?.details, 5000),
            text(requirement?.objectionType, 500),
            text(requirement?.lossReason, 500),
            text(requirement?.internalRemarks, 5000),
            updatedAt,
          ),
      )
    }

    for (const row of interactions) {
      statements.push(
        db
          .prepare(`INSERT INTO interactions (id, owner_sub, lead_id, interaction_date, channel, outcome, note, status_after, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(
            id(),
            owner,
            leadId,
            isoStamp(row.date, `${createdDate}T00:00:00.000Z`),
            text(row.channel, 40) ?? 'Note',
            text(row.outcome, 160),
            text(row.note, 5000),
            isLeadStatus(row.statusAfter) ? row.statusAfter : null,
            createdAt,
          ),
      )
    }
    counts.interactions += interactions.length

    for (const row of followUps) {
      statements.push(
        db
          .prepare(`INSERT INTO follow_ups (id, owner_sub, lead_id, due_date, due_time, creation_mode, is_completed, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(
            id(),
            owner,
            leadId,
            String(row.dueDate).slice(0, 10),
            dueTime(row.dueTime),
            row.mode === 'Auto' ? 'Auto' : 'Manual',
            row.completed ? 1 : 0,
            createdAt,
          ),
      )
    }
    counts.followUps += followUps.length

    for (const row of meetings) {
      statements.push(
        db
          .prepare(`INSERT INTO meetings (id, owner_sub, lead_id, scheduled_at, meeting_type, meeting_status, meeting_notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(
            id(),
            owner,
            leadId,
            isoStamp(row.scheduledAt, `${createdDate}T12:00:00.000Z`),
            text(row.type, 40) ?? 'Meeting',
            text(row.status, 40) ?? 'Done',
            text(row.notes, 1000),
            createdAt,
          ),
      )
    }
    counts.meetings += meetings.length

    try {
      await db.batch(statements)
      counts.leads++
    } catch (error) {
      console.error(`Backup import failed on ${code}`, error)
      return c.json({ error: `Import stopped on ${code}. No partial lead was saved for that code; clear and retry.` }, 500)
    }
  }

  if (templates.length) {
    const existingTemplates = await db.prepare(`SELECT template_name FROM message_templates WHERE owner_sub = ?`).bind(owner).all<{ template_name: string }>()
    const names = new Set(existingTemplates.results.map((row) => row.template_name.toLowerCase()))
    const statements: D1PreparedStatement[] = []
    for (const template of templates) {
      const name = text(template.name, 160)
      const bodyText = text(template.body, 10000)
      if (!name || !bodyText || names.has(name.toLowerCase())) continue
      names.add(name.toLowerCase())
      statements.push(
        db
          .prepare(`INSERT INTO message_templates (id, owner_sub, template_name, segment, product, usage_scenario, message_body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(id(), owner, name, text(template.segment, 80), text(template.product, 80), text(template.usageScenario, 300), bodyText, t, t),
      )
      counts.templates++
    }
    for (let i = 0; i < statements.length; i += 40) await db.batch(statements.slice(i, i + 40))
  }

  if (counts.leads) {
    await db.prepare(`INSERT OR REPLACE INTO lead_workspace (owner_sub, seeded_at) VALUES (?, ?)`).bind(owner, t).run()
    await db.prepare(`UPDATE workspaces SET seeded_at = ? WHERE owner_sub = ?`).bind(t, owner).run()
  }

  return privateJson(c, { ok: true, ...counts })
})
