// Types shared by the Worker (src/worker) and the app (src/app).

import type { LeadStatusKey, PriorityLevel } from './leads'

export type ContactStatus = 'lead' | 'active' | 'customer' | 'churned'
export const CONTACT_STATUSES: ContactStatus[] = ['lead', 'active', 'customer', 'churned']

export type DealStage = 'lead' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost'
export const DEAL_STAGES: { key: DealStage; label: string }[] = [
  { key: 'lead', label: 'Lead' },
  { key: 'qualified', label: 'Qualified' },
  { key: 'proposal', label: 'Proposal' },
  { key: 'negotiation', label: 'Negotiation' },
  { key: 'won', label: 'Won' },
  { key: 'lost', label: 'Lost' },
]

export type ActivityKind = 'note' | 'call' | 'email' | 'meeting' | 'stage' | 'file' | 'created'

export interface Company {
  id: string
  name: string
  domain: string | null
  industry: string | null
  size: string | null
  location: string | null
  hue: number
  createdAt: number
  updatedAt: number
  contactCount?: number
  dealCount?: number
  openValue?: number
}

export interface Contact {
  id: string
  companyId: string | null
  companyName?: string | null
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  title: string | null
  status: ContactStatus
  avatarKey: string | null
  hue: number
  lastActivityAt: number
  createdAt: number
  updatedAt: number
}

export interface Deal {
  id: string
  title: string
  companyId: string | null
  companyName?: string | null
  contactId: string | null
  contactName?: string | null
  contactHue?: number | null
  value: number
  stage: DealStage
  position: number
  closeDate: string | null
  createdAt: number
  updatedAt: number
}

export interface Activity {
  id: string
  kind: ActivityKind
  body: string
  contactId: string | null
  dealId: string | null
  companyId: string | null
  contactName?: string | null
  dealTitle?: string | null
  createdAt: number
}

export interface Task {
  id: string
  title: string
  dueAt: number | null
  doneAt: number | null
  contactId: string | null
  dealId: string | null
  contactName?: string | null
  dealTitle?: string | null
  createdAt: number
}

export interface StoredFile {
  id: string
  name: string
  size: number
  mime: string
  contactId: string | null
  dealId: string | null
  companyId: string | null
  createdAt: number
}

export interface Me {
  user: { sub: string; name?: string; email?: string; picture?: string }
  workspace: { name: string; seededAt: number | null }
  capabilities: { database: boolean; files: boolean; auth: 'freebuff' | 'password' | 'development' }
}

export interface Overview {
  kpis: {
    pipelineValue: number
    wonThisMonth: number
    wonLastMonth: number
    openDeals: number
    newContacts: number
    tasksDue: number
  }
  revenueSeries: { label: string; value: number }[]
  stageTotals: { stage: DealStage; count: number; value: number }[]
  recentActivity: Activity[]
  upcomingTasks: Task[]
}

// Lead management ----------------------------------------------------------

export interface Lead {
  id: string
  code: string
  createdDate: string
  source: string
  product: string
  status: LeadStatusKey
  priorityScore: number
  priorityLevel: PriorityLevel
  assignedTo: string | null
  b2b: boolean
  archived: boolean
  createdAt: number
  updatedAt: number
  lastInteractionAt: string | null
}

export interface LeadOrganization {
  id: string
  name: string
  type: string | null
  city: string | null
  headcount: number | null
  existingSystem: string | null
}

export interface LeadContact {
  id: string
  fullName: string
  phone: string | null
  designation: string | null
  role: 'Primary' | 'Point of Contact'
  createdAt: number
}

export interface LeadRequirement {
  id: string
  summary: string | null
  details: string | null
  objectionType: string | null
  lossReason: string | null
  internalRemarks: string | null
}

export interface LeadInteraction {
  id: string
  date: string
  channel: string
  outcome: string | null
  note: string | null
  statusAfter: string | null
  createdAt: number
}

export interface LeadFollowUp {
  id: string
  dueDate: string
  dueTime: string | null
  mode: 'Auto' | 'Manual' | 'Cadence'
  completed: boolean
  completedOn?: string | null
  rescheduleReason?: string | null
  createdAt: number
}

export interface LeadMeeting {
  id: string
  scheduledAt: string
  type: string
  status: string
  notes: string | null
  createdAt: number
}

export interface LeadTemplate {
  id: string
  name: string
  segment: string | null
  product: string | null
  usageScenario: string | null
  body: string
  message?: string
  suggested?: boolean
  createdAt: number
}

export interface LeadFollowUpRef {
  id: string
  dueDate: string
  dueTime: string | null
}

