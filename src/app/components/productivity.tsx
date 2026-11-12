import { CalendarClock, CheckCircle2, Clock3, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'

import { ApiError, api, useApiMutation } from '../lib/api'
import { addDaysISO, CALL_RESULTS, CHANNELS, LEAD_SOURCES, LOSS_REASONS, PRODUCTS, todayISO } from '../../shared/leads'
import { Button, Dialog, Field, Input, Select, Textarea, useToast } from './ui'

type CompleteResult = 'next' | 'won' | 'lost' | 'postpone'

const invalidates = ['today', 'next-actions', 'follow-ups', 'leads', 'lead', 'reports', 'meetings', 'data-summary', 'data-health', 'notification-settings']

/**
 * The one completion flow used everywhere. An open lead cannot be completed
 * without a next step; winning, losing or postponing with a reason is allowed.
 */
export function CompleteFollowUpDialog({
  open,
  onClose,
  followUpId,
  leadCode,
  dueDate,
  onCompleted,
}: {
  open: boolean
  onClose: () => void
  followUpId: string | null
  leadCode?: string
  dueDate?: string
  onCompleted?: () => void
}) {
  const toast = useToast()
  const [result, setResult] = useState<CompleteResult>('next')
  const [channel, setChannel] = useState('Call')
  const [outcome, setOutcome] = useState('')
  const [callResult, setCallResult] = useState('Connected')
  const [note, setNote] = useState('')
  const [nextDate, setNextDate] = useState(addDaysISO(2))
  const [nextTime, setNextTime] = useState('10:00')
  const [nextNote, setNextNote] = useState('')
  const [lossReason, setLossReason] = useState('')
  const [postponeReason, setPostponeReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setResult('next')
      setChannel('Call')
      setOutcome('')
      setCallResult('Connected')
      setNote('')
      setNextDate(addDaysISO(2))
      setNextTime('10:00')
      setNextNote('')
      setLossReason('')
      setPostponeReason('')
      setError(null)
    }
  }, [open, followUpId])

  const complete = useApiMutation(
    () => {
      const shared = { channel, outcome: outcome || null, note: note || null, callResult: channel === 'Call' ? callResult : null }
      if (result === 'won' || result === 'lost') {
        return api(`/follow-ups/${followUpId}/complete`, {
          method: 'POST',
          json: { ...shared, status: result, lossReason: result === 'lost' ? lossReason : null },
        })
      }
      if (result === 'postpone') {
        return api(`/follow-ups/${followUpId}/complete`, {
          method: 'POST',
          json: { ...shared, postponeTo: nextDate, nextStepTime: nextTime || null, postponeReason },
        })
      }
      return api(`/follow-ups/${followUpId}/complete`, {
        method: 'POST',
        json: { ...shared, nextStepDate: nextDate, nextStepTime: nextTime || null, nextStepNote: nextNote || null },
      })
    },
    invalidates,
    {
      onSuccess: () => {
        toast(result === 'postpone' ? 'Follow-up postponed with a reason' : result === 'next' ? 'Completed — next step scheduled' : `Lead closed ${result}`)
        onCompleted?.()
        onClose()
      },
    },
  )

  function submit() {
    setError(null)
    if (!followUpId) return
    if (result === 'next' && (!nextDate || nextDate < todayISO())) {
      setError('Choose a next step today or later.')
      return
    }
    if (result === 'lost' && !lossReason) {
      setError('Choose a loss reason before closing this lead.')
      return
    }
    if (result === 'postpone' && !postponeReason.trim()) {
      setError('Add a reason for postponing this follow-up.')
      return
    }
    if (result === 'postpone' && (!nextDate || nextDate < todayISO())) {
      setError('Choose a new date today or later.')
      return
    }
    complete.mutate()
  }

  const resultOptions = [
    { key: 'next' as const, title: 'Set next step', hint: 'Keep the lead moving', icon: CalendarClock },
    { key: 'won' as const, title: 'Won', hint: 'Close as customer', icon: CheckCircle2 },
    { key: 'lost' as const, title: 'Lost', hint: 'Needs a reason', icon: XCircle },
    { key: 'postpone' as const, title: 'Postpone', hint: 'Move with a reason', icon: Clock3 },
  ]

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Complete follow-up"
      description={[leadCode, dueDate].filter(Boolean).join(' · ') || undefined}
      width={560}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={complete.isPending} disabled={!followUpId}>
            {result === 'next' ? 'Complete & schedule next' : result === 'postpone' ? 'Postpone' : `Close ${result}`}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {resultOptions.map((option) => {
            const Icon = option.icon
            const active = result === option.key
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => setResult(option.key)}
                className={`rounded-control border p-2.5 text-left transition-colors ${active ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-surface text-muted hover:bg-surface-2'}`}
              >
                <Icon className="size-4" />
                <span className="mt-1.5 block text-[12.5px] font-semibold">{option.title}</span>
                <span className="block text-[10.5px] opacity-75">{option.hint}</span>
              </button>
            )
          })}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Channel">
            <Select value={channel} onChange={(e) => setChannel(e.target.value)}>
              {CHANNELS.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </Select>
          </Field>
          {channel === 'Call' ? (
            <Field label="Call result">
              <Select value={callResult} onChange={(e) => setCallResult(e.target.value)}>
                {CALL_RESULTS.filter((result) => result !== 'Unknown').map((result) => (
                  <option key={result}>{result}</option>
                ))}
              </Select>
            </Field>
          ) : (
            <Field label="Outcome">
              <Input value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="No answer, demo booked..." />
            </Field>
          )}
        </div>

        {result !== 'won' && result !== 'lost' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label={result === 'postpone' ? 'Move to' : 'Next step date'} hint="Required">
              <Input type="date" min={todayISO()} value={nextDate} onChange={(e) => setNextDate(e.target.value)} required />
            </Field>
            <Field label="Time">
              <Input type="time" value={nextTime} onChange={(e) => setNextTime(e.target.value)} />
            </Field>
          </div>
        )}

        {result === 'next' && (
          <Field label="Next step" hint="What exactly happens next?">
            <Input value={nextNote} onChange={(e) => setNextNote(e.target.value)} placeholder="Send proposal, confirm demo, call HR..." />
          </Field>
        )}

        {result === 'postpone' && (
          <Field label="Reason for postponing" hint="Required — keeps the audit trail honest">
            <Input value={postponeReason} onChange={(e) => setPostponeReason(e.target.value)} placeholder="Client asked to reconnect next month..." required />
          </Field>
        )}

        {result === 'lost' && (
          <Field label="Loss reason" hint="Required">
            <Select value={lossReason} onChange={(e) => setLossReason(e.target.value)}>
              <option value="">Choose a reason</option>
              {LOSS_REASONS.map((reason) => (
                <option key={reason}>{reason}</option>
              ))}
            </Select>
          </Field>
        )}

        <Field label="What happened on this follow-up?">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Short note for the lead history..." />
        </Field>

        {result === 'next' && (
          <p className="rounded-control bg-success-soft px-3 py-2 text-[12px] text-success">
            The current follow-up is marked done and the next one is created on the chosen date.
          </p>
        )}
        {result === 'won' && <p className="rounded-control bg-success-soft px-3 py-2 text-[12px] text-success">Completing closes the lead as won and clears any other open follow-ups.</p>}
        {error && <p className="text-[13px] text-danger">{error}</p>}
        {complete.error && <p className="text-[13px] text-danger">{complete.error.message}</p>}
      </div>
    </Dialog>
  )
}

