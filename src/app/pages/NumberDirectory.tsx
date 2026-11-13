import { ArrowLeft, ChevronLeft, ChevronRight, PhoneCall, Search, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'

import { CallDialog } from '../components/call-form'
import { WhatsAppButton } from '../components/lead-bits'
import { Badge, Button, Card, EmptyState, Input, PageHeader, Skeleton, TableProgress } from '../components/ui'
import { useNumberDirectory } from '../lib/api'
import { cx } from '../lib/cx'
import type { DirectoryRow } from '../../shared/types'

const PAGE = 20

export function NumberDirectory() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const [logging, setLogging] = useState<DirectoryRow | null>(null)
  const q = params.get('q') ?? ''
  const page = Math.max(0, Number(params.get('page') ?? 0))
  const { data, isLoading, isFetching } = useNumberDirectory(q)
  const items = data?.items ?? []
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE))
  const current = Math.min(page, totalPages - 1)
  const pageItems = items.slice(current * PAGE, current * PAGE + PAGE)

  function update(next: Record<string, string>) {
    const merged = new URLSearchParams(params)
    for (const [key, value] of Object.entries(next)) value ? merged.set(key, value) : merged.delete(key)
    if (!('page' in next)) merged.delete('page')
    setParams(merged, { replace: true })
  }

  return (
    <div className="mx-auto max-w-[1360px] p-4 sm:p-6 2xl:p-8">
      <PageHeader
        title="Number directory"
        subtitle={items.length ? `${items.length} saved contact numbers across your leads.` : 'Every saved contact number, ready to call.'}
        actions={
          <Button onClick={() => navigate('/calls')}>
            <ArrowLeft />
            Call log
          </Button>
        }
      />

      <div className="mt-5 flex flex-wrap items-end gap-2">
        <div className="min-w-[260px] flex-1 sm:max-w-md">
          <span className="mb-1 block text-[11.5px] font-medium text-muted">Search numbers</span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
            <Input
              type="search"
              value={q}
              onChange={(e) => update({ q: e.target.value })}
              placeholder="Number, person, lead or company"
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
      </div>

      <Card className="relative mt-4 animate-rise overflow-hidden" style={{ animationDelay: '80ms' }}>
        <TableProgress show={isFetching && !isLoading} />
        <div className="overflow-x-auto">
          <table className="data-table w-full min-w-[940px] table-fixed border-collapse text-left text-[13.5px]">
            <thead>
              <tr className="h-10 border-b border-line">
                <th className="w-[23%] px-4 font-medium">Lead / Company</th>
                <th className="w-[18%] px-4 font-medium">Person</th>
                <th className="w-[19%] px-4 font-medium">Number</th>
                <th className="w-[16%] px-4 font-medium">Designation</th>
                <th className="w-[10%] px-4 font-medium">Role</th>
                <th className="w-[14%] px-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {isLoading &&
                Array.from({ length: 8 }).map((_, index) => (
                  <tr key={index} className="h-14">
                    {Array.from({ length: 6 }).map((__, column) => (
                      <td key={column} className="px-4">
                        <Skeleton className={cx('h-3.5', column === 0 ? 'w-3/4' : column === 5 ? 'ml-auto w-2/3' : 'w-full')} />
                      </td>
                    ))}
                  </tr>
                ))}
              {!isLoading &&
                pageItems.map((row) => (
                  <DirectoryTableRow key={row.id} row={row} onLog={() => setLogging(row)} />
                ))}
            </tbody>
          </table>
        </div>
        {!isLoading && items.length === 0 && (
          <EmptyState
            icon={<PhoneCall />}
            title={q ? 'No numbers match' : 'No saved numbers'}
            description={q ? 'Try a different number, person, lead or company.' : 'Add contacts with phone numbers to your leads and they will appear here.'}
            action={q ? <Button onClick={() => update({ q: '' })}>Clear search</Button> : undefined}
          />
        )}
      </Card>

      {items.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-line/80 bg-white/70 px-3 py-2 text-[12.5px] text-muted shadow-[inset_0_1px_0_rgb(255_255_255/0.9)] backdrop-blur">
          <span className="tabular-nums">
            Showing <span className="font-medium text-fg">{current * PAGE + 1}–{Math.min((current + 1) * PAGE, items.length)}</span> of{' '}
            <span className="font-medium text-fg">{items.length}</span> numbers
          </span>
          <div className="flex items-center gap-1">
            <Button size="sm" disabled={current === 0} onClick={() => update({ page: String(current - 1) })} aria-label="Previous page">
              <ChevronLeft />
              <span className="hidden sm:inline">Previous</span>
            </Button>
            <span className="px-2 text-[12px] tabular-nums">
              {current + 1} / {totalPages}
            </span>
            <Button size="sm" disabled={current + 1 >= totalPages} onClick={() => update({ page: String(current + 1) })} aria-label="Next page">
              <span className="hidden sm:inline">Next</span>
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}

      <CallDialog
        open={Boolean(logging)}
        onClose={() => setLogging(null)}
        initialLeadId={logging?.lead.id}
        initialContactId={logging?.id}
      />
    </div>
  )
}

function DirectoryTableRow({ row, onLog }: { row: DirectoryRow; onLog: () => void }) {
  return (
    <tr className="align-top transition-colors hover:bg-surface-2/60">
      <td className="px-4 py-3">
        <Link to={`/leads/${row.lead.id}`} className="block truncate font-medium hover:underline">
          {row.lead.orgName ?? row.lead.code}
        </Link>
        <p className="mt-0.5 truncate text-[11.5px] text-faint">
          {row.lead.code}
          {row.lead.orgType ? ` · ${row.lead.orgType}` : ''}
        </p>
      </td>
      <td className="px-4 py-3">
        <p className="truncate font-medium">{row.personName}</p>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          <span className="truncate text-[12.5px] tabular-nums text-muted">{row.phone}</span>
          <WhatsAppButton phone={row.phone} compact />
        </div>
      </td>
      <td className="px-4 py-3 text-[12.5px] text-muted">{row.designation ?? <span className="text-faint">—</span>}</td>
      <td className="px-4 py-3">
        <Badge tone={row.role === 'Primary' ? 'accent' : 'neutral'}>{row.role === 'Primary' ? 'Primary' : 'Contact'}</Badge>
      </td>
      <td className="px-4 py-3">
        <Button size="sm" onClick={onLog}>
          <PhoneCall />
          Log call
        </Button>
      </td>
    </tr>
  )
}