export interface LeadListItem {
  id: string
  code: string
  createdDate: string
  source: string
  product: string
  status: LeadStatusKey
  priorityScore: number
  priorityLevel: PriorityLevel
  assignedTo: string | null
  b2b: boolean
  archived: boolean
  orgName: string | null
  orgType: string | null
  city: string | null
  headcount: number | null
  existingSystem: string | null
  requirementSummary: string | null
  requirementDetails: string | null
  objectionType: string | null
  internalRemarks: string | null
  contactName: string | null
  contactPhone: string | null
  contactDesignation: string | null
  contactRole: string | null
  lastNote: string | null
  lastChannel: string | null
  lastInteractionAt: string | null
  interactionCount: number
  lossReason: string | null
  nextFollowUp: LeadFollowUpRef | null
  overdue: boolean
  dueToday: boolean
}

export interface LeadDetail {
  lead: Lead
  organization: LeadOrganization | null
  contacts: LeadContact[]
  requirement: LeadRequirement | null
  interactions: LeadInteraction[]
  followUps: LeadFollowUp[]
  meetings: LeadMeeting[]
  templates: LeadTemplate[]
}

export interface FollowUpRow {
  followUp: LeadFollowUp
  lead: LeadListItem
}

export interface MeetingRow {
  meeting: LeadMeeting
  lead: Pick<LeadListItem, 'id' | 'code' | 'contactName' | 'contactPhone' | 'orgName'>
}

export interface TodayData {
  today: string
  counts: {
    overdue: number
    dueToday: number
    todayDone: number
    completedToday: number
    meetingsToday: number
    meetingsPending: number
    stale: number
    openLeads: number
  }
  overdue: FollowUpRow[]
  dueToday: FollowUpRow[]
  meetings: MeetingRow[]
  stale: LeadListItem[]
}

// Productivity, notifications and data quality ------------------------------

export type CadenceChannel = 'Call' | 'WhatsApp' | 'Meeting' | 'Email'

export interface CadenceStep {
  days: number
  time: string
  channel: CadenceChannel
}

export interface CadencePlaybook {
  enabled: boolean
  steps: CadenceStep[]
}

export interface CadenceSettings {
  newLead: CadencePlaybook
  proposal: CadencePlaybook
}

export interface NotificationSettings {
  enabled: boolean
  timezone: string
  morning: { enabled: boolean; time: string }
  evening: { enabled: boolean; time: string }
  smtp: {
    host: string
    port: number
    user: string
    from: string
    to: string
    passwordConfigured: boolean
    passwordSource: 'settings' | 'environment' | 'none'
  }
  cadence: CadenceSettings
  lastMorningSentOn: string | null
  lastEveningSentOn: string | null
  logs: EmailLogEntry[]
}

export interface NotificationSettingsInput {
  enabled: boolean
  timezone: string
  morningEnabled: boolean
  morningTime: string
  eveningEnabled: boolean
  eveningTime: string
  smtpHost: string
  smtpPort: number
  smtpUser: string
  smtpPassword?: string
  clearPassword?: boolean
  emailFrom: string
  emailTo: string
  cadence: CadenceSettings
}

export interface EmailLogEntry {
  id: string
  kind: 'morning' | 'evening' | 'test' | 'progress'
  sentOn: string
  sentAt: number
  status: 'sent' | 'error' | 'sending'
  recipient: string
  error: string | null
}

export interface NextActionsData {
  today: string
  queue: FollowUpRow[]
  noNextStep: LeadListItem[]
  progress: {
    completedToday: number
    todayDone: number
    pendingToday: number
    overdue: number
    meetingsToday: number
    meetingsDone: number
    meetingsPending: number
  }
}

export interface DataHealthData {
  counts: {
    noNextStep: number
    duplicateGroups: number
    missingPhone: number
    placeholderNames: number
    stale: number
  }
  noNextStep: LeadListItem[]
  duplicates: { phone: string; leads: Pick<LeadListItem, 'id' | 'code' | 'contactName' | 'orgName' | 'status' | 'assignedTo'>[] }[]
  missingPhone: LeadListItem[]
  placeholderNames: LeadListItem[]
  stale: LeadListItem[]
}

export interface MeetingsData {
  items: MeetingRow[]
  counts: {
    today: number
    yesterday: number
    tomorrow: number
    pending: number
    upcoming: number
    previous: number
    completed: number
    all: number
  }
}

export interface FollowUpsData {
  items: FollowUpRow[]
  counts: {
    total: number
    pending: number
    overdue: number
    today: number
    yesterday: number
    tomorrow: number
    upcoming: number
    previous: number
    completed: number
  }
}

