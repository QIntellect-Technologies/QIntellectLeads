import { useEffect, useState, type FormEvent } from 'react'

import { ApiError, api, useApiMutation } from '../lib/api'
import { addDaysISO, CALL_RESULTS, CHANNELS, CONTACT_ROLES, LEAD_SOURCES, LEAD_STATUSES, LOSS_REASONS, MEETING_STATUSES, MEETING_TYPES, OBJECTION_TYPES, ORG_TYPES, PRODUCTS, TEMPLATE_SEGMENTS, dmy } from '../../shared/leads'
import type { LeadContact, LeadDetail, LeadFollowUp, LeadMeeting, LeadTemplate } from '../../shared/types'
import { Button, Checkbox, Dialog, Field, Input, Select, Textarea, useFieldId, useToast } from './ui'

// Forms for the lead system. Each works for create and edit; pass `initial`.

function FieldInput(props: React.ComponentPropsWithoutRef<typeof Input>) {
  const id = useFieldId()
  return <Input id={id} {...props} />
}
function FieldSelect(props: React.ComponentPropsWithoutRef<typeof Select>) {
  const id = useFieldId()
  return <Select id={id} {...props} />
}
function FieldTextarea(props: React.ComponentPropsWithoutRef<typeof Textarea>) {
  const id = useFieldId()
  return <Textarea id={id} {...props} />
}

const options = (values: readonly string[], current?: string | null) => {
  const set = new Set(values)
  if (current) set.add(current)
  return [...set]
}

function blankLead(detail?: LeadDetail) {
  const primary = detail?.contacts[0]
  return {
    fullName: primary?.fullName ?? '',
    phone: primary?.phone ?? '',
    designation: primary?.designation ?? '',
    companyName: detail?.organization?.name ?? '',
    orgType: detail?.organization?.type ?? '',
    city: detail?.organization?.city ?? '',
    headcount: detail?.organization?.headcount ? String(detail.organization.headcount) : '',
    existingSystem: detail?.organization?.existingSystem ?? '',
    source: detail?.lead.source ?? '',
    product: detail?.lead.product ?? '',
    status: detail?.lead.status ?? ('new' as string),
    assignedTo: detail?.lead.assignedTo ?? '',
    createdDate: detail?.lead.createdDate ?? addDaysISO(0),
    b2b: detail?.lead.b2b ?? false,
    requirementSummary: detail?.requirement?.summary ?? '',
    requirementDetails: detail?.requirement?.details ?? '',
    objectionType: detail?.requirement?.objectionType ?? '',
    lossReason: detail?.requirement?.lossReason ?? '',
    internalRemarks: detail?.requirement?.internalRemarks ?? '',
  }
}

