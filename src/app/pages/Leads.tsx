import { Archive, ChevronLeft, ChevronRight, Plus, Search, SlidersHorizontal, Users, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router'

import { LeadForm } from '../components/lead-forms'
import { FollowUpBadge, LeadIdentity, LastSeen, PriorityBadge, StatusBadge, WhatsAppButton } from '../components/lead-bits'
import { Button, Card, EmptyState, Input, PageHeader, Select, Skeleton, TableProgress } from '../components/ui'
import { useLeads } from '../lib/api'
import { cx } from '../lib/cx'
import { LEAD_SOURCES, LEAD_STATUSES, ORG_TYPES, PRIORITY_LEVELS, PRODUCTS } from '../../shared/leads'

const PAGE = 20

export function Leads() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const [adding, setAdding] = useState(false)
  const q = params.get('q') ?? ''
  const status = params.get('status') ?? ''
  const priority = params.get('priority') ?? ''
  const source = params.get('source') ?? ''
  const product = params.get('product') ?? ''
  const orgType = params.get('orgType') ?? ''
  const followUp = params.get('followUp') ?? ''
  const stale = params.get('stale') === '1' ? '1' : ''
  const sort = params.get('sort') ?? 'newest'
  const archived = params.get('archived') === '1' ? '1' : '0'
  const page = Math.max(0, Number(params.get('page') ?? 0))

  const { data, isLoading, isFetching } = useLeads({ q, status, priority, source, product, orgType, followUp, stale, sort, archived })
  const items = data?.items ?? []
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE))
  const current = Math.min(page, totalPages - 1)
  const pageItems = items.slice(current * PAGE, current * PAGE + PAGE)
  const filtered = Boolean(q || status || priority || source || product || orgType || followUp || stale)
  const sourceOptions = Array.from(new Set([...LEAD_SOURCES, ...items.map((lead) => lead.source).filter(Boolean)]))
  const orgTypeOptions = Array.from(new Set([...ORG_TYPES, ...items.map((lead) => lead.orgType).filter(Boolean)]))

  function update(next: Record<string, string>) {
    const merged = new URLSearchParams(params)
    for (const [key, value] of Object.entries(next)) value ? merged.set(key, value) : merged.delete(key)
    if (!('page' in next)) merged.delete('page')
    setParams(merged, { replace: true })
  }

  function clearFilters() {
    const merged = new URLSearchParams(params)
    for (const key of ['q', 'status', 'priority', 'source', 'product', 'orgType', 'followUp', 'stale', 'page']) merged.delete(key)
    setParams(merged, { replace: true })
  }

  const activeFilters = [
    q && { key: 'q', label: `Search: ${q}` },
    status && { key: 'status', label: LEAD_STATUSES.find((s) => s.key === status)?.label ?? status },
    priority && { key: 'priority', label: `${priority} priority` },
    source && { key: 'source', label: source },
    product && { key: 'product', label: product },
    orgType && { key: 'orgType', label: orgType },
    followUp && {
      key: 'followUp',
      label: { overdue: 'Overdue follow-ups', today: 'Due today', upcoming: 'Upcoming follow-ups', none: 'No follow-up' }[followUp] ?? followUp,
    },
    stale && { key: 'stale', label: 'Quiet for 14+ days' },
  ].filter(Boolean) as { key: string; label: string }[]

  return (
    <div className="mx-auto max-w-[1440px] p-4 sm:p-6 2xl:p-8">
      <PageHeader
        title={archived === '1' ? 'Archived leads' : 'Leads'}
        subtitle={data ? `${items.length} ${archived === '1' ? 'archived' : ''} ${items.length === 1 ? 'lead' : 'leads'}${filtered ? ' matching' : ''}` : undefined}
        actions={
          <>
            <Button onClick={() => update({ archived: archived === '1' ? '' : '1', page: '' })}>
              <Archive />
              {archived === '1' ? 'Active leads' : 'Archived'}
            </Button>
            <Button variant="primary" onClick={() => setAdding(true)}>
              <Plus />
              Add lead
            </Button>
          </>
        }
      />

      <Card className="mt-6 animate-rise p-3.5" style={{ animationDelay: '40ms' }}>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[240px] flex-1 sm:max-w-md">
              <span className="mb-1 block text-[11.5px] font-medium text-muted">Search leads</span>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
                <Input
                  type="search"
                  value={q}
                  onChange={(e) => update({ q: e.target.value })}
                  placeholder="Name, number, company or lead ID"
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
            <FilterField label="Sort by" className="w-[170px]">
              <Select value={sort} onChange={(e) => update({ sort: e.target.value })} className="w-full">
                <option value="newest">Newest first</option>
                <option value="priority">Priority</option>
                <option value="followup">Follow-up date</option>
                <option value="name">Contact name</option>
                <option value="created">Created date</option>
              </Select>
            </FilterField>
            {filtered && (
              <Button variant="ghost" className="mb-px" onClick={clearFilters}>
                <X />
                Clear all
              </Button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            <FilterField label="Status">
              <Select value={status} onChange={(e) => update({ status: e.target.value })} className="w-full">
                <option value="">All statuses</option>
                {LEAD_STATUSES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </FilterField>
            <FilterField label="Priority">
              <Select value={priority} onChange={(e) => update({ priority: e.target.value })} className="w-full">
                <option value="">Any priority</option>
                {PRIORITY_LEVELS.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </Select>
            </FilterField>
            <FilterField label="Source">
              <Select value={source} onChange={(e) => update({ source: e.target.value })} className="w-full">
                <option value="">Any source</option>
                {sourceOptions.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
            </FilterField>
            <FilterField label="Product">
              <Select value={product} onChange={(e) => update({ product: e.target.value })} className="w-full">
                <option value="">Any product</option>
                {PRODUCTS.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </Select>
            </FilterField>
            <FilterField label="Company type">
              <Select value={orgType} onChange={(e) => update({ orgType: e.target.value })} className="w-full">
                <option value="">Any type</option>
                {orgTypeOptions.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </Select>
            </FilterField>
            <FilterField label="Follow-up">
              <Select value={followUp} onChange={(e) => update({ followUp: e.target.value })} className="w-full">
                <option value="">Any follow-up</option>
                <option value="overdue">Overdue</option>
                <option value="today">Due today</option>
                <option value="upcoming">Upcoming</option>
                <option value="none">No follow-up</option>
              </Select>
            </FilterField>
          </div>

          {activeFilters.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 border-t border-line pt-2.5">
              <span className="mr-0.5 flex items-center gap-1 text-[11.5px] text-faint">
                <SlidersHorizontal className="size-3.5" />
                Active
              </span>
              {activeFilters.map((filter) => (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() => update({ [filter.key]: '' })}
                  className="inline-flex h-6 items-center gap-1 rounded-[7px] bg-surface-2 px-2 text-[11.5px] font-medium text-muted hover:text-fg"
                >
                  {filter.label}
                  <X className="size-3" />
                </button>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Card className="relative mt-4 animate-rise overflow-hidden" style={{ animationDelay: '90ms' }}>
        <TableProgress show={isFetching && !isLoading} />
        <div className="overflow-x-auto">
          <table className="data-table w-full min-w-[940px] table-fixed border-collapse text-left text-[13.5px]">
            <thead>
              <tr className="h-10 border-b border-line">
                <th className="w-[24%] px-4 font-medium">Lead</th>
                <th className="w-[11%] px-4 font-medium">Product</th>
                <th className="w-[14%] px-4 font-medium">Status</th>
                <th className="w-[10%] px-4 font-medium">Priority</th>
                <th className="w-[15%] px-4 font-medium">Next follow-up</th>
                <th className="w-[18%] px-4 font-medium">Last note</th>
                <th className="w-[8%] px-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {isLoading &&
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="h-14">
                    {Array.from({ length: 7 }).map((__, j) => (
                      <td key={j} className="px-4">
                        <Skeleton className={cx('h-3.5', j === 0 ? 'w-3/4' : j === 6 ? 'ml-auto w-1/2' : 'w-full')} />
                      </td>
                    ))}
                  </tr>
                ))}
              {!isLoading &&
                pageItems.map((lead) => (
                  <tr
                    key={lead.id}
                    onClick={() => navigate(`/leads/${lead.id}`)}
                    className={cx('cursor-pointer align-top transition-colors hover:bg-surface-2/60', lead.overdue && 'bg-danger-soft/30')}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <LeadIdentity lead={lead} />
                        {lead.b2b && <span className="shrink-0 rounded-[5px] bg-accent-soft px-1 text-[10px] font-semibold text-accent">B2B</span>}
                      </div>
                      <p className="mt-0.5 truncate text-[11.5px] text-faint">
                        {[lead.source, lead.orgType, lead.city].filter(Boolean).join(' · ') || 'No organization details'}
                      </p>
                    </td>
                    <td className="truncate px-4 py-3 text-muted" title={lead.product}>{lead.product || <span className="text-faint">None</span>}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={lead.status} />
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex flex-col items-start gap-0.5">
                        <PriorityBadge score={lead.priorityScore} level={lead.priorityLevel} showScore={false} />
                        <span className="pl-0.5 text-[11px] tabular-nums text-faint">{lead.priorityScore}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3">{lead.nextFollowUp ? <FollowUpBadge followUp={lead.nextFollowUp} /> : <span className="text-[12px] text-faint">None</span>}</td>
                    <td className="px-4 py-3">
                      <p className="line-clamp-2 text-[12.5px] leading-snug text-muted">{lead.lastNote ?? <span className="text-faint">No history yet</span>}</p>
                      {lead.lastInteractionAt && (
                        <p className="mt-1 text-[11px] text-faint">
                          <LastSeen value={lead.lastInteractionAt} />
                        </p>
                      )}
                    </td>
                    <td className="px-2 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <WhatsAppButton phone={lead.contactPhone} compact />
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {!isLoading && items.length === 0 && (
          <EmptyState
            icon={<Users />}
            title={filtered ? 'No leads match' : archived === '1' ? 'No archived leads' : 'No leads yet'}
            description={filtered ? 'Try a different search or clear the filters.' : archived === '1' ? 'Leads you archive are kept here with their history.' : 'Add your first lead to start the pipeline.'}
            action={
              filtered ? (
                <Button onClick={clearFilters}>Clear filters</Button>
              ) : (
                <Button variant="primary" onClick={() => setAdding(true)}>
                  <Plus />
                  Add lead
                </Button>
              )
            }
          />
        )}
      </Card>

      {items.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-line/80 bg-white/70 px-3 py-2 text-[12.5px] text-muted shadow-[inset_0_1px_0_rgb(255_255_255/0.9)] backdrop-blur">
          <span className="tabular-nums">
            Showing <span className="font-medium text-fg">{current * PAGE + 1}–{Math.min((current + 1) * PAGE, items.length)}</span> of{' '}
            <span className="font-medium text-fg">{items.length}</span> leads
          </span>
          <div className="flex items-center gap-1">
            <Button size="sm" disabled={current === 0} onClick={() => update({ page: String(current - 1) })} aria-label="Previous page">
              <ChevronLeft />
              <span className="hidden sm:inline">Previous</span>
            </Button>
            {pageNumbers(current, totalPages).map((page, index) =>
              page === null ? (
                <span key={`gap-${index}`} className="grid size-8 place-items-center text-faint">…</span>
              ) : (
                <Button
                  key={page}
                  size="icon-sm"
                  variant={page === current ? 'primary' : 'secondary'}
                  onClick={() => update({ page: String(page) })}
                  aria-label={`Page ${page + 1}`}
                  aria-current={page === current ? 'page' : undefined}
                  className="tabular-nums"
                >
                  {page + 1}
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

      <p className="mt-4 text-[12px] text-faint">Lead history is never overwritten: every status change and note stays on the lead.</p>

      <LeadForm open={adding} onClose={() => setAdding(false)} onSaved={(id) => navigate(`/leads/${id}`)} />
    </div>
  )
}

function FilterField({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <label className={cx('flex min-w-0 flex-col gap-1', className)}>
      <span className="text-[11.5px] font-medium text-muted">{label}</span>
      {children}
    </label>
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
