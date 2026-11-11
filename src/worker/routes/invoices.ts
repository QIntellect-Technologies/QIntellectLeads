import { Hono } from 'hono'

import { privateJson } from '../auth'
import { id, now } from '../db'
import type { AppContext } from '../env'
import { addDaysISO, todayISO } from '../../shared/leads'
import {
  DEFAULT_INVOICE_SETTINGS,
  calculateInvoiceTotals,
  clampNumber,
  generateInvoiceNumber,
  invoiceStatuses,
  normalizeInvoiceSettings,
} from '../../shared/invoice'
import type {
  InvoiceClient,
  InvoiceDiscountType,
  InvoiceInput,
  InvoiceKind,
  InvoiceLine,
  InvoiceRecord,
  InvoiceSettings,
  InvoicesData,
} from '../../shared/types'

type Row = Record<string, unknown>

const DATE = /^\d{4}-\d{2}-\d{2}$/
const MAX_LINES = 40

const text = (value: unknown, max = 300): string => String(value ?? '').trim().slice(0, max)
const integer = (value: unknown, fallback = 0, min = 0, max = 1_000_000) =>
  Math.round(clampNumber(value, min, max, fallback))
const parseJson = <T>(value: unknown, fallback: T): T => {
  if (typeof value !== 'string' || !value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function normalizeKind(value: unknown): InvoiceKind {
  return value === 'Quotation' ? 'Quotation' : 'Invoice'
}

function normalizeStatus(value: unknown, kind: InvoiceKind): string {
  const status = text(value, 40)
  return invoiceStatuses(kind).includes(status) ? status : 'Draft'
}

function normalizeClient(value: unknown): InvoiceClient {
  const raw = (value && typeof value === 'object' ? value : {}) as Partial<InvoiceClient>
  return {
    name: text(raw.name, 160),
    company: text(raw.company, 180),
    email: text(raw.email, 160),
    phone: text(raw.phone, 80),
    address: text(raw.address, 500),
  }
}

function normalizeLine(value: unknown): InvoiceLine | null {
  const raw = (value && typeof value === 'object' ? value : {}) as Partial<InvoiceLine>
  const description = text(raw.description, 300)
  if (!description) return null
  return {
    id: text(raw.id, 80) || id(),
    description,
    detail: text(raw.detail, 500) || null,
    quantity: Math.round(clampNumber(raw.quantity, 0, 1_000_000, 1) * 100) / 100,
    rate: Math.round(clampNumber(raw.rate, 0, 1_000_000_000, 0) * 100) / 100,
    kind: raw.kind === 'One-time' ? 'One-time' : 'Monthly',
    source: ['Package', 'Setup', 'Users', 'Branches', 'Custom'].includes(String(raw.source))
      ? (raw.source as InvoiceLine['source'])
      : 'Custom',
    enabled: raw.enabled !== false,
  }
}

function normalizeDates(input: InvoiceInput) {
  const issueDate = DATE.test(text(input.issueDate, 10)) ? text(input.issueDate, 10) : todayISO()
  const dueDate = DATE.test(text(input.dueDate, 10)) ? text(input.dueDate, 10) : addDaysISO(14)
  const validUntil = DATE.test(text(input.validUntil, 10)) ? text(input.validUntil, 10) : addDaysISO(30)
  return { issueDate, dueDate, validUntil }
}

function mapInvoice(row: Row): InvoiceRecord {
  const items = parseJson<InvoiceLine[]>(row.items_json, [])
  const discountType: InvoiceDiscountType = row.discount_type === 'percent' ? 'percent' : 'amount'
  const taxEnabled = Boolean(Number(row.tax_enabled ?? 1))
  const taxRate = Number(row.tax_rate ?? 0)
  const storedTotals = parseJson<InvoiceRecord['totals'] | null>(row.totals_json, null)
  const totals =
    storedTotals ??
    calculateInvoiceTotals(items, {
      taxEnabled,
      taxRate,
      discountType,
      discountValue: Number(row.discount_value ?? 0),
    })
  return {
    id: row.id as string,
    kind: normalizeKind(row.kind),
    number: row.number as string,
    status: row.status as string,
    issueDate: row.issue_date as string,
    dueDate: row.due_date as string,
    validUntil: row.valid_until as string,
    client: parseJson<InvoiceClient>(row.client_json, { name: '', company: '', email: '', phone: '', address: '' }),
    subject: (row.subject as string) ?? '',
    packageNumber: row.package_number == null ? null : Number(row.package_number),
    employees: Number(row.employees ?? 0),
    additionalUsers: Number(row.additional_users ?? 0),
    branches: Number(row.branches ?? 0),
    items,
    discountType,
    discountValue: Number(row.discount_value ?? 0),
    taxRate,
    taxLabel: (row.tax_label as string) ?? 'Sales Tax',
    taxEnabled,
    currency: (row.currency as string) ?? 'PKR',
    notes: (row.notes as string) ?? '',
    terms: (row.terms as string) ?? '',
    totals,
    createdAt: Number(row.created_at ?? 0),
    updatedAt: Number(row.updated_at ?? 0),
  }
}

async function loadSettings(db: D1Database, owner: string): Promise<InvoiceSettings> {
  let row = await db.prepare(`SELECT settings_json FROM invoice_settings WHERE owner_sub = ?`).bind(owner).first<{ settings_json: string }>()
  if (!row) {
    const settings = normalizeInvoiceSettings(DEFAULT_INVOICE_SETTINGS)
    await db
      .prepare(`INSERT OR REPLACE INTO invoice_settings (owner_sub, settings_json, updated_at) VALUES (?, ?, ?)`)
      .bind(owner, JSON.stringify(settings), now())
      .run()
    row = { settings_json: JSON.stringify(settings) }
  }
  return normalizeInvoiceSettings(parseJson<InvoiceSettings>(row.settings_json, DEFAULT_INVOICE_SETTINGS))
}

async function numberExists(db: D1Database, owner: string, number: string, excludeId?: string): Promise<boolean> {
  const row = excludeId
    ? await db.prepare(`SELECT id FROM invoices WHERE owner_sub = ? AND number = ? AND id <> ?`).bind(owner, number, excludeId).first()
    : await db.prepare(`SELECT id FROM invoices WHERE owner_sub = ? AND number = ?`).bind(owner, number).first()
  return Boolean(row)
}

async function suggestNumber(db: D1Database, owner: string, prefix: string, issueDate: string): Promise<string> {
  const year = Number(issueDate.slice(0, 4)) || new Date().getFullYear()
  for (let sequence = 1; sequence <= 9999; sequence += 1) {
    const candidate = generateInvoiceNumber(prefix, year, sequence)
    if (!(await numberExists(db, owner, candidate))) return candidate
  }
  throw new Error('Could not allocate the next invoice number.')
}

function buildInvoice(input: InvoiceInput, settings: InvoiceSettings, existingNumber?: string) {
  const kind = normalizeKind(input.kind)
  const client = normalizeClient(input.client)
  if (!client.name) throw new Error('Client name is required.')
  const items = (Array.isArray(input.items) ? input.items : [])
    .slice(0, MAX_LINES)
    .map(normalizeLine)
    .filter((line): line is InvoiceLine => line !== null)
  if (!items.length) throw new Error('Add at least one invoice line.')
  const dates = normalizeDates(input)
  const discountType: InvoiceDiscountType = input.discountType === 'percent' ? 'percent' : 'amount'
  const discountValue = Math.round(clampNumber(input.discountValue, 0, discountType === 'percent' ? 100 : 1_000_000_000, 0) * 100) / 100
  const taxRate = Math.round(clampNumber(input.taxRate, 0, 100, settings.taxRate) * 100) / 100
  const taxEnabled = input.taxEnabled !== false
  const taxLabel = text(input.taxLabel, 60) || settings.taxLabel
  const currency = text(input.currency, 8).toUpperCase() || settings.currency || 'PKR'
  const itemsWithTotals = items
  const totals = calculateInvoiceTotals(itemsWithTotals, { taxEnabled, taxRate, discountType, discountValue })
  return {
    kind,
    number: text(input.number, 60) || existingNumber || '',
    status: normalizeStatus(input.status, kind),
    ...dates,
    client,
    subject: text(input.subject, 240) || 'AI Attendance System — Implementation & Subscription',
    packageNumber: input.packageNumber == null ? null : integer(input.packageNumber, 1, 1, 10),
    employees: integer(input.employees, 1, 0, 10_000_000),
    additionalUsers: integer(input.additionalUsers, 0, 0, 1_000_000),
    branches: integer(input.branches, 0, 0, 1_000_000),
    items: itemsWithTotals,
    discountType,
    discountValue,
    taxRate,
    taxLabel,
    taxEnabled,
    currency,
    notes: text(input.notes, 4000),
    terms: text(input.terms, 4000),
    totals,
  }
}

export const invoices = new Hono<AppContext>()

invoices.get('/invoice-settings', async (c) => {
  const settings = await loadSettings(c.get('db'), c.get('user').sub)
  return privateJson(c, settings)
})

invoices.put('/invoice-settings', async (c) => {
  const input = await c.req.json<unknown>()
  const settings = normalizeInvoiceSettings(input)
  await c.get('db')
    .prepare(`INSERT OR REPLACE INTO invoice_settings (owner_sub, settings_json, updated_at) VALUES (?, ?, ?)`)
    .bind(c.get('user').sub, JSON.stringify(settings), now())
    .run()
  return privateJson(c, settings)
})

invoices.get('/invoices', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const kind = c.req.query('kind')
  const status = c.req.query('status')
  const q = (c.req.query('q') ?? '').trim().toLowerCase()
  const rows = await db
    .prepare(`SELECT * FROM invoices WHERE owner_sub = ? ORDER BY issue_date DESC, created_at DESC LIMIT 600`)
    .bind(owner)
    .all<Row>()
  const all = (rows.results ?? []).map(mapInvoice)
  let items = all
  if (kind === 'Invoice' || kind === 'Quotation') items = items.filter((item) => item.kind === kind)
  if (status) items = items.filter((item) => item.status === status)
  if (q) {
    items = items.filter((item) =>
      [item.number, item.client.name, item.client.company, item.subject, item.status]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q),
    )
  }
  const counts: InvoicesData['counts'] = {
    all: all.length,
    invoices: all.filter((item) => item.kind === 'Invoice').length,
    quotations: all.filter((item) => item.kind === 'Quotation').length,
    paid: all.filter((item) => item.status === 'Paid').length,
    outstanding: all
      .filter((item) => item.kind === 'Invoice' && (item.status === 'Sent' || item.status === 'Partially Paid'))
      .reduce((sum, item) => sum + item.totals.total, 0),
  }
  return privateJson(c, { items, counts } satisfies InvoicesData)
})

