import { Percent, TrendingUp, Trophy, Users } from 'lucide-react'
import type { ReactNode } from 'react'

import { Badge, Card, KpiCard, PageHeader, Skeleton } from '../components/ui'
import { useReports } from '../lib/api'
import { cx } from '../lib/cx'
import { LEAD_STATUSES, statusLabel, statusTone } from '../../shared/leads'

export function Reports() {
  const { data, isLoading } = useReports()

  return (
    <div className="mx-auto max-w-[1240px] p-4 sm:p-6 2xl:p-8">
      <PageHeader title="Reports" subtitle="Where leads come from, where they stop, and how many close." />

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {isLoading || !data
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[106px] rounded-card" />)
          : [
              { label: 'Total leads', value: String(data.totals.leads), hint: `${data.totals.open} still open`, icon: Users, tone: 'accent' as const },
              { label: 'Closed won', value: String(data.totals.won), hint: `${data.totals.lost} lost`, icon: Trophy, tone: 'success' as const },
              { label: 'Conversion rate', value: `${data.totals.conversionRate}%`, hint: 'Won of closed leads', icon: Percent, tone: 'info' as const },
              { label: 'Reached a decision', value: `${data.totals.closedRate}%`, hint: 'Closed of all leads', icon: TrendingUp, tone: 'warning' as const },
            ].map((kpi, index) => <KpiCard key={kpi.label} {...kpi} index={index} />)}
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Card className="animate-rise p-5" style={{ animationDelay: '140ms' }}>
          <h2 className="text-[14px] font-semibold">Leads by status</h2>
          <div className="mt-4">
            {data ? (
              <BarList
                max={Math.max(1, ...data.byStatus.map((row) => row.count))}
                rows={data.byStatus.map((row) => ({
                  key: row.status,
                  label: statusLabel(row.status),
                  value: row.count,
                  tone: barTone(row.status),
                  badge: <Badge tone={statusTone(row.status)}>{row.count}</Badge>,
                }))}
              />
            ) : (
              <Skeleton className="h-[260px]" />
            )}
          </div>
        </Card>

        <Card className="animate-rise p-5" style={{ animationDelay: '180ms' }}>
          <h2 className="text-[14px] font-semibold">Loss reasons</h2>
          <p className="text-[12.5px] text-muted">Why closed-lost deals did not convert.</p>
          <div className="mt-4">
            {data ? (
              data.lossReasons.length ? (
                <BarList
                  max={Math.max(1, ...data.lossReasons.map((row) => row.count))}
                  rows={data.lossReasons.map((row) => ({
                    key: row.reason,
                    label: row.reason,
                    value: row.count,
                    tone: 'var(--color-danger)',
                    badge: <Badge tone="danger">{row.count}</Badge>,
                  }))}
                />
              ) : (
                <p className="py-10 text-center text-[13px] text-muted">No lost leads recorded yet</p>
              )
            ) : (
              <Skeleton className="h-[260px]" />
            )}
          </div>
        </Card>
      </div>

      <Card className="mt-3 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
          <div>
            <h2 className="text-[14px] font-semibold">Leads by source</h2>
            <p className="text-[12.5px] text-muted">Which channel brings the best leads.</p>
          </div>
        </div>
        {data ? (
          <div className="overflow-x-auto">
            <table className="data-table w-full min-w-[620px] text-left text-[13px]">
              <thead>
                <tr className="h-10 border-b border-line">
                  <th className="px-5 font-medium">Source</th>
                  <th className="w-[20%] px-4 text-right font-medium">Leads</th>
                  <th className="w-[18%] px-4 text-right font-medium">Won</th>
                  <th className="w-[18%] px-4 text-right font-medium">Lost</th>
                  <th className="w-[22%] px-5 text-right font-medium">Conversion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.bySource.map((row) => (
                  <tr key={row.source} className="h-11">
                    <td className="px-5 font-medium">{row.source}</td>
                    <td className="px-4 text-right tabular-nums">{row.leads}</td>
                    <td className="px-4 text-right tabular-nums text-success">{row.won}</td>
                    <td className="px-4 text-right tabular-nums text-danger">{row.lost}</td>
                    <td className="px-5">
                      <div className="flex items-center justify-end gap-2">
                        <span className="h-1.5 w-24 overflow-hidden rounded-[3px] bg-surface-2">
                          <span className="block h-full rounded-[3px] bg-accent" style={{ width: `${row.conversionRate}%` }} />
                        </span>
                        <span className="w-9 text-right tabular-nums">{row.conversionRate}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
                {data.bySource.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-[13px] text-muted">
                      No leads yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-5">
            <Skeleton className="h-[180px]" />
          </div>
        )}
      </Card>

      <Card className="mt-3 overflow-hidden">
        <div className="border-b border-line px-5 py-3">
          <h2 className="text-[14px] font-semibold">Leads by product</h2>
        </div>
        {data ? (
          <div className="overflow-x-auto">
            <table className="data-table w-full min-w-[520px] text-left text-[13px]">
              <thead>
                <tr className="h-10 border-b border-line">
                  <th className="px-5 font-medium">Product</th>
                  <th className="w-[20%] px-4 text-right font-medium">Leads</th>
                  <th className="w-[20%] px-5 text-right font-medium">Won</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.byProduct.map((row) => (
                  <tr key={row.product} className="h-11">
                    <td className="px-5 font-medium">{row.product}</td>
                    <td className="px-4 text-right tabular-nums">{row.leads}</td>
                    <td className="px-5 text-right tabular-nums text-success">{row.won}</td>
                  </tr>
                ))}
                {data.byProduct.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-5 py-8 text-center text-[13px] text-muted">
                      No product data yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-5">
            <Skeleton className="h-[140px]" />
          </div>
        )}
      </Card>

      <p className="mt-4 text-[12px] text-faint">
        Reports use the same active leads as the leads list. Archived leads are excluded; conversion counts Closed Won against Closed Won plus Closed Lost.
      </p>
    </div>
  )
}

const statusColor = Object.fromEntries(LEAD_STATUSES.map((status) => [status.key, statusTone(status.key)]))

function barTone(status: string): string {
  const tone = statusColor[status]
  if (tone === 'success') return 'var(--color-success)'
  if (tone === 'danger') return 'var(--color-danger)'
  if (tone === 'warning') return 'var(--color-warning)'
  if (tone === 'info') return 'var(--color-info)'
  if (tone === 'accent') return 'var(--color-accent)'
  return 'var(--color-line-strong)'
}

function BarList({
  rows,
  max,
}: {
  rows: { key: string; label: string; value: number; tone: string; badge?: ReactNode }[]
  max: number
}) {
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((row) => (
        <li key={row.key} className="grid grid-cols-[132px_1fr_auto] items-center gap-3 text-[12.5px]">
          <span className="truncate text-muted" title={row.label}>
            {row.label}
          </span>
          <span className={cx('h-2 overflow-hidden rounded-[4px] bg-surface-2')}>
            <span className="block h-full rounded-[4px] transition-[width]" style={{ width: `${(row.value / max) * 100}%`, background: row.tone }} />
          </span>
          {row.badge ?? <span className="w-8 text-right tabular-nums text-faint">{row.value}</span>}
        </li>
      ))}
    </ul>
  )
}
