import { AlarmClock, CalendarClock, CalendarRange, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock, Flame, MessageSquarePlus, RotateCcw, Search, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'

import { StatusBadge, WhatsAppButton } from '../components/lead-bits'
import { CompleteFollowUpDialog, QuickLeadDialog, RescheduleDialog } from '../components/productivity'
import { Badge, Button, Card, Checkbox, EmptyState, Input, KpiCard, PageHeader, Skeleton, TableProgress } from '../components/ui'
import { api, useApiMutation, useFollowUps } from '../lib/api'
import { cx } from '../lib/cx'
import { addDaysISO, dmy, timeLabel, todayISO } from '../../shared/leads'
import type { FollowUpRow } from '../../shared/types'

const PAGE = 20

const TABS = [
  { key: 'pending', label: 'Pending' },
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'tomorrow', label: 'Tomorrow' },
  { key: 'previous', label: 'Previous' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'completed', label: 'Completed' },
  { key: 'all', label: 'All' },
] as const

export function FollowUps() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const [updating, setUpdating] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [completing, setCompleting] = useState<FollowUpRow | null>(null)
  const [rescheduling, setRescheduling] = useState<string[] | null>(null)
  const [quick, setQuick] = useState(false)
  const when = params.get('when') ?? 'today'
  const date = params.get('date') ?? ''
  const q = params.get('q') ?? ''
  const page = Math.max(0, Number(params.get('page') ?? 0))
  const { data, isLoading, isFetching } = useFollowUps({ when, date, q })
  const items = data?.items ?? []
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE))
  const current = Math.min(page, totalPages - 1)
  const pageItems = items.slice(current * PAGE, current * PAGE + PAGE)
  const today = todayISO()
  const yesterday = addDaysISO(-1)
  const tomorrow = addDaysISO(1)

  const reopen = useApiMutation(
    (id: string) => api(`/follow-ups/${id}`, { method: 'PATCH', json: { isCompleted: false } }),
    ['follow-ups', 'today', 'next-actions', 'leads', 'lead', 'reports', 'meetings', 'data-summary'],
    { onSuccess: () => setUpdating(null) },
  )
  const selectedIds = [...selected].filter((id) => items.some((row) => row.followUp.id === id))
  const pageIds = pageItems.filter((row) => !row.followUp.completed).map((row) => row.followUp.id)
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id))

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function update(next: Record<string, string>) {
    const merged = new URLSearchParams(params)
    for (const [key, value] of Object.entries(next)) value ? merged.set(key, value) : merged.delete(key)
    if (!('page' in next)) merged.delete('page')
    setParams(merged, { replace: true })
  }

  const counts = data?.counts
  const selectedTab = TABS.find((tab) => tab.key === when)?.label ?? 'All'
  const title = date ? `Follow-ups on ${dmy(date)}` : `${selectedTab} follow-ups`
  const subtitle = date
    ? 'Every follow-up due on the selected date, including completed ones.'
    : {
        pending: 'Every follow-up that is still open, past or future.',
        today: 'Calls and messages due today.',
        yesterday: 'Every follow-up that was due yesterday, open or completed.',
        tomorrow: 'Follow-ups scheduled for tomorrow.',
        previous: 'Every follow-up whose date has already passed, open or completed.',
        overdue: 'Every open follow-up whose date has passed.',
        upcoming: 'Open follow-ups from tomorrow onwards.',
        completed: 'Follow-ups your team has already completed.',
        all: 'Every follow-up, open and completed.',
      }[when] ?? 'Every follow-up, open and completed.'

  const stats = [
    { label: 'Pending follow-ups', value: counts?.pending, hint: 'Still open', key: 'pending', icon: AlarmClock, tone: 'accent' as const },
    { label: 'Overdue', value: counts?.overdue, hint: 'Past due date', key: 'overdue', icon: Flame, tone: 'danger' as const },
    { label: 'Today', value: counts?.today, hint: 'Due today', key: 'today', icon: Clock, tone: 'warning' as const },
    { label: 'Tomorrow', value: counts?.tomorrow, hint: 'Due tomorrow', key: 'tomorrow', icon: CalendarClock, tone: 'accent' as const },
    { label: 'Upcoming', value: counts?.upcoming, hint: 'After tomorrow', key: 'upcoming', icon: CalendarRange, tone: 'info' as const },
    { label: 'Completed', value: counts?.completed, hint: 'Marked done', key: 'completed', icon: CheckCircle2, tone: 'success' as const },
  ]

  return (
    <div className="mx-auto max-w-[1400px] p-4 sm:p-6 2xl:p-8">
      <PageHeader
        title="Follow-ups"
        subtitle="Every past, today and future follow-up in one place."
        actions={
          <>
            <Button onClick={() => setQuick(true)}>
              <MessageSquarePlus />
              Quick capture
            </Button>
            <Button onClick={() => navigate('/leads')}>
              <AlarmClock />
              Leads
            </Button>
          </>
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
          <span className="mb-1 block text-[11.5px] font-medium text-muted">Search follow-ups</span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
            <Input
              type="search"
              value={q}
              onChange={(e) => update({ q: e.target.value })}
              placeholder="Lead, company, phone or QT number"
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

      <div className="mt-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <p className="mt-0.5 text-[12.5px] text-muted">{subtitle}</p>
        </div>
        <span className="text-[12.5px] tabular-nums text-faint">{items.length} shown</span>
      </div>

      {selectedIds.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[14px] border border-accent/25 bg-accent-soft px-3 py-2 text-[12.5px] shadow-[inset_0_1px_0_rgb(255_255_255/0.9)]">
          <span className="font-medium text-accent">{selectedIds.length} selected</span>
          <Button size="sm" onClick={() => setRescheduling(selectedIds)}>
            Reschedule with reason
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
          <span className="ml-auto text-[11px] text-muted">Bulk cleanup requires a reason and never deletes history.</span>
        </div>
      )}

      <Card className="relative mt-3 animate-rise overflow-hidden" style={{ animationDelay: '100ms' }}>
        <TableProgress show={isFetching && !isLoading} />
        <div className="overflow-x-auto">
          <table className="data-table w-full min-w-[960px] table-fixed border-collapse text-left text-[13.5px]">
            <thead>
              <tr className="h-10 border-b border-line">
                <th className="w-[4%] px-3 font-medium">
                  <Checkbox
                    aria-label="Select all visible open follow-ups"
                    checked={allPageSelected}
                    onChange={() =>
                      setSelected((current) => {
                        const next = new Set(current)
                        if (allPageSelected) pageIds.forEach((id) => next.delete(id))
                        else pageIds.forEach((id) => next.add(id))
                        return next
                      })
                    }
                  />
                </th>
                <th className="w-[23%] px-4 font-medium">Lead</th>
                <th className="w-[14%] px-4 font-medium">Phone</th>
                <th className="w-[15%] px-4 font-medium">Follow-up</th>
                <th className="w-[12%] px-4 font-medium">State</th>
                <th className="w-[20%] px-4 font-medium">Last note</th>
                <th className="w-[14%] px-2 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {isLoading &&
                Array.from({ length: 8 }).map((_, index) => (
                  <tr key={index} className="h-16">
                    {Array.from({ length: 7 }).map((__, column) => (
                      <td key={column} className="px-4">
                        <Skeleton className={cx('h-3.5', column === 0 ? 'w-3/4' : column === 5 ? 'ml-auto w-1/2' : 'w-full')} />
                      </td>
                    ))}
                  </tr>
                ))}
              {!isLoading &&
                pageItems.map((row) => (
                  <FollowUpTableRow
                    key={row.followUp.id}
                    row={row}
                    today={today}
                    yesterday={yesterday}
                    tomorrow={tomorrow}
                    updating={updating === row.followUp.id}
                    selected={selected.has(row.followUp.id)}
                    onToggle={() => toggle(row.followUp.id)}
                    onComplete={() => (row.followUp.completed ? (setUpdating(row.followUp.id), reopen.mutate(row.followUp.id)) : setCompleting(row))}
                    onReschedule={() => setRescheduling([row.followUp.id])}
                  />
                ))}
            </tbody>
          </table>
        </div>
        {!isLoading && items.length === 0 && (
          <EmptyState
            icon={<AlarmClock />}
            title={q ? 'No follow-ups match' : date ? 'No follow-ups on this date' : `No ${selectedTab.toLowerCase()} follow-ups`}
            description={q ? 'Try another lead, company or phone number.' : 'Follow-ups you add to a lead appear here automatically.'}
            action={q ? <Button onClick={() => update({ q: '' })}>Clear search</Button> : undefined}
          />
        )}
      </Card>

      {items.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-line/80 bg-white/70 px-3 py-2 text-[12.5px] text-muted shadow-[inset_0_1px_0_rgb(255_255_255/0.9)] backdrop-blur">
          <span className="tabular-nums">
            Showing <span className="font-medium text-fg">{current * PAGE + 1}–{Math.min((current + 1) * PAGE, items.length)}</span> of{' '}
            <span className="font-medium text-fg">{items.length}</span> follow-ups
          </span>
          <div className="flex items-center gap-1">
            <Button size="sm" disabled={current === 0} onClick={() => update({ page: String(current - 1) })} aria-label="Previous page">
              <ChevronLeft />
              <span className="hidden sm:inline">Previous</span>
            </Button>
            {pageNumbers(current, totalPages).map((number, index) =>
              number === null ? (
                <span key={`gap-${index}`} className="grid size-8 place-items-center text-faint">…</span>
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

      <QuickLeadDialog open={quick} onClose={() => setQuick(false)} onCreated={(id) => navigate(`/leads/${id}`)} />
      <CompleteFollowUpDialog
        open={Boolean(completing)}
        onClose={() => setCompleting(null)}
        followUpId={completing?.followUp.id ?? null}
        leadCode={completing?.lead.code}
        dueDate={completing ? dmy(completing.followUp.dueDate) : undefined}
      />
      <RescheduleDialog
        open={Boolean(rescheduling)}
        onClose={() => setRescheduling(null)}
        ids={rescheduling ?? []}
        onDone={() => setSelected(new Set())}
      />
    </div>
  )
}

function FollowUpTableRow({
  row,
  today,
  yesterday,
  tomorrow,
  updating,
  selected,
  onToggle,
  onComplete,
  onReschedule,
}: {
  row: FollowUpRow
  today: string
  yesterday: string
  tomorrow: string
  updating: boolean
  selected: boolean
  onToggle: () => void
  onComplete: () => void
  onReschedule: () => void
}) {
  const navigate = useNavigate()
  const { lead, followUp } = row
  const due = followUp.dueDate
  const state = followUp.completed
    ? { label: 'Completed', tone: 'success' as const }
    : due < today
      ? { label: due === yesterday ? 'Yesterday' : 'Overdue', tone: 'danger' as const }
      : due === today
        ? { label: 'Today', tone: 'warning' as const }
        : due === tomorrow
          ? { label: 'Tomorrow', tone: 'accent' as const }
          : { label: 'Upcoming', tone: 'info' as const }

  return (
    <tr className="align-top transition-colors hover:bg-surface-2/60">
      <td className="px-3 py-3">
        <Checkbox aria-label={`Select follow-up for ${lead.code}`} disabled={followUp.completed} checked={selected} onChange={onToggle} />
      </td>
      <td className="px-4 py-3">
        <Link to={`/leads/${lead.id}`} className="block truncate font-medium hover:underline">
          {lead.contactName ?? lead.code}
        </Link>
        <p className="mt-0.5 truncate text-[11.5px] text-faint">
          {lead.code} · {lead.orgName ?? 'No organization'}
        </p>
        <div className="mt-1 flex items-center gap-1.5">
          <StatusBadge status={lead.status} />
          {lead.priorityScore >= 60 && <Badge tone="warning">{lead.priorityLevel}</Badge>}
        </div>
      </td>
      <td className="px-4 py-3">
        {lead.contactPhone ? (
          <div className="flex items-center gap-1">
            <span className="text-[12.5px] tabular-nums text-muted">{lead.contactPhone}</span>
            <WhatsAppButton phone={lead.contactPhone} compact />
          </div>
        ) : (
          <span className="text-[12px] text-faint">No phone</span>
        )}
      </td>
      <td className="px-4 py-3">
        <p className="font-medium tabular-nums">{dmy(due)}</p>
        <p className="mt-0.5 text-[11.5px] text-faint">{followUp.dueTime ? timeLabel(followUp.dueTime) : 'Time not set'}</p>
        <p className="mt-0.5 text-[11px] text-faint">{followUp.mode}</p>
      </td>
      <td className="px-4 py-3">
        <Badge tone={state.tone}>{state.label}</Badge>
      </td>
      <td className="px-4 py-3">
        <p className="line-clamp-2 text-[12.5px] leading-snug text-muted">{lead.lastNote ?? <span className="text-faint">No history yet</span>}</p>
      </td>
      <td className="px-2 py-3">
        <div className="flex flex-wrap items-center justify-end gap-1">
          <Button
            size="sm"
            onClick={() => navigate(`/leads/${lead.id}?log=1&followUp=${followUp.id}`)}
            title="Add today's discussion"
          >
            <MessageSquarePlus />
            Log
          </Button>
          <Button
            size="sm"
            variant={followUp.completed ? 'ghost' : 'secondary'}
            onClick={onComplete}
            loading={updating}
            aria-label={followUp.completed ? 'Mark follow-up open again' : 'Complete follow-up'}
            title={followUp.completed ? 'Mark open again' : 'Complete with next step'}
          >
            {followUp.completed ? <RotateCcw /> : <Check />}
          </Button>
          {!followUp.completed && (
            <Button size="sm" variant="ghost" onClick={onReschedule} title="Reschedule with a reason" aria-label="Reschedule follow-up">
              <CalendarClock />
            </Button>
          )}
        </div>
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