export function LeadForm({
  open,
  onClose,
  initial,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  initial?: LeadDetail
  onSaved?: (id: string) => void
}) {
  const toast = useToast()
  const [form, setForm] = useState(blankLead(initial))
  const [allowDuplicate, setAllowDuplicate] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setForm(blankLead(initial))
      setAllowDuplicate(false)
      setLocalError(null)
    }
  }, [open, initial])

  const save = useApiMutation(
    (input: typeof form & { allowDuplicate?: boolean }) => {
      const payload = { ...input, headcount: input.headcount === '' ? null : Number(input.headcount) }
      return initial
        ? api<LeadDetail>(`/leads/${initial.lead.id}`, { method: 'PATCH', json: payload })
        : api<{ lead: { id: string } }>('/leads', { method: 'POST', json: payload })
    },
    ['leads', 'lead', 'today', 'reports', 'templates', 'lead-search'],
    {
      onSuccess: (result) => {
        toast(initial ? 'Lead updated' : 'Lead added')
        onSaved?.(result.lead.id)
        onClose()
      },
    },
  )

  const duplicate = save.error instanceof ApiError && save.error.code === 'duplicate_phone' ? (save.error.details as { id: string; code: string; name: string | null; orgName: string | null }[]) : null

  function submit(e: FormEvent) {
    e.preventDefault()
    setLocalError(null)
    if (form.status === 'lost' && !form.lossReason.trim()) {
      setLocalError('Closed Lost needs a loss reason.')
      return
    }
    save.mutate({ ...form, allowDuplicate })
  }

  const closed = form.status === 'won' || form.status === 'lost'

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={initial ? `Edit ${initial.lead.code}` : 'Add lead'}
      description={initial ? undefined : 'Only name, number, source and product are required.'}
      width={620}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="lead-form" loading={save.isPending}>
            {initial ? 'Save changes' : 'Add lead'}
          </Button>
        </>
      }
    >
      <form id="lead-form" onSubmit={submit} className="grid gap-5">
        <section className="grid gap-3">
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-faint">Contact</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Full name">
              <FieldInput required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} placeholder="e.g. Maya Chen" />
            </Field>
            <Field label="Phone number" hint="Stored as +92">
              <FieldInput required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="0300 4561201" />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Designation">
              <FieldInput value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} placeholder="Principal, HR Manager..." />
            </Field>
            <Field label="Assigned to">
              <FieldInput value={form.assignedTo} onChange={(e) => setForm({ ...form, assignedTo: e.target.value })} />
            </Field>
          </div>
        </section>

        <section className="grid gap-3">
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-faint">Lead</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Lead source">
              <FieldSelect required value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
                <option value="">Choose a source</option>
                {options(LEAD_SOURCES, form.source).map((source) => (
                  <option key={source}>{source}</option>
                ))}
              </FieldSelect>
            </Field>
            <Field label="Product interest">
              <FieldSelect required value={form.product} onChange={(e) => setForm({ ...form, product: e.target.value })}>
                <option value="">Choose a product</option>
                {options(PRODUCTS, form.product).map((product) => (
                  <option key={product}>{product}</option>
                ))}
              </FieldSelect>
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Status">
              <FieldSelect value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {LEAD_STATUSES.map((status) => (
                  <option key={status.key} value={status.key}>
                    {status.label}
                  </option>
                ))}
              </FieldSelect>
            </Field>
            <Field label="Created date">
              <FieldInput type="date" value={form.createdDate} onChange={(e) => setForm({ ...form, createdDate: e.target.value })} />
            </Field>
          </div>
          {form.status === 'lost' && (
            <Field label="Loss reason" hint="Required when closing a lead as lost.">
              <FieldSelect value={form.lossReason} onChange={(e) => setForm({ ...form, lossReason: e.target.value })}>
                <option value="">Choose a reason</option>
                {options(LOSS_REASONS, form.lossReason).map((reason) => (
                  <option key={reason}>{reason}</option>
                ))}
              </FieldSelect>
            </Field>
          )}
          {closed && <p className="text-[12px] text-faint">Saving a closed status clears open follow-ups.</p>}
        </section>

        <section className="grid gap-3">
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-faint">Organization (optional)</h3>
          <Field label="Organization name">
            <FieldInput value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} placeholder="School, factory or office" />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Type">
              <FieldSelect value={form.orgType} onChange={(e) => setForm({ ...form, orgType: e.target.value })}>
                <option value="">Unknown</option>
                {options(ORG_TYPES, form.orgType).map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </FieldSelect>
            </Field>
            <Field label="City">
              <FieldInput value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </Field>
            <Field label="Headcount">
              <FieldInput type="number" min={0} value={form.headcount} onChange={(e) => setForm({ ...form, headcount: e.target.value })} />
            </Field>
          </div>
          <Field label="Existing system">
            <FieldInput value={form.existingSystem} onChange={(e) => setForm({ ...form, existingSystem: e.target.value })} placeholder="Manual registers, another vendor..." />
          </Field>
          <label className="flex items-center gap-2.5 text-[13px]">
            <Checkbox checked={form.b2b} onChange={(e) => setForm({ ...form, b2b: e.target.checked })} />
            B2B / partner or reseller
            <span className="text-[12px] text-faint">(+15 priority)</span>
          </label>
        </section>

        <section className="grid gap-3">
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-faint">Requirement (optional)</h3>
          <Field label="Summary">
            <FieldInput value={form.requirementSummary} onChange={(e) => setForm({ ...form, requirementSummary: e.target.value })} placeholder="What do they need?" />
          </Field>
          <Field label="Details">
            <FieldTextarea value={form.requirementDetails} onChange={(e) => setForm({ ...form, requirementDetails: e.target.value })} placeholder="Scope, sites, users, timeline" />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Objection type">
              <FieldSelect value={form.objectionType} onChange={(e) => setForm({ ...form, objectionType: e.target.value })}>
                <option value="">None</option>
                {options(OBJECTION_TYPES, form.objectionType).map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </FieldSelect>
            </Field>
            <Field label="Internal remarks">
              <FieldInput value={form.internalRemarks} onChange={(e) => setForm({ ...form, internalRemarks: e.target.value })} />
            </Field>
          </div>
        </section>

        {duplicate && (
          <div className="rounded-control bg-danger-soft p-3 text-[12.5px] text-danger">
            <p className="font-medium">Possible duplicate</p>
            <p className="mt-1">This number already belongs to {duplicate.map((d) => `${d.code}${d.name ? ` (${d.name})` : ''}`).join(', ')}.</p>
            <Button size="sm" className="mt-2" onClick={() => save.mutate({ ...form, allowDuplicate: true })} loading={save.isPending}>
              Save anyway
            </Button>
          </div>
        )}
        {localError && <p className="text-[13px] text-danger">{localError}</p>}
        {save.error && !duplicate && <p className="text-[13px] text-danger">{save.error.message}</p>}
      </form>
    </Dialog>
  )
}