export interface DataSummary {
  counts: {
    leads: number
    interactions: number
    followUps: number
    meetings: number
    contacts: number
    templates: number
    organizations: number
    requirements: number
  }
}

export interface ReportsData {
  totals: { leads: number; open: number; won: number; lost: number; archived: number; conversionRate: number; closedRate: number }
  byStatus: { status: LeadStatusKey; count: number }[]
  bySource: { source: string; leads: number; won: number; lost: number; conversionRate: number }[]
  lossReasons: { reason: string; count: number }[]
  byProduct: { product: string; leads: number; won: number }[]
}

export interface ImportPreviewRow {
  line: number
  code: string | null
  name: string | null
  org: string | null
  phone: string | null
  statusRaw: string | null
  status: LeadStatusKey | null
  source: string | null
  product: string | null
  followUp: string | null
  note: string | null
}

export interface ImportPreview {
  kind: 'leads' | 'templates'
  total: number
  skipped: number
  headers: string[]
  mapping: Record<string, string>
  rows: ImportPreviewRow[]
  statuses: { raw: string; mapped: LeadStatusKey | null; count: number }[]
  unmappedStatuses: string[]
  existingCodes: string[]
}

export interface ImportResult {
  kind: 'leads' | 'templates'
  imported: number
  skipped: number
  interactions: number
  templates: number
  errors: string[]
}

// Invoices and quotations ----------------------------------------------------

export type InvoiceKind = 'Invoice' | 'Quotation'
export type InvoiceLineKind = 'Monthly' | 'One-time'
export type InvoiceDiscountType = 'amount' | 'percent'

export interface InvoicePackage {
  number: number
  label: string
  employeeRange: string
  minEmployees: number
  maxEmployees: number | null
  monthlyRate: number
  setupCharge: number
  branchSetup: number
}

export interface InvoicePricing {
  packages: InvoicePackage[]
  additionalUserMonthly: number
  additionalUserStandard: number
}

export interface InvoiceCompany {
  legalName: string
  displayName: string
  tagline: string
  ntn: string
  contact: string
  email: string
  website: string
  address: string
}

export interface InvoiceBank {
  accountTitle: string
  bankName: string
  iban: string
  ntn: string
}

export interface InvoiceSettings {
  company: InvoiceCompany
  bank: InvoiceBank
  currency: string
  taxRate: number
  taxLabel: string
  taxEnabled: boolean
  defaultTerms: string
  invoicePrefix: string
  quotationPrefix: string
  footerNote: string
  pricing: InvoicePricing
}

export type InvoiceLineSource = 'Package' | 'Setup' | 'Users' | 'Branches' | 'Custom'

export interface InvoiceLine {
  id: string
  description: string
  detail: string | null
  quantity: number
  rate: number
  kind: InvoiceLineKind
  source?: InvoiceLineSource
  /** Excluded lines stay on the draft but are not billed. Missing means included. */
  enabled?: boolean
}

export interface InvoiceClient {
  name: string
  company: string
  email: string
  phone: string
  address: string
}

export interface InvoiceTotals {
  subtotal: number
  discountAmount: number
  taxableAmount: number
  taxRate: number
  taxAmount: number
  total: number
  monthlyRecurring: number
  oneTimeTotal: number
}
export interface InvoiceRecord {
  id: string
  kind: InvoiceKind
  number: string
  status: string
  issueDate: string
  dueDate: string
  validUntil: string
  client: InvoiceClient
  subject: string
  packageNumber: number | null
  employees: number
  additionalUsers: number
  branches: number
  items: InvoiceLine[]
  discountType: InvoiceDiscountType
  discountValue: number
  taxRate: number
  taxLabel: string
  taxEnabled: boolean
  currency: string
  notes: string
  terms: string
  totals: InvoiceTotals
  createdAt: number
  updatedAt: number
}

export interface InvoiceInput {
  kind: InvoiceKind
  number?: string
  status: string
  issueDate: string
  dueDate: string
  validUntil: string
  client: InvoiceClient
  subject: string
  packageNumber: number | null
  employees: number
  additionalUsers: number
  branches: number
  items: InvoiceLine[]
  discountType: InvoiceDiscountType
  discountValue: number
  taxRate: number
  taxLabel: string
  taxEnabled: boolean
  currency: string
  notes: string
  terms: string
}

export interface InvoicesData {
  items: InvoiceRecord[]
  counts: { all: number; invoices: number; quotations: number; paid: number; outstanding: number }
}

