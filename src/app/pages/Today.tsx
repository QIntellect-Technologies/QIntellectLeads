import { AlarmClock, ArrowRight, CalendarCheck, CalendarClock, CalendarDays, Check, Clock, Flame, ListChecks, MessageCircle, Plus, Users } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'

import { LeadForm } from '../components/lead-forms'
import { DueText, LeadIdentity, PriorityBadge, StatusBadge, WhatsAppButton } from '../components/lead-bits'
import { CompleteFollowUpDialog, QuickLeadDialog } from '../components/productivity'
import { Badge, Button, Card, EmptyState, KpiCard, Skeleton } from '../components/ui'
import { useMe, useToday } from '../lib/api'
import { dmy, meetingTime } from '../../shared/leads'
import type { FollowUpRow, MeetingRow } from '../../shared/types'

export function Today() {
  const { data, isLoading } = useToday()
  const { data: me } = useMe()
  const navigate = useNavigate()
  const [adding, setAdding] = useState(false)
  const [quick, setQuick] = useState(false)
  const [completing, setCompleting] = useState<FollowUpRow | null>(null)

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const first = me?.user.name?.split(' ')[0]

  const counts = data?.counts
  const overduePreview = data?.overdue.slice(0, 2) ?? []
  const dueTodayPreview = data?.dueToday.slice(0, 2) ?? []
  const attention = (counts?.overdue ?? 0) + (counts?.dueToday ?? 0)
  const focusLine = !counts
    ? 'Here is what needs attention across your workspace today.'
    : attention > 0
      ? `${attention.toLocaleString()} ${attention === 1 ? 'follow-up needs' : 'follow-ups need'} a touch today${counts.overdue ? `, with ${counts.overdue.toLocaleString()} already overdue` : ''}. Start with the warmest conversations.`
      : 'Nothing is overdue or due today. Use the quiet time to move a warm lead forward.'

  return (
    <div className="mx-auto max-w-[1320px] p-4 sm:p-6 2xl:p-8">
      <section className="premium-dark relative animate-rise overflow-hidden rounded-[24px] px-5 py-6 text-white shadow-[0_28px_70px_-38px_rgb(8_9_16/0.75)] ring-1 ring-black/10 sm:px-7 sm:py-7">
        <div aria-hidden className="premium-grid pointer-events-none absolute inset-0" />
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-24 size-72 rounded-full bg-accent/20 blur-[90px]" />
        <span aria-hidden className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />

        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[11px] font-medium text-white/65 backdrop-blur">
                <CalendarDays className="size-3.5 text-[#b9b5ff]" />
                {dmy(data?.today ?? new Date())}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-white/45">
                <span className="size-1.5 rounded-full bg-[#4ade9a] shadow-[0_0_0_3px_rgb(74_222_154/0.12)]" />
                Workspace live
              </span>
            </div>
            <h1 className="mt-4 text-[28px] font-semibold leading-[1.08] tracking-[-0.035em] sm:text-[32px]">
              {greeting}{first ? `, ${first}` : ''}
            </h1>
            <p className="mt-2.5 max-w-xl text-[13px] leading-relaxed text-white/48">{focusLine}</p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Link
              to="/next-actions"
              className="inline-flex h-10 items-center gap-1.5 rounded-control border border-white/10 bg-white/[0.06] px-3.5 text-[13px] font-medium text-white/75 backdrop-blur transition-colors hover:bg-white/[0.1] hover:text-white"
            >
              <ListChecks className="size-4" />
              Next actions
            </Link>
            <button
              type="button"
              onClick={() => setQuick(true)}
              className="inline-flex h-10 items-center gap-1.5 rounded-control border border-white/10 bg-white/[0.06] px-3.5 text-[13px] font-medium text-white/75 backdrop-blur transition-colors hover:bg-white/[0.1] hover:text-white"
            >
              <Plus className="size-4" />
              Quick capture
            </button>
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex h-10 items-center gap-1.5 rounded-control bg-white px-3.5 text-[13px] font-semibold text-[#15161d] shadow-[0_12px_26px_-14px_rgb(255_255_255/0.5)] transition-[background-color,transform] hover:bg-[#f1f1f6] active:scale-[0.98]"
            >
              <Plus className="size-4" />
              Add lead
            </button>
          </div>
        </div>
      </section>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {isLoading || !counts
          ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[106px] rounded-card" />)
          : [
              { label: 'Overdue follow-ups', value: counts.overdue, hint: 'Past their date', icon: AlarmClock, tone: 'danger' as const, to: '/follow-ups?when=overdue' },
              { label: 'Due today', value: counts.dueToday, hint: `${counts.todayDone} done · ${counts.completedToday} completed today`, icon: Clock, tone: 'warning' as const, to: '/follow-ups?when=today' },
              { label: 'Meetings today', value: counts.meetingsToday, hint: 'Scheduled for today', icon: CalendarCheck, tone: 'accent' as const, to: '/meetings?when=today' },
              { label: 'Meetings pending', value: counts.meetingsPending, hint: 'Scheduled, not completed', icon: CalendarClock, tone: 'info' as const, to: '/meetings?when=pending' },
              { label: 'High priority, quiet', value: counts.stale, hint: 'No activity for 14+ days', icon: Flame, tone: 'info' as const, to: '/leads?stale=1' },
            ].map((kpi, index) => (
              <KpiCard key={kpi.label} {...kpi} index={index} className={index === 4 ? 'max-lg:col-span-2' : undefined} />
            ))}
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <Card className="animate-rise p-5 lg:col-span-2" style={{ animationDelay: '160ms' }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-[14px] font-semibold tracking-[-0.01em]">Follow-ups</h2>
                <span className="size-1.5 rounded-full bg-danger shadow-[0_0_0_3px_rgb(212_70_47/0.10)]" />
              </div>
              <p className="mt-1 text-[11.5px] text-faint">Your next actions, ordered by urgency</p>
            </div>
            <Link
              to="/follow-ups?when=pending"
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-control border border-line bg-surface px-2.5 text-[12px] font-medium text-muted shadow-[inset_0_1px_0_rgb(255_255_255/0.9)] transition-colors hover:bg-surface-2 hover:text-fg"
            >
              See all
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
          {isLoading ? (
            <div className="mt-4 flex flex-col gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
          ) : data && data.overdue.length + data.dueToday.length === 0 ? (
            <EmptyState icon={<Check />} title="Nothing due" description="No overdue or due follow-ups. Log a call to set the next one." />
          ) : (
            <div className="mt-3 flex flex-col gap-5">
              {data && overduePreview.length > 0 && (
                <section>
                  <div className="flex items-center gap-2">
                    <h3 className="text-[12px] font-semibold uppercase tracking-wide text-danger">Overdue</h3>
                    <Badge tone="danger">{counts?.overdue ?? data.overdue.length}</Badge>
                  </div>
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {overduePreview.map((row) => (
                      <FollowUpItem key={row.followUp.id} row={row} onComplete={() => setCompleting(row)} completing={false} />
                    ))}
                  </ul>
                </section>
              )}
              {data && dueTodayPreview.length > 0 && (
                <section>
                  <div className="flex items-center gap-2">
                    <h3 className="text-[12px] font-semibold uppercase tracking-wide text-warning">Due today</h3>
                    <Badge tone="warning">{counts?.dueToday ?? data.dueToday.length}</Badge>
                  </div>
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {dueTodayPreview.map((row) => (
                      <FollowUpItem key={row.followUp.id} row={row} onComplete={() => setCompleting(row)} completing={false} />
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
        </Card>

        <div className="flex flex-col gap-3">
          <Card className="animate-rise p-5" style={{ animationDelay: '200ms' }}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[14px] font-semibold tracking-[-0.01em]">Meetings today</h2>
                <p className="mt-1 text-[11.5px] text-faint">Scheduled conversations</p>
              </div>
              <Link to="/meetings?when=today" className="text-[12px] font-medium text-muted hover:text-fg">
                View all
              </Link>
            </div>
            <ul className="mt-3 divide-y divide-line">
              {isLoading &&
                Array.from({ length: 2 }).map((_, i) => (
                  <li key={i} className="py-3">
                    <Skeleton className="h-10" />
                  </li>
                ))}
              {data?.meetings.map((row) => <MeetingItem key={row.meeting.id} row={row} />)}
              {data && data.meetings.length === 0 && <li className="py-6 text-center text-[13px] text-muted">No meetings scheduled today</li>}
            </ul>
          </Card>

          <Card className="animate-rise p-5" style={{ animationDelay: '240ms' }}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[14px] font-semibold tracking-[-0.01em]">Needs a nudge</h2>
                <p className="mt-1 text-[11.5px] text-faint">High priority, quiet for 14+ days</p>
              </div>
              <span className="grid size-7 shrink-0 place-items-center rounded-[9px] bg-warning-soft text-warning ring-1 ring-inset ring-warning/10">
                <Flame className="size-3.5" />
              </span>
            </div>
            <ul className="mt-3 divide-y divide-line">
              {data?.stale.map((lead) => (
                <li key={lead.id} className="flex items-center gap-3 py-2.5">
                  <LeadIdentity lead={lead} />
                  <span className="ml-auto flex shrink-0 items-center gap-1.5">
                    <PriorityBadge score={lead.priorityScore} level={lead.priorityLevel} showScore={false} />
                    <WhatsAppButton phone={lead.contactPhone} compact />
                  </span>
                </li>
              ))}
              {data && data.stale.length === 0 && <li className="py-6 text-center text-[13px] text-muted">Every hot lead has recent activity</li>}
            </ul>
          </Card>
        </div>
      </div>

      <LeadForm open={adding} onClose={() => setAdding(false)} onSaved={(id) => navigate(`/leads/${id}`)} />
      <QuickLeadDialog open={quick} onClose={() => setQuick(false)} onCreated={(id) => navigate(`/leads/${id}`)} />
      <CompleteFollowUpDialog
        open={Boolean(completing)}
        onClose={() => setCompleting(null)}
        followUpId={completing?.followUp.id ?? null}
        leadCode={completing?.lead.code}
        dueDate={completing ? dmy(completing.followUp.dueDate) : undefined}
      />
    </div>
  )
}

function FollowUpItem({ row, onComplete, completing }: { row: FollowUpRow; onComplete: () => void; completing: boolean }) {
  const { lead, followUp } = row
  return (
    <li className="group relative flex items-center gap-3 overflow-hidden rounded-control border border-line bg-white px-3 py-2.5 transition-[background-color,border-color,box-shadow] duration-150 hover:border-line-strong hover:bg-surface-2/30 hover:shadow-card">
      <span aria-hidden className="absolute inset-y-2 left-0 w-[2px] rounded-full bg-accent opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <LeadIdentity lead={lead} />
          <StatusBadge status={lead.status} className="max-sm:hidden" />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          <DueText followUp={followUp} />
        </div>
      </div>
      <WhatsAppButton phone={lead.contactPhone} compact />
      <Button size="sm" onClick={onComplete} loading={completing} aria-label="Mark follow-up done">
        <Check />
        <span className="hidden sm:inline">Done</span>
      </Button>
      <Link to={`/leads/${lead.id}`} aria-label="Open lead" className="grid size-8 place-items-center rounded-tile text-faint hover:bg-surface-2 hover:text-fg">
        <ArrowRight className="size-4" />
      </Link>
    </li>
  )
}

function MeetingItem({ row }: { row: MeetingRow }) {
  return (
    <li className="flex items-center gap-3 py-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-tile bg-accent-soft text-accent">
        <Users className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <Link to={`/leads/${row.lead.id}`} className="block truncate text-[13.5px] font-medium hover:underline">
          {row.lead.contactName ?? row.lead.code}
        </Link>
        <p className="truncate text-[12px] text-faint">
          {row.meeting.type} · {row.lead.orgName ?? row.lead.code}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-[12.5px] font-medium tabular-nums">{meetingTime(row.meeting.scheduledAt)}</span>
        <span className="text-[11.5px] text-faint">{dmy(row.meeting.scheduledAt)}</span>
      </div>
      {row.lead.contactPhone && (
        <a
          href={`https://wa.me/${row.lead.contactPhone.replace(/\D/g, '')}`}
          target="_blank"
          rel="noreferrer"
          aria-label="WhatsApp"
          className="grid size-7 place-items-center rounded-tile text-success hover:bg-success-soft"
        >
          <MessageCircle className="size-4" />
        </a>
      )}
    </li>
  )
}