// Log interaction -----------------------------------------------------------

export function LogInteractionDialog({
  open,
  onClose,
  lead,
  followUpId,
}: {
  open: boolean
  onClose: () => void
  lead: LeadDetail
  followUpId?: string
}) {
  const toast = useToast()
  const [channel, setChannel] = useState<string>('Call')
  const [outcome, setOutcome] = useState('')
  const [callResult, setCallResult] = useState('Connected')
  const [contactId, setContactId] = useState(lead.contacts[0]?.id ?? '')
  const [contactName, setContactName] = useState(lead.contacts[0]?.fullName ?? '')
  const [phoneNumber, setPhoneNumber] = useState(lead.contacts[0]?.phone ?? '')
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [status, setStatus] = useState(lead.lead.status)
  const [followUpDate, setFollowUpDate] = useState(addDaysISO(2))
  const [followUpTime, setFollowUpTime] = useState('10:00')
  const [lossReason, setLossReason] = useState(lead.requirement?.lossReason ?? '')

  useEffect(() => {
    if (open) {
      setChannel('Call')
      setOutcome('')
      setCallResult('Connected')
      setContactId(lead.contacts[0]?.id ?? '')
      setContactName(lead.contacts[0]?.fullName ?? '')
      setPhoneNumber(lead.contacts[0]?.phone ?? '')
      setError(null)
      setNote('')
      setStatus(lead.lead.status)
      setFollowUpDate(addDaysISO(2))
      setFollowUpTime('10:00')
      setLossReason(lead.requirement?.lossReason ?? '')
    }
  }, [open, lead])

  const closed = status === 'won' || status === 'lost'
  const log = useApiMutation(
    async () => {
      const result = await api(`/leads/${lead.lead.id}/interactions`, {
        method: 'POST',
        json: {
          channel,
          outcome: channel === 'Call' ? outcome || callResult : outcome || null,
          note: note || null,
          status,
          lossReason: status === 'lost' ? lossReason : null,
          nextFollowUpDate: closed ? null : followUpDate || null,
          nextFollowUpTime: closed ? null : followUpTime || null,
          followUpId: followUpId ?? null,
          callResult: channel === 'Call' ? callResult : null,
          contactId: channel === 'Call' ? contactId || null : null,
          contactName: channel === 'Call' ? contactName || null : null,
          phoneNumber: channel === 'Call' ? phoneNumber || null : null,
        },
      })
      return result
    },
    ['lead', 'leads', 'today', 'next-actions', 'reports', 'templates', 'follow-ups', 'meetings', 'data-summary', 'data-health'],
    {
      onSuccess: () => {
        toast("Today's discussion saved")
        onClose()
      },
    },
  )

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add today's discussion"
      description={`${lead.lead.code} · ${lead.contacts[0]?.fullName ?? 'Lead'} · ${dmy(new Date())}`}
      width={540}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="interaction-form" loading={log.isPending}>
            Save today's discussion
          </Button>
        </>
      }
    >
      <form
        id="interaction-form"
        onSubmit={(e) => {
          e.preventDefault()
          setError(null)
          if (channel === 'Call' && !callResult) return setError('Choose a call result.')
          if (status === 'lost' && !lossReason) return
          log.mutate()
        }}
        className="grid gap-4"
      >
        {followUpId && (
          <p className="rounded-control bg-success-soft px-3 py-2 text-[12.5px] text-success">
            This follow-up will be marked completed when you save.
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Channel">
            <FieldSelect value={channel} onChange={(e) => setChannel(e.target.value)}>
              {CHANNELS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </FieldSelect>
          </Field>
          {channel === 'Call' ? (
            <Field label="Call result">
              <FieldSelect value={callResult} onChange={(e) => setCallResult(e.target.value)}>
                <option value="">Choose result</option>
                {CALL_RESULTS.filter((result) => result !== 'Unknown').map((result) => (
                  <option key={result}>{result}</option>
                ))}
              </FieldSelect>
            </Field>
          ) : (
            <Field label="Outcome">
              <FieldInput value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="No answer, demo booked..." />
            </Field>
          )}
        </div>
        {channel === 'Call' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Person called">
              <FieldSelect
                value={contactId}
                onChange={(e) => {
                  const contact = lead.contacts.find((item) => item.id === e.target.value)
                  setContactId(e.target.value)
                  setContactName(contact?.fullName ?? '')
                  setPhoneNumber(contact?.phone ?? '')
                }}
              >
                <option value="">Other / not listed</option>
                {lead.contacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.fullName}
                    {contact.phone ? ` · ${contact.phone}` : ''}
                  </option>
                ))}
              </FieldSelect>
            </Field>
            <Field label="Number called">
              <FieldInput value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="0300 4561201" />
            </Field>
          </div>
        )}
        {channel === 'Call' && !contactId && (
          <Field label="Person name" hint="Optional — who did you speak to?">
            <FieldInput value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Name of the person on the call" />
          </Field>
        )}
        <Field label="What was discussed today?" hint={channel === 'Call' ? 'Optional for a call' : "Saved with today's date and time"}>
          <FieldTextarea required={channel !== 'Call'} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did the client say? What was agreed?" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Status after">
            <FieldSelect value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
              {LEAD_STATUSES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </FieldSelect>
          </Field>
          <Field label="Next follow-up" hint={closed ? 'Closed leads have no follow-ups' : 'Defaults to +2 days'}>
            <FieldInput type="date" disabled={closed} value={closed ? '' : followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Follow-up time">
            <FieldInput type="time" disabled={closed} value={closed ? '' : followUpTime} onChange={(e) => setFollowUpTime(e.target.value)} />
          </Field>
          {status === 'lost' && (
            <Field label="Loss reason" hint="Required">
              <FieldSelect value={lossReason} onChange={(e) => setLossReason(e.target.value)}>
                <option value="">Choose a reason</option>
                {options(LOSS_REASONS, lossReason).map((reason) => (
                  <option key={reason}>{reason}</option>
                ))}
              </FieldSelect>
            </Field>
          )}
        </div>
        {status === 'lost' && !lossReason && <p className="text-[12.5px] text-danger">Choose a loss reason before saving.</p>}
        {error && <p className="text-[13px] text-danger">{error}</p>}
        {log.error && <p className="text-[13px] text-danger">{log.error.message}</p>}
      </form>
    </Dialog>
  )
}

