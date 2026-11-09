import { AlertTriangle, Copy, PhoneOff, UserX, Users } from 'lucide-react'
import { Link } from 'react-router'

import { StatusBadge } from '../components/lead-bits'
import { Badge, Card, EmptyState, KpiCard, PageHeader, Skeleton } from '../components/ui'
import { useDataHealth } from '../lib/api'
import type { LeadListItem } from '../../shared/types'

export function DataHealth() {
  const { data, isLoading } = useDataHealth()
  const counts = data?.counts

  return (
    <div className="mx-auto max-w-[1320px] p-4 sm:p-6 2xl:p-8">
      <PageHeader title="Data health" subtitle="Fix the small data problems that quietly cost follow-ups." />

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {isLoading || !counts
          ? Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-[106px] rounded-card" />)
          : [
              { label: 'No next step', value: counts.noNextStep, hint: 'Open leads', icon: AlertTriangle, tone: 'warning' as const, to: '/leads?followUp=none' },
              { label: 'Duplicate phones', value: counts.duplicateGroups, hint: 'Groups to review', icon: Copy, tone: 'danger' as const, to: '#duplicates' },
              { label: 'No phone', value: counts.missingPhone, hint: 'Hard to contact', icon: PhoneOff, tone: 'info' as const, to: '#missing-phone' },
              { label: 'Placeholder names', value: counts.placeholderNames, hint: 'Like "Name"', icon: UserX, tone: 'danger' as const, to: '#placeholders' },
              { label: 'Quiet & hot', value: counts.stale, hint: '14+ days silent', icon: Users, tone: 'accent' as const, to: '/leads?stale=1' },
            ].map((kpi, index) => <KpiCard key={kpi.label} {...kpi} index={index} />)}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="animate-rise p-5" id="duplicates">
          <SectionTitle title="Duplicate phone groups" hint="Same last 10 digits. Merge deliberately — no automatic deletes." count={counts?.duplicateGroups ?? 0} />
          <div className="mt-3 space-y-2">
            {(data?.duplicates ?? []).map((group) => (
              <div key={group.phone} className="rounded-control border border-line p-3">
                <p className="text-[12px] font-semibold tabular-nums text-muted">{group.phone}</p>
                <ul className="mt-1.5 divide-y divide-line">
                  {group.leads.map((lead) => (
                    <li key={lead.id} className="flex items-center gap-2 py-1.5">
                      <Link to={`/leads/${lead.id}`} className="min-w-0 flex-1 truncate text-[12.5px] font-medium hover:underline">
                        {lead.code} · {lead.contactName ?? 'No name'}
                      </Link>
                      <StatusBadge status={lead.status} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {data && data.duplicates.length === 0 && <EmptyState title="No duplicate numbers" description="Phone numbers are clean." />}
          </div>
        </Card>

        <Card className="animate-rise p-5" style={{ animationDelay: '60ms' }}>
          <SectionTitle title="Open leads with no next step" hint="These are the easiest deals to lose." count={counts?.noNextStep ?? 0} />
          <LeadList items={data?.noNextStep ?? []} empty="Every open lead has a next step." />
        </Card>

        <Card className="animate-rise p-5" id="missing-phone" style={{ animationDelay: '100ms' }}>
          <SectionTitle title="Missing phone numbers" hint="Add a number before the next touch." count={counts?.missingPhone ?? 0} />
          <LeadList items={data?.missingPhone ?? []} empty="Every lead has a phone number." />
        </Card>

        <Card className="animate-rise p-5" id="placeholders" style={{ animationDelay: '140ms' }}>
          <SectionTitle title="Placeholder contact names" hint="Replace 'Name' or 'First Name' with a real person." count={counts?.placeholderNames ?? 0} />
          <LeadList items={data?.placeholderNames ?? []} empty="No placeholder names found." />
        </Card>

        <Card className="animate-rise p-5 lg:col-span-2" style={{ animationDelay: '180ms' }}>
          <SectionTitle title="High priority, gone quiet" hint="Priority 60+ with no activity for 14+ days." count={counts?.stale ?? 0} />
          <LeadList items={data?.stale ?? []} empty="Every high-priority lead has recent activity." columns />
        </Card>
      </div>
    </div>
  )
}

function SectionTitle({ title, hint, count }: { title: string; hint: string; count: number }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 className="text-[14px] font-semibold">{title}</h2>
        <p className="mt-0.5 text-[11.5px] text-faint">{hint}</p>
      </div>
      <Badge tone={count ? 'warning' : 'success'}>{count}</Badge>
    </div>
  )
}

function LeadList({ items, empty, columns = false }: { items: LeadListItem[]; empty: string; columns?: boolean }) {
  if (!items.length) return <p className="mt-4 rounded-control bg-success-soft px-3 py-4 text-center text-[12.5px] text-success">{empty}</p>
  return (
    <ul className={`mt-3 divide-y divide-line ${columns ? 'sm:grid sm:grid-cols-2 sm:gap-x-6 sm:divide-y-0' : ''}`}>
      {items.slice(0, columns ? 20 : 10).map((lead) => (
        <li key={lead.id} className="flex items-center gap-2 py-2">
          <Link to={`/leads/${lead.id}`} className="min-w-0 flex-1 truncate text-[12.5px] font-medium hover:underline">
            {lead.contactName ?? lead.code}
          </Link>
          <span className="truncate text-[11px] text-faint">{lead.code}</span>
          <StatusBadge status={lead.status} />
        </li>
      ))}
    </ul>
  )
}
