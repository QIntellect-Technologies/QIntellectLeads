import type { MiddlewareHandler } from 'hono'

import type { AppContext } from './env'

// Schema lives with the Worker: D1 has no migration tool on Freebuff Sites, so
// tables are created on the first request of each isolate (cheap: one batch of
// IF NOT EXISTS statements). Add new statements at the end for new columns or
// tables; never edit existing ones in place once deployed.
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS workspaces (
    owner_sub TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    seeded_at INTEGER,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS companies (
    id TEXT PRIMARY KEY,
    owner_sub TEXT NOT NULL,
    name TEXT NOT NULL,
    domain TEXT,
    industry TEXT,
    size TEXT,
    location TEXT,
    hue INTEGER NOT NULL DEFAULT 220,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS companies_owner ON companies(owner_sub, name)`,
  `CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY,
    owner_sub TEXT NOT NULL,
    company_id TEXT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL DEFAULT '',
    email TEXT,
    phone TEXT,
    title TEXT,
    status TEXT NOT NULL DEFAULT 'lead',
    avatar_key TEXT,
    hue INTEGER NOT NULL DEFAULT 220,
    last_activity_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS contacts_owner ON contacts(owner_sub, last_activity_at DESC)`,
  `CREATE INDEX IF NOT EXISTS contacts_company ON contacts(owner_sub, company_id)`,
  `CREATE TABLE IF NOT EXISTS deals (
    id TEXT PRIMARY KEY,
    owner_sub TEXT NOT NULL,
    title TEXT NOT NULL,
    company_id TEXT,
    contact_id TEXT,
    value INTEGER NOT NULL DEFAULT 0,
    stage TEXT NOT NULL DEFAULT 'lead',
    position REAL NOT NULL DEFAULT 0,
    close_date TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS deals_owner ON deals(owner_sub, stage, position)`,
  `CREATE TABLE IF NOT EXISTS activities (
    id TEXT PRIMARY KEY,
    owner_sub TEXT NOT NULL,
    kind TEXT NOT NULL,
    body TEXT NOT NULL,
    contact_id TEXT,
    deal_id TEXT,
    company_id TEXT,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS activities_owner ON activities(owner_sub, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS activities_contact ON activities(owner_sub, contact_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS activities_deal ON activities(owner_sub, deal_id, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    owner_sub TEXT NOT NULL,
    title TEXT NOT NULL,
    due_at INTEGER,
    done_at INTEGER,
    contact_id TEXT,
    deal_id TEXT,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS tasks_owner ON tasks(owner_sub, done_at, due_at)`,
  `CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    owner_sub TEXT NOT NULL,
    key TEXT NOT NULL,
    name TEXT NOT NULL,
    size INTEGER NOT NULL,
    mime TEXT NOT NULL,
    contact_id TEXT,
    deal_id TEXT,
    company_id TEXT,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS files_owner ON files(owner_sub, created_at DESC)`,

  // --- Lead management -----------------------------------------------------
  // The new domain lives beside the original CRM tables so existing workspaces
  // upgrade in place. `lead_contacts` avoids the old contacts table name.
  `CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY,
    owner_sub TEXT NOT NULL,
    lead_code TEXT NOT NULL,
    created_date TEXT NOT NULL,
    lead_source TEXT NOT NULL DEFAULT 'Other',
    product_interest TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'new',
    priority_score INTEGER NOT NULL DEFAULT 0,
    assigned_to TEXT,
    b2b INTEGER NOT NULL DEFAULT 0,
    archived INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS leads_owner_code ON leads(owner_sub, lead_code)`,
  `CREATE INDEX IF NOT EXISTS leads_owner_status ON leads(owner_sub, archived, status)`,
  `CREATE TABLE IF NOT EXISTS organizations (
    id TEXT PRIMARY KEY,
    owner_sub TEXT NOT NULL,
    lead_id TEXT NOT NULL,
    organization_name TEXT NOT NULL,
    organization_type TEXT,
    city TEXT,
    headcount INTEGER,
    existing_system TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS organizations_lead ON organizations(owner_sub, lead_id)`,
  `CREATE TABLE IF NOT EXISTS lead_contacts (
    id TEXT PRIMARY KEY,
    owner_sub TEXT NOT NULL,
    lead_id TEXT NOT NULL,
    full_name TEXT NOT NULL,
    phone_number TEXT,
    designation TEXT,
    contact_role TEXT NOT NULL DEFAULT 'Primary',
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS lead_contacts_lead ON lead_contacts(owner_sub, lead_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS requirements (
    id TEXT PRIMARY KEY,
    owner_sub TEXT NOT NULL,
    lead_id TEXT NOT NULL,
    requirement_summary TEXT,
    requirement_details TEXT,
    objection_type TEXT,
    loss_reason TEXT,
    internal_remarks TEXT,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS requirements_lead ON requirements(owner_sub, lead_id)`,
  `CREATE TABLE IF NOT EXISTS interactions (
    id TEXT PRIMARY KEY,
    owner_sub TEXT NOT NULL,
    lead_id TEXT NOT NULL,
    interaction_date TEXT NOT NULL,
    channel TEXT NOT NULL,
    outcome TEXT,
    note TEXT,
    status_after TEXT,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS interactions_lead ON interactions(owner_sub, lead_id, interaction_date DESC)`,
  `CREATE TABLE IF NOT EXISTS follow_ups (
    id TEXT PRIMARY KEY,
    owner_sub TEXT NOT NULL,
    lead_id TEXT NOT NULL,
    due_date TEXT NOT NULL,
    due_time TEXT,
    creation_mode TEXT NOT NULL DEFAULT 'Manual',
    is_completed INTEGER NOT NULL DEFAULT 0,
    completed_on TEXT,
    completed_at INTEGER,
    reschedule_reason TEXT,
    rescheduled_at INTEGER,
    rescheduled_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS follow_ups_lead ON follow_ups(owner_sub, lead_id, is_completed, due_date)`,
  `CREATE INDEX IF NOT EXISTS follow_ups_open ON follow_ups(owner_sub, is_completed, due_date)`,
  `CREATE TABLE IF NOT EXISTS meetings (
    id TEXT PRIMARY KEY,
    owner_sub TEXT NOT NULL,
    lead_id TEXT NOT NULL,
    scheduled_at TEXT NOT NULL,
    meeting_type TEXT NOT NULL DEFAULT 'Call',
    meeting_status TEXT NOT NULL DEFAULT 'Scheduled',
    meeting_notes TEXT,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS meetings_lead ON meetings(owner_sub, lead_id, scheduled_at DESC)`,
  `CREATE INDEX IF NOT EXISTS meetings_day ON meetings(owner_sub, scheduled_at)`,
  `CREATE TABLE IF NOT EXISTS message_templates (
    id TEXT PRIMARY KEY,
    owner_sub TEXT NOT NULL,
    template_name TEXT NOT NULL,
    segment TEXT,
    product TEXT,
    usage_scenario TEXT,
    message_body TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS message_templates_owner ON message_templates(owner_sub, template_name)`,
  `CREATE TABLE IF NOT EXISTS lead_workspace (
    owner_sub TEXT PRIMARY KEY,
    seeded_at INTEGER
  )`,

  // --- Productivity and notifications -------------------------------------
  `CREATE TABLE IF NOT EXISTS notification_settings (
    owner_sub TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL DEFAULT 1,
    timezone TEXT NOT NULL DEFAULT 'Asia/Karachi',
    morning_enabled INTEGER NOT NULL DEFAULT 1,
    morning_time TEXT NOT NULL DEFAULT '08:30',
    evening_enabled INTEGER NOT NULL DEFAULT 1,
    evening_time TEXT NOT NULL DEFAULT '18:30',
    smtp_host TEXT NOT NULL DEFAULT 'smtp.gmail.com',
    smtp_port INTEGER NOT NULL DEFAULT 465,
    smtp_user TEXT,
    smtp_password TEXT,
    email_from TEXT,
    email_to TEXT,
    cadence_json TEXT,
    last_morning_sent_on TEXT,
    last_evening_sent_on TEXT,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS email_log (
    id TEXT PRIMARY KEY,
    owner_sub TEXT NOT NULL,
    kind TEXT NOT NULL,
    sent_on TEXT NOT NULL,
    sent_at INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'sending',
    recipient TEXT NOT NULL,
    error TEXT,
    attempts INTEGER NOT NULL DEFAULT 1
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS email_log_once ON email_log(owner_sub, kind, sent_on)`,
  `CREATE INDEX IF NOT EXISTS email_log_recent ON email_log(owner_sub, sent_at DESC)`,
  `CREATE TABLE IF NOT EXISTS cadence_runs (
    owner_sub TEXT NOT NULL,
    lead_id TEXT NOT NULL,
    cadence_key TEXT NOT NULL,
    applied_at INTEGER NOT NULL,
    PRIMARY KEY(owner_sub, lead_id, cadence_key)
  )`,

  // --- Invoices and quotations ---------------------------------------------
  `CREATE TABLE IF NOT EXISTS invoice_settings (
    owner_sub TEXT PRIMARY KEY,
    settings_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY,
    owner_sub TEXT NOT NULL,
    kind TEXT NOT NULL,
    number TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Draft',
    issue_date TEXT NOT NULL,
    due_date TEXT NOT NULL,
    valid_until TEXT NOT NULL,
    client_json TEXT NOT NULL,
    subject TEXT NOT NULL,
    package_number INTEGER,
    employees INTEGER NOT NULL DEFAULT 1,
    additional_users INTEGER NOT NULL DEFAULT 0,
    branches INTEGER NOT NULL DEFAULT 0,
    items_json TEXT NOT NULL,
    discount_type TEXT NOT NULL DEFAULT 'amount',
    discount_value REAL NOT NULL DEFAULT 0,
    tax_rate REAL NOT NULL DEFAULT 16,
    tax_label TEXT NOT NULL DEFAULT 'Sales Tax',
    tax_enabled INTEGER NOT NULL DEFAULT 1,
    currency TEXT NOT NULL DEFAULT 'PKR',
    notes TEXT NOT NULL DEFAULT '',
    terms TEXT NOT NULL DEFAULT '',
    totals_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS invoices_owner_number ON invoices(owner_sub, number)`,
  `CREATE INDEX IF NOT EXISTS invoices_owner_kind ON invoices(owner_sub, kind, issue_date DESC)`,
  `CREATE INDEX IF NOT EXISTS interactions_call ON interactions(owner_sub, channel, interaction_date DESC)`,

  // --- Calling list --------------------------------------------------------
  // Number-first outreach list imported from the company workbook. It stays
  // separate from leads until someone converts a number, so the two datasets
  // can grow independently. `phone_key` is the last 10 digits, which is how
  // duplicates are found across every source sheet.
  `CREATE TABLE IF NOT EXISTS outreach_contacts (
    id TEXT PRIMARY KEY,
    owner_sub TEXT NOT NULL,
    phone TEXT NOT NULL,
    phone_key TEXT NOT NULL,
    person_name TEXT,
    company_name TEXT,
    designation TEXT,
    city TEXT,
    address TEXT,
    email TEXT,
    source_list TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Not called',
    last_result TEXT,
    last_called_at INTEGER,
    notes TEXT,
    converted_lead_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS outreach_contacts_owner_phone ON outreach_contacts(owner_sub, phone_key)`,
  `CREATE INDEX IF NOT EXISTS outreach_contacts_owner_status ON outreach_contacts(owner_sub, status, company_name)`,
  `CREATE INDEX IF NOT EXISTS outreach_contacts_owner_source ON outreach_contacts(owner_sub, source_list)`,
  `CREATE TABLE IF NOT EXISTS outreach_calls (
    id TEXT PRIMARY KEY,
    owner_sub TEXT NOT NULL,
    contact_id TEXT NOT NULL,
    called_at INTEGER NOT NULL,
    result TEXT NOT NULL,
    direction TEXT,
    note TEXT,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS outreach_calls_contact ON outreach_calls(owner_sub, contact_id, called_at DESC)`,
]

async function addColumnIfMissing(db: D1Database, table: string, column: string, definition: string) {
  const info = await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>()
  if (!info.results.some((row) => row.name === column)) {
    await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run()
  }
}

let ready: Promise<void> | undefined

export function ensureSchema(db: D1Database): Promise<void> {
  ready ??= db
    .batch(SCHEMA.map((sql) => db.prepare(sql)))
    .then(async () => {
      // D1 has no migration runner. Existing workspaces get the new columns
      // added once per isolate; fresh workspaces already have them above.
      await addColumnIfMissing(db, 'follow_ups', 'completed_on', 'TEXT')
      await addColumnIfMissing(db, 'follow_ups', 'completed_at', 'INTEGER')
      await addColumnIfMissing(db, 'follow_ups', 'reschedule_reason', 'TEXT')
      await addColumnIfMissing(db, 'follow_ups', 'rescheduled_at', 'INTEGER')
      await addColumnIfMissing(db, 'follow_ups', 'rescheduled_count', 'INTEGER NOT NULL DEFAULT 0')

      // Call details on the existing interaction timeline. These are additive
      // so old workspaces keep every call note and simply gain a result.
      await addColumnIfMissing(db, 'interactions', 'call_result', 'TEXT')
      await addColumnIfMissing(db, 'interactions', 'call_direction', 'TEXT')
      await addColumnIfMissing(db, 'interactions', 'contact_id', 'TEXT')
      await addColumnIfMissing(db, 'interactions', 'contact_name', 'TEXT')
      await addColumnIfMissing(db, 'interactions', 'phone_number', 'TEXT')
      await db
        .prepare(
          `UPDATE interactions SET call_result = CASE
             WHEN lower(COALESCE(outcome, '')) LIKE '%wrong number%' THEN 'Wrong number'
             WHEN lower(COALESCE(outcome, '')) LIKE '%voicemail%' OR lower(COALESCE(outcome, '')) LIKE '%voice mail%' THEN 'Voicemail'
             WHEN lower(COALESCE(outcome, '')) LIKE '%busy%' THEN 'Busy'
             WHEN lower(COALESCE(outcome, '')) LIKE '%callback%' THEN 'Callback requested'
             WHEN lower(COALESCE(outcome, '')) LIKE '%no answer%' OR lower(COALESCE(outcome, '')) LIKE '%not answer%'
               OR lower(COALESCE(outcome, '')) LIKE '%no response%' OR lower(COALESCE(outcome, '')) LIKE '%not responding%'
               OR lower(COALESCE(outcome, '')) LIKE '%not received%' OR lower(COALESCE(outcome, '')) LIKE '%unreachable%'
               OR lower(COALESCE(outcome, '')) LIKE '%call attempted%' THEN 'No answer'
             WHEN lower(COALESCE(outcome, '')) LIKE '%connect%' OR lower(COALESCE(outcome, '')) LIKE '%conversation%'
               OR lower(COALESCE(outcome, '')) LIKE '%spoke%' THEN 'Connected'
             ELSE 'Unknown'
           END
           WHERE channel = 'Call' AND call_result IS NULL`,
        )
        .run()
    })
    .then(
      () => undefined,
      (error) => {
        ready = undefined
        throw error
      },
    )
  return ready
}

/** Rejects early with a clear message when the database binding is missing. */
export const requireDb: MiddlewareHandler<AppContext> = async (c, next) => {
  const db = c.env.DB
  if (!db) {
    return c.json(
      { error: 'database_missing', message: 'No database is attached yet. Add D1 storage named DB and redeploy.' },
      503,
    )
  }
  await ensureSchema(db)
  c.set('db', db)
  await next()
}

export const id = () => crypto.randomUUID()
export const now = () => Date.now()

export function hueFor(text: string): number {
  let h = 0
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) % 360
  return h
}

type Row = Record<string, unknown>

export function mapCompany(r: Row) {
  return {
    id: r.id as string,
    name: r.name as string,
    domain: (r.domain as string | null) ?? null,
    industry: (r.industry as string | null) ?? null,
    size: (r.size as string | null) ?? null,
    location: (r.location as string | null) ?? null,
    hue: Number(r.hue ?? 220),
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
    ...(r.contact_count !== undefined ? { contactCount: Number(r.contact_count) } : {}),
    ...(r.deal_count !== undefined ? { dealCount: Number(r.deal_count) } : {}),
    ...(r.open_value !== undefined ? { openValue: Number(r.open_value ?? 0) } : {}),
  }
}

export function mapContact(r: Row) {
  return {
    id: r.id as string,
    companyId: (r.company_id as string | null) ?? null,
    companyName: (r.company_name as string | null) ?? null,
    firstName: r.first_name as string,
    lastName: (r.last_name as string) ?? '',
    email: (r.email as string | null) ?? null,
    phone: (r.phone as string | null) ?? null,
    title: (r.title as string | null) ?? null,
    status: r.status as 'lead' | 'active' | 'customer' | 'churned',
    avatarKey: (r.avatar_key as string | null) ?? null,
    hue: Number(r.hue ?? 220),
    lastActivityAt: Number(r.last_activity_at),
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  }
}

export function mapDeal(r: Row) {
  return {
    id: r.id as string,
    title: r.title as string,
    companyId: (r.company_id as string | null) ?? null,
    companyName: (r.company_name as string | null) ?? null,
    contactId: (r.contact_id as string | null) ?? null,
    contactName: (r.contact_name as string | null) ?? null,
    contactHue: r.contact_hue === null || r.contact_hue === undefined ? null : Number(r.contact_hue),
    value: Number(r.value ?? 0),
    stage: r.stage as 'lead' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost',
    position: Number(r.position ?? 0),
    closeDate: (r.close_date as string | null) ?? null,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  }
}

export function mapActivity(r: Row) {
  return {
    id: r.id as string,
    kind: r.kind as 'note' | 'call' | 'email' | 'meeting' | 'stage' | 'file' | 'created',
    body: r.body as string,
    contactId: (r.contact_id as string | null) ?? null,
    dealId: (r.deal_id as string | null) ?? null,
    companyId: (r.company_id as string | null) ?? null,
    contactName: (r.contact_name as string | null) ?? null,
    dealTitle: (r.deal_title as string | null) ?? null,
    createdAt: Number(r.created_at),
  }
}

export function mapTask(r: Row) {
  return {
    id: r.id as string,
    title: r.title as string,
    dueAt: r.due_at === null || r.due_at === undefined ? null : Number(r.due_at),
    doneAt: r.done_at === null || r.done_at === undefined ? null : Number(r.done_at),
    contactId: (r.contact_id as string | null) ?? null,
    dealId: (r.deal_id as string | null) ?? null,
    contactName: (r.contact_name as string | null) ?? null,
    dealTitle: (r.deal_title as string | null) ?? null,
    createdAt: Number(r.created_at),
  }
}

export function mapFile(r: Row) {
  return {
    id: r.id as string,
    name: r.name as string,
    size: Number(r.size),
    mime: r.mime as string,
    contactId: (r.contact_id as string | null) ?? null,
    dealId: (r.deal_id as string | null) ?? null,
    companyId: (r.company_id as string | null) ?? null,
    createdAt: Number(r.created_at),
  }
}

export const CONTACT_SELECT = `
  SELECT c.*, co.name AS company_name
  FROM contacts c LEFT JOIN companies co ON co.id = c.company_id AND co.owner_sub = c.owner_sub`

export const DEAL_SELECT = `
  SELECT d.*, co.name AS company_name,
    CASE WHEN ct.id IS NULL THEN NULL ELSE ct.first_name || ' ' || ct.last_name END AS contact_name,
    ct.hue AS contact_hue
  FROM deals d
  LEFT JOIN companies co ON co.id = d.company_id AND co.owner_sub = d.owner_sub
  LEFT JOIN contacts ct ON ct.id = d.contact_id AND ct.owner_sub = d.owner_sub`

export const ACTIVITY_SELECT = `
  SELECT a.*,
    CASE WHEN ct.id IS NULL THEN NULL ELSE ct.first_name || ' ' || ct.last_name END AS contact_name,
    d.title AS deal_title
  FROM activities a
  LEFT JOIN contacts ct ON ct.id = a.contact_id AND ct.owner_sub = a.owner_sub
  LEFT JOIN deals d ON d.id = a.deal_id AND d.owner_sub = a.owner_sub`

export const TASK_SELECT = `
  SELECT t.*,
    CASE WHEN ct.id IS NULL THEN NULL ELSE ct.first_name || ' ' || ct.last_name END AS contact_name,
    d.title AS deal_title
  FROM tasks t
  LEFT JOIN contacts ct ON ct.id = t.contact_id AND ct.owner_sub = t.owner_sub
  LEFT JOIN deals d ON d.id = t.deal_id AND d.owner_sub = t.owner_sub`