// Follow-ups ----------------------------------------------------------------

export function FollowUpDialog({ open, onClose, leadId, initial }: { open: boolean; onClose: () => void; leadId: string; initial?: LeadFollowUp }) {
  const toast = useToast()
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? addDaysISO(2))
  const [dueTime, setDueTime] = useState(initial?.dueTime ?? '10:00')

  useEffect(() => {
    if (open) {
      setDueDate(initial?.dueDate ?? addDaysISO(2))
      setDueTime(initial?.dueTime ?? '10:00')
    }
  }, [open, initial])

  const save = useApiMutation(
    () =>
      initial
        ? api(`/follow-ups/${initial.id}`, { method: 'PATCH', json: { dueDate, dueTime: dueTime || null } })
        : api(`/leads/${leadId}/follow-ups`, { method: 'POST', json: { dueDate, dueTime: dueTime || null } }),
    ['lead', 'leads', 'today', 'reports', 'follow-ups', 'data-summary'],
    { onSuccess: () => (toast(initial ? 'Follow-up updated' : 'Follow-up added'), onClose()) },
  )

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={initial ? 'Edit follow-up' : 'Add follow-up'}
      width={400}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="follow-up-form" loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form
        id="follow-up-form"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate()
        }}
        className="grid gap-4"
      >
        <Field label="Due date">
          <FieldInput type="date" required value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
        <Field label="Time">
          <FieldInput type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
        </Field>
        {save.error && <p className="text-[13px] text-danger">{save.error.message}</p>}
      </form>
    </Dialog>
  )
}