export function RescheduleDialog({
  open,
  onClose,
  ids,
  title,
  onDone,
}: {
  open: boolean
  onClose: () => void
  ids: string[]
  title?: string
  onDone?: () => void
}) {
  const toast = useToast()
  const [dueDate, setDueDate] = useState(addDaysISO(1))
  const [dueTime, setDueTime] = useState('10:00')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setDueDate(addDaysISO(1))
      setDueTime('10:00')
      setReason('')
      setError(null)
    }
  }, [open])

  const move = useApiMutation(
    () => api<{ changed: number }>('/follow-ups/bulk-reschedule', { method: 'POST', json: { ids, dueDate, dueTime: dueTime || null, reason } }),
    invalidates,
    {
      onSuccess: (result) => {
        toast(`${result.changed} follow-up${result.changed === 1 ? '' : 's'} moved`)
        onDone?.()
        onClose()
      },
    },
  )

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title ?? `Reschedule ${ids.length} follow-up${ids.length === 1 ? '' : 's'}`}
      description="Moving a follow-up requires a reason so silent drops are visible."
      width={460}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={move.isPending}
            onClick={() => {
              setError(null)
              if (!dueDate || dueDate < todayISO()) return setError('Choose a new date today or later.')
              if (!reason.trim()) return setError('Add a reason for moving these follow-ups.')
              move.mutate()
            }}
          >
            Move follow-ups
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="New date">
            <Input type="date" min={todayISO()} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
          <Field label="Time">
            <Input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
          </Field>
        </div>
        <Field label="Reason" hint="Required">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Client travelling, event postponed..." />
        </Field>
        {error && <p className="text-[13px] text-danger">{error}</p>}
        {move.error && <p className="text-[13px] text-danger">{move.error.message}</p>}
      </div>
    </Dialog>
  )
}

