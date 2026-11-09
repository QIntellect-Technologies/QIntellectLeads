import { Calendar, ClipboardCopy, Mail, MessageCircle, Phone, Sparkles, Trash2, Users } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

import { api, useApiMutation } from '../lib/api'
import { cx } from '../lib/cx'
import { dmy, dmyTime, isPastDate, isToday, phoneKey, priorityTone, statusLabel, statusTone, whatsappLink } from '../../shared/leads'
import type { LeadFollowUp, LeadListItem } from '../../shared/types'
import { Badge, useToast } from './ui'

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge tone={statusTone(status)} dot className={className}>
      {statusLabel(status)}
    </Badge>
  )
}

export function PriorityBadge({ score, level, showScore = true }: { score: number; level: string; showScore?: boolean }) {
  return (
    <Badge tone={priorityTone(level)}>
      {level}
      {showScore && <span className="tabular-nums opacity-70">{score}</span>}
    </Badge>
  )
}

export function FollowUpBadge({ followUp }: { followUp: LeadFollowUp | { dueDate: string; dueTime: string | null } }) {
  const overdue = isPastDate(followUp.dueDate)
  const today = isToday(followUp.dueDate)
  return (
    <span
      className={cx(
        'inline-flex flex-wrap items-center gap-x-1.5 text-[12.5px] leading-snug tabular-nums',
        overdue ? 'font-medium text-danger' : today ? 'font-medium text-warning' : 'text-muted',
      )}
    >
      <Calendar className="size-3.5" />
      {dmy(followUp.dueDate)}
      {followUp.dueTime ? ` · ${followUp.dueTime}` : ''}
      {overdue && <span className="text-[11px] uppercase tracking-wide">overdue</span>}
      {today && <span className="text-[11px] uppercase tracking-wide">today</span>}
    </span>
  )
}

export function LeadIdentity({ lead, showCode = true }: { lead: Pick<LeadListItem, 'id' | 'code' | 'contactName' | 'orgName'>; showCode?: boolean }) {
  return (
    <span className="min-w-0">
      <span className="flex items-baseline gap-2">
        <Link to={`/leads/${lead.id}`} className="truncate text-[13.5px] font-medium hover:underline">
          {lead.contactName ?? 'Unnamed contact'}
        </Link>
        {showCode && <span className="shrink-0 text-[11.5px] tabular-nums text-faint">{lead.code}</span>}
      </span>
      {lead.orgName && <span className="block truncate text-[12px] text-faint">{lead.orgName}</span>}
    </span>
  )
}

export function WhatsAppButton({ phone, message, label = 'WhatsApp', compact }: { phone: string | null; message?: string; label?: string; compact?: boolean }) {
  if (!phone) {
    return <span className="text-[12px] text-faint">No number</span>
  }
  return (
    <a
      href={whatsappLink(phone, message ?? '')}
      target="_blank"
      rel="noreferrer"
      aria-label={`WhatsApp ${phone}`}
      className={cx(
        'inline-flex items-center gap-1.5 rounded-tile font-medium text-success transition-colors hover:bg-success-soft',
        compact ? 'grid size-7 place-items-center' : 'h-8 px-2.5 text-[12.5px]',
      )}
    >
      <MessageCircle className={compact ? 'size-4' : 'size-3.5'} />
      {!compact && label}
    </a>
  )
}

const channelIcon: Record<string, ReactNode> = {
  Call: <Phone />,
  WhatsApp: <MessageCircle />,
  Meeting: <Users />,
  Email: <Mail />,
  Note: <ClipboardCopy />,
  System: <Sparkles />,
}

export function InteractionTimeline({ items, onDeleted }: { items: LeadDetailInteractions; onDeleted?: () => void }) {
  const toast = useToast()
  const remove = useApiMutation((id: string) => api(`/interactions/${id}`, { method: 'DELETE' }), ['lead', 'today', 'leads', 'reports'], {
    onSuccess: () => {
      toast('Interaction removed')
      onDeleted?.()
    },
  })
  if (items.length === 0) return <p className="py-6 text-center text-[13px] text-muted">No history yet. Log the first call or WhatsApp message.</p>
  return (
    <ol className="relative mt-1 flex flex-col">
      <span aria-hidden className="absolute bottom-3 left-[13px] top-3 w-px bg-line" />
      {items.map((item) => (
        <li key={item.id} className="group relative flex gap-3 py-3">
          <span className="relative z-10 grid size-7 shrink-0 place-items-center rounded-[9px] border border-line bg-surface text-muted [&_svg]:size-3.5">
            {channelIcon[item.channel] ?? <ClipboardCopy />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-[12.5px] font-semibold">{item.channel}</span>
              {item.outcome && item.outcome.toLowerCase() !== (item.statusAfter ? statusLabel(item.statusAfter).toLowerCase() : '') && (
                <span className="text-[12.5px] text-muted">{item.outcome}</span>
              )}
              {item.statusAfter && (
                <span className="text-[11.5px] text-faint">
                  status: {statusLabel(item.statusAfter)}
                </span>
              )}
              <span className="ml-auto shrink-0 text-[11.5px] tabular-nums text-faint">{dmyTime(item.date)}</span>
            </div>
            {item.note && <p className="mt-1 whitespace-pre-wrap text-[13.5px] leading-relaxed text-fg/90">{item.note}</p>}
          </div>
          {item.channel !== 'System' && (
            <button
              type="button"
              aria-label="Delete interaction"
              onClick={() => remove.mutate(item.id)}
              className="absolute right-0 top-3 grid size-7 place-items-center rounded-tile text-faint opacity-0 transition-opacity hover:bg-surface-2 hover:text-danger group-hover:opacity-100"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </li>
      ))}
    </ol>
  )
}

type LeadDetailInteractions = { id: string; date: string; channel: string; outcome: string | null; note: string | null; statusAfter: string | null }[]

export function DueText({ followUp }: { followUp: LeadFollowUp }) {
  const overdue = isPastDate(followUp.dueDate) && !followUp.completed
  return (
    <span className={cx('inline-flex items-center gap-1 text-[12px] tabular-nums', overdue ? 'text-danger' : 'text-faint')}>
      <Calendar className="size-3" />
      {dmy(followUp.dueDate)}
      {followUp.dueTime ? ` · ${followUp.dueTime}` : ''}
    </span>
  )
}

export function PhoneText({ phone }: { phone: string | null }) {
  if (!phone) return <span className="text-faint">No number</span>
  return (
    <a href={`tel:${phone}`} className="inline-flex items-center gap-1.5 tabular-nums hover:underline">
      <Phone className="size-3.5 text-faint" />
      {phone}
    </a>
  )
}

export function LastSeen({ value }: { value: string | null }) {
  if (!value) return <span className="text-faint">No activity yet</span>
  return <span title={dmyTime(value)}>{dmy(value)}</span>
}

// Re-export so pages can build their own labels consistently.
export { phoneKey }