// Meetings ------------------------------------------------------------------

export function MeetingDialog({ open, onClose, leadId, initial }: { open: boolean; onClose: () => void; leadId: string; initial?: LeadMeeting }) {
  const toast = useToast()
  const split = (value?: string) => (value ? { date: value.slice(0, 10), time: value.slice(11, 16) } : { date: addDaysISO(1), time: '10:00' })
  const [date, setDate] = useState(split(initial?.scheduledAt).date)
  const [time, setTime] = useState(split(initial?.scheduledAt).time)
  const [type, setType] = useState(initial?.type ?? 'Call')
  const [status, setStatus] = useState(initial?.status ?? 'Scheduled')
  const [notes, setNotes] = useState(initial?.notes ?? '')

  useEffect(() => {
    if (open) {
      const initialSplit = split(initial?.scheduledAt)
      setDate(initialSplit.date)
      setTime(initialSplit.time)
      setType(initial?.type ?? 'Call')
      setStatus(initial?.status ?? 'Scheduled')
      setNotes(initial?.notes ?? '')
    }
  }, [open, initial])

  const save = useApiMutation(
    () => {
      const payload = { scheduledAt: `${date}T${time}`, meetingType: type, meetingStatus: status, meetingNotes: notes || null }
      return initial ? api(`/meetings/${initial.id}`, { method: 'PATCH', json: payload }) : api(`/leads/${leadId}/meetings`, { method: 'POST', json: payload })
    },
    ['lead', 'today', 'leads', 'meetings', 'reports', 'data-summary'],
    { onSuccess: () => (toast(initial ? 'Meeting updated' : 'Meeting scheduled'), onClose()) },
  )

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={initial ? 'Edit meeting' : 'Schedule meeting'}
      width={460}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="meeting-form" loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form
        id="meeting-form"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate()
        }}
        className="grid gap-4"
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <FieldInput type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Time">
            <FieldInput type="time" required value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type">
            <FieldSelect value={type} onChange={(e) => setType(e.target.value)}>
              {MEETING_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </FieldSelect>
          </Field>
          <Field label="Status">
            <FieldSelect value={status} onChange={(e) => setStatus(e.target.value)}>
              {MEETING_STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </FieldSelect>
          </Field>
        </div>
        <Field label="Notes">
          <FieldTextarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Agenda or outcome" />
        </Field>
        {save.error && <p className="text-[13px] text-danger">{save.error.message}</p>}
      </form>
    </Dialog>
  )
}

