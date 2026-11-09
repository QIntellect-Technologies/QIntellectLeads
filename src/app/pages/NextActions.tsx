import { AlarmClock, ArrowRight, CalendarCheck, Check, CheckCircle2, Flame, ListChecks, Plus, Send, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'

import { CompleteFollowUpDialog, QuickLeadDialog } from '../components/productivity'
import { LeadIdentity, StatusBadge } from '../components/lead-bits'
import { Badge, Button, Card, EmptyState, KpiCard, PageHeader, Skeleton, useToast } from '../components/ui'
import { api, useApiMutation, useNextActions, useNotificationSettings } from '../lib/api'
import { dmy, timeLabel } from '../../shared/leads'
import type { FollowUpRow } from '../../shared/types'

export function NextActions() {
  const { data, isLoading } = useNextActions()
  const { data: notifications } = useNotificationSettings()
  const toast = useToast()
  const navigate = useNavigate()
  const [completing, setCompleting] = useState<FollowUpRow | null>(null)
  const [quick, setQuick] = useState(false)
  const sendNow = useApiMutation(
    () => api<{ ok: true }>('/settings/notifications/send-now', { method: 'POST' }),
    ['notification-settings'],
    { onSuccess: () => toast('Progress email sent to the saved recipients') },
  )
  const today = data?.today
  const queue = data?.queue ?? []
  const overdue = queue.filter((row) => today && row.followUp.dueDate < today)
  const dueToday = queue.filter((row) => today && row.followUp.dueDate === today)
  const upcoming = queue.filter((row) => today && row.followUp.dueDate > today)
  const progress = data?.progress
  const load = (progress?.pendingToday ?? 0) + (progress?.overdue ?? 0)

  return (
    <div className="mx-auto max-w-[1320px] p-4 sm:p-6 2xl:p-8">
      <PageHeader
        title="Next actions"
        subtitle="One queue for the work that actually moves leads forward today."
        actions={
          <>
            <Button onClick={() => navigate('/follow-ups?when=pending')}>
              <ListChecks />
              All follow-ups
            </Button>
            <Button variant="primary" onClick={() => setQuick(true)}>
              <Plus />
              Quick capture
            </Button>
          </>
        }
      />

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {isLoading || !progress
          ? Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-[106px] rounded-card" />)
          : [
              { label: 'Completed today', value: progress.completedToday, hint: 'All follow-ups finished', icon: CheckCircle2, tone: 'success' as const, to: '/follow-ups?when=completed' },
              { label: 'Due today', value: progress.pendingToday, hint: `${progress.todayDone} already done today`, icon: CalendarCheck, tone: 'warning' as const, to: '/follow-ups?when=today' },
              { label: 'Overdue', value: progress.overdue, hint: 'Oldest first in the queue', icon: Flame, tone: 'danger' as const, to: '/follow-ups?when=overdue' },
              { label: 'Meetings today', value: `${progress.meetingsDone}/${progress.meetingsToday}`, hint: `${progress.meetingsPending} still scheduled`, icon: AlarmClock, tone: 'accent' as const, to: '/meetings?when=today' },
            ].map((kpi, index) => <KpiCard key={kpi.label} {...kpi} index={index} />)}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="animate-rise overflow-hidden">
          <div className="border-b border-line px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-[15px] font-semibold">Today's queue</h2>
                <p className="mt-0.5 text-[12px] text-muted">Overdue first, then today, then the next 15 upcoming.</p>
              </div>
              <Badge tone={load ? 'warning' : 'success'} dot>
                {load ? `${load} open` : 'Clear'}
              </Badge>
            </div>
          </div>

          {isLoading ? (
            <div className="p-5">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="mb-2 h-16" />
              ))}
            </div>
          ) : queue.length === 0 ? (
            <EmptyState
              icon={<Check />}
              title="No open follow-ups"
              description="Every follow-up is done. Add a lead or set the next step on a quiet lead."
              action={<Button onClick={() => setQuick(true)}>Quick capture</Button>}
            />
          ) : (
            <div>
              <QueueSection title="Overdue" tone="danger" rows={overdue} today={today} onComplete={setCompleting} />
              <QueueSection title="Due today" tone="warning" rows={dueToday} today={today} onComplete={setCompleting} />
              <QueueSection title="Up next" tone="info" rows={upcoming} today={today} onComplete={setCompleting} />
            </div>
          )}
        </Card>

        <div className="flex flex-col gap-4">
          <Card className="animate-rise p-5" style={{ animationDelay: '80ms' }}>
            <div className="flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-tile bg-success-soft text-success">
                <Sparkles className="size-4" />
              </span>
              <div>
                <h2 className="text-[14px] font-semibold">End-of-day wrap-up</h2>
                <p className="text-[11.5px] text-faint">What happened, what remains</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {[
                ['Meetings done', progress ? `${progress.meetingsDone}/${progress.meetingsToday}` : '—'],
                ['Follow-ups done', progress ? `${progress.todayDone}/${progress.todayDone + progress.pendingToday}` : '—'],
                ['Completed today', progress?.completedToday ?? '—'],
                ['Still pending', progress?.pendingToday ?? '—'],
              ].map(([label, value]) => (
                <div key={label} className="rounded-control border border-line bg-surface-2/50 p-3">
                  <p className="text-[10.5px] uppercase tracking-wide text-faint">{label}</p>
                  <p className="mt-1 text-[20px] font-semibold tabular-nums">{value}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-muted">
              {progress && progress.pendingToday === 0 && progress.overdue === 0
                ? 'Everything due today is done. Good place to stop.'
                : 'Complete each pending follow-up with a next step, or postpone it with a reason. Nothing should disappear silently.'}
            </p>
            <Button
              size="sm"
              className="mt-3 w-full"
              loading={sendNow.isPending}
              disabled={!notifications?.smtp.passwordConfigured}
              onClick={() => sendNow.mutate(undefined)}
              title={notifications?.smtp.passwordConfigured ? 'Email this progress update now' : 'Save the SMTP app password in Settings first'}
            >
              <Send />
              Send progress now
            </Button>
            {!notifications?.smtp.passwordConfigured && (
              <p className="mt-1.5 text-center text-[10.5px] text-faint">Save the Gmail app password in Settings to enable this.</p>
            )}
            {sendNow.error && <p className="mt-2 text-[11.5px] text-danger">{sendNow.error.message}</p>}
          </Card>

          <Card className="animate-rise p-5" style={{ animationDelay: '120ms' }}>
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-[14px] font-semibold">No next step</h2>
                <p className="text-[11.5px] text-faint">{data?.noNextStep.length ?? 0} open leads with no follow-up</p>
              </div>
              <Link to="/leads?followUp=none" className="text-[12px] font-medium text-muted hover:text-fg">
                View all
              </Link>
            </div>
            <ul className="mt-3 divide-y divide-line">
              {(data?.noNextStep ?? []).slice(0, 8).map((lead) => (
                <li key={lead.id} className="flex items-center gap-2 py-2.5">
                  <LeadIdentity lead={lead} />
                  <Link to={`/leads/${lead.id}`} aria-label={`Open ${lead.code}`} className="ml-auto grid size-7 place-items-center rounded-tile text-faint hover:bg-surface-2 hover:text-fg">
                    <ArrowRight className="size-3.5" />
                  </Link>
                </li>
              ))}
              {data && data.noNextStep.length === 0 && <li className="py-5 text-center text-[12.5px] text-muted">Every open lead has a next step.</li>}
            </ul>
          </Card>
        </div>
      </div>

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

function QueueSection({
  title,
  tone,
  rows,
  today,
  onComplete,
}: {
  title: string
  tone: 'danger' | 'warning' | 'info'
  rows: FollowUpRow[]
  today?: string
  onComplete: (row: FollowUpRow) => void
}) {
  if (!rows.length) return null
  return (
    <section>
      <div className="flex items-center gap-2 border-b border-line bg-surface-2/40 px-5 py-2">
        <h3 className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">{title}</h3>
        <Badge tone={tone}>{rows.length}</Badge>
      </div>
      <ul className="divide-y divide-line">
        {rows.map((row) => {
          const late = today && row.followUp.dueDate < today
          return (
            <li key={row.followUp.id} className="px-5 py-3 transition-colors hover:bg-surface-2/40">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={`/leads/${row.lead.id}`} className="truncate text-[13.5px] font-semibold hover:underline">
                      {row.lead.contactName ?? row.lead.code}
                    </Link>
                    <StatusBadge status={row.lead.status} />
                    {row.followUp.mode === 'Cadence' && <Badge tone="accent">Cadence</Badge>}
                  </div>
                  <p className="mt-0.5 truncate text-[11.5px] text-faint">
                    {row.lead.code} · {row.lead.orgName ?? 'No organization'} · {row.lead.contactPhone ?? 'No phone'}
                  </p>
                  <p className="mt-1 line-clamp-1 text-[12px] text-muted">{row.lead.lastNote ?? 'No history yet'}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className={`text-[12px] font-medium tabular-nums ${late ? 'text-danger' : 'text-muted'}`}>{dmy(row.followUp.dueDate)}</p>
                  <p className="text-[11px] text-faint">{row.followUp.dueTime ? timeLabel(row.followUp.dueTime) : 'No time'}</p>
                </div>
                <Button size="sm" variant={late ? 'primary' : 'secondary'} onClick={() => onComplete(row)}>
                  <Check />
                  Complete
                </Button>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
