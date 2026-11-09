import { DndContext, DragOverlay, PointerSensor, closestCorners, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { MessageCircle, Plus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'

import { LeadForm, LossReasonDialog } from '../components/lead-forms'
import { PriorityBadge, StatusBadge } from '../components/lead-bits'
import { Button, PageHeader, Skeleton, useToast } from '../components/ui'
import { api, useApiMutation, useLeads } from '../lib/api'
import { cx } from '../lib/cx'
import { LEAD_STATUSES, dmy, isPastDate, whatsappLink } from '../../shared/leads'
import type { LeadStatusKey } from '../../shared/leads'
import type { LeadListItem } from '../../shared/types'

export function Pipeline() {
  const { data, isLoading } = useLeads({})
  const navigate = useNavigate()
  const toast = useToast()
  const [local, setLocal] = useState<LeadListItem[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [pendingLost, setPendingLost] = useState<LeadListItem | null>(null)
  const [adding, setAdding] = useState(false)

  const items = data?.items ?? []
  useEffect(() => setLocal(items), [items])

  const move = useApiMutation(
    (input: { id: string; status: LeadStatusKey; lossReason?: string }) => api(`/leads/${input.id}`, { method: 'PATCH', json: input }),
    ['leads', 'lead', 'today', 'reports', 'lead-search'],
    { onSuccess: () => toast('Pipeline updated') },
  )

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const columns = useMemo(
    () =>
      LEAD_STATUSES.map((status) => ({
        ...status,
        leads: local.filter((lead) => lead.status === status.key).sort((a, b) => b.priorityScore - a.priorityScore),
      })),
    [local],
  )
  const active = activeId ? local.find((lead) => lead.id === activeId) : undefined
  const open = local.filter((lead) => lead.status !== 'won' && lead.status !== 'lost').length

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id))
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveId(null)
    const overId = event.over?.id ? String(event.over.id) : null
    const id = String(event.active.id)
    const lead = local.find((l) => l.id === id)
    if (!lead || !overId || !LEAD_STATUSES.some((s) => s.key === overId)) return
    const next = overId as LeadStatusKey
    if (next === lead.status) return
    if (next === 'lost') {
      // Closed Lost needs a reason: ask before saving.
      setLocal(items)
      setPendingLost(lead)
      return
    }
    setLocal((prev) => prev.map((l) => (l.id === id ? { ...l, status: next } : l)))
    move.mutate({ id, status: next })
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mx-auto w-full max-w-[1500px] px-5 pt-5 sm:px-8 sm:pt-8">
        <PageHeader
          title="Pipeline"
          subtitle={data ? `${open} open leads across the pipeline. Drag a card to change its status.` : undefined}
          actions={
            <Button variant="primary" onClick={() => setAdding(true)}>
              <Plus />
              Add lead
            </Button>
          }
        />
      </div>

      {isLoading ? (
        <div className="mx-auto mt-6 flex w-full max-w-[1500px] gap-3 overflow-hidden px-5 sm:px-8">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[320px] w-[240px] shrink-0 rounded-card" />
          ))}
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => (setActiveId(null), setLocal(items))}>
          <div className="scrollbar-thin mt-6 flex-1 overflow-x-auto px-5 pb-6 sm:px-8">
            <div className="mx-auto flex max-w-[1500px] gap-3">
              {columns.map((column) => (
                <Column key={column.key} status={column.key} count={column.leads.length} onAdd={() => setAdding(true)}>
                  {column.leads.map((lead) => (
                    <DraggableCard key={lead.id} lead={lead} onOpen={() => navigate(`/leads/${lead.id}`)} />
                  ))}
                </Column>
              ))}
            </div>
          </div>
          <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }}>{active && <LeadCard lead={active} overlay />}</DragOverlay>
        </DndContext>
      )}

      <LeadForm open={adding} onClose={() => setAdding(false)} onSaved={(id) => navigate(`/leads/${id}`)} />
      <LossReasonDialog
        open={Boolean(pendingLost)}
        onClose={() => setPendingLost(null)}
        code={pendingLost?.code}
        onConfirm={(reason) => {
          if (!pendingLost) return
          const lead = pendingLost
          setLocal((prev) => prev.map((l) => (l.id === lead.id ? { ...l, status: 'lost' } : l)))
          move.mutate(
            { id: lead.id, status: 'lost', lossReason: reason },
            {
              onError: () => setLocal(items),
            },
          )
          setPendingLost(null)
        }}
      />
    </div>
  )
}