// Contacts ------------------------------------------------------------------

export function LeadContactDialog({ open, onClose, leadId, initial }: { open: boolean; onClose: () => void; leadId: string; initial?: LeadContact }) {
  const toast = useToast()
  const [fullName, setFullName] = useState(initial?.fullName ?? '')
  const [phone, setPhone] = useState(initial?.phone ?? '')
  const [designation, setDesignation] = useState(initial?.designation ?? '')
  const [role, setRole] = useState<string>(initial?.role ?? 'Point of Contact')
  const [allowDuplicate, setAllowDuplicate] = useState(false)

  useEffect(() => {
    if (open) {
      setFullName(initial?.fullName ?? '')
      setPhone(initial?.phone ?? '')
      setDesignation(initial?.designation ?? '')
      setRole(initial?.role ?? 'Point of Contact')
      setAllowDuplicate(false)
    }
  }, [open, initial])

  const save = useApiMutation(
    (override?: { allowDuplicate?: boolean }) => {
      const payload = { fullName, phoneNumber: phone, designation: designation || null, contactRole: role, allowDuplicate: override?.allowDuplicate ?? allowDuplicate }
      return initial
        ? api(`/lead-contacts/${initial.id}`, { method: 'PATCH', json: payload })
        : api(`/leads/${leadId}/contacts`, { method: 'POST', json: payload })
    },
    ['lead', 'leads', 'today'],
    { onSuccess: () => (toast(initial ? 'Contact updated' : 'Contact added'), onClose()) },
  )
  const duplicate = save.error instanceof ApiError && save.error.code === 'duplicate_phone' ? (save.error.details as { code: string }[]) : null

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={initial ? 'Edit contact' : 'Add contact'}
      width={440}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="lead-contact-form" loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form
        id="lead-contact-form"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate(undefined)
        }}
        className="grid gap-4"
      >
        <Field label="Full name">
          <FieldInput required value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>
        <Field label="Phone number">
          <FieldInput value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Designation">
            <FieldInput value={designation} onChange={(e) => setDesignation(e.target.value)} />
          </Field>
          <Field label="Role">
            <FieldSelect value={role} onChange={(e) => setRole(e.target.value)}>
              {CONTACT_ROLES.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </FieldSelect>
          </Field>
        </div>
        {duplicate && (
          <div className="rounded-control bg-danger-soft p-3 text-[12.5px] text-danger">
            This number is already on {duplicate.map((d) => d.code).join(', ')}.
            <Button size="sm" className="mt-2" onClick={() => save.mutate({ allowDuplicate: true })} loading={save.isPending}>
              Save anyway
            </Button>
          </div>
        )}
        {save.error && !duplicate && <p className="text-[13px] text-danger">{save.error.message}</p>}
      </form>
    </Dialog>
  )
}

// Templates -----------------------------------------------------------------