invoices.get('/invoices/:id', async (c) => {
  const row = await c.get('db').prepare(`SELECT * FROM invoices WHERE owner_sub = ? AND id = ?`).bind(c.get('user').sub, c.req.param('id')).first<Row>()
  if (!row) return c.json({ error: 'Invoice not found.' }, 404)
  return privateJson(c, mapInvoice(row))
})

invoices.post('/invoices', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const input = await c.req.json<InvoiceInput>()
  const settings = await loadSettings(db, owner)
  let data
  try {
    data = buildInvoice(input, settings)
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Invalid invoice.' }, 400)
  }
  if (!data.number) {
    data.number = await suggestNumber(db, owner, data.kind === 'Quotation' ? settings.quotationPrefix : settings.invoicePrefix, data.issueDate)
  }
  if (await numberExists(db, owner, data.number)) {
    return c.json({ error: `Invoice number ${data.number} is already used. Choose another number.` }, 409)
  }
  const invoiceId = id()
  const timestamp = now()
  try {
    await db
      .prepare(
        `INSERT INTO invoices
          (id, owner_sub, kind, number, status, issue_date, due_date, valid_until, client_json, subject,
           package_number, employees, additional_users, branches, items_json, discount_type, discount_value,
           tax_rate, tax_label, tax_enabled, currency, notes, terms, totals_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        invoiceId,
        owner,
        data.kind,
        data.number,
        data.status,
        data.issueDate,
        data.dueDate,
        data.validUntil,
        JSON.stringify(data.client),
        data.subject,
        data.packageNumber,
        data.employees,
        data.additionalUsers,
        data.branches,
        JSON.stringify(data.items),
        data.discountType,
        data.discountValue,
        data.taxRate,
        data.taxLabel,
        data.taxEnabled ? 1 : 0,
        data.currency,
        data.notes,
        data.terms,
        JSON.stringify(data.totals),
        timestamp,
        timestamp,
      )
      .run()
  } catch (error) {
    console.error(error)
    return c.json({ error: `Could not save ${data.kind.toLowerCase()}. The number ${data.number} may already be used.` }, 409)
  }
  const row = await db.prepare(`SELECT * FROM invoices WHERE owner_sub = ? AND id = ?`).bind(owner, invoiceId).first<Row>()
  return privateJson(c, mapInvoice(row as Row), 201)
})

invoices.put('/invoices/:id', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const invoiceId = c.req.param('id')
  const existing = await db.prepare(`SELECT * FROM invoices WHERE owner_sub = ? AND id = ?`).bind(owner, invoiceId).first<Row>()
  if (!existing) return c.json({ error: 'Invoice not found.' }, 404)
  const input = await c.req.json<InvoiceInput>()
  const settings = await loadSettings(db, owner)
  let data
  try {
    data = buildInvoice(input, settings, existing.number as string)
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Invalid invoice.' }, 400)
  }
  if (await numberExists(db, owner, data.number, invoiceId)) {
    return c.json({ error: `Invoice number ${data.number} is already used. Choose another number.` }, 409)
  }
  await db
    .prepare(
      `UPDATE invoices SET kind = ?, number = ?, status = ?, issue_date = ?, due_date = ?, valid_until = ?,
        client_json = ?, subject = ?, package_number = ?, employees = ?, additional_users = ?, branches = ?,
        items_json = ?, discount_type = ?, discount_value = ?, tax_rate = ?, tax_label = ?, tax_enabled = ?,
        currency = ?, notes = ?, terms = ?, totals_json = ?, updated_at = ?
       WHERE owner_sub = ? AND id = ?`,
    )
    .bind(
      data.kind,
      data.number,
      data.status,
      data.issueDate,
      data.dueDate,
      data.validUntil,
      JSON.stringify(data.client),
      data.subject,
      data.packageNumber,
      data.employees,
      data.additionalUsers,
      data.branches,
      JSON.stringify(data.items),
      data.discountType,
      data.discountValue,
      data.taxRate,
      data.taxLabel,
      data.taxEnabled ? 1 : 0,
      data.currency,
      data.notes,
      data.terms,
      JSON.stringify(data.totals),
      now(),
      owner,
      invoiceId,
    )
    .run()
  const row = await db.prepare(`SELECT * FROM invoices WHERE owner_sub = ? AND id = ?`).bind(owner, invoiceId).first<Row>()
  return privateJson(c, mapInvoice(row as Row))
})

invoices.delete('/invoices/:id', async (c) => {
  await c.get('db').prepare(`DELETE FROM invoices WHERE owner_sub = ? AND id = ?`).bind(c.get('user').sub, c.req.param('id')).run()
  return privateJson(c, { ok: true })
})
