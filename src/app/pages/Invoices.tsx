import {
  ArrowLeft,
  BadgeCheck,
  Banknote,
  Check,
  FileText,
  Landmark,
  PencilLine,
  Plus,
  Printer,
  ReceiptText,
  Save,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'

import { InvoiceDocument } from '../components/InvoiceDocument'
import { Badge, Button, Card, Checkbox, EmptyState, Field, Input, PageHeader, Select, Skeleton, Textarea, useToast } from '../components/ui'
import { api, useApiMutation, useInvoice, useInvoiceSettings, useInvoices } from '../lib/api'
import { cx } from '../lib/cx'
import {
  buildPricingLines,
  calculateInvoiceTotals,
  detectInvoicePackage,
  formatInvoiceMoney,
  invoiceStatuses,
  newCustomInvoiceLine,
} from '../../shared/invoice'
import { addDaysISO, todayISO } from '../../shared/leads'
import type { InvoiceInput, InvoiceLine, InvoiceRecord, InvoiceSettings } from '../../shared/types'

type Draft = Omit<InvoiceInput, 'number'> & { number: string; id?: string }

const STATUS_CLASS: Record<string, string> = {
  Draft: 'border-line-strong bg-surface-2 text-muted',
  Sent: 'border-sky-200 bg-sky-50 text-sky-700',
  Paid: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  'Partially Paid': 'border-amber-200 bg-amber-50 text-amber-700',
  Accepted: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  Expired: 'border-rose-200 bg-rose-50 text-rose-700',
  Cancelled: 'border-rose-200 bg-rose-50 text-rose-700',
}

function dateLabel(value: string) {
  if (!value) return '—'
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
}

function draftFromRecord(record: InvoiceRecord): Draft {
  return {
    id: record.id,
    kind: record.kind,
    number: record.number,
    status: record.status,
    issueDate: record.issueDate,
    dueDate: record.dueDate,
    validUntil: record.validUntil,
    client: record.client,
    subject: record.subject,
    packageNumber: record.packageNumber,
    employees: record.employees,
    additionalUsers: record.additionalUsers,
    branches: record.branches,
    items: record.items,
    discountType: record.discountType,
    discountValue: record.discountValue,
    taxRate: record.taxRate,
    taxLabel: record.taxLabel,
    taxEnabled: record.taxEnabled,
    currency: record.currency,
    notes: record.notes,
    terms: record.terms,
  }
}

function newDraft(kind: 'Invoice' | 'Quotation', settings: InvoiceSettings): Draft {
  const packageNumber = 1
  const employees = 10
  const items = buildPricingLines(settings.pricing, packageNumber, employees, 0, 0)
  return {
    kind,
    number: '',
    status: 'Draft',
    issueDate: todayISO(),
    dueDate: addDaysISO(14),
    validUntil: addDaysISO(30),
    client: { name: '', company: '', email: '', phone: '', address: '' },
    subject: 'AI Attendance System — Implementation & Subscription',
    packageNumber,
    employees,
    additionalUsers: 0,
    branches: 0,
    items,
    discountType: 'amount',
    discountValue: 0,
    taxRate: settings.taxRate,
    taxLabel: settings.taxLabel,
    taxEnabled: settings.taxEnabled,
    currency: settings.currency,
    notes: '',
    terms: settings.defaultTerms,
  }
}

export function Invoices() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const toast = useToast()
  const tab = params.get('tab') === 'settings' ? 'settings' : 'documents'
  const [kind, setKind] = useState('')
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const { data, isLoading, isFetching } = useInvoices({ kind, status, q })
  const remove = useApiMutation((id: string) => api(`/invoices/${id}`, { method: 'DELETE' }), ['invoices'], {
    onSuccess: () => toast('Document deleted.'),
  })
  const items = data?.items ?? []
  const counts = data?.counts

  function setTab(next: 'documents' | 'settings') {
    const merged = new URLSearchParams(params)
    if (next === 'settings') merged.set('tab', 'settings')
    else merged.delete('tab')
    setParams(merged, { replace: true })
  }

  async function deleteDocument(record: InvoiceRecord) {
    if (!window.confirm(`Delete ${record.number}? This cannot be undone.`)) return
    try {
      await remove.mutateAsync(record.id)
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not delete document.', 'danger')
    }
  }

  return (
    <div className="mx-auto max-w-[1400px] p-4 sm:p-6 2xl:p-8">
      <PageHeader
        title="Invoices & quotations"
        subtitle="Create professional, tax-ready documents with live pricing, editable figures and printable PDFs."
        actions={
          <>
            <Button onClick={() => navigate('/invoices/new?kind=Quotation')}>
              <FileText />
              New quotation
            </Button>
            <Button variant="primary" onClick={() => navigate('/invoices/new?kind=Invoice')}>
              <ReceiptText />
              New invoice
            </Button>
          </>
        }
      />

      <div className="mt-6 flex flex-wrap items-center gap-2 border-b border-line pb-3">
        <button
          type="button"
          onClick={() => setTab('documents')}
          className={cx(
            'inline-flex items-center gap-2 rounded-control px-3 py-2 text-[13px] font-semibold transition-colors',
            tab === 'documents' ? 'bg-fg text-white' : 'text-muted hover:bg-surface-2 hover:text-fg',
          )}
        >
          <ReceiptText className="size-4" />
          Documents
        </button>
        <button
          type="button"
          onClick={() => setTab('settings')}
          className={cx(
            'inline-flex items-center gap-2 rounded-control px-3 py-2 text-[13px] font-semibold transition-colors',
            tab === 'settings' ? 'bg-fg text-white' : 'text-muted hover:bg-surface-2 hover:text-fg',
          )}
        >
          <Settings2 className="size-4" />
          Pricing & settings
        </button>
      </div>

      {tab === 'settings' ? (
        <InvoiceSettingsPanel />
      ) : (
        <>
          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: 'All documents', value: counts?.all ?? '—', hint: 'Invoices and quotations', icon: FileText },
              { label: 'Invoices', value: counts?.invoices ?? '—', hint: 'Tax invoices', icon: ReceiptText },
              { label: 'Quotations', value: counts?.quotations ?? '—', hint: 'Estimates sent', icon: BadgeCheck },
              {
                label: 'Outstanding',
                value: counts ? formatInvoiceMoney(counts.outstanding) : '—',
                hint: 'Sent invoices unpaid',
                icon: Banknote,
              },
            ].map((card) => {
              const Icon = card.icon
              return (
                <Card key={card.label} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[11.5px] font-medium text-muted">{card.label}</div>
                      <div className="mt-1 truncate text-[22px] font-semibold tracking-[-0.03em]">{card.value}</div>
                      <div className="mt-0.5 text-[11px] text-faint">{card.hint}</div>
                    </div>
                    <span className="grid size-9 shrink-0 place-items-center rounded-tile bg-accent-soft text-accent">
                      <Icon className="size-4" />
                    </span>
                  </div>
                </Card>
              )
            })}
          </div>

          <div className="mt-5 flex flex-wrap items-end gap-2">
            <div className="min-w-[230px] flex-1 sm:max-w-sm">
              <span className="mb-1 block text-[11.5px] font-medium text-muted">Search documents</span>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
                <Input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Number, client, company…" className="pl-9" />
              </div>
            </div>
            <div className="min-w-[150px]">
              <span className="mb-1 block text-[11.5px] font-medium text-muted">Type</span>
              <Select value={kind} onChange={(event) => setKind(event.target.value)}>
                <option value="">All types</option>
                <option value="Invoice">Invoices</option>
                <option value="Quotation">Quotations</option>
              </Select>
            </div>
            <div className="min-w-[160px]">
              <span className="mb-1 block text-[11.5px] font-medium text-muted">Status</span>
              <Select value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="">All statuses</option>
                {['Draft', 'Sent', 'Paid', 'Partially Paid', 'Accepted', 'Expired', 'Cancelled'].map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </Select>
            </div>
            {isFetching && <span className="pb-2 text-[11.5px] text-faint">Refreshing…</span>}
          </div>

          <Card className="mt-4 overflow-hidden">
            {isLoading ? (
              <div className="space-y-2 p-4">
                {[0, 1, 2, 3].map((row) => <Skeleton key={row} className="h-12 w-full" />)}
              </div>
            ) : items.length === 0 ? (
              <EmptyState
                icon={<ReceiptText className="size-5" />}
                title="No documents yet"
                description="Create your first invoice or quotation. Pricing, tax and bank details are already set up."
                action={
                  <Button variant="primary" onClick={() => navigate('/invoices/new?kind=Invoice')}>
                    <Plus />
                    Create invoice
                  </Button>
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="data-table w-full min-w-[850px] text-left text-[12.5px]">
                  <thead>
                    <tr className="border-b border-line">
                      <th className="px-4 py-2.5">Document</th>
                      <th className="px-4 py-2.5">Client</th>
                      <th className="px-4 py-2.5">Issued</th>
                      <th className="px-4 py-2.5">Status</th>
                      <th className="px-4 py-2.5 text-right">Total</th>
                      <th className="w-24 px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((record) => (
                      <tr
                        key={record.id}
                        className="cursor-pointer border-b border-line/70 last:border-0"
                        onClick={() => navigate(`/invoices/${record.id}`)}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <span className={cx('grid size-8 place-items-center rounded-tile', record.kind === 'Invoice' ? 'bg-emerald-50 text-emerald-700' : 'bg-accent-soft text-accent')}>
                              {record.kind === 'Invoice' ? <ReceiptText className="size-4" /> : <FileText className="size-4" />}
                            </span>
                            <div>
                              <div className="font-semibold text-fg">{record.number}</div>
                              <div className="text-[11px] text-faint">{record.kind} · {record.subject}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{record.client.company || record.client.name || '—'}</div>
                          <div className="text-[11px] text-faint">{record.client.name && record.client.company ? record.client.name : record.client.email || ''}</div>
                        </td>
                        <td className="px-4 py-3 text-muted">{dateLabel(record.issueDate)}</td>
                        <td className="px-4 py-3">
                          <span className={cx('inline-flex rounded-full border px-2 py-0.5 text-[10.5px] font-semibold', STATUS_CLASS[record.status] ?? STATUS_CLASS.Draft)}>
                            {record.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold">{formatInvoiceMoney(record.totals.total, record.currency)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              title="Edit"
                              onClick={(event) => {
                                event.stopPropagation()
                                navigate(`/invoices/${record.id}`)
                              }}
                            >
                              <PencilLine />
                            </Button>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              title="Delete"
                              onClick={(event) => {
                                event.stopPropagation()
                                void deleteDocument(record)
                              }}
                            >
                              <Trash2 />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  )
}

export function InvoiceBuilder() {
  const { id } = useParams<{ id: string }>()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const toast = useToast()
  const isNew = !id
  const initialKind = params.get('kind') === 'Quotation' ? 'Quotation' : 'Invoice'
  const { data: settings, isLoading: settingsLoading } = useInvoiceSettings()
  const { data: record, isLoading: recordLoading } = useInvoice(id)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [manualPricing, setManualPricing] = useState(false)

  useEffect(() => {
    if (!settings) return
    if (record) {
      setDraft((current) => current ?? draftFromRecord(record))
    } else if (isNew) {
      setDraft((current) => current ?? newDraft(initialKind, settings))
    }
  }, [settings, record, isNew, initialKind])

  // Reopened documents that no longer match the saved plan figures open in
  // manual mode so a team-size change cannot silently replace custom rates.
  useEffect(() => {
    if (!record || !settings) return
    const expected = buildPricingLines(
      settings.pricing,
      record.packageNumber ?? 1,
      record.employees,
      record.additionalUsers,
      record.branches,
    )
    const planLines = record.items.filter((item) => item.source && item.source !== 'Custom')
    const customized =
      expected.length !== planLines.length ||
      expected.some((line) => {
        const saved = planLines.find((item) => item.source === line.source)
        return (
          !saved ||
          saved.enabled === false ||
          saved.rate !== line.rate ||
          saved.quantity !== line.quantity ||
          saved.description !== line.description ||
          saved.detail !== line.detail ||
          saved.kind !== line.kind
        )
      })
    if (customized) setManualPricing(true)
  }, [record?.id, settings])

  const totals = useMemo(
    () =>
      draft
        ? calculateInvoiceTotals(draft.items, {
            taxEnabled: draft.taxEnabled,
            taxRate: draft.taxRate,
            discountType: draft.discountType,
            discountValue: draft.discountValue,
          })
        : null,
    [draft],
  )

  const suggestedPackage = settings && draft ? detectInvoicePackage(settings.pricing, draft.employees) : null
  const selectedPackage = settings && draft ? settings.pricing.packages.find((item) => item.number === draft.packageNumber) ?? null : null

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => (current ? { ...current, [key]: value } : current))
  }

  function applyPlan(
    patch: Partial<Pick<Draft, 'packageNumber' | 'employees' | 'additionalUsers' | 'branches'>>,
    options?: { force?: boolean },
  ) {
    setDraft((current) => {
      if (!current || !settings) return current
      const next = { ...current, ...patch }
      // Manual mode keeps the current line items while the package/team inputs
      // change. Reset to plan is the explicit way back to generated figures.
      if (manualPricing && !options?.force) return next
      const custom = current.items.filter((item) => !item.source || item.source === 'Custom')
      const plan = buildPricingLines(
        settings.pricing,
        next.packageNumber ?? 1,
        next.employees,
        next.additionalUsers,
        next.branches,
      )
      return { ...next, items: [...plan, ...custom] }
    })
  }

  function switchToAutoPricing() {
    setManualPricing(false)
    applyPlan({}, { force: true })
  }

  function updateLine(lineId: string, field: keyof InvoiceLine, value: string | number | boolean) {
    const line = draft?.items.find((item) => item.id === lineId)
    if (line?.source && line.source !== 'Custom') setManualPricing(true)
    setDraft((current) => {
      if (!current) return current
      return {
        ...current,
        items: current.items.map((item) => (item.id === lineId ? { ...item, [field]: value } : item)),
      }
    })
  }

  function removeLine(lineId: string) {
    const line = draft?.items.find((item) => item.id === lineId)
    if (line?.source && line.source !== 'Custom') setManualPricing(true)
    setDraft((current) => (current ? { ...current, items: current.items.filter((item) => item.id !== lineId) } : current))
  }

  function addLine() {
    setDraft((current) => (current ? { ...current, items: [...current.items, newCustomInvoiceLine()] } : current))
  }

  async function save() {
    if (!draft) return
    if (!draft.client.name.trim()) {
      toast('Add the client name before saving.', 'danger')
      return
    }
    if (!draft.items.some((item) => item.enabled !== false)) {
      toast('Add or enable at least one invoice line.', 'danger')
      return
    }
    setSaving(true)
    try {
      const payload: InvoiceInput = { ...draft, number: draft.number.trim() || undefined }
      const saved = draft.id
        ? await api<InvoiceRecord>(`/invoices/${draft.id}`, { method: 'PUT', json: payload })
        : await api<InvoiceRecord>('/invoices', { method: 'POST', json: payload })
      setDraft(draftFromRecord(saved))
      toast(`${saved.kind} ${saved.number} saved.`)
      if (!draft.id) navigate(`/invoices/${saved.id}`, { replace: true })
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not save document.', 'danger')
    } finally {
      setSaving(false)
    }
  }

  if (settingsLoading || recordLoading || !draft || !settings || !totals) {
    return <div className="mx-auto max-w-[1400px] p-6"><Skeleton className="h-40 w-full" /></div>
  }

  return (
    <div className="mx-auto max-w-[1760px] p-4 sm:p-6 2xl:p-8">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate('/invoices')}>
            <ArrowLeft />
            Documents
          </Button>
          <div className="h-5 w-px bg-line" />
          <div>
            <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-faint">{draft.kind}</div>
            <div className="text-[17px] font-semibold tracking-[-0.02em]">{draft.number || 'New document'}</div>
          </div>
          {draft.id && <Badge tone={draft.status === 'Paid' || draft.status === 'Accepted' ? 'success' : 'neutral'}>{draft.status}</Badge>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => window.print()}>
            <Printer />
            Print / Save PDF
          </Button>
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            <Save />
            {draft.id ? 'Save changes' : 'Save document'}
          </Button>
        </div>
      </div>

      <div className="mt-5 grid items-start gap-5 xl:grid-cols-[580px_minmax(0,1fr)] 2xl:grid-cols-[620px_minmax(0,1fr)]">
        <div className="no-print space-y-3">
          <Card className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[13px] font-semibold">Document type</div>
                <div className="mt-0.5 text-[11.5px] text-muted">Invoice for billing, quotation for estimates.</div>
              </div>
              <div className="flex rounded-control border border-line bg-surface-2 p-0.5">
                {(['Invoice', 'Quotation'] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() =>
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              kind: item,
                              status: invoiceStatuses(item).includes(current.status) ? current.status : 'Draft',
                            }
                          : current,
                      )
                    }
                    className={cx('rounded-[8px] px-2.5 py-1.5 text-[11.5px] font-semibold transition-colors', draft.kind === item ? 'bg-white text-fg shadow-sm' : 'text-muted hover:text-fg')}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Field label="Document no." hint="Leave blank to auto-generate">
                <Input value={draft.number} onChange={(event) => update('number', event.target.value)} placeholder="Auto-generated" />
              </Field>
              <Field label="Status">
                <Select value={draft.status} onChange={(event) => update('status', event.target.value)}>
                  {invoiceStatuses(draft.kind).map((item) => <option key={item} value={item}>{item}</option>)}
                </Select>
              </Field>
              <Field label={draft.kind === 'Quotation' ? 'Quotation date' : 'Invoice date'}>
                <Input type="date" value={draft.issueDate} onChange={(event) => update('issueDate', event.target.value)} />
              </Field>
              <Field label={draft.kind === 'Quotation' ? 'Valid until' : 'Payment due'}>
                <Input
                  type="date"
                  value={draft.kind === 'Quotation' ? draft.validUntil : draft.dueDate}
                  onChange={(event) => update(draft.kind === 'Quotation' ? 'validUntil' : 'dueDate', event.target.value)}
                />
              </Field>
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-[13px] font-semibold">Client details</div>
            <div className="mt-3 grid gap-2.5">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Client name" className="col-span-2 sm:col-span-1">
                  <Input value={draft.client.name} onChange={(event) => update('client', { ...draft.client, name: event.target.value })} placeholder="Contact person" />
                </Field>
                <Field label="Company" className="col-span-2 sm:col-span-1">
                  <Input value={draft.client.company} onChange={(event) => update('client', { ...draft.client, company: event.target.value })} placeholder="Company name" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Phone">
                  <Input value={draft.client.phone} onChange={(event) => update('client', { ...draft.client, phone: event.target.value })} placeholder="03xx…" />
                </Field>
                <Field label="Email">
                  <Input type="email" value={draft.client.email} onChange={(event) => update('client', { ...draft.client, email: event.target.value })} placeholder="client@company.com" />
                </Field>
              </div>
              <Field label="Address">
                <Textarea value={draft.client.address} onChange={(event) => update('client', { ...draft.client, address: event.target.value })} placeholder="Billing address" className="min-h-[62px]" />
              </Field>
              <Field label="Subject">
                <Input value={draft.subject} onChange={(event) => update('subject', event.target.value)} />
              </Field>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <div className="text-[13px] font-semibold">Pricing plan</div>
                  {manualPricing && <Badge tone="warning">Manual</Badge>}
                </div>
                <div className="mt-0.5 text-[11.5px] text-muted">Auto-priced from your saved package. Every line can be edited below.</div>
              </div>
              <Sparkles className="size-4 text-accent" />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Field label="Package">
                <Select value={String(draft.packageNumber ?? 1)} onChange={(event) => applyPlan({ packageNumber: Number(event.target.value) })}>
                  {settings.pricing.packages.map((item) => <option key={item.number} value={item.number}>{item.label} · {item.employeeRange}</option>)}
                </Select>
              </Field>
              <Field label="Employees">
                <Input type="number" min={0} value={draft.employees} onChange={(event) => applyPlan({ employees: Number(event.target.value) })} />
              </Field>
              <Field label="Extra users">
                <Input type="number" min={0} value={draft.additionalUsers} onChange={(event) => applyPlan({ additionalUsers: Number(event.target.value) })} />
              </Field>
              <Field label="Extra branches">
                <Input type="number" min={0} value={draft.branches} onChange={(event) => applyPlan({ branches: Number(event.target.value) })} />
              </Field>
            </div>
            {selectedPackage && (
              <div className="mt-2.5 rounded-control border border-line bg-surface-2 px-3 py-2 text-[11.5px] text-muted">
                <span className="font-semibold text-fg">{formatInvoiceMoney(selectedPackage.monthlyRate)}</span> / employee / month
                <span className="mx-1.5 text-line-strong">·</span>
                Setup <span className="font-semibold text-fg">{formatInvoiceMoney(selectedPackage.setupCharge)}</span>
                {suggestedPackage && suggestedPackage.number !== selectedPackage.number && (
                  <button type="button" className="ml-2 font-semibold text-accent hover:underline" onClick={() => applyPlan({ packageNumber: suggestedPackage.number })}>
                    Use {suggestedPackage.label}
                  </button>
                )}
              </div>
            )}
            <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-control border border-line bg-surface-2/70 px-3 py-2.5">
              <Checkbox
                className="mt-0.5"
                checked={manualPricing}
                onChange={(event) => (event.target.checked ? setManualPricing(true) : switchToAutoPricing())}
              />
              <span className="min-w-0">
                <span className="block text-[12px] font-semibold text-fg">Manual pricing</span>
                <span className="mt-0.5 block text-[11px] leading-relaxed text-muted">
                  Keep your own rates. Package and team changes stop overwriting the line items.
                </span>
              </span>
            </label>
            <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-faint">
              <span>Turn a line off to exclude it, or add your own below.</span>
              <button type="button" className="shrink-0 font-semibold text-accent hover:underline" onClick={switchToAutoPricing}>
                {manualPricing ? 'Reset to plan' : 'Refresh'}
              </button>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-[13px] font-semibold">Line items</div>
                <div className="mt-0.5 text-[11.5px] text-muted">Every line is editable. Toggle a line off to leave it out of the total.</div>
              </div>
              <Button size="sm" onClick={addLine}>
                <Plus />
                Add line
              </Button>
            </div>
            <div className="mt-3 space-y-2">
              {draft.items.map((item, index) => {
                const custom = !item.source || item.source === 'Custom'
                const enabled = item.enabled !== false
                return (
                  <div
                    key={item.id}
                    className={cx(
                      'rounded-control border p-2.5 transition-opacity',
                      enabled
                        ? custom
                          ? 'border-line-strong bg-white'
                          : 'border-line bg-surface-2/70'
                        : 'border-line bg-surface-2/40 opacity-60',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-1 items-start gap-2">
                        <Checkbox
                          className="mt-2"
                          checked={enabled}
                          onChange={(event) => updateLine(item.id, 'enabled', event.target.checked)}
                          aria-label={enabled ? 'Exclude this line' : 'Include this line'}
                          title={enabled ? 'Exclude from invoice' : 'Include in invoice'}
                        />
                        <div className="min-w-0 flex-1">
                          <Input
                            value={item.description}
                            onChange={(event) => updateLine(item.id, 'description', event.target.value)}
                            placeholder={custom ? `Custom line ${index + 1}` : 'Line description'}
                            className="h-8 text-[12.5px]"
                          />
                          <Input
                            value={item.detail ?? ''}
                            onChange={(event) => updateLine(item.id, 'detail', event.target.value)}
                            placeholder="Optional detail"
                            className="mt-1 h-7 text-[11.5px]"
                          />
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <span className="rounded bg-white px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-muted">
                          {custom ? 'Custom' : 'Plan'}
                        </span>
                        <Button size="icon-sm" variant="ghost" onClick={() => removeLine(item.id)} title="Remove line">
                          <Trash2 />
                        </Button>
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-1.5">
                      <Field label="Qty">
                        <Input
                          type="number"
                          min={0}
                          value={item.quantity}
                          onChange={(event) => updateLine(item.id, 'quantity', Number(event.target.value))}
                          className="h-8 text-[12px]"
                        />
                      </Field>
                      <Field label="Rate">
                        <Input
                          type="number"
                          min={0}
                          value={item.rate}
                          onChange={(event) => updateLine(item.id, 'rate', Number(event.target.value))}
                          className="h-8 text-[12px]"
                        />
                      </Field>
                      <Field label="Type">
                        <Select value={item.kind} onChange={(event) => updateLine(item.id, 'kind', event.target.value)}>
                          <option value="Monthly">Monthly</option>
                          <option value="One-time">One-time</option>
                        </Select>
                      </Field>
                      <div className="pb-1 text-right">
                        <div className={cx('text-[11.5px] font-semibold', !enabled && 'text-faint line-through')}>{formatInvoiceMoney(item.quantity * item.rate)}</div>
                        <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-faint">{enabled ? 'Line total' : 'Excluded'}</div>
                      </div>
                    </div>
                  </div>
                )
              })}
              {draft.items.length === 0 && (
                <div className="rounded-control border border-dashed border-line-strong bg-surface-2/50 px-4 py-6 text-center text-[12px] text-muted">
                  No lines yet. Add a line to start building this document.
                </div>
              )}
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-[13px] font-semibold">Discount & tax</div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Field label="Discount">
                <Input type="number" min={0} value={draft.discountValue} onChange={(event) => update('discountValue', Number(event.target.value))} />
              </Field>
              <Field label="Discount type">
                <Select value={draft.discountType} onChange={(event) => update('discountType', event.target.value as 'amount' | 'percent')}>
                  <option value="amount">Amount (Rs.)</option>
                  <option value="percent">Percent (%)</option>
                </Select>
              </Field>
              <Field label="Tax label">
                <Input value={draft.taxLabel} onChange={(event) => update('taxLabel', event.target.value)} placeholder="Sales Tax" />
              </Field>
              <Field label="Tax rate %">
                <Input type="number" min={0} max={100} step="0.01" value={draft.taxRate} disabled={!draft.taxEnabled} onChange={(event) => update('taxRate', Number(event.target.value))} />
              </Field>
            </div>
            <label className="mt-2 flex items-center gap-2 text-[12px] font-medium text-muted">
              <Checkbox checked={draft.taxEnabled} onChange={(event) => update('taxEnabled', event.target.checked)} />
              Apply tax to this document
            </label>
            <div className="mt-3 space-y-1.5 rounded-control bg-surface-2 p-3 text-[11.5px]">
              <div className="flex justify-between text-muted"><span>Subtotal</span><span className="font-semibold text-fg">{formatInvoiceMoney(totals.subtotal)}</span></div>
              <div className="flex justify-between text-muted"><span>Discount</span><span className="font-semibold text-success">− {formatInvoiceMoney(totals.discountAmount)}</span></div>
              <div className="flex justify-between text-muted"><span>Taxable amount</span><span className="font-semibold text-fg">{formatInvoiceMoney(totals.taxableAmount)}</span></div>
              <div className="flex justify-between text-muted"><span>{draft.taxLabel} ({draft.taxRate}%)</span><span className="font-semibold text-fg">{formatInvoiceMoney(totals.taxAmount)}</span></div>
              <div className="flex justify-between border-t border-line pt-1.5 text-[13px] font-semibold"><span>Total</span><span>{formatInvoiceMoney(totals.total)}</span></div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-[13px] font-semibold">Notes & terms</div>
            <div className="mt-3 space-y-2.5">
              <Field label="Notes (visible on document)">
                <Textarea value={draft.notes} onChange={(event) => update('notes', event.target.value)} placeholder="Payment instructions, project scope…" className="min-h-[64px]" />
              </Field>
              <Field label="Terms & conditions">
                <Textarea value={draft.terms} onChange={(event) => update('terms', event.target.value)} className="min-h-[110px] text-[12px]" />
              </Field>
            </div>
          </Card>
        </div>

        <div className="min-w-0">
          <div className="no-print mb-2 flex items-center justify-between px-1 text-[11.5px] text-faint">
            <span>Live preview · A4 document</span>
            <span>{draft.items.filter((item) => item.enabled !== false).length} line items · {formatInvoiceMoney(totals.total, draft.currency)}</span>
          </div>
          <div className="overflow-auto rounded-[18px] bg-[#dfe3ec] p-3 sm:p-5">
            <InvoiceDocument settings={settings} data={draft} totals={totals} />
          </div>
        </div>
      </div>
    </div>
  )
}

function InvoiceSettingsPanel() {
  const toast = useToast()
  const { data, isLoading } = useInvoiceSettings()
  const [form, setForm] = useState<InvoiceSettings | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (data) setForm((current) => current ?? data)
  }, [data])

  function update(patch: Partial<InvoiceSettings>) {
    setForm((current) => (current ? { ...current, ...patch } : current))
  }

  function updateCompany(key: keyof InvoiceSettings['company'], value: string) {
    setForm((current) => (current ? { ...current, company: { ...current.company, [key]: value } } : current))
  }

  function updateBank(key: keyof InvoiceSettings['bank'], value: string) {
    setForm((current) => (current ? { ...current, bank: { ...current.bank, [key]: value } } : current))
  }

  function updatePackage(number: number, key: 'monthlyRate' | 'setupCharge' | 'branchSetup' | 'employeeRange', value: string | number) {
    setForm((current) => {
      if (!current) return current
      return {
        ...current,
        pricing: {
          ...current.pricing,
          packages: current.pricing.packages.map((item) => (item.number === number ? { ...item, [key]: value } : item)),
        },
      }
    })
  }

  async function save() {
    if (!form) return
    setSaving(true)
    try {
      const saved = await api<InvoiceSettings>('/invoice-settings', { method: 'PUT', json: form })
      setForm(saved)
      toast('Invoice settings saved. New documents will use these figures.')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not save settings.', 'danger')
    } finally {
      setSaving(false)
    }
  }

  if (isLoading || !form) {
    return <div className="mt-5"><Skeleton className="h-64 w-full" /></div>
  }

  return (
    <div className="mt-5 space-y-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[15px] font-semibold">Pricing catalog</div>
            <div className="mt-1 text-[12px] leading-relaxed text-muted">
              These are the current Freedom Sale rates from your plan. Edit any figure and press save; new invoices and quotations use them immediately. Existing saved documents keep their own snapshot.
            </div>
          </div>
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            <Save />
            Save settings
          </Button>
        </div>

        <div className="mt-4 overflow-x-auto rounded-control border border-line">
          <table className="w-full min-w-[720px] text-left text-[12px]">
            <thead className="bg-surface-2 text-[10px] uppercase tracking-[0.08em] text-faint">
              <tr>
                <th className="px-3 py-2.5">Package</th>
                <th className="px-3 py-2.5">Employee range</th>
                <th className="px-3 py-2.5 text-right">Monthly / employee</th>
                <th className="px-3 py-2.5 text-right">Setup charge</th>
                <th className="px-3 py-2.5 text-right">Branch setup</th>
              </tr>
            </thead>
            <tbody>
              {form.pricing.packages.map((item) => (
                <tr key={item.number} className="border-t border-line/70">
                  <td className="px-3 py-2 font-semibold">{item.label}</td>
                  <td className="px-3 py-2">
                    <Input value={item.employeeRange} onChange={(event) => updatePackage(item.number, 'employeeRange', event.target.value)} className="h-8 w-[118px] text-[12px]" />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Input type="number" min={0} value={item.monthlyRate} onChange={(event) => updatePackage(item.number, 'monthlyRate', Number(event.target.value))} className="ml-auto h-8 w-[100px] text-right text-[12px]" />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Input type="number" min={0} value={item.setupCharge} onChange={(event) => updatePackage(item.number, 'setupCharge', Number(event.target.value))} className="ml-auto h-8 w-[115px] text-right text-[12px]" />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Input type="number" min={0} value={item.branchSetup} onChange={(event) => updatePackage(item.number, 'branchSetup', Number(event.target.value))} className="ml-auto h-8 w-[105px] text-right text-[12px]" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Additional user — monthly rate" hint="One user is already included in every package.">
            <Input type="number" min={0} value={form.pricing.additionalUserMonthly} onChange={(event) => update({ pricing: { ...form.pricing, additionalUserMonthly: Number(event.target.value) } })} />
          </Field>
          <Field label="Additional user — standard rate" hint="Shown as the reference rate in the line detail.">
            <Input type="number" min={0} value={form.pricing.additionalUserStandard} onChange={(event) => update({ pricing: { ...form.pricing, additionalUserStandard: Number(event.target.value) } })} />
          </Field>
        </div>
        <div className="mt-2 rounded-control border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-[11.5px] leading-relaxed text-emerald-800">
          <Users className="mr-1.5 inline size-3.5" />
          Additional branch setup defaults: 4,800 for packages 1–3, 9,600 for 4–6, 21,000 for 7, 36,000 for 8, 54,000 for 9 and 78,000 for 10. Change them above whenever needed.
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="text-[15px] font-semibold">Company details</div>
          <div className="mt-1 text-[12px] text-muted">These appear in the document header and footer.</div>
          <div className="mt-4 grid gap-2.5">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Legal name"><Input value={form.company.legalName} onChange={(event) => updateCompany('legalName', event.target.value)} /></Field>
              <Field label="Display name"><Input value={form.company.displayName} onChange={(event) => updateCompany('displayName', event.target.value)} /></Field>
            </div>
            <Field label="Tagline"><Input value={form.company.tagline} onChange={(event) => updateCompany('tagline', event.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="NTN"><Input value={form.company.ntn} onChange={(event) => updateCompany('ntn', event.target.value)} /></Field>
              <Field label="Contact"><Input value={form.company.contact} onChange={(event) => updateCompany('contact', event.target.value)} /></Field>
              <Field label="Email"><Input value={form.company.email} onChange={(event) => updateCompany('email', event.target.value)} /></Field>
              <Field label="Website"><Input value={form.company.website} onChange={(event) => updateCompany('website', event.target.value)} placeholder="Optional" /></Field>
            </div>
            <Field label="Address"><Textarea value={form.company.address} onChange={(event) => updateCompany('address', event.target.value)} placeholder="Optional — shown on invoice" className="min-h-[60px]" /></Field>
          </div>
        </Card>

        <Card className="p-5">
          <div className="text-[15px] font-semibold">Bank & payment details</div>
          <div className="mt-1 text-[12px] text-muted">Printed on every invoice and quotation.</div>
          <div className="mt-4 grid gap-2.5">
            <Field label="Account title"><Input value={form.bank.accountTitle} onChange={(event) => updateBank('accountTitle', event.target.value)} /></Field>
            <Field label="Bank name"><Input value={form.bank.bankName} onChange={(event) => updateBank('bankName', event.target.value)} /></Field>
            <Field label="IBAN"><Input value={form.bank.iban} onChange={(event) => updateBank('iban', event.target.value)} className="font-mono text-[12.5px]" /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Bank NTN"><Input value={form.bank.ntn} onChange={(event) => updateBank('ntn', event.target.value)} /></Field>
              <Field label="Currency"><Input value={form.currency} onChange={(event) => update({ currency: event.target.value.toUpperCase() })} /></Field>
            </div>
            <div className="rounded-control bg-surface-2 p-3 text-[11.5px] leading-relaxed text-muted">
              <Landmark className="mr-1.5 inline size-3.5 text-accent" />
              Customer payments go directly to this account. The IBAN is displayed without spaces for easy copying.
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <div className="text-[15px] font-semibold">Invoice defaults</div>
        <div className="mt-1 text-[12px] text-muted">Default tax, numbering and terms. Each document can still override its tax and terms.</div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Invoice prefix"><Input value={form.invoicePrefix} onChange={(event) => update({ invoicePrefix: event.target.value })} /></Field>
          <Field label="Quotation prefix"><Input value={form.quotationPrefix} onChange={(event) => update({ quotationPrefix: event.target.value })} /></Field>
          <Field label="Default tax label"><Input value={form.taxLabel} onChange={(event) => update({ taxLabel: event.target.value })} /></Field>
          <Field label="Default tax rate %"><Input type="number" min={0} max={100} step="0.01" value={form.taxRate} onChange={(event) => update({ taxRate: Number(event.target.value) })} /></Field>
        </div>
        <label className="mt-2 flex items-center gap-2 text-[12px] font-medium text-muted">
          <Checkbox checked={form.taxEnabled} onChange={(event) => update({ taxEnabled: event.target.checked })} />
          Apply tax by default on new documents
        </label>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <Field label="Default terms & conditions">
            <Textarea value={form.defaultTerms} onChange={(event) => update({ defaultTerms: event.target.value })} className="min-h-[130px] text-[12px]" />
          </Field>
          <Field label="Footer note">
            <Textarea value={form.footerNote} onChange={(event) => update({ footerNote: event.target.value })} className="min-h-[130px] text-[12px]" />
          </Field>
        </div>
        <div className="mt-3 flex justify-end">
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            <Save />
            Save settings
          </Button>
        </div>
      </Card>

      <div className="rounded-control border border-line bg-surface px-4 py-3 text-[11.5px] leading-relaxed text-muted">
        <Check className="mr-1.5 inline size-3.5 text-success" />
        Tax is charged on the amount after discount. The document stores its own tax snapshot, so updating tomorrow’s rate will not silently change an invoice you already issued.
      </div>
    </div>
  )
}