export function QuickLeadDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated?: (id: string) => void }) {
  const toast = useToast()
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [source, setSource] = useState('WhatsApp')
  const [product, setProduct] = useState(PRODUCTS[0])
  const [allowDuplicate, setAllowDuplicate] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setFullName('')
      setPhone('')
      setCompanyName('')
      setSource('WhatsApp')
      setProduct(PRODUCTS[0])
      setAllowDuplicate(false)
      setError(null)
    }
  }, [open])

  const create = useApiMutation(
    (input?: { allowDuplicate?: boolean }) =>
      api<{ lead: { id: string } }>('/leads', {
        method: 'POST',
        json: { fullName, phone, companyName: companyName || null, source, product, allowDuplicate: input?.allowDuplicate ?? allowDuplicate },
      }),
    invalidates,
    {
      onSuccess: (result) => {
        toast('Lead captured — cadence started')
        onCreated?.(result.lead.id)
        onClose()
      },
    },
  )

  const duplicate = create.error instanceof ApiError && create.error.code === 'duplicate_phone'

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Quick capture"
      description="Name and number only. The new-lead cadence schedules the follow-ups."
      width={440}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={create.isPending}
            onClick={() => {
              setError(null)
              if (!fullName.trim() || !phone.trim()) return setError('Name and phone number are required.')
              create.mutate({})
            }}
          >
            Capture lead
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <Field label="Full name">
          <Input autoFocus value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Maya Chen" />
        </Field>
        <Field label="Phone number">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0300 4561201" inputMode="tel" />
        </Field>
        <Field label="Company (optional)">
          <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="School, factory or office" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Source">
            <Select value={source} onChange={(e) => setSource(e.target.value)}>
              {LEAD_SOURCES.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </Select>
          </Field>
          <Field label="Product">
            <Select value={product} onChange={(e) => setProduct(e.target.value)}>
              {PRODUCTS.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </Select>
          </Field>
        </div>
        {duplicate && (
          <div className="rounded-control bg-warning-soft p-3 text-[12.5px] text-warning">
            <p>{create.error?.message}</p>
            <Button size="sm" className="mt-2" onClick={() => { setAllowDuplicate(true); create.mutate({ allowDuplicate: true }) }} loading={create.isPending}>
              Save anyway
            </Button>
          </div>
        )}
        {error && <p className="text-[13px] text-danger">{error}</p>}
        {create.error && !duplicate && <p className="text-[13px] text-danger">{create.error.message}</p>}
      </div>
    </Dialog>
  )
}