export function TemplateForm({ open, onClose, initial }: { open: boolean; onClose: () => void; initial?: LeadTemplate }) {
  const toast = useToast()
  const [name, setName] = useState(initial?.name ?? '')
  const [segment, setSegment] = useState(initial?.segment ?? '')
  const [product, setProduct] = useState(initial?.product ?? '')
  const [usageScenario, setUsageScenario] = useState(initial?.usageScenario ?? '')
  const [body, setBody] = useState(initial?.body ?? '')

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? '')
      setSegment(initial?.segment ?? '')
      setProduct(initial?.product ?? '')
      setUsageScenario(initial?.usageScenario ?? '')
      setBody(initial?.body ?? '')
    }
  }, [open, initial])

  const save = useApiMutation(
    () => {
      const payload = { name, segment: segment || null, product: product || null, usageScenario: usageScenario || null, body }
      return initial ? api(`/templates/${initial.id}`, { method: 'PATCH', json: payload }) : api('/templates', { method: 'POST', json: payload })
    },
    ['templates', 'lead'],
    { onSuccess: () => (toast(initial ? 'Template updated' : 'Template added'), onClose()) },
  )

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={initial ? 'Edit template' : 'New WhatsApp template'}
      width={560}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="template-form" loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form
        id="template-form"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate()
        }}
        className="grid gap-4"
      >
        <Field label="Template name">
          <FieldInput required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Segment">
            <FieldSelect value={segment} onChange={(e) => setSegment(e.target.value)}>
              <option value="">None</option>
              {options(TEMPLATE_SEGMENTS, segment).map((s) => (
                <option key={s}>{s}</option>
              ))}
            </FieldSelect>
          </Field>
          <Field label="Product">
            <FieldSelect value={product} onChange={(e) => setProduct(e.target.value)}>
              <option value="">Any product</option>
              {options(PRODUCTS, product).map((p) => (
                <option key={p}>{p}</option>
              ))}
            </FieldSelect>
          </Field>
        </div>
        <Field label="When to use it">
          <FieldInput value={usageScenario} onChange={(e) => setUsageScenario(e.target.value)} placeholder="Proposal sent, no reply after 3 days" />
        </Field>
        <Field label="Message" hint="Placeholders: [Name], [Company Name], [Product], [City], [Lead ID], [My Name]">
          <FieldTextarea required value={body} onChange={(e) => setBody(e.target.value)} className="min-h-[140px]" />
        </Field>
        {save.error && <p className="text-[13px] text-danger">{save.error.message}</p>}
      </form>
    </Dialog>
  )
}

// Loss reason ---------------------------------------------------------------

export function LossReasonDialog({ open, onClose, onConfirm, code }: { open: boolean; onClose: () => void; onConfirm: (reason: string) => void; code?: string }) {
  const [reason, setReason] = useState('')
  useEffect(() => {
    if (open) setReason('')
  }, [open])
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Close as lost"
      description={code ? `${code} needs a loss reason before it can be closed.` : 'A loss reason is required.'}
      width={420}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="danger" disabled={!reason} onClick={() => reason && onConfirm(reason)}>
            Close lead
          </Button>
        </>
      }
    >
      <Field label="Loss reason">
        <FieldSelect value={reason} onChange={(e) => setReason(e.target.value)}>
          <option value="">Choose a reason</option>
          {LOSS_REASONS.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </FieldSelect>
      </Field>
    </Dialog>
  )
}

// Small confirmation used before destructive lead actions.
export function ArchiveLeadDialog({ open, onClose, onConfirm, code, archived }: { open: boolean; onClose: () => void; onConfirm: () => void; code: string; archived: boolean }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={archived ? `Restore ${code}?` : `Archive ${code}?`}
      width={420}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant={archived ? 'primary' : 'danger'} onClick={onConfirm}>
            {archived ? 'Restore' : 'Archive'}
          </Button>
        </>
      }
    >
      <p className="text-[13.5px] text-muted">
        {archived ? 'The lead returns to the active list with its full history.' : `The lead is hidden from the lists and dashboard, but its history is kept. You can restore it later.`}
      </p>
    </Dialog>
  )
}

export const leadCreatedLabel = (date: string) => dmy(date)
