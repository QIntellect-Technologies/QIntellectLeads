import { ArrowUpRight, CheckCheck, ChevronLeft, ChevronRight, Phone, PhoneCall, PhoneOff, Search, ThumbsUp, UserPlus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import { WhatsAppButton } from '../components/lead-bits'
import { Badge, Button, Card, Dialog, EmptyState, Field, Input, KpiCard, PageHeader, Select, Skeleton, TableProgress, Textarea, useToast } from '../components/ui'
import { api, useApiMutation, useCallingList } from '../lib/api'
import { cx } from '../lib/cx'
import { CALL_DIRECTIONS, CALL_RESULTS, dmyTime } from '../../shared/leads'
import { OUTREACH_STATUSES, outreachStatusTone, resultTone } from '../../shared/calling-list'
import type { OutreachContact } from '../../shared/types'

const PAGE = 50

export function CallingList() {
  const [params, setParams] = useSearchParams()
  const toast = useToast()
  const q = params.get('q') ?? ''
  const status = params.get('status') ?? ''
  const source = params.get('source') ?? ''
  const page = Math.max(0, Number(params.get('page') ?? 0))
  const { data, isLoading, isFetching } = useCallingList({ q, status, source, page })
  const items = data?.items ?? []
  const counts = data?.counts
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE))
  const current = Math.min(page, totalPages - 1)
  const [logging, setLogging] = useState<OutreachContact | null>(null)

  function update(next: Record<string, string>) {
    const merged = new URLSearchParams(params)
    for (const [key, value] of Object.entries(next)) value ? merged.set(key, value) : merged.delete(key)
    if (!('page' in next)) merged.delete('page')
    setParams(merged, { replace: true })
  }

  const convert = useApiMutation(
    (id: string) => api<{ leadId: string; code: string; existing: boolean }>(`/calling-list/${id}/convert`, { method: 'POST', json: {} }),
    ['calling-list', 'leads', 'lead', 'today'],
    {
      onSuccess: (result) => {
        toast(result.existing ? `This number is already ${result.code}` : `Converted to ${result.code}`)
      },
    },
  )

  const stats = [
    {
      label: 'Numbers',
      value: counts?.total,
      hint: 'One row per phone number',
      icon: Phone,
      tone: 'accent' as const,
      active: !status && !q && !source,
      onClick: () => update({ status: '', q: '', source: '' }),
    },
    {
      label: 'Not called',
      value: counts?.notCalled,
      hint: 'Waiting for the first call',
      icon: PhoneOff,
      tone: 'neutral' as const,
      active: status === 'Not called',
      onClick: () => update({ status: 'Not called' }),
    },
    {
      label: 'Called',
      value: counts?.called,
      hint: 'At least one call logged',
      icon: PhoneCall,
      tone: 'info' as const,
      active: status === 'Called',
      onClick: () => update({ status: 'Called' }),
    },
    {
      label: 'Interested',
      value: counts?.interested,
      hint: 'Ready to convert',
      icon: ThumbsUp,
      tone: 'success' as const,
      active: status === 'Interested',
      onClick: () => update({ status: 'Interested' }),
    },
    {
      label: 'Converted',
      value: counts?.converted,
      hint: 'Now in the lead pipeline',
      icon: UserPlus,
      tone: 'warning' as const,
      active: status === 'Converted',
      onClick: () => update({ status: 'Converted' }),
    },
  ]

  return (
    <div className="mx-auto max-w-[1440px] p-4 sm:p-6 2xl:p-8">
      <PageHeader
        title="Calling list"
        subtitle={
          counts
            ? `${counts.total.toLocaleString()} numbers from your company sheets, kept separate from leads until you convert one.`
            : 'Every phone number from your company sheets, ready to call.'
        }
      />

      <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((stat, index) => (
          <KpiCard
            key={stat.label}
            label={stat.label}
            value={stat.value ?? '—'}
            hint={stat.hint}
            icon={stat.icon}
            tone={stat.tone}
            active={stat.active}
            onClick={stat.onClick}
            index={index}
          />
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-end gap-2">
        <div className="min-w-[240px] flex-1 sm:max-w-sm">
          <span className="mb-1 block text-[11.5px] font-medium text-muted">Search numbers</span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
            <Input
              type="search"
              value={q}
              onChange={(e) => update({ q: e.target.value })}
              placeholder="Number, person, company or city"
              className="pl-9 pr-9"
            />
            {q && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => update({ q: '' })}
                className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-[6px] text-faint hover:bg-surface-2 hover:text-fg"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        </div>
        <div>
          <span className="mb-1 block text-[11.5px] font-medium text-muted">Status</span>
          <Select value={status} onChange={(e) => update({ status: e.target.value })} className="w-[180px]">
            <option value="">All statuses</option>
            <option value="Called">Called (any result)</option>
            {OUTREACH_STATUSES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <span className="mb-1 block text-[11.5px] font-medium text-muted">Source list</span>
          <Select value={source} onChange={(e) => update({ source: e.target.value })} className="w-[230px]">
            <option value="">All lists</option>
            {(data?.sources ?? []).map((entry) => (
              <option key={entry.source} value={entry.source}>
                {entry.source} ({entry.count.toLocaleString()})
              </option>
            ))}
          </Select>
        </div>
        {(status || source || q) && (
          <Button variant="ghost" onClick={() => update({ status: '', source: '', q: '' })}>
            <X />
            Clear filters
          </Button>
        )}
      </div>

      <Card className="relative mt-4 animate-rise overflow-hidden" style={{ animationDelay: '100ms' }}>
        <TableProgress show={isFetching && !isLoading} />
        <div className="overflow-x-auto">
          <table className="data-table w-full min-w-[1120px] table-fixed border-collapse text-left text-[13.5px]">
            <thead>
              <tr className="h-10 border-b border-line">
                <th className="w-[24%] px-4 font-medium">Company / Person</th>
                <th className="w-[16%] px-4 font-medium">Number</th>
                <th className="w-[11%] px-4 font-medium">City</th>
                <th className="w-[15%] px-4 font-medium">Source list</th>
                <th className="w-[12%] px-4 font-medium">Status</th>
                <th className="w-[12%] px-4 font-medium">Last call</th>
                <th className="w-[10%] px-2 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {isLoading &&
                Array.from({ length: 8 }).map((_, index) => (
                  <tr key={index} className="h-14">
                    {Array.from({ length: 7 }).map((__, column) => (
                      <td key={column} className="px-4">
                        <Skeleton className={cx('h-3.5', column === 0 ? 'w-3/4' : column === 6 ? 'ml-auto w-2/3' : 'w-full')} />
                      </td>
                    ))}
                  </tr>
                ))}
              {!isLoading &&
                items.map((contact) => (
                  <CallingListRow
                    key={contact.id}
                    contact={contact}
                    converting={convert.isPending && convert.variables === contact.id}
                    onConvert={() => convert.mutate(contact.id)}
                    onLog={() => setLogging(contact)}
                  />
                ))}
            </tbody>
          </table>
        </div>
        {!isLoading && items.length === 0 && (
          <EmptyState
            icon={<Phone />}
            title={q || status || source ? 'No numbers match' : 'No numbers yet'}
            description={
              q || status || source
                ? 'Try a different number, company, city or list, or clear the filters.'
                : 'Run the one-time importer to load the company sheets into this list.'
            }
            action={
              q || status || source ? (
                <Button onClick={() => update({ status: '', source: '', q: '' })}>Clear filters</Button>
              ) : undefined
            }
          />
        )}
      </Card>

      {total > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-line/80 bg-white/70 px-3 py-2 text-[12.5px] text-muted shadow-[inset_0_1px_0_rgb(255_255_255/0.9)] backdrop-blur">
          <span className="tabular-nums">
            Showing <span className="font-medium text-fg">{current * PAGE + 1}–{Math.min((current + 1) * PAGE, total)}</span> of{' '}
            <span className="font-medium text-fg">{total.toLocaleString()}</span> numbers
          </span>
          <div className="flex items-center gap-1">
            <Button size="sm" disabled={current === 0} onClick={() => update({ page: String(current - 1) })} aria-label="Previous page">
              <ChevronLeft />
              <span className="hidden sm:inline">Previous</span>
            </Button>
            {pageNumbers(current, totalPages).map((number, index) =>
              number === null ? (
                <span key={`gap-${index}`} className="grid size-8 place-items-center text-faint">
                  …
                </span>
              ) : (
                <Button
                  key={number}
                  size="icon-sm"
                  variant={number === current ? 'primary' : 'secondary'}
                  onClick={() => update({ page: String(number) })}
                  aria-label={`Page ${number + 1}`}
                  aria-current={number === current ? 'page' : undefined}
                  className="tabular-nums"
                >
                  {number + 1}
                </Button>
              ),
            )}
            <Button size="sm" disabled={current + 1 >= totalPages} onClick={() => update({ page: String(current + 1) })} aria-label="Next page">
              <span className="hidden sm:inline">Next</span>
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}

      <LogOutreachCall contact={logging} onClose={() => setLogging(null)} />
    </div>
  )
}

function CallingListRow({
  contact,
  converting,
  onConvert,
  onLog,
}: {
  contact: OutreachContact
  converting: boolean
  onConvert: () => void
  onLog: () => void
}) {
  return (
    <tr className="align-top transition-colors hover:bg-surface-2/60">
      <td className="px-4 py-3">
        <p className="truncate font-medium">{contact.companyName ?? contact.personName ?? 'Unknown'}</p>
        <p className="mt-0.5 truncate text-[11.5px] text-faint">
          {contact.companyName && contact.personName ? contact.personName : contact.designation ?? contact.address ?? 'No contact person'}
        </p>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          <a href={`tel:${contact.phone}`} className="truncate text-[12.5px] tabular-nums text-muted hover:text-fg hover:underline">
            {contact.phone}
          </a>
          <WhatsAppButton phone={contact.phone} compact />
        </div>
      </td>
      <td className="px-4 py-3 text-[12.5px] text-muted">{contact.city ?? <span className="text-faint">—</span>}</td>
      <td className="px-4 py-3">
        <span className="line-clamp-2 text-[12px] leading-snug text-muted">{contact.sourceList}</span>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-col items-start gap-1">
          <Badge tone={outreachStatusTone(contact.status)}>{contact.status}</Badge>
          {contact.lastResult && contact.status !== contact.lastResult && (
            <span className="text-[10.5px] text-faint">Result: {contact.lastResult}</span>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-[12.5px] tabular-nums text-muted">
        {contact.lastCalledAt ? dmyTime(contact.lastCalledAt) : <span className="text-faint">Never</span>}
      </td>
      <td className="px-2 py-3">
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="icon-sm" aria-label="Log call" onClick={onLog}>
            <PhoneCall />
          </Button>
          {contact.convertedLeadId ? (
            <Link
              to={`/leads/${contact.convertedLeadId}`}
              className="inline-flex h-8 items-center gap-1 rounded-tile px-2 text-[12px] font-medium text-accent hover:bg-accent-soft"
            >
              {contact.convertedLeadCode ?? 'Lead'}
              <ArrowUpRight className="size-3.5" />
            </Link>
          ) : (
            <Button size="sm" loading={converting} onClick={onConvert}>
              <UserPlus />
              Convert
            </Button>
          )}
        </div>
      </td>
    </tr>
  )
}

function LogOutreachCall({ contact, onClose }: { contact: OutreachContact | null; onClose: () => void }) {
  const toast = useToast()
  const [result, setResult] = useState('Connected')
  const [direction, setDirection] = useState('Outbound')
  const [note, setNote] = useState('')

  useEffect(() => {
    if (!contact) return
    setResult(contact.lastResult && CALL_RESULTS.includes(contact.lastResult as (typeof CALL_RESULTS)[number]) ? contact.lastResult : 'Connected')
    setDirection('Outbound')
    setNote('')
  }, [contact])

  const save = useApiMutation(
    () => api(`/calling-list/${contact?.id}/calls`, { method: 'POST', json: { result, direction, note: note.trim() || null } }),
    ['calling-list', 'calling-list-item'],
    {
      onSuccess: () => {
        toast('Call logged')
        onClose()
      },
    },
  )

  return (
    <Dialog
      open={Boolean(contact)}
      onClose={onClose}
      title="Log call"
      description={contact ? `${contact.phone}${contact.companyName ? ` · ${contact.companyName}` : ''}` : undefined}
      width={500}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => save.mutate()} loading={save.isPending} disabled={!contact}>
            <CheckCheck />
            Save result
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Result">
            <Select value={result} onChange={(e) => setResult(e.target.value)}>
              {CALL_RESULTS.filter((item) => item !== 'Unknown').map((item) => (
                <option key={item}>{item}</option>
              ))}
            </Select>
          </Field>
          <Field label="Direction">
            <Select value={direction} onChange={(e) => setDirection(e.target.value)}>
              {CALL_DIRECTIONS.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Notes" hint="Who answered and what did they say?">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} placeholder="Call notes..." />
        </Field>
        <div className="rounded-control border border-line bg-surface-2/60 px-3 py-2 text-[12px] text-muted">
          A result also updates the number's status. Set <span className="font-medium text-fg">Interested</span> to keep it at the top of the list.
          {contact?.notes && <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-[12px] text-faint">{contact.notes}</p>}
        </div>
        {save.error && <p className="text-[13px] text-danger">{save.error.message}</p>}
        <Badge tone={resultTone(result)} className="w-fit">
          {result}
        </Badge>
      </div>
    </Dialog>
  )
}

function pageNumbers(current: number, total: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index)
  const pages = new Set([0, total - 1, current - 1, current, current + 1].filter((page) => page >= 0 && page < total))
  const sorted = [...pages].sort((a, b) => a - b)
  const result: (number | null)[] = []
  for (const page of sorted) {
    const previous = result[result.length - 1]
    if (typeof previous === 'number' && page - previous > 1) result.push(null)
    result.push(page)
  }
  return result
}
