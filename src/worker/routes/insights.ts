import { Hono } from 'hono'

import { privateJson } from '../auth'
import { id, now } from '../db'
import type { AppContext } from '../env'
import { asText, listLeads, parseHeadcount } from '../lead-core'
import { LEAD_SOURCES, PRODUCTS, computePriority, inferredLossReason, mapLegacyStatus, normalizePhone, phoneKey, statusLabel, todayISO } from '../../shared/leads'
import type { LeadStatusKey } from '../../shared/leads'
import type { FollowUpRow, ImportPreview, ImportPreviewRow, ImportResult, MeetingRow, ReportsData, TodayData } from '../../shared/types'

export const insights = new Hono<AppContext>()

const DAY = 86_400_000

insights.get('/today', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const today = todayISO()
  const items = await listLeads(db, owner, 'l.owner_sub = ? AND l.archived = 0', [owner])
  const itemMap = new Map(items.map((item) => [item.id, item]))
  const [followRows, meetingRows, pendingMeetingRows, completedStats] = await db.batch([
    db
      .prepare(
        `SELECT f.*, l.lead_code FROM follow_ups f JOIN leads l ON l.id = f.lead_id AND l.owner_sub = f.owner_sub
         WHERE f.owner_sub = ? AND f.is_completed = 0 AND l.archived = 0
         ORDER BY f.due_date ASC, COALESCE(f.due_time, '') ASC LIMIT 400`,
      )
      .bind(owner),
    db
      .prepare(
        `SELECT m.*, l.lead_code FROM meetings m JOIN leads l ON l.id = m.lead_id AND l.owner_sub = m.owner_sub
         WHERE m.owner_sub = ? AND m.scheduled_at LIKE ? AND m.meeting_status = 'Scheduled'
         ORDER BY m.scheduled_at ASC LIMIT 100`,
      )
      .bind(owner, `${today}%`),
    db
      .prepare(
        `SELECT m.*, l.lead_code FROM meetings m JOIN leads l ON l.id = m.lead_id AND l.owner_sub = m.owner_sub
         WHERE m.owner_sub = ? AND m.meeting_status = 'Scheduled' AND l.archived = 0
         ORDER BY m.scheduled_at ASC LIMIT 400`,
      )
      .bind(owner),
    db
      .prepare(
        `SELECT COUNT(*) AS completed_today, COALESCE(SUM(CASE WHEN due_date = ? THEN 1 ELSE 0 END), 0) AS today_done
         FROM follow_ups WHERE owner_sub = ? AND completed_on = ?`,
      )
      .bind(today, owner, today),
  ])

  const overdue: FollowUpRow[] = []
  const dueToday: FollowUpRow[] = []
  for (const row of followRows.results as Record<string, unknown>[]) {
    const lead = itemMap.get(row.lead_id as string)
    if (!lead) continue
    const dueDate = row.due_date as string
    const followUp = {
      id: row.id as string,
      dueDate,
      dueTime: (row.due_time as string | null) ?? null,
      mode: (row.creation_mode as 'Auto' | 'Manual' | 'Cadence') ?? 'Manual',
      completed: Boolean(Number(row.is_completed ?? 0)),
      completedOn: (row.completed_on as string | null) ?? null,
      rescheduleReason: (row.reschedule_reason as string | null) ?? null,
      createdAt: Number(row.created_at ?? 0),
    }
    if (dueDate < today) overdue.push({ followUp, lead })
    else if (dueDate === today) dueToday.push({ followUp, lead })
  }

  const meetings: MeetingRow[] = (meetingRows.results as Record<string, unknown>[])
    .map((row) => {
      const lead = itemMap.get(row.lead_id as string)
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

  const staleAll = items
    .filter((lead) => lead.priorityScore >= 60)
    .filter((lead) => {
      const last = new Date(lead.lastInteractionAt ?? `${lead.createdDate}T00:00:00`).getTime()
      return Number.isFinite(last) && now() - last > 14 * DAY
    })
    .sort((a, b) => b.priorityScore - a.priorityScore)
  const stale = staleAll.slice(0, 12)

  const body: TodayData = {
    today,
    counts: {
      overdue: overdue.length,
      dueToday: dueToday.length,
      todayDone: Number((completedStats.results?.[0] as { today_done?: number } | undefined)?.today_done ?? 0),
      completedToday: Number((completedStats.results?.[0] as { completed_today?: number } | undefined)?.completed_today ?? 0),
      meetingsToday: meetings.length,
      meetingsPending: pendingMeetingRows.results.length,
      stale: staleAll.length,
      openLeads: items.filter((lead) => lead.status !== 'won' && lead.status !== 'lost').length,
    },
    overdue: overdue.slice(0, 60),
    dueToday: dueToday.slice(0, 60),
    meetings,
    stale,
  }
  return privateJson(c, body)
})

insights.get('/data-summary', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const tables = [
    ['leads', 'leads'],
    ['interactions', 'interactions'],
    ['follow_ups', 'followUps'],
    ['meetings', 'meetings'],
    ['lead_contacts', 'contacts'],
    ['message_templates', 'templates'],
    ['organizations', 'organizations'],
    ['requirements', 'requirements'],
  ] as const
  const rows = await db.batch(tables.map(([table]) => db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE owner_sub = ?`).bind(owner)))
  const counts = Object.fromEntries(
    tables.map(([, key], index) => {
      const first = rows[index]?.results?.[0] as { n?: number } | undefined
      return [key, Number(first?.n ?? 0)]
    }),
  )
  return privateJson(c, { counts })
})

insights.get('/reports', async (c) => {
  const owner = c.get('user').sub
  const items = await listLeads(c.get('db'), owner, 'l.owner_sub = ? AND l.archived = 0', [owner])
  const won = items.filter((i) => i.status === 'won')
  const lost = items.filter((i) => i.status === 'lost')
  const closed = won.length + lost.length
  const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0)

  const statusOrder = ['new', 'contacted', 'connected', 'demo_scheduled', 'demo_done', 'proposal_sent', 'negotiation', 'postponed', 'won', 'lost']
  const byStatus = statusOrder.map((status) => ({ status: status as LeadStatusKey, count: items.filter((i) => i.status === status).length }))

  const sources = Array.from(new Set([...LEAD_SOURCES, ...items.map((i) => i.source)]))
  const bySource = sources
    .map((source) => {
      const rows = items.filter((i) => i.source === source)
      const w = rows.filter((i) => i.status === 'won').length
      const l = rows.filter((i) => i.status === 'lost').length
      return { source, leads: rows.length, won: w, lost: l, conversionRate: pct(w, w + l) }
    })
    .filter((row) => row.leads > 0)
    .sort((a, b) => b.leads - a.leads)

  const reasonCount = new Map<string, number>()
  for (const lead of lost) {
    const reason = lead.lossReason ?? 'Not recorded'
    reasonCount.set(reason, (reasonCount.get(reason) ?? 0) + 1)
  }
  const lossReasons = [...reasonCount.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count)

  const products = Array.from(new Set([...PRODUCTS, ...items.map((i) => i.product).filter(Boolean)]))
  const byProduct = products
    .map((product) => ({ product, leads: items.filter((i) => i.product === product).length, won: items.filter((i) => i.product === product && i.status === 'won').length }))
    .filter((row) => row.leads > 0)
    .sort((a, b) => b.leads - a.leads)

  const body: ReportsData = {
    totals: {
      leads: items.length,
      open: items.length - closed,
      won: won.length,
      lost: lost.length,
      archived: 0,
      conversionRate: pct(won.length, closed),
      closedRate: pct(closed, items.length),
    },
    byStatus,
    bySource,
    lossReasons,
    byProduct,
  }
  return privateJson(c, body)
})

insights.get('/search', async (c) => {
  const q = (c.req.query('q') ?? '').trim().toLowerCase()
  if (!q) return privateJson(c, { leads: [] })
  const items = await listLeads(c.get('db'), c.get('user').sub, 'l.owner_sub = ? AND l.archived = 0', [c.get('user').sub])
  const digits = q.replace(/\D/g, '')
  const numeric = /^[\d\s+\-()]+$/.test(q)
  const needle = digits.replace(/^\+?92/, '').replace(/^0/, '')
  const leads = items
    .filter((lead) => {
      const haystack = [lead.code, lead.orgName, lead.contactName, lead.contactDesignation, lead.city, lead.product].filter(Boolean).join(' ').toLowerCase()
      return haystack.includes(q) || (numeric && needle.length >= 3 && phoneKey(lead.contactPhone).endsWith(needle))
    })
    .slice(0, 8)
    .map((lead) => ({
      id: lead.id,
      code: lead.code,
      name: lead.contactName,
      orgName: lead.orgName,
      phone: lead.contactPhone,
      status: lead.status,
      priorityScore: lead.priorityScore,
    }))
  return privateJson(c, { leads })
})

// Export --------------------------------------------------------------------

const EXPORT_HEADERS = [
  'Lead ID',
  'Created Date',
  'Lead Source',
  'Product Interest',
  'Status',
  'Priority Score',
  'Priority Level',
  'Assigned To',
  'B2B',
  'Organization',
  'Organization Type',
  'City',
  'Headcount',
  'Existing System',
  'Contact Name',
  'Phone',
  'Designation',
  'Requirement',
  'Details',
  'Objection Type',
  'Loss Reason',
  'Internal Remarks',
  'Last Interaction',
  'Last Note',
  'Next Follow-up',
]

const csvEscape = (value: unknown): string => {
  const text = String(value ?? '')
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

insights.get('/export/leads.csv', async (c) => {
  const items = await listLeads(c.get('db'), c.get('user').sub, 'l.owner_sub = ?', [c.get('user').sub])
  const lines = [EXPORT_HEADERS.join(',')]
  for (const lead of items) {
    lines.push(
      [
        lead.code,
        lead.createdDate,
        lead.source,
        lead.product,
        statusLabel(lead.status),
        lead.priorityScore,
        lead.priorityLevel,
        lead.assignedTo ?? '',
        lead.b2b ? 'Yes' : 'No',
        lead.orgName ?? '',
        lead.orgType ?? '',
        lead.city ?? '',
        lead.headcount ?? '',
        lead.existingSystem ?? '',
        lead.contactName ?? '',
        lead.contactPhone ?? '',
        lead.contactDesignation ?? '',
        lead.requirementSummary ?? '',
        lead.requirementDetails ?? '',
        lead.objectionType ?? '',
        lead.lossReason ?? '',
        lead.internalRemarks ?? '',
        lead.lastInteractionAt ?? '',
        lead.lastNote ?? '',
        lead.nextFollowUp ? `${lead.nextFollowUp.dueDate}${lead.nextFollowUp.dueTime ? ` ${lead.nextFollowUp.dueTime}` : ''}` : '',
      ]
        .map(csvEscape)
        .join(','),
    )
  }
  c.header('Cache-Control', 'private, no-store')
  c.header('Content-Type', 'text/csv; charset=utf-8')
  c.header('Content-Disposition', `attachment; filename="leads-${todayISO()}.csv"`)
  return c.body(lines.join('\r\n'))
})

// Import --------------------------------------------------------------------

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const input = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else if (ch !== '\r') cell += ch
  }
  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

const COLUMN_ALIASES: Record<string, string[]> = {
  code: ['leadid', 'leadcode', 'leadno', 'id', 'srno', 'serialno', 'leadnumber'],
  createdDate: ['createddate', 'createdon', 'date', 'leaddate', 'enquirydate', 'inquirydate'],
  source: ['leadsource', 'source', 'channel', 'leadorigin', 'origin'],
  product: ['productinterest', 'product', 'interest', 'productname', 'requirementproduct'],
  status: ['status', 'leadstatus', 'currentstatus', 'pipeline'],
  assignedTo: ['assignedto', 'assigned', 'owner', 'salesperson', 'salesexecutive', 'handledby'],
  orgName: ['organizationname', 'organization', 'companyname', 'company', 'schoolname', 'school', 'institution', 'businessname', 'business', 'clientcompany'],
  orgType: ['organizationtype', 'orgtype', 'businesstype', 'customertype', 'industrytype', 'category'],
  city: ['city', 'location', 'area', 'town', 'region'],
  headcount: ['headcount', 'noofemployees', 'employees', 'employeecount', 'staff', 'strength', 'totalstaff'],
  existingSystem: ['existingsystem', 'currentsystem', 'existingsoftware', 'currentsoftware', 'software'],
  contactName: ['contactname', 'contactperson', 'contact', 'clientname', 'personname', 'fullname', 'name', 'customername', 'poc'],
  phone: ['phonenumber', 'phone', 'mobilenumber', 'mobile', 'whatsapp', 'whatsappnumber', 'contactnumber', 'number', 'cell', 'cellphone'],
  designation: ['designation', 'title', 'role', 'position', 'jobtitle'],
  requirementSummary: ['requirementsummary', 'requirement', 'requirements', 'need', 'needs', 'requirementbrief'],
  details: ['requirementdetails', 'details', 'detailsgathered', 'additionaldetails'],
  objection: ['objectiontype', 'objection', 'objections', 'concern'],
  lossReason: ['lossreason', 'reasonforloss', 'lostreason'],
  internalRemarks: ['internalremarks', 'remarks', 'comments', 'internalnotes', 'teamremarks'],
  lastNote: ['lastnote', 'lastnotes', 'note', 'notes', 'latestnote', 'lastconversation'],
  followUp: ['followupdate', 'followup', 'nextfollowup', 'nextfollowupdate', 'reminderdate', 'nextcall'],
  templateName: ['templatename', 'scriptname', 'templatetitle', 'nameofscript'],
  templateSegment: ['templatesegment', 'segment'],
  templateProduct: ['templateproduct'],
  usageScenario: ['usagescenario', 'scenario', 'whentouse', 'usecase'],
  templateBody: ['messagebody', 'message', 'body', 'script', 'template', 'whatsappscript', 'text', 'content'],
}

const normalizeHeader = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '')

function detectMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {}
  const used = new Set<number>()
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    const index = headers.findIndex((header, i) => !used.has(i) && aliases.includes(normalizeHeader(header)))
    if (index >= 0) {
      mapping[field] = headers[index]
      used.add(index)
    }
  }
  return mapping
}

function parseSheetDate(value: string | null | undefined): string | null {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10)
  const serial = Number(raw)
  if (Number.isFinite(serial) && serial > 20000 && serial < 80000) {
    const date = new Date(Date.UTC(1899, 11, 30) + serial * DAY)
    return date.toISOString().slice(0, 10)
  }
  let match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(raw)
  if (match) {
    const [, d, m, y] = match
    const year = Number(y.length === 2 ? `20${y}` : y)
    const date = new Date(year, Number(m) - 1, Number(d))
    return Number.isNaN(date.getTime()) ? null : todayISO(date)
  }
  match = /^(\d{1,2})[ -]([A-Za-z]{3,})[ -](\d{2,4})$/.exec(raw)
  if (match) {
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
    const month = months.indexOf(match[2].slice(0, 3).toLowerCase())
    const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3])
    if (month >= 0) {
      const date = new Date(year, month, Number(match[1]))
      return Number.isNaN(date.getTime()) ? null : todayISO(date)
    }
  }
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : todayISO(parsed)
}

interface ParsedSheet {
  kind: 'leads' | 'templates'
  headers: string[]
  mapping: Record<string, string>
  rows: { line: number; cells: Record<string, string> }[]
  skipped: number
}

function parseSheet(csv: string): ParsedSheet {
  const table = parseCsv(csv).filter((row) => row.some((cell) => cell.trim() !== ''))
  if (table.length < 2) return { kind: 'leads', headers: table[0] ?? [], mapping: {}, rows: [], skipped: 0 }
  const headers = table[0].map((h, i) => h.trim() || `Column ${i + 1}`)
  const mapping = detectMapping(headers)
  const index = new Map(headers.map((header, i) => [header, i]))
  const kind: 'leads' | 'templates' = mapping.templateBody && mapping.templateName && !mapping.phone ? 'templates' : 'leads'
  const rows: { line: number; cells: Record<string, string> }[] = []
  let skipped = 0
  table.slice(1).forEach((row, i) => {
    const cells: Record<string, string> = {}
    for (const [field, header] of Object.entries(mapping)) {
      const at = index.get(header)
      cells[field] = at === undefined ? '' : (row[at] ?? '').trim()
    }
    if (kind === 'templates') {
      if (!cells.templateName && !cells.templateBody) {
        skipped++
        return
      }
    } else if (!cells.contactName && !cells.phone && !cells.orgName) {
      // A bare lead ID with nothing else is an empty row (QT-284 onward).
      skipped++
      return
    }
    rows.push({ line: i + 2, cells })
  })
  return { kind, headers, mapping, rows, skipped }
}

const cell = (cells: Record<string, string>, field: string): string => cells[field]?.trim() ?? ''

insights.post('/import/preview', async (c) => {
  const { csv } = await c.req.json<{ csv?: string }>()
  if (!csv || !csv.trim()) return c.json({ error: 'Choose a CSV file first.' }, 400)
  const sheet = parseSheet(csv)
  const statusCount = new Map<string, { mapped: LeadStatusKey | null; count: number }>()
  const previewRows: ImportPreviewRow[] = []

  for (const { line, cells } of sheet.rows) {
    if (sheet.kind === 'templates') continue
    const statusRaw = cell(cells, 'status') || 'New'
    const mapped = mapLegacyStatus(statusRaw)
    const current = statusCount.get(statusRaw) ?? { mapped, count: 0 }
    current.count++
    statusCount.set(statusRaw, current)
    if (previewRows.length < 12) {
      previewRows.push({
        line,
        code: cell(cells, 'code') || null,
        name: cell(cells, 'contactName') || null,
        org: cell(cells, 'orgName') || null,
        phone: cell(cells, 'phone') || null,
        statusRaw,
        status: mapped,
        source: cell(cells, 'source') || null,
        product: cell(cells, 'product') || null,
        followUp: parseSheetDate(cell(cells, 'followUp')),
        note: cell(cells, 'lastNote') || null,
      })
    }
  }

  const existing = await c.get('db').prepare(`SELECT lead_code FROM leads WHERE owner_sub = ?`).bind(c.get('user').sub).all<{ lead_code: string }>()
  const existingSet = new Set(existing.results.map((r) => r.lead_code.toUpperCase()))
  const codes = sheet.rows.map((row) => cell(row.cells, 'code')).filter(Boolean)
  const existingCodes = Array.from(new Set(codes.filter((code) => existingSet.has(code.toUpperCase()))))

  const statuses = [...statusCount.entries()].map(([raw, value]) => ({ raw, mapped: value.mapped, count: value.count })).sort((a, b) => b.count - a.count)
  const body: ImportPreview = {
    kind: sheet.kind,
    total: sheet.rows.length,
    skipped: sheet.skipped,
    headers: sheet.headers,
    mapping: sheet.mapping,
    rows: previewRows,
    statuses,
    unmappedStatuses: statuses.filter((s) => !s.mapped).map((s) => s.raw),
    existingCodes,
  }
  return privateJson(c, body)
})

insights.post('/import', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const user = c.get('user')
  const { csv } = await c.req.json<{ csv?: string }>()
  if (!csv || !csv.trim()) return c.json({ error: 'Choose a CSV file first.' }, 400)
  const sheet = parseSheet(csv)
  const result: ImportResult = { kind: sheet.kind, imported: 0, skipped: sheet.skipped, interactions: 0, templates: 0, errors: [] }

  if (sheet.kind === 'templates') {
    const existing = await db.prepare(`SELECT template_name FROM message_templates WHERE owner_sub = ?`).bind(owner).all<{ template_name: string }>()
    const names = new Set(existing.results.map((r) => r.template_name.toLowerCase()))
    const statements: D1PreparedStatement[] = []
    const t = now()
    for (const { cells } of sheet.rows) {
      const name = cell(cells, 'templateName')
      const body = cell(cells, 'templateBody')
      if (!name || !body) {
        result.skipped++
        continue
      }
      if (names.has(name.toLowerCase())) {
        result.skipped++
        continue
      }
      names.add(name.toLowerCase())
      statements.push(
        db
          .prepare(`INSERT INTO message_templates (id, owner_sub, template_name, segment, product, usage_scenario, message_body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(id(), owner, name, asText(cell(cells, 'templateSegment'), 60), asText(cell(cells, 'templateProduct'), 60), asText(cell(cells, 'usageScenario'), 120), body, t, t),
      )
      result.templates++
    }
    for (let i = 0; i < statements.length; i += 40) await db.batch(statements.slice(i, i + 40))
    return privateJson(c, result)
  }

  const existing = await db.prepare(`SELECT lead_code FROM leads WHERE owner_sub = ?`).bind(owner).all<{ lead_code: string }>()
  const codes = new Set(existing.results.map((r) => r.lead_code.toUpperCase()))
  let maxCode = 0
  for (const code of codes) {
    const match = /(\d+)$/.exec(code)
    if (match) maxCode = Math.max(maxCode, Number(match[1]))
  }
  const statements: D1PreparedStatement[] = []
  const phoneSeen = new Map<string, string>()
  const t = now()

  for (const { line, cells } of sheet.rows) {
    let code = cell(cells, 'code')
    if (code) {
      if (codes.has(code.toUpperCase())) {
        result.skipped++
        continue
      }
    } else {
      maxCode++
      code = `QT-${String(maxCode).padStart(3, '0')}`
    }
    codes.add(code.toUpperCase())

    const statusRaw = cell(cells, 'status')
    const status = mapLegacyStatus(statusRaw) ?? 'new'
    const createdDate = parseSheetDate(cell(cells, 'createdDate')) ?? todayISO()
    const headcount = parseHeadcount(cell(cells, 'headcount'))
    const followUp = parseSheetDate(cell(cells, 'followUp'))
    const phone = normalizePhone(cell(cells, 'phone'))
    const contactName = cell(cells, 'contactName') || cell(cells, 'orgName') || code
    const source = cell(cells, 'source') || 'Other'
    const product = cell(cells, 'product') || ''
    const lastNote = cell(cells, 'lastNote')
    const lossReason = cell(cells, 'lossReason') || (status === 'lost' ? inferredLossReason(statusRaw) ?? 'Other' : null)
    const leadId = id()
    const closed = status === 'won' || status === 'lost'

    if (phone) {
      const key = phoneKey(phone)
      if (phoneSeen.has(key)) {
        result.errors.push(`Line ${line}: ${code} shares a number with ${phoneSeen.get(key)}.`)
      } else phoneSeen.set(key, code)
    }

    const score = computePriority({
      status,
      b2b: false,
      headcount,
      overdueFollowUp: Boolean(followUp && followUp < todayISO() && !closed),
      lastActivityAt: lastNote ? `${createdDate}T12:00:00.000Z` : null,
      createdAt: new Date(`${createdDate}T00:00:00`).getTime(),
    })

    statements.push(
      db
        .prepare(
          `INSERT INTO leads (id, owner_sub, lead_code, created_date, lead_source, product_interest, status, priority_score, assigned_to, b2b, archived, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`,
        )
        .bind(leadId, owner, code, createdDate, source, product, status, score, cell(cells, 'assignedTo') || user.name || null, t, t),
    )
    if (cell(cells, 'orgName')) {
      statements.push(
        db
          .prepare(`INSERT INTO organizations (id, owner_sub, lead_id, organization_name, organization_type, city, headcount, existing_system) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(id(), owner, leadId, cell(cells, 'orgName'), asText(cell(cells, 'orgType'), 60), asText(cell(cells, 'city'), 80), headcount, asText(cell(cells, 'existingSystem'), 120)),
      )
    }
    if (cell(cells, 'contactName') || phone) {
      statements.push(
        db
          .prepare(`INSERT INTO lead_contacts (id, owner_sub, lead_id, full_name, phone_number, designation, contact_role, created_at) VALUES (?, ?, ?, ?, ?, ?, 'Primary', ?)`)
          .bind(id(), owner, leadId, contactName, phone || null, asText(cell(cells, 'designation'), 80), t),
      )
    }
    if (cell(cells, 'requirementSummary') || cell(cells, 'details') || cell(cells, 'objection') || lossReason || cell(cells, 'internalRemarks')) {
      statements.push(
        db
          .prepare(`INSERT INTO requirements (id, owner_sub, lead_id, requirement_summary, requirement_details, objection_type, loss_reason, internal_remarks, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(
            id(),
            owner,
            leadId,
            asText(cell(cells, 'requirementSummary'), 500),
            asText(cell(cells, 'details'), 2000),
            asText(cell(cells, 'objection'), 60),
            asText(lossReason, 120),
            asText(cell(cells, 'internalRemarks'), 2000),
            t,
          ),
      )
    }
    if (lastNote) {
      statements.push(
        db
          .prepare(`INSERT INTO interactions (id, owner_sub, lead_id, interaction_date, channel, outcome, note, status_after, created_at) VALUES (?, ?, ?, ?, 'Note', ?, ?, ?, ?)`)
          .bind(id(), owner, leadId, `${createdDate}T12:00:00.000Z`, 'Imported note', lastNote, status, t),
      )
      result.interactions++
    }
    if (followUp && !closed) {
      statements.push(
        db
          .prepare(`INSERT INTO follow_ups (id, owner_sub, lead_id, due_date, due_time, creation_mode, is_completed, created_at) VALUES (?, ?, ?, ?, NULL, 'Manual', 0, ?)`)
          .bind(id(), owner, leadId, followUp, t),
      )
    }
    result.imported++
  }

  try {
    for (let i = 0; i < statements.length; i += 30) await db.batch(statements.slice(i, i + 30))
  } catch (error) {
    console.error(error)
    return c.json({ error: 'Import stopped part-way. Check the CSV and try again.' }, 500)
  }
  return privateJson(c, result)
})