function Column({ status, count, children, onAdd }: { status: LeadStatusKey; count: number; children: React.ReactNode; onAdd: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  return (
    <section className="flex w-[248px] shrink-0 flex-col">
      <header className="flex h-10 items-center gap-2 px-1.5">
        <StatusBadge status={status} />
        <span className="grid min-w-5 place-items-center rounded-full bg-surface/80 px-1.5 py-0.5 text-[10.5px] font-medium tabular-nums text-faint ring-1 ring-line">
          {count}
        </span>
      </header>
      <div
        ref={setNodeRef}
        className={cx(
          'flex min-h-[240px] flex-1 flex-col gap-2 rounded-[17px] border p-2 transition-colors',
          isOver
            ? 'border-accent/40 bg-accent-soft/50 shadow-[inset_0_0_0_1px_rgb(90_85_222/0.08)]'
            : 'border-line/70 bg-[#eef1f8]/80 shadow-[inset_0_1px_0_rgb(255_255_255/0.75)]',
        )}
      >
        {children}
        <button type="button" onClick={onAdd} className="flex h-8 items-center justify-center gap-1.5 rounded-control text-[12px] text-faint transition-colors hover:bg-surface hover:text-fg">
          <Plus className="size-3.5" />
          Add lead
        </button>
      </div>
    </section>
  )
}

function DraggableCard({ lead, onOpen }: { lead: LeadListItem; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lead.id })
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform) }} {...attributes} {...listeners} className={cx(isDragging && 'opacity-30')}>
      <LeadCard lead={lead} onOpen={onOpen} />
    </div>
  )
}

function LeadCard({ lead, onOpen, overlay }: { lead: LeadListItem; onOpen?: () => void; overlay?: boolean }) {
  const overdue = lead.nextFollowUp ? isPastDate(lead.nextFollowUp.dueDate) : false
  return (
    <article
      onClick={onOpen}
      className={cx(
        'group cursor-grab rounded-[14px] border border-line/80 bg-[linear-gradient(180deg,#fff,#fdfdff)] p-3 text-left shadow-[0_1px_2px_rgb(20_21_29/0.03),0_10px_22px_-22px_rgb(20_21_29/0.24)] transition-[box-shadow,border-color,transform] duration-200 hover:-translate-y-px hover:border-line-strong hover:shadow-lift active:cursor-grabbing',
        overdue && 'border-l-[3px] border-l-danger',
        overlay && 'rotate-[1.5deg] cursor-grabbing shadow-pop',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 text-[13.5px] font-medium leading-snug">{lead.contactName ?? 'Unnamed contact'}</p>
        <span className="shrink-0 text-[11px] tabular-nums text-faint">{lead.code}</span>
      </div>
      {lead.orgName && <p className="mt-0.5 truncate text-[12px] text-muted">{lead.orgName}</p>}
      <p className="mt-0.5 truncate text-[11.5px] text-faint">{lead.product || 'No product'}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <PriorityBadge score={lead.priorityScore} level={lead.priorityLevel} />
        {lead.b2b && <span className="rounded-[5px] bg-accent-soft px-1 py-0.5 text-[10px] font-semibold text-accent">B2B</span>}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-line pt-2">
        <span className={cx('text-[11.5px] tabular-nums', overdue ? 'font-medium text-danger' : 'text-faint')}>
          {lead.nextFollowUp ? `${dmy(lead.nextFollowUp.dueDate)}${lead.nextFollowUp.dueTime ? ` ${lead.nextFollowUp.dueTime}` : ''}` : 'No follow-up'}
        </span>
        {lead.contactPhone && (
          <a
            href={whatsappLink(lead.contactPhone, '')}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            aria-label="WhatsApp"
            className="grid size-6 place-items-center rounded-tile text-success hover:bg-success-soft"
          >
            <MessageCircle className="size-3.5" />
          </a>
        )}
      </div>
    </article>
  )
}
