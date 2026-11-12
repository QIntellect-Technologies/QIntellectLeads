// Lead domain rules shared by the Worker and the React app: the standard
// pipeline, scoring, phone handling, WhatsApp helpers and legacy status mapping.

export type LeadStatusKey =
  | 'new'
  | 'contacted'
  | 'connected'
  | 'demo_scheduled'
  | 'demo_done'
  | 'proposal_sent'
  | 'negotiation'
  | 'postponed'
  | 'won'
  | 'lost'

export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info'

export interface LeadStatusDef {
  key: LeadStatusKey
  label: string
  tone: Tone
  base: number
}

export const LEAD_STATUSES: LeadStatusDef[] = [
  { key: 'new', label: 'New', tone: 'neutral', base: 45 },
  { key: 'contacted', label: 'Contacted', tone: 'info', base: 25 },
  { key: 'connected', label: 'Connected', tone: 'info', base: 55 },
  { key: 'demo_scheduled', label: 'Demo Scheduled', tone: 'accent', base: 80 },
  { key: 'demo_done', label: 'Demo Done / Trial', tone: 'accent', base: 80 },
  { key: 'proposal_sent', label: 'Proposal Sent', tone: 'warning', base: 90 },
  { key: 'negotiation', label: 'Negotiation', tone: 'warning', base: 100 },
  { key: 'postponed', label: 'Postponed / On Hold', tone: 'neutral', base: 40 },
  { key: 'won', label: 'Closed Won', tone: 'success', base: 0 },
  { key: 'lost', label: 'Closed Lost', tone: 'danger', base: 0 },
]

export const LEAD_STATUS_KEYS = LEAD_STATUSES.map((s) => s.key)
export const OPEN_STATUS_KEYS = LEAD_STATUS_KEYS.filter((s) => s !== 'won' && s !== 'lost')

export const isLeadStatus = (value: unknown): value is LeadStatusKey => LEAD_STATUS_KEYS.includes(value as LeadStatusKey)
export const isClosedStatus = (value: LeadStatusKey) => value === 'won' || value === 'lost'

export const statusDef = (key: string): LeadStatusDef => LEAD_STATUSES.find((s) => s.key === key) ?? LEAD_STATUSES[0]
export const statusLabel = (key: string): string => statusDef(key).label
export const statusTone = (key: string): Tone => statusDef(key).tone

// Priority ------------------------------------------------------------------

export type PriorityLevel = 'High' | 'Medium-High' | 'Medium' | 'Low' | 'Very Low' | 'Inactive'

export const PRIORITY_LEVELS: PriorityLevel[] = ['High', 'Medium-High', 'Medium', 'Low', 'Very Low', 'Inactive']

export function priorityLevel(score: number): PriorityLevel {
  if (score >= 80) return 'High'
  if (score >= 60) return 'Medium-High'
  if (score >= 40) return 'Medium'
  if (score >= 30) return 'Low'
  if (score >= 1) return 'Very Low'
  return 'Inactive'
}

export const priorityTone = (level: string): Tone => {
  if (level === 'High') return 'danger'
  if (level === 'Medium-High') return 'warning'
  if (level === 'Medium') return 'info'
  if (level === 'Low') return 'neutral'
  if (level === 'Very Low') return 'neutral'
  return 'neutral'
}

const DAY = 86_400_000

/**
 * Base score from the pipeline status, then the agreed adjustments:
 * B2B +15, headcount over 500 +10, overdue follow-up +5, no activity for
 * 14+ days -10. Closed statuses are always 0, and the total caps at 100.
 */
export function computePriority(input: {
  status: LeadStatusKey
  b2b?: boolean | number | null
  headcount?: number | null
  overdueFollowUp?: boolean
  lastActivityAt?: string | number | null
  createdAt: number
  now?: number
}): number {
  if (isClosedStatus(input.status)) return 0
  let score = statusDef(input.status).base
  if (input.b2b) score += 15
  if (Number(input.headcount ?? 0) > 500) score += 10
  if (input.overdueFollowUp) score += 5
  const last = input.lastActivityAt ? new Date(input.lastActivityAt).getTime() : input.createdAt
  const now = input.now ?? Date.now()
  if (Number.isFinite(last) && now - last > 14 * DAY) score -= 10
  return Math.max(0, Math.min(100, Math.round(score)))
}

// Phone ---------------------------------------------------------------------

