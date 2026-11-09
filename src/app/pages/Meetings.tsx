import { CalendarCheck, CalendarClock, CalendarDays, CalendarMinus, CheckCircle2, ChevronLeft, ChevronRight, Clock, Search, Users, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'

import { WhatsAppButton } from '../components/lead-bits'
import { Badge, Button, Card, EmptyState, Input, KpiCard, PageHeader, Select, Skeleton, TableProgress } from '../components/ui'
import { api, useApiMutation, useMeetings } from '../lib/api'
import { cx } from '../lib/cx'
import { MEETING_STATUSES, dmy, meetingTime, todayISO } from '../../shared/leads'
import type { MeetingRow } from '../../shared/types'

const PAGE = 20

const TABS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'tomorrow', label: 'Tomorrow' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'previous', label: 'Previous' },
  { key: 'pending', label: 'Pending' },
  { key: 'completed', label: 'Completed' },
  { key: 'all', label: 'All' },
] as const

export function Meetings() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const [updating, setUpdating] = useState<string | null>(null)
  const when = params.get('when') ?? 'pending'
  const date = params.get('date') ?? ''
  const q = params.get('q') ?? ''
  const page = Math.max(0, Number(params.get('page') ?? 0))
  const { data, isLoading, isFetching } = useMeetings({ when, date, q })
  const items = data?.items ?? []
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE))
  const current = Math.min(page, totalPages - 1)
  const pageItems = items.slice(current * PAGE, current * PAGE + PAGE)
  const today = todayISO()

  const updateStatus = useApiMutation(
    (input: { id: string; status: string }) => api(`/meetings/${input.id}`, { method: 'PATCH', json: { meetingStatus: input.status } }),
    ['meetings', 'today', 'lead', 'leads', 'reports'],
    { onSuccess: () => setUpdating(null) },
  )

  function update(next: Record<string, string>) {
    const merged = new URLSearchParams(params)
    for (const [key, value] of Object.entries(next)) value ? merged.set(key, value) : merged.delete(key)
    if (!('page' in next)) merged.delete('page')
    setParams(merged, { replace: true })
  }

  const counts = data?.counts
  const selected = TABS.find((tab) => tab.key === when)?.label ?? 'All'
  const title = date ? `Meetings on ${dmy(date)}` : `${selected} meetings`
  const subtitle = date
    ? 'Every meeting scheduled on the selected date, whatever its status.'
    : {
        today: 'Meetings scheduled for today.',
        yesterday: 'Meetings that were scheduled for yesterday.',
        tomorrow: 'Meetings scheduled for tomorrow.',
        upcoming: 'Scheduled meetings from today onwards.',
        previous: 'Every meeting whose date has already passed.',
        pending: 'Every scheduled meeting that has not been completed or cancelled.',
        completed: 'Meetings marked done or cancelled.',
        all: 'Every meeting on your leads.',
      }[when] ?? 'Every meeting on your leads.'

  const stats = [
    { label: 'Total meetings', value: counts?.all, hint: 'All time', key: 'all', icon: CalendarDays, tone: 'neutral' as const },
    { label: 'Today', value: counts?.today, hint: 'Scheduled today', key: 'today', icon: CalendarCheck, tone: 'accent' as const },
    { label: 'Yesterday', value: counts?.yesterday, hint: 'Previous day', key: 'yesterday', icon: CalendarMinus, tone: 'neutral' as const },
    { label: 'Tomorrow', value: counts?.tomorrow, hint: 'Next day', key: 'tomorrow', icon: CalendarClock, tone: 'info' as const },
    { label: 'Pending', value: counts?.pending, hint: 'Not completed', key: 'pending', icon: Clock, tone: 'warning' as const },
    { label: 'Completed', value: counts?.completed, hint: 'Done or cancelled', key: 'completed', icon: CheckCircle2, tone: 'success' as const },
  ]

  return (
    <div className="mx-auto max-w-[1360px] p-4 sm:p-6 2xl:p-8">
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <Button onClick={() => navigate('/leads')}>
            <Users />
            Leads
          </Button>
        }
      />

      <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((stat, index) => (
          <KpiCard
            key={stat.label}
            label={stat.label}
            value={stat.value ?? '—'}
            hint={stat.hint}
            icon={stat.icon}
            tone={stat.tone}
            active={when === stat.key && !date}
            onClick={() => update({ when: stat.key, date: '' })}
            index={index}
          />
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-end gap-2">
        <div className="min-w-[240px] flex-1 sm:max-w-sm">
          <span className="mb-1 block text-[11.5px] font-medium text-muted">Search meetings</span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
            <Input
              type="search"
              value={q}
              onChange={(e) => update({ q: e.target.value })}
              placeholder="Lead, company or meeting type"
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
        <div className="flex flex-wrap items-center gap-1 pb-px">
          {TABS.map((tab) => {
            const count = counts?.[tab.key]
            return (
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
                {typeof count === 'number' && (
                  <span className={cx('text-[11.5px] tabular-nums', when === tab.key ? 'text-white/70' : 'text-faint')}>{count}</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <Card className="relative mt-4 animate-rise overflow-hidden" style={{ animationDelay: '100ms' }}>
        <TableProgress show={isFetching && !isLoading} />
        <div className="overflow-x-auto">
          <table className="data-table w-full min-w-[1000px] table-fixed border-collapse text-left text-[13.5px]">
            <thead>
              <tr className="h-10 border-b border-line">
                <th className="w-[21%] px-4 font-medium">Lead</th>
                <th className="w-[12%] px-4 font-medium">Phone</th>
                <th className="w-[10%] px-4 font-medium">Meeting</th>
                <th className="w-[16%] px-4 font-medium">When</th>
                <th className="w-[13%] px-4 font-medium">Status</th>
                <th className="w-[15%] px-4 font-medium">Notes</th>
                <th className="w-[13%] px-2" />
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
                pageItems.map((row) => (
                  <MeetingTableRow
                    key={row.meeting.id}
                    row={row}
                    today={today}
                    updating={updating === row.meeting.id}
                    onStatus={(status) => {
                      setUpdating(row.meeting.id)
                      updateStatus.mutate({ id: row.meeting.id, status })
                    }}
                  />
                ))}
            </tbody>
          </table>
        </div>
        {!isLoading && items.length === 0 && (
          <EmptyState
            icon={<CalendarClock />}
            title={q ? 'No meetings match' : date ? 'No meetings on this date' : `No ${selected.toLowerCase()} meetings`}
            description={q ? 'Try a different lead, company or meeting type.' : 'Meetings you add to a lead appear here automatically.'}
            action={q ? <Button onClick={() => update({ q: '' })}>Clear search</Button> : undefined}
          />
        )}
      </Card>

      {items.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-line/80 bg-white/70 px-3 py-2 text-[12.5px] text-muted shadow-[inset_0_1px_0_rgb(255_255_255/0.9)] backdrop-blur">
          <span className="tabular-nums">
            Showing <span className="font-medium text-fg">{current * PAGE + 1}–{Math.min((current + 1) * PAGE, items.length)}</span> of{' '}
            <span className="font-medium text-fg">{items.length}</span> meetings
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
    </div>
  )
}

function MeetingTableRow({
  row,
  today,
  updating,
  onStatus,
}: {
  row: MeetingRow
  today: string
  updating: boolean
  onStatus: (status: string) => void
}) {
  const { lead, meeting } = row
  const overdue = meeting.status === 'Scheduled' && meeting.scheduledAt.slice(0, 10) < today
  const tone = meeting.status === 'Done' ? 'success' : meeting.status === 'Cancelled' ? 'danger' : overdue ? 'danger' : 'accent'
  return (
    <tr className="align-top transition-colors hover:bg-surface-2/60">
      <td className="px-4 py-3">
        <Link to={`/leads/${lead.id}`} className="block truncate font-medium hover:underline">
          {lead.contactName ?? lead.code}
        </Link>
        <p className="mt-0.5 truncate text-[11.5px] text-faint">
          {lead.code} · {lead.orgName ?? 'No organization'}
        </p>
      </td>
      <td className="px-4 py-3">
        {lead.contactPhone ? (
          <div className="flex items-center gap-1">
            <span className="truncate text-[12.5px] tabular-nums text-muted">{lead.contactPhone}</span>
            <WhatsAppButton phone={lead.contactPhone} compact />
          </div>
        ) : (
          <span className="text-[12px] text-faint">No phone</span>
        )}
      </td>
      <td className="px-4 py-3 text-muted">{meeting.type}</td>
      <td className="px-4 py-3">
        <p className="font-medium tabular-nums">{dmy(meeting.scheduledAt)}</p>
        <p className="mt-0.5 text-[11.5px] text-faint tabular-nums">{meetingTime(meeting.scheduledAt)}</p>
      </td>
      <td className="px-4 py-3">
        <Badge tone={tone}>{overdue ? 'Overdue' : meeting.status}</Badge>
      </td>
      <td className="px-4 py-3">
        <p className="line-clamp-2 text-[12.5px] leading-snug text-muted">{meeting.notes ?? <span className="text-faint">No notes</span>}</p>
      </td>
      <td className="px-2 py-3 text-right">
        <Select
          value={meeting.status}
          disabled={updating}
          onChange={(e) => onStatus(e.target.value)}
          aria-label="Meeting status"
          className="ml-auto w-[118px]"
        >
          {MEETING_STATUSES.map((status) => (
            <option key={status}>{status}</option>
          ))}
        </Select>
      </td>
    </tr>
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
