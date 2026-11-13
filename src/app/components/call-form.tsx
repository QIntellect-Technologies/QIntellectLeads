import { PhoneCall, Search, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import { api, useApiMutation, useLead, useLeadSearch } from '../lib/api'
import { addDaysISO, CALL_DIRECTIONS, CALL_RESULTS, todayISO } from '../../shared/leads'
import { Button, Dialog, Field, Input, Select, Textarea, useToast } from './ui'

const invalidates = ['calls', 'call', 'lead', 'leads', 'today', 'next-actions', 'follow-ups', 'reports', 'meetings', 'data-summary', 'data-health']

/**
 * Quick call entry used from the Calls page. It writes a normal interaction,
 * so the lead timeline stays the single source of truth.
 */
export function CallDialog({
  open,
  onClose,
  initialLeadId,
  initialContactId,
}: {
  open: boolean
  onClose: () => void
  initialLeadId?: string
  initialContactId?: string
}) {
  const toast = useToast()
  const [leadId, setLeadId] = useState(initialLeadId ?? '')
  const [q, setQ] = useState('')
  const [contactId, setContactId] = useState('')
  const [contactName, setContactName] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [result, setResult] = useState('')
  const [direction, setDirection] = useState('Outbound')
  const [note, setNote] = useState('')
  const [followUpDate, setFollowUpDate] = useState(addDaysISO(2))
  const [followUpTime, setFollowUpTime] = useState('10:00')
  const [error, setError] = useState<string | null>(null)

  const search = useLeadSearch(q)
  const detail = useLead(leadId || undefined)
  const contacts = detail.data?.contacts ?? []
  const selectedLead = detail.data?.lead
  const results = search.data?.leads ?? []

  useEffect(() => {
    if (!open) return
    setLeadId(initialLeadId ?? '')
    setQ('')
    setContactId('')
    setContactName('')
    setPhoneNumber('')
    setResult('')
    setDirection('Outbound')
    setNote('')
    setFollowUpDate(addDaysISO(2))
    setFollowUpTime('10:00')
    setError(null)
  }, [open, initialLeadId])

  useEffect(() => {
    if (!open || !detail.data) return
    const preferred = initialContactId
      ? detail.data.contacts.find((contact) => contact.id === initialContactId)
      : detail.data.contacts[0]
    setContactId(preferred?.id ?? '')
    setContactName(preferred?.fullName ?? '')
    setPhoneNumber(preferred?.phone ?? '')
  }, [open, detail.data?.lead.id, initialContactId])

  function pickLead(id: string) {
    setLeadId(id)
    setQ('')
    setContactId('')
    setContactName('')
    setPhoneNumber('')
    setError(null)
  }

  const log = useApiMutation(
    () =>
      api(`/leads/${leadId}/interactions`, {
        method: 'POST',
        json: {
          channel: 'Call',
          callResult: result,
          callDirection: direction,
          contactId: contactId || null,
          contactName: contactName.trim() || null,
          phoneNumber: phoneNumber.trim() || null,
          outcome: result,
          note: note.trim() || null,
          nextFollowUpDate: followUpDate || null,
          nextFollowUpTime: followUpDate ? followUpTime || null : null,
        },
      }),
    invalidates,
    {
      onSuccess: () => {
        toast('Call logged')
        onClose()
      },
    },
  )

  function submit() {
    setError(null)
    if (!leadId) return setError('Choose a lead first.')
    if (!result) return setError('Choose a call result.')
    if (followUpDate && followUpDate < todayISO()) return setError('The next follow-up cannot be in the past.')
    log.mutate()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Log call"
      description="Record the exact person and number you called."
      width={560}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={log.isPending} disabled={!leadId}>
            <PhoneCall />
            Save call
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="Lead" hint={leadId ? undefined : 'Search by name, company, number or QT code.'}>
          {leadId ? (
            <div className="flex items-center gap-2 rounded-control border border-line bg-surface-2/60 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">
                  {detail.data?.contacts[0]?.fullName ?? 'Lead'} {selectedLead ? <span className="text-faint">· {selectedLead.code}</span> : null}
                </p>
                <p className="truncate text-[11.5px] text-faint">
                  {detail.data?.organization?.name ?? 'No organization'}
                  {detail.data?.contacts[0]?.phone ? ` · ${detail.data.contacts[0].phone}` : ''}
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => {
                  setLeadId('')
                  setContactId('')
                  setContactName('')
                  setPhoneNumber('')
                }}
              >
                Change
              </Button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search lead, person, company or number"
                  className="pl-9 pr-9"
                />
                {q && (
                  <button
                    type="button"
                    aria-label="Clear search"
                    onClick={() => setQ('')}
                    className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-[6px] text-faint hover:bg-surface-2 hover:text-fg"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
              {q.trim() && (
                <div className="max-h-52 overflow-y-auto rounded-control border border-line bg-surface">
                  {results.slice(0, 8).map((lead) => (
                    <button
                      key={lead.id}
                      type="button"
                      onClick={() => pickLead(lead.id)}
                      className="flex w-full items-start gap-2 border-b border-line px-3 py-2.5 text-left last:border-0 hover:bg-surface-2"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium">{lead.name ?? lead.code}</span>
                        <span className="block truncate text-[11.5px] text-faint">
                          {lead.code} · {lead.orgName ?? 'No organization'} {lead.phone ? `· ${lead.phone}` : ''}
                        </span>
                      </span>
                    </button>
                  ))}
                  {!search.isFetching && results.length === 0 && <p className="px-3 py-4 text-center text-[12.5px] text-faint">No matching leads.</p>}
                  {search.isFetching && <p className="px-3 py-4 text-center text-[12.5px] text-faint">Searching…</p>}
                </div>
              )}
            </>
          )}
        </Field>

        {leadId && (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Person called">
                <Select
                  value={contactId}
                  onChange={(e) => {
                    const contact = contacts.find((item) => item.id === e.target.value)
                    setContactId(e.target.value)
                    setContactName(contact?.fullName ?? '')
                    setPhoneNumber(contact?.phone ?? '')
                  }}
                >
                  <option value="">Other / not listed</option>
                  {contacts.map((contact) => (
                    <option key={contact.id} value={contact.id}>
                      {contact.fullName}
                      {contact.phone ? ` · ${contact.phone}` : ''}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Number called">
                <Input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="0300 4561201" />
              </Field>
              <Field label="Direction">
                <Select value={direction} onChange={(e) => setDirection(e.target.value)}>
                  {CALL_DIRECTIONS.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </Select>
              </Field>
            </div>

            {!contactId && (
              <Field label="Person name" hint="Optional — who did you speak to?">
                <Input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Name of the person on the call" />
              </Field>
            )}

            <Field label="Call result" hint="Connected counts as responded. No answer, Busy and Voicemail count as no response.">
              <Select value={result} onChange={(e) => setResult(e.target.value)}>
                <option value="">Choose result</option>
                {CALL_RESULTS.filter((item) => item !== 'Unknown').map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </Select>
            </Field>

            <Field label="Notes" hint="Optional — what was discussed?">
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Short note for the lead history..." />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Next follow-up" hint="Optional">
                <Input type="date" min={todayISO()} value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
              </Field>
              <Field label="Time">
                <Input type="time" value={followUpTime} onChange={(e) => setFollowUpTime(e.target.value)} disabled={!followUpDate} />
              </Field>
            </div>
          </>
        )}

        {error && <p className="text-[13px] text-danger">{error}</p>}
        {log.error && <p className="text-[13px] text-danger">{log.error.message}</p>}
      </div>
    </Dialog>
  )
}