/** Store every number in +92 format; everything else is kept as +<digits>. */
export function normalizePhone(input: string | null | undefined): string {
  const digits = String(input ?? '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('92')) return `+${digits}`
  if (digits.startsWith('0')) return `+92${digits.slice(1)}`
  if (digits.length === 10 && digits.startsWith('3')) return `+92${digits}`
  return `+${digits}`
}

/** Duplicate detection compares the last 10 digits only. */
export const phoneKey = (input: string | null | undefined): string => String(input ?? '').replace(/\D/g, '').slice(-10)

export function whatsappLink(phone: string | null | undefined, message: string): string {
  const digits = String(phone ?? '').replace(/\D/g, '')
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
}

// Message templates ---------------------------------------------------------

export const PLACEHOLDERS = ['Name', 'First Name', 'Company Name', 'Company/School Name', 'Restaurant Name', 'Product', 'City', 'Organization Type', 'Lead ID', 'Designation', 'My Name'] as const

export interface TemplateContext {
  name?: string | null
  firstName?: string | null
  company?: string | null
  product?: string | null
  city?: string | null
  orgType?: string | null
  leadCode?: string | null
  designation?: string | null
  myName?: string | null
}

export function fillTemplate(body: string, ctx: TemplateContext): string {
  const values: Record<string, string> = {
    name: ctx.name ?? '',
    'first name': ctx.firstName ?? (ctx.name ? ctx.name.split(/\s+/)[0] : ''),
    company: ctx.company ?? '',
    'company name': ctx.company ?? '',
    'company/school name': ctx.company ?? '',
    'school name': ctx.company ?? '',
    'restaurant name': ctx.company ?? '',
    product: ctx.product ?? '',
    city: ctx.city ?? '',
    'organization type': ctx.orgType ?? '',
    'lead id': ctx.leadCode ?? '',
    designation: ctx.designation ?? '',
    'my name': ctx.myName ?? '',
  }
  return body.replace(/\[([^\]]{1,40})\]/g, (match, raw: string) => {
    const key = raw.trim().toLowerCase()
    return key in values ? values[key] : match
  })
}

// Fixed vocabularies --------------------------------------------------------

export const LEAD_SOURCES = ['Meta Ads', 'WhatsApp', 'Referral', 'Website', 'Walk-in', 'Cold Call', 'Other']

export const PRODUCTS = ['AI Attendance System', 'GPS Tracking', 'HR / Payroll', 'AI Chatbot']

export const ORG_TYPES = [
  'School',
  'College',
  'Educational Institute',
  'Factory',
  'Manufacturer',
  'Distributor',
  'Retailer',
  'Office',
  'Service Provider',
  'Government',
  'Hospital',
  'Medical Sector',
  'Restaurant',
  'Retail',
  'Other',
]

export const LOSS_REASONS = [
  'Price too high',
  'Chose another system',
  'Prefers one-time or hardware purchase',
  'No response',
  'No current requirement',
  'Wrong lead (job seeker, personal use)',
  'Budget not available',
  'Integration or network issue',
  'Other',
]

export const OBJECTION_TYPES = ['Pricing', 'Existing system', 'Integration', 'Network/Internet', 'Needs management approval', 'No requirement', 'Other']

export const CHANNELS = ['Call', 'WhatsApp', 'Meeting', 'Email'] as const
export const CALL_RESULTS = ['Connected', 'No answer', 'Busy', 'Voicemail', 'Wrong number', 'Callback requested', 'Unknown'] as const
export type CallResult = (typeof CALL_RESULTS)[number]
export const NO_RESPONSE_CALL_RESULTS = ['No answer', 'Busy', 'Voicemail'] as const
export const isCallResult = (value: unknown): value is CallResult =>
  typeof value === 'string' && CALL_RESULTS.includes(value as CallResult)
export const MEETING_TYPES = ['Call', 'Demo', 'Physical', 'Technical', 'Meeting'] as const
export const MEETING_STATUSES = ['Scheduled', 'Done', 'Cancelled'] as const
export const CONTACT_ROLES = ['Primary', 'Point of Contact'] as const

export const TEMPLATE_SEGMENTS = ['Intro', 'Follow-up', 'Demo', 'Pricing', 'Call', 'Postponed', 'Closing', 'Other']

// Dates ---------------------------------------------------------------------

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const asDate = (value: string | number | Date | null | undefined): Date | null => {
  if (value === null || value === undefined || value === '') return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value === 'number') return new Date(value)
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date
}

/** DD-MMM-YYYY, the format the sales team uses. */
export function dmy(value: string | number | Date | null | undefined): string {
  const date = asDate(value)
  if (!date) return ''
  return `${String(date.getDate()).padStart(2, '0')}-${MONTHS[date.getMonth()]}-${date.getFullYear()}`
}

export function dmyTime(value: string | number | Date | null | undefined): string {
  const date = asDate(value)
  if (!date) return ''
  const hours = date.getHours()
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const suffix = hours >= 12 ? 'pm' : 'am'
  const h12 = hours % 12 === 0 ? 12 : hours % 12
  return `${dmy(date)} ${h12}:${minutes} ${suffix}`
}

