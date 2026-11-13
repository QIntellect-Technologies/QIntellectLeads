import { BookUser, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Pencil, Percent, PhoneCall, PhoneOff, Search, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'

import { CallDialog } from '../components/call-form'
import { EditCallDialog } from '../components/edit-call'
import { WhatsAppButton } from '../components/lead-bits'
import { Badge, Button, Card, EmptyState, Input, KpiCard, PageHeader, Select, Skeleton, TableProgress } from '../components/ui'
import { useCalls } from '../lib/api'
import { cx } from '../lib/cx'
import { CALL_RESULTS, dmy, dmyTime } from '../../shared/leads'
import type { CallRow } from '../../shared/types'

const PAGE = 20

const TABS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: 'This week' },
  { key: 'all', label: 'All' },
] as const

export function Calls() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const [logOpen, setLogOpen] = useState(false)
  const [callLead, setCallLead] = useState<string | undefined>()
  const [editing, setEditing] = useState<CallRow | null>(null)
  const when = params.get('when') ?? 'today'
  const date = params.get('date') ?? ''
  const q = params.get('q') ?? ''
  const result = params.get('result') ?? ''
  const direction = params.get('direction') ?? ''
  const page = Math.max(0, Number(params.get('page') ?? 0))
  const { data, isLoading, isFetching } = useCalls({ when, date, q, result, direction })
  const items = data?.items ?? []
  const counts = data?.counts
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE))
  const current = Math.min(page, totalPages - 1)
  const pageItems = items.slice(current * PAGE, current * PAGE + PAGE)

  function update(next: Record<string, string>) {
    const merged = new URLSearchParams(params)
    for (const [key, value] of Object.entries(next)) value ? merged.set(key, value) : merged.delete(key)
    if (!('page' in next)) merged.delete('page')
    setParams(merged, { replace: true })
  }

  function openLog(leadId?: string) {
    setCallLead(leadId)
    setLogOpen(true)
  }

  const title = date
    ? `Calls on ${dmy(date)}`
    : when === 'today'
      ? "Today's calls"
      : when === 'yesterday'
        ? "Yesterday's calls"
        : when === 'week'
          ? "This week's calls"
          : 'All calls'
  const subtitle = date
    ? 'Every call logged on the selected date.'
    : {
        today: 'Calls logged today, with responses and no responses.',
        yesterday: 'Calls logged yesterday.',
        week: 'Calls logged this week, starting Monday.',
        all: 'Every call logged on your leads.',
      }[when] ?? 'Every call logged on your leads.'

  const stats = [
    {
      label: 'Calls',
      value: counts?.calls,
      hint: 'In this period',
      icon: PhoneCall,
      tone: 'accent' as const,
      active: !date && when === 'today' && !result,
      onClick: () => update({ when: 'today', date: '', result: '' }),
    },
    {
      label: 'Responded',
      value: counts?.responded,
      hint: 'Connected',
      icon: CheckCircle2,
      tone: 'success' as const,
      active: !date && when === 'today' && result === 'Connected',
      onClick: () => update({ when: 'today', date: '', result: 'Connected' }),
    },
    {
      label: 'No response',
      value: counts?.noResponse,
      hint: 'No answer, busy or voicemail',
      icon: PhoneOff,
      tone: 'danger' as const,
      active: !date && when === 'today' && result === 'no_response',
      onClick: () => update({ when: 'today', date: '', result: 'no_response' }),
    },
    {
      label: 'Response rate',
      value: `${counts?.responseRate ?? 0}%`,
      hint: 'Connected ÷ responses measured',
      icon: Percent,
      tone: 'info' as const,
    },
    {
      label: 'Callbacks',
      value: counts?.callbacks,
      hint: 'Callback requested',
      icon: Clock3,
      tone: 'warning' as const,
      active: !date && when === 'today' && result === 'Callback requested',
      onClick: () => update({ when: 'today', date: '', result: 'Callback requested' }),
    },
  ]

  return (
    <div className="mx-auto max-w-[1360px] p-4 sm:p-6 2xl:p-8">
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <>
            <Button onClick={() => navigate('/calls/directory')}>
              <BookUser />
              Number directory
            </Button>
            <Button variant="primary" onClick={() => openLog()}>
              <PhoneCall />
              Log call
            </Button>
          </>
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
          <span className="mb-1 block text-[11.5px] font-medium text-muted">Search calls</span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
            <Input
              type="search"
              value={q}
              onChange={(e) => update({ q: e.target.value })}
              placeholder="Number, person, lead or note"
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
          <span className="mb-1 block text-[11.5px] font-medium text-muted">Custom date</span>
          <div className="flex items-center gap-1">
            <Input type="date" value={date} onChange={(e) => update({ date: e.target.value, when: '' })} className="w-[160px]" />
            {date && (
              <Button variant="ghost" size="icon-sm" aria-label="Clear custom date" onClick={() => update({ date: '', when: 'today' })}>
                <X />
              </Button>
            )}
          </div>
        </div>
        <div>
          <span className="mb-1 block text-[11.5px] font-medium text-muted">Result</span>
          <Select value={result} onChange={(e) => update({ result: e.target.value })} className="w-[168px]">
            <option value="">All results</option>
            <option value="no_response">No response</option>
            {CALL_RESULTS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <span className="mb-1 block text-[11.5px] font-medium text-muted">Direction</span>
          <Select value={direction} onChange={(e) => update({ direction: e.target.value })} className="w-[140px]">
            <option value="">All directions</option>
            <option value="Outbound">Outbound</option>
            <option value="Inbound">Inbound</option>
            <option value="Unknown">Unknown</option>
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-1 pb-px">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => update({ when: tab.key, date: '' })}
              className={cx(
                'inline-flex h-9 items-center gap-1.5 rounded-control px-3 text-[13px] font-medium transition-colors',
                when === tab.key && !date ? 'bg-fg text-white' : 'border border-line-strong bg-surface text-muted hover:bg-surface-2 hover:text-fg',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <Card className="relative mt-4 animate-rise overflow-hidden" style={{ animationDelay: '100ms' }}>
        <TableProgress show={isFetching && !isLoading} />
        <div className="overflow-x-auto">
          <table className="data-table w-full min-w-[1180px] table-fixed border-collapse text-left text-[13.5px]">
            <thead>
              <tr className="h-10 border-b border-line">
                <th className="w-[11%] px-4 font-medium">Time</th>
                <th className="w-[15%] px-4 font-medium">Number</th>
                <th className="w-[14%] px-4 font-medium">Person</th>
                <th className="w-[18%] px-4 font-medium">Lead / Company</th>
                <th className="w-[9%] px-4 font-medium">Direction</th>
                <th className="w-[11%] px-4 font-medium">Result</th>
                <th className="w-[14%] px-4 font-medium">Notes</th>
                <th className="w-[10%] px-4 font-medium">Next follow-up</th>
                <th className="w-[10%] px-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {isLoading &&
                Array.from({ length: 8 }).map((_, index) => (
                  <tr key={index} className="h-14">
                    {Array.from({ length: 9 }).map((__, column) => (
                      <td key={column} className="px-4">
                        <Skeleton className={cx('h-3.5', column === 0 ? 'w-3/4' : column === 8 ? 'ml-auto w-2/3' : 'w-full')} />
                      </td>
                    ))}
                  </tr>
                ))}
              {!isLoading &&
                pageItems.map((call) => (
                  <CallTableRow
                    key={call.id}
                    call={call}
                    onLog={() => openLog(call.lead.id)}
                    onEdit={() => setEditing(call)}
                  />
                ))}
            </tbody>
          </table>
        </div>
        {!isLoading && items.length === 0 && (
          <EmptyState
            icon={<PhoneCall />}
            title={
              q
                ? 'No calls match'
                : date
                  ? 'No calls on this date'
                  : when === 'today'
                    ? 'No calls today'
                    : when === 'yesterday'
                      ? 'No calls yesterday'
                      : when === 'week'
                        ? 'No calls this week'
                        : 'No calls yet'
            }
            description={
              q
                ? 'Try a different number, person, lead or note.'
                : result
                  ? 'No calls match this result. Clear the filter to see all calls.'
                  : 'Log a call to start building your call history.'
            }
            action={q ? <Button onClick={() => update({ q: '' })}>Clear search</Button> : <Button onClick={() => openLog()}>Log call</Button>}
          />
        )}
      </Card>

      {items.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-line/80 bg-white/70 px-3 py-2 text-[12.5px] text-muted shadow-[inset_0_1px_0_rgb(255_255_255/0.9)] backdrop-blur">
          <span className="tabular-nums">
            Showing <span className="font-medium text-fg">{current * PAGE + 1}–{Math.min((current + 1) * PAGE, items.length)}</span> of{' '}
            <span className="font-medium text-fg">{items.length}</span> calls
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

      <CallDialog open={logOpen} onClose={() => setLogOpen(false)} initialLeadId={callLead} />
      <EditCallDialog call={editing} onClose={() => setEditing(null)} />
    </div>
  )
}

function CallTableRow({ call, onLog, onEdit }: { call: CallRow; onLog: () => void; onEdit: () => void }) {
  const phone = call.phoneNumber ?? call.lead.contactPhone
  const person = call.contactName ?? call.lead.contactName
  return (
    <tr className="align-top transition-colors hover:bg-surface-2/60">
      <td className="px-4 py-3 text-[12.5px] tabular-nums text-muted">{dmyTime(call.date)}</td>
      <td className="px-4 py-3">
        {phone ? (
          <div className="flex items-center gap-1">
            <span className="truncate text-[12.5px] tabular-nums text-muted">{phone}</span>
            {call.phoneInferred && <span className="rounded-[5px] bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-faint">primary</span>}
            <WhatsAppButton phone={phone} compact />
          </div>
        ) : (
          <span className="text-[12px] text-faint">No number</span>
        )}
      </td>
      <td className="px-4 py-3">
        <p className="truncate font-medium">{person ?? <span className="text-faint">Unknown person</span>}</p>
      </td>
      <td className="px-4 py-3">
        <Link to={`/leads/${call.lead.id}`} className="block truncate font-medium hover:underline">
          {call.lead.contactName ?? call.lead.code}
        </Link>
        <p className="mt-0.5 truncate text-[11.5px] text-faint">
          {call.lead.code} · {call.lead.orgName ?? 'No organization'}
        </p>
      </td>
      <td className="px-4 py-3 text-[12.5px] text-muted">{call.direction}</td>
      <td className="px-4 py-3">
        <Badge tone={resultTone(call.result)}>{call.result}</Badge>
      </td>
      <td className="px-4 py-3">
        <p className="line-clamp-2 text-[12.5px] leading-snug text-muted">{call.note ?? call.outcome ?? <span className="text-faint">No notes</span>}</p>
      </td>
      <td className="px-4 py-3">
        {call.lead.nextFollowUp ? (
          <>
            <p className="font-medium tabular-nums">{dmy(call.lead.nextFollowUp.dueDate)}</p>
            {call.lead.nextFollowUp.dueTime && <p className="mt-0.5 text-[11.5px] text-faint tabular-nums">{call.lead.nextFollowUp.dueTime}</p>}
          </>
        ) : (
          <span className="text-[12px] text-faint">None</span>
        )}
      </td>
      <td className="px-2 py-3 text-right">
        <div className="flex justify-end gap-0.5">
          <Button variant="ghost" size="icon-sm" aria-label="Log another call" onClick={onLog}>
            <PhoneCall />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Edit call" onClick={onEdit}>
            <Pencil />
          </Button>
        </div>
      </td>
    </tr>
  )
}

function resultTone(result: CallRow['result']): 'success' | 'danger' | 'warning' | 'info' | 'neutral' {
  if (result === 'Connected') return 'success'
  if (result === 'No answer' || result === 'Wrong number') return 'danger'
  if (result === 'Busy' || result === 'Voicemail' || result === 'Callback requested') return 'warning'
  if (result === 'Unknown') return 'neutral'
  return 'info'
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
