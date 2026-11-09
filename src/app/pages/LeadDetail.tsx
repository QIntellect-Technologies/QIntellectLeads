import { Archive, ArrowLeft, Building2, CalendarPlus, Check, MessageSquarePlus, MoreHorizontal, Pencil, Plus, RotateCcw, Trash2, UserPlus, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'

import { ArchiveLeadDialog, FollowUpDialog, LeadContactDialog, LeadForm, LogInteractionDialog, MeetingDialog } from '../components/lead-forms'
import { CompleteFollowUpDialog } from '../components/productivity'
import { DueText, InteractionTimeline, LastSeen, PhoneText, PriorityBadge, StatusBadge, WhatsAppButton } from '../components/lead-bits'
import { Avatar, Badge, Button, Card, EmptyState, Menu, Spinner, useToast } from '../components/ui'
import { api, useApiMutation, useLead } from '../lib/api'
import { cx } from '../lib/cx'
import { dmy, dmyTime, statusLabel, todayISO } from '../../shared/leads'
import type { LeadContact, LeadFollowUp, LeadMeeting } from '../../shared/types'

export function LeadDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const toast = useToast()
  const { data, isLoading } = useLead(id)
  const [editing, setEditing] = useState(false)
  const [logging, setLogging] = useState(false)
  const [loggingFollowUpId, setLoggingFollowUpId] = useState<string | undefined>()
  const [addingFollowUp, setAddingFollowUp] = useState(false)
  const [editingFollowUp, setEditingFollowUp] = useState<LeadFollowUp | undefined>()
  const [completingFollowUp, setCompletingFollowUp] = useState<LeadFollowUp | null>(null)
  const [addingMeeting, setAddingMeeting] = useState(false)
  const [editingMeeting, setEditingMeeting] = useState<LeadMeeting | undefined>()
  const [addingContact, setAddingContact] = useState(false)
  const [editingContact, setEditingContact] = useState<LeadContact | undefined>()
  const [archiving, setArchiving] = useState(false)

  useEffect(() => {
    if (searchParams.get('log') !== '1') return
    setLogging(true)
    setLoggingFollowUpId(searchParams.get('followUp') ?? undefined)
    const next = new URLSearchParams(searchParams)
    next.delete('log')
    next.delete('followUp')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  const refresh = ['lead', 'leads', 'today', 'reports', 'lead-search', 'follow-ups', 'meetings', 'data-summary']
  const completeFollowUp = useApiMutation((input: { id: string; done: boolean }) => api(`/follow-ups/${input.id}`, { method: 'PATCH', json: { isCompleted: input.done } }), refresh, {
    onSuccess: () => toast('Follow-up updated'),
  })
  const deleteFollowUp = useApiMutation((followUpId: string) => api(`/follow-ups/${followUpId}`, { method: 'DELETE' }), refresh)
  const meetingStatus = useApiMutation((input: { id: string; status: string }) => api(`/meetings/${input.id}`, { method: 'PATCH', json: { meetingStatus: input.status } }), refresh, {
    onSuccess: () => toast('Meeting updated'),
  })
  const deleteMeeting = useApiMutation((meetingId: string) => api(`/meetings/${meetingId}`, { method: 'DELETE' }), refresh)
  const makePrimary = useApiMutation((contactId: string) => api(`/lead-contacts/${contactId}`, { method: 'PATCH', json: { contactRole: 'Primary' } }), refresh, {
    onSuccess: () => toast('Primary contact updated'),
  })
  const deleteContact = useApiMutation((contactId: string) => api(`/lead-contacts/${contactId}`, { method: 'DELETE' }), refresh)
  const setArchived = useApiMutation(
    (archived: boolean) => api(`/leads/${id}/archive`, { method: 'POST', json: { archived } }),
    [...refresh, 'today'],
    {
      onSuccess: () => {
        setArchiving(false)
        toast('Lead updated')
      },
    },
  )

  if (isLoading) {
    return (
      <div className="grid h-full place-items-center">
        <Spinner />
      </div>
    )
  }
  if (!data) {
    return (
      <EmptyState
        icon={<Users />}
        title="Lead not found"
        description="It may have been removed."
        action={<Button onClick={() => navigate('/leads')}>Back to leads</Button>}
      />
    )
  }

  const { lead, organization, contacts, requirement, interactions, followUps, meetings } = data
  const primary = contacts[0]
  const openFollowUps = followUps.filter((f) => !f.completed)
  const doneFollowUps = followUps.filter((f) => f.completed)
  const nextFollowUp = openFollowUps[0]

  return (
    <div className="mx-auto max-w-[1320px] p-4 sm:p-6 2xl:p-8">
      <Link to={lead.archived ? '/leads?archived=1' : '/leads'} className="inline-flex h-8 items-center gap-1.5 rounded-tile text-[13px] text-muted hover:text-fg">
        <ArrowLeft className="size-4" />
        Leads
      </Link>

      {lead.archived && (
        <div className="mt-4 flex items-center gap-3 rounded-control bg-warning-soft px-3 py-2.5 text-[13px] text-warning">
          <Archive className="size-4" />
          This lead is archived.
          <Button size="sm" className="ml-auto" onClick={() => setArchived.mutate(false)} loading={setArchived.isPending}>
            <RotateCcw />
            Restore
          </Button>
        </div>
      )}

      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar name={primary?.fullName ?? lead.code} hue={210} size={56} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-[24px] font-semibold tracking-[-0.02em]">{primary?.fullName ?? lead.code}</h1>
              <span className="text-[13px] tabular-nums text-faint">{lead.code}</span>
              <StatusBadge status={lead.status} />
              <PriorityBadge score={lead.priorityScore} level={lead.priorityLevel} />
              {lead.b2b && <Badge tone="accent">B2B</Badge>}
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px] text-muted">
              {organization?.name ? (
                <span className="inline-flex items-center gap-1.5">
                  <Building2 className="size-3.5 text-faint" />
                  {organization.name}
                </span>
              ) : (
                <span>No organization</span>
              )}
              {organization?.type && <span className="text-faint">· {organization.type}</span>}
              {organization?.city && <span className="text-faint">· {organization.city}</span>}
              {lead.product && <span className="text-faint">· {lead.product}</span>}
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted">
              {primary?.phone ? <PhoneText phone={primary.phone} /> : <span className="text-faint">No phone</span>}
              {primary?.designation && <span>{primary.designation}</span>}
              <span className="text-faint">
                Created {dmy(lead.createdDate)} · Last activity <LastSeen value={lead.lastInteractionAt} />
              </span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={() => setLogging(true)} title="Add a full interaction for today">
            <MessageSquarePlus />
            Add today's discussion
          </Button>
          <Button onClick={() => setEditing(true)}>
            <Pencil />
            Edit
          </Button>
          <WhatsAppButton phone={primary?.phone ?? null} label="WhatsApp" />
          <Button variant="ghost" size="icon" aria-label={lead.archived ? 'Restore lead' : 'Archive lead'} onClick={() => setArchiving(true)}>
            <Archive />
          </Button>
        </div>
      </header>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-[14px] font-semibold">History</h2>
              <span className="text-[12.5px] tabular-nums text-faint">{interactions.length} entries</span>
            </div>
            <InteractionTimeline items={interactions} />
            <p className="mt-2 border-t border-line pt-3 text-[11.5px] text-faint">
              Each entry is a separate saved touch. Seeing the same status again on a new date means the lead reached that
              stage more than once, not that the entry was imported twice.
            </p>
          </Card>

          {requirement && (
            <Card className="p-5">
              <h2 className="text-[14px] font-semibold">Requirement</h2>
              <dl className="mt-3 grid gap-3 text-[13.5px]">
                {requirement.summary && (
                  <div>
                    <dt className="text-[12px] font-medium uppercase tracking-wide text-faint">Summary</dt>
                    <dd className="mt-0.5">{requirement.summary}</dd>
                  </div>
                )}
                {requirement.details && (
                  <div>
                    <dt className="text-[12px] font-medium uppercase tracking-wide text-faint">Details</dt>
                    <dd className="mt-0.5 whitespace-pre-wrap leading-relaxed text-fg/90">{requirement.details}</dd>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <dt className="text-[12px] font-medium uppercase tracking-wide text-faint">Objection</dt>
                    <dd className="mt-0.5">{requirement.objectionType ?? <span className="text-faint">None</span>}</dd>
                  </div>
                  <div>
                    <dt className="text-[12px] font-medium uppercase tracking-wide text-faint">Loss reason</dt>
                    <dd className="mt-0.5">{requirement.lossReason ?? <span className="text-faint">Not set</span>}</dd>
                  </div>
                </div>
                {requirement.internalRemarks && (
                  <div>
                    <dt className="text-[12px] font-medium uppercase tracking-wide text-faint">Internal remarks</dt>
                    <dd className="mt-0.5 text-muted">{requirement.internalRemarks}</dd>
                  </div>
                )}
              </dl>
            </Card>
          )}
        </div>

        <aside className="flex min-w-0 flex-col gap-4">
          <Card className="p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[13px] font-semibold">Follow-ups</h2>
              <div className="flex items-center gap-1">
                <Link to={`/follow-ups?q=${lead.code}`} className="text-[12px] text-muted hover:text-fg">
                  View all
                </Link>
                <Button size="sm" onClick={() => setAddingFollowUp(true)}>
                  <Plus />
                  Add
                </Button>
              </div>
            </div>
            {nextFollowUp && (
              <p className="mt-1 text-[12px] text-muted">
                Next: <span className="font-medium text-fg">{dmy(nextFollowUp.dueDate)}</span>
                {nextFollowUp.dueTime ? ` at ${nextFollowUp.dueTime}` : ''}
              </p>
            )}
            <ul className="mt-2 flex flex-col gap-1">
              {openFollowUps.map((followUp) => (
                <li key={followUp.id} className="group flex items-center gap-2 rounded-tile px-1 py-1.5 hover:bg-surface-2/60">
                  <button
                    type="button"
                    aria-label="Complete follow-up with next step"
                    onClick={() => setCompletingFollowUp(followUp)}
                    className="grid size-5 shrink-0 place-items-center rounded-[6px] border border-line-strong text-transparent transition-colors hover:border-success hover:text-success"
                  >
                    <Check className="size-3.5" />
                  </button>
                  <span className="min-w-0 flex-1">
                    <DueText followUp={followUp} />
                    <span className="mt-0.5 block text-[11px] text-faint">{followUp.mode}</span>
                  </span>
                  <Menu
                    align="end"
                    trigger={
                      <Button variant="ghost" size="icon-sm" aria-label="Follow-up options">
                        <MoreHorizontal />
                      </Button>
                    }
                    items={[
                      { label: 'Change date', onSelect: () => setEditingFollowUp(followUp) },
                      { label: 'Delete', danger: true, icon: <Trash2 />, onSelect: () => deleteFollowUp.mutate(followUp.id) },
                    ]}
                  />
                </li>
              ))}
              {openFollowUps.length === 0 && <li className="py-2 text-[12.5px] text-faint">No open follow-ups</li>}
            </ul>
            {doneFollowUps.length > 0 && (
              <details className="mt-2 border-t border-line pt-2">
                <summary className="cursor-pointer text-[12px] text-faint">{doneFollowUps.length} completed</summary>
                <ul className="mt-1 flex flex-col gap-1">
                  {doneFollowUps.slice(0, 8).map((followUp) => (
                    <li key={followUp.id} className="flex items-center gap-2 text-[12px] text-faint">
                      <Check className="size-3.5 text-success" />
                      <span className="tabular-nums line-through">{dmy(followUp.dueDate)}</span>
                      <button type="button" className="ml-auto text-[11px] hover:text-fg" onClick={() => completeFollowUp.mutate({ id: followUp.id, done: false })}>
                        Reopen
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[13px] font-semibold">Meetings</h2>
              <Button size="sm" onClick={() => setAddingMeeting(true)}>
                <CalendarPlus />
                Add
              </Button>
            </div>
            <ul className="mt-2 flex flex-col gap-1.5">
              {meetings.map((meeting) => (
                <li key={meeting.id} className="rounded-control border border-line p-2.5">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] font-medium tabular-nums">{dmyTime(meeting.scheduledAt)}</p>
                      <p className="text-[11.5px] text-faint">
                        {meeting.type} · {meeting.status}
                      </p>
                      {meeting.notes && <p className="mt-1 line-clamp-2 text-[12px] text-muted">{meeting.notes}</p>}
                    </div>
                    <Menu
                      align="end"
                      trigger={
                        <Button variant="ghost" size="icon-sm" aria-label="Meeting options">
                          <MoreHorizontal />
                        </Button>
                      }
                      items={[
                        { label: 'Edit', icon: <Pencil />, onSelect: () => setEditingMeeting(meeting) },
                        ...(meeting.status !== 'Done' ? [{ label: 'Mark done', icon: <Check />, onSelect: () => meetingStatus.mutate({ id: meeting.id, status: 'Done' }) }] : []),
                        ...(meeting.status !== 'Cancelled' ? [{ label: 'Cancel meeting', onSelect: () => meetingStatus.mutate({ id: meeting.id, status: 'Cancelled' }) }] : []),
                        { label: 'Delete', danger: true, icon: <Trash2 />, onSelect: () => deleteMeeting.mutate(meeting.id) },
                      ]}
                    />
                  </div>
                  {meeting.scheduledAt.slice(0, 10) === todayISO() && meeting.status === 'Scheduled' && (
                    <Badge tone="warning" className="mt-2">
                      Today
                    </Badge>
                  )}
                </li>
              ))}
              {meetings.length === 0 && <li className="py-2 text-[12.5px] text-faint">No meetings yet</li>}
            </ul>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[13px] font-semibold">Contacts</h2>
              <Button size="sm" onClick={() => setAddingContact(true)}>
                <UserPlus />
                Add
              </Button>
            </div>
            <ul className="mt-2 flex flex-col gap-1.5">
              {contacts.map((contact) => (
                <li key={contact.id} className="flex items-center gap-2">
                  <Avatar name={contact.fullName} hue={200} size={28} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-medium">
                      {contact.fullName}
                      {contact.role === 'Primary' && <span className="ml-1.5 text-[10.5px] font-semibold uppercase text-accent">primary</span>}
                    </p>
                    <p className="truncate text-[11.5px] text-faint">
                      {contact.designation ? `${contact.designation} · ` : ''}
                      {contact.phone ?? 'No number'}
                    </p>
                  </div>
                  <Menu
                    align="end"
                    trigger={
                      <Button variant="ghost" size="icon-sm" aria-label="Contact options">
                        <MoreHorizontal />
                      </Button>
                    }
                    items={[
                      { label: 'Edit', icon: <Pencil />, onSelect: () => setEditingContact(contact) },
                      ...(contact.role !== 'Primary' ? [{ label: 'Make primary', icon: <Check />, onSelect: () => makePrimary.mutate(contact.id) }] : []),
                      { label: 'Remove', danger: true, icon: <Trash2 />, onSelect: () => deleteContact.mutate(contact.id) },
                    ]}
                  />
                </li>
              ))}
              {contacts.length === 0 && <li className="py-2 text-[12.5px] text-faint">No contacts</li>}
            </ul>
          </Card>

          <Card className="p-4">
            <h2 className="text-[13px] font-semibold">Organization</h2>
            <dl className="mt-2 grid gap-2 text-[12.5px]">
              <Row label="Name" value={organization?.name} />
              <Row label="Type" value={organization?.type} />
              <Row label="City" value={organization?.city} />
              <Row label="Headcount" value={organization?.headcount ? String(organization.headcount) : null} />
              <Row label="Existing system" value={organization?.existingSystem} />
              <Row label="Assigned to" value={lead.assignedTo} />
              <Row label="Source" value={lead.source} />
              <Row label="B2B" value={lead.b2b ? 'Yes' : 'No'} />
              <Row label="Status" value={statusLabel(lead.status)} />
              <Row label="Priority" value={`${lead.priorityScore} · ${lead.priorityLevel}`} />
            </dl>
          </Card>

          {requirement?.lossReason && (
            <Card className="p-4">
              <h2 className="text-[13px] font-semibold">Closed lost</h2>
              <p className="mt-1 text-[12.5px] text-muted">Loss reason: <span className="font-medium text-fg">{requirement.lossReason}</span></p>
            </Card>
          )}
        </aside>
      </div>

      <LeadForm open={editing} onClose={() => setEditing(false)} initial={data} />
      <LogInteractionDialog
        open={logging}
        onClose={() => {
          setLogging(false)
          setLoggingFollowUpId(undefined)
        }}
        lead={data}
        followUpId={loggingFollowUpId}
      />
      <FollowUpDialog open={addingFollowUp} onClose={() => setAddingFollowUp(false)} leadId={lead.id} />
      <FollowUpDialog open={Boolean(editingFollowUp)} onClose={() => setEditingFollowUp(undefined)} leadId={lead.id} initial={editingFollowUp} />
      <CompleteFollowUpDialog
        open={Boolean(completingFollowUp)}
        onClose={() => setCompletingFollowUp(null)}
        followUpId={completingFollowUp?.id ?? null}
        leadCode={lead.code}
        dueDate={completingFollowUp ? dmy(completingFollowUp.dueDate) : undefined}
      />
      <MeetingDialog open={addingMeeting} onClose={() => setAddingMeeting(false)} leadId={lead.id} />
      <MeetingDialog open={Boolean(editingMeeting)} onClose={() => setEditingMeeting(undefined)} leadId={lead.id} initial={editingMeeting} />
      <LeadContactDialog open={addingContact} onClose={() => setAddingContact(false)} leadId={lead.id} />
      <LeadContactDialog open={Boolean(editingContact)} onClose={() => setEditingContact(undefined)} leadId={lead.id} initial={editingContact} />
      <ArchiveLeadDialog
        open={archiving}
        onClose={() => setArchiving(false)}
        onConfirm={() => setArchived.mutate(!lead.archived)}
        code={lead.code}
        archived={lead.archived}
      />
    </div>
  )
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-faint">{label}</dt>
      <dd className={cx('min-w-0 truncate text-right', value ? 'text-fg' : 'text-faint')}>{value || '—'}</dd>
    </div>
  )
}