export function timeLabel(value: string | null | undefined): string {
  if (!value) return ''
  const [h, m] = value.split(':').map(Number)
  if (!Number.isFinite(h)) return value
  const suffix = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m ?? 0).padStart(2, '0')} ${suffix}`
}

/** Time of day in the viewer's timezone, for ISO timestamps. */
export function timeOfDay(value: string | number | Date | null | undefined): string {
  const date = asDate(value)
  if (!date) return ''
  const hours = date.getHours()
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const suffix = hours >= 12 ? 'pm' : 'am'
  const h12 = hours % 12 === 0 ? 12 : hours % 12
  return `${h12}:${minutes} ${suffix}`
}

/** Date-only imported meetings were stored at local midnight. */
export function meetingTime(value: string | number | Date | null | undefined): string {
  const date = asDate(value)
  if (!date) return ''
  return date.getHours() === 0 && date.getMinutes() === 0 ? 'Time not set' : timeOfDay(date)
}

export const toISODate = (date: Date): string => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

export const todayISO = (now = new Date()): string => toISODate(now)

export function addDaysISO(days: number, from = new Date()): string {
  const date = new Date(from)
  date.setDate(date.getDate() + days)
  return toISODate(date)
}

export const isPastDate = (date: string | null | undefined, today = todayISO()): boolean => Boolean(date && date < today)
export const isToday = (date: string | null | undefined, today = todayISO()): boolean => Boolean(date && date.slice(0, 10) === today)

// Legacy import mapping -----------------------------------------------------

const normalizeLegacy = (raw: string): string =>
  raw
    .toLowerCase()
    .replace(/[^a-z0-9+/ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** Old sheet statuses and the standard pipeline value each one becomes. */
export const LEGACY_STATUS_MAP: Record<string, LeadStatusKey> = {
  new: 'new',
  fresh: 'new',
  'new lead': 'new',

  contacted: 'contacted',
  'call attempted': 'contacted',
  'not responding': 'contacted',
  'no response': 'contacted',
  'not answering': 'contacted',
  'call not received': 'contacted',

  connected: 'connected',
  interested: 'connected',
  'follow up required': 'connected',
  'follow-up required': 'connected',
  'follow up': 'connected',

  'demo scheduled': 'demo_scheduled',
  'demo fixed': 'demo_scheduled',
  'meeting scheduled': 'demo_scheduled',

  'demo done': 'demo_done',
  'demo done / trial': 'demo_done',
  'demo given': 'demo_done',
  trial: 'demo_done',
  'trial started': 'demo_done',

  'proposal sent': 'proposal_sent',
  proposal: 'proposal_sent',
  quotation: 'proposal_sent',
  'quotation sent': 'proposal_sent',
  'price high': 'proposal_sent',

  negotiation: 'negotiation',
  negotiating: 'negotiation',

  postponed: 'postponed',
  'postponed / on hold': 'postponed',
  'on hold': 'postponed',
  hold: 'postponed',
  'immature lead': 'postponed',
  'future prospect': 'postponed',

  'closed won': 'won',
  won: 'won',
  converted: 'won',
  'deal closed': 'won',
  'deal done': 'won',

  'closed lost': 'lost',
  lost: 'lost',
  'not interested': 'lost',
  'not relevant': 'lost',
  'wrong lead': 'lost',
  junk: 'lost',
  'job seeker': 'lost',
}

/** Returns null when a legacy value is not recognised, so import can report it. */
export function mapLegacyStatus(raw: string | null | undefined): LeadStatusKey | null {
  const key = normalizeLegacy(String(raw ?? ''))
  if (!key) return null
  if (LEGACY_STATUS_MAP[key]) return LEGACY_STATUS_MAP[key]
  if (key.includes('won') || key.includes('convert')) return 'won'
  if (key.includes('lost') || key.includes('not interested') || key.includes('not relevant')) return 'lost'
  if (key.includes('postpone') || key.includes('hold') || key.includes('immature')) return 'postponed'
  if (key.includes('negotiat')) return 'negotiation'
  if (key.includes('proposal') || key.includes('quotation') || key.includes('price high')) return 'proposal_sent'
  if (key.includes('demo')) return key.includes('done') || key.includes('given') ? 'demo_done' : 'demo_scheduled'
  if (key.includes('connect') || key.includes('interest')) return 'connected'
  if (key.includes('call') || key.includes('respond')) return 'contacted'
  if (key.includes('new')) return 'new'
  return null
}

/** Default loss reason inferred while mapping old lost statuses. */
export function inferredLossReason(raw: string | null | undefined): string | null {
  const key = normalizeLegacy(String(raw ?? ''))
  if (!key) return null
  if (key.includes('not interested') || key.includes('not relevant')) return 'No current requirement'
  if (key.includes('job seeker') || key.includes('wrong lead')) return 'Wrong lead (job seeker, personal use)'
  if (key.includes('price')) return 'Price too high'
  if (key.includes('budget')) return 'Budget not available'
  if (key.includes('network') || key.includes('integration')) return 'Integration or network issue'
  return null
}

/**
 * A client who postponed for a personal or family reason should not be pushed
 * a pricing or discount script.
 */
export function shouldSuppressPricing(status: string, text: string | null | undefined): boolean {
  if (status !== 'postponed') return false
  const haystack = String(text ?? '').toLowerCase()
  return /family|personal|marriage|wedding|bereave|death|health|medical|illness|emergency|visa|abroad/.test(haystack)
}
