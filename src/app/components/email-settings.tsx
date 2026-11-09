import { useQueryClient } from '@tanstack/react-query'
import { Bell, Mail, Plus, Send, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'

import { api, useApiMutation, useNotificationSettings } from '../lib/api'
import { COMMON_TIMEZONES, zonedTimeLabel } from '../../shared/timezone'
import type { CadenceChannel, CadencePlaybook, CadenceSettings, NotificationSettings, NotificationSettingsInput } from '../../shared/types'
import { Badge, Button, Field, Input, Select, Skeleton, useToast } from './ui'

const CHANNELS: CadenceChannel[] = ['Call', 'WhatsApp', 'Meeting', 'Email']

function fromSettings(settings: NotificationSettings): NotificationSettingsInput {
  return {
    enabled: settings.enabled,
    timezone: settings.timezone,
    morningEnabled: settings.morning.enabled,
    morningTime: settings.morning.time,
    eveningEnabled: settings.evening.enabled,
    eveningTime: settings.evening.time,
    smtpHost: settings.smtp.host,
    smtpPort: settings.smtp.port,
    smtpUser: settings.smtp.user,
    emailFrom: settings.smtp.from,
    emailTo: settings.smtp.to,
    cadence: JSON.parse(JSON.stringify(settings.cadence)) as CadenceSettings,
  }
}

export function EmailSettings() {
  const { data, isLoading } = useNotificationSettings()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [form, setForm] = useState<NotificationSettingsInput | null>(null)
  const [password, setPassword] = useState('')
  const [clearPassword, setClearPassword] = useState(false)

  // Initialise once per visit. Background refreshes must not wipe a time or
  // password the user is still typing.
  useEffect(() => {
    if (data && form === null) setForm(fromSettings(data))
  }, [data, form])

  const save = useApiMutation(
    (input: NotificationSettingsInput) => api<NotificationSettings>('/settings/notifications', { method: 'PUT', json: input }),
    ['notification-settings', 'next-actions'],
    {
      onSuccess: (settings) => {
        queryClient.setQueryData(['notification-settings'], settings)
        setForm(fromSettings(settings))
        setPassword('')
        setClearPassword(false)
        toast('Email and cadence settings saved')
      },
    },
  )
  const test = useApiMutation(
    (kind: 'morning' | 'evening') => api<{ ok: true }>('/settings/notifications/test', { method: 'POST', json: { kind } }),
    ['notification-settings'],
    { onSuccess: (_result, kind) => toast(`Test ${kind} briefing sent`) },
  )
  const sendNow = useApiMutation(
    () => api<{ ok: true }>('/settings/notifications/send-now', { method: 'POST' }),
    ['notification-settings'],
    { onSuccess: () => toast('Progress email sent now') },
  )

  if (isLoading || !form || !data) {
    return (
      <section className="mt-8">
        <Skeleton className="h-6 w-44" />
        <Skeleton className="mt-3 h-64 rounded-card" />
      </section>
    )
  }

  const timezones = COMMON_TIMEZONES.includes(form.timezone as never) ? [...COMMON_TIMEZONES] : [form.timezone, ...COMMON_TIMEZONES]
  const saveDisabled = save.isPending || test.isPending

  function update<K extends keyof NotificationSettingsInput>(key: K, value: NotificationSettingsInput[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current))
  }

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[14px] font-semibold">
            <Bell className="size-4 text-accent" />
            Email briefings
          </h2>
          <p className="mt-1 text-[12.5px] text-muted">Morning and end-of-day summaries on your schedule. Everything here is live.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={form.enabled ? 'success' : 'neutral'} dot>
            {form.enabled ? 'On' : 'Off'}
          </Badge>
          <Button
            size="sm"
            variant="primary"
            loading={sendNow.isPending}
            disabled={!data.smtp.passwordConfigured || clearPassword}
            onClick={() => sendNow.mutate(undefined)}
            title={data.smtp.passwordConfigured ? 'Send a progress email to the saved recipients right now' : 'Save the SMTP app password first'}
          >
            <Send />
            Send progress now
          </Button>
        </div>
      </div>
      {sendNow.error && <p className="mt-2 text-[12.5px] text-danger">{sendNow.error.message}</p>}
      {!data.smtp.passwordConfigured && <p className="mt-2 text-[11.5px] text-faint">Save the Gmail app password below to unlock “Send progress now” and test emails.</p>}

      <div className="mt-3 rounded-card border border-line/80 bg-surface p-4 shadow-card">
        <label className="flex items-center justify-between gap-3 rounded-control bg-surface-2/60 px-3 py-2.5">
          <span>
            <span className="block text-[13px] font-medium">Send automatic briefings</span>
            <span className="block text-[11.5px] text-faint">Turn the whole feature off without losing your settings.</span>
          </span>
          <input type="checkbox" checked={form.enabled} onChange={(e) => update('enabled', e.target.checked)} className="size-4 accent-[var(--color-accent)]" />
        </label>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-control border border-line p-3">
            <label className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-medium">Morning briefing</span>
              <input type="checkbox" checked={form.morningEnabled} onChange={(e) => update('morningEnabled', e.target.checked)} className="size-4 accent-[var(--color-accent)]" />
            </label>
            <p className="mt-1 text-[11px] text-faint">Today's meetings and today's follow-ups.</p>
            <Input className="mt-2" type="time" value={form.morningTime} disabled={!form.morningEnabled} onChange={(e) => update('morningTime', e.target.value)} />
          </div>
          <div className="rounded-control border border-line p-3">
            <label className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-medium">End-of-day briefing</span>
              <input type="checkbox" checked={form.eveningEnabled} onChange={(e) => update('eveningEnabled', e.target.checked)} className="size-4 accent-[var(--color-accent)]" />
            </label>
            <p className="mt-1 text-[11px] text-faint">Meetings done and follow-ups still pending.</p>
            <Input className="mt-2" type="time" value={form.eveningTime} disabled={!form.eveningEnabled} onChange={(e) => update('eveningTime', e.target.value)} />
          </div>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Time zone" hint="The schedule and today's date use this zone.">
            <Select value={form.timezone} onChange={(e) => update('timezone', e.target.value)}>
              {timezones.map((zone) => (
                <option key={zone}>{zone}</option>
              ))}
            </Select>
          </Field>
          <div className="rounded-control border border-line bg-surface-2/50 p-3">
            <p className="text-[11px] uppercase tracking-wide text-faint">Schedule preview</p>
            <p className="mt-1 text-[12.5px] font-medium">
              {form.enabled ? `${zonedTimeLabel(form.morningTime)} morning · ${zonedTimeLabel(form.eveningTime)} evening` : 'Automatic briefings are off'}
            </p>
            <p className="mt-0.5 text-[11px] text-faint">{form.timezone} · checked every minute while the app runs</p>
          </div>
        </div>

        <div className="mt-5 border-t border-line pt-4">
          <h3 className="flex items-center gap-2 text-[13px] font-semibold">
            <Mail className="size-4 text-muted" />
            SMTP delivery
          </h3>
          <p className="mt-1 text-[11.5px] text-faint">Gmail works with an app password. The password is encrypted before it is stored and never shown again.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="SMTP host">
              <Input value={form.smtpHost} onChange={(e) => update('smtpHost', e.target.value)} placeholder="smtp.gmail.com" />
            </Field>
            <Field label="Port" hint="465 uses TLS, 587 uses STARTTLS.">
              <Input type="number" min={1} max={65535} value={form.smtpPort} onChange={(e) => update('smtpPort', Number(e.target.value))} />
            </Field>
            <Field label="Gmail address">
              <Input type="email" value={form.smtpUser} onChange={(e) => update('smtpUser', e.target.value)} placeholder="admin@qintellecttechnologies.com" />
            </Field>
            <Field label="App password" hint={data.smtp.passwordConfigured ? `Saved (${data.smtp.passwordSource === 'environment' ? 'environment' : 'encrypted settings'}). Leave blank to keep it.` : 'No password saved yet.'}>
              <Input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  if (e.target.value) setClearPassword(false)
                }}
                placeholder={data.smtp.passwordConfigured ? '••••••••••••••••' : '16-character Gmail app password'}
                autoComplete="new-password"
              />
            </Field>
            <Field label="From address">
              <Input type="email" value={form.emailFrom} onChange={(e) => update('emailFrom', e.target.value)} />
            </Field>
            <Field label="Send briefings to" hint="Up to 5 addresses, comma separated.">
              <Input value={form.emailTo} onChange={(e) => update('emailTo', e.target.value)} placeholder="admin@qintellecttechnologies.com" />
            </Field>
          </div>
          {data.smtp.passwordConfigured && (
            <label className="mt-3 flex items-center gap-2 text-[12px] text-muted">
              <input type="checkbox" checked={clearPassword} onChange={(e) => setClearPassword(e.target.checked)} className="size-4 accent-[var(--color-danger)]" />
              Remove the saved password
            </label>
          )}
          {!data.smtp.passwordConfigured && password && <p className="mt-2 text-[11.5px] text-warning">Save the app password first, then the test buttons unlock.</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => test.mutate('morning')} loading={test.isPending} disabled={!data.smtp.passwordConfigured || clearPassword}>
              <Send />
              Test morning email
            </Button>
            <Button size="sm" onClick={() => test.mutate('evening')} loading={test.isPending} disabled={!data.smtp.passwordConfigured || clearPassword}>
              <Send />
              Test end-of-day email
            </Button>
          </div>
          {test.error && <p className="mt-2 text-[12.5px] text-danger">{test.error.message}</p>}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <p className="text-[11.5px] text-faint">
            Morning: {data.lastMorningSentOn ? `last sent ${data.lastMorningSentOn}` : 'not sent yet'} · Evening: {data.lastEveningSentOn ? `last sent ${data.lastEveningSentOn}` : 'not sent yet'}
          </p>
          <Button
            variant="primary"
            loading={save.isPending}
            disabled={saveDisabled}
            onClick={() => {
              if (!form) return
              if (form.morningTime >= form.eveningTime) {
                toast('Morning time must be earlier than evening time')
                return
              }
              save.mutate({ ...form, smtpPassword: password || undefined, clearPassword })
            }}
          >
            Save email settings
          </Button>
        </div>
        {save.error && <p className="mt-2 text-[12.5px] text-danger">{save.error.message}</p>}

        {data.logs.length > 0 && (
          <div className="mt-4 border-t border-line pt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">Recent deliveries</p>
            <ul className="mt-2 divide-y divide-line">
              {data.logs.slice(0, 5).map((log) => (
                <li key={log.id} className="flex items-center gap-2 py-1.5 text-[11.5px]">
                  <span className="w-16 font-medium capitalize">{log.kind}</span>
                  <span className="flex-1 truncate text-faint">
                    {log.sentOn.startsWith('test-') ? 'manual test' : log.sentOn.startsWith('progress-') ? 'sent on demand' : log.sentOn}
                  </span>
                  <Badge tone={log.status === 'sent' ? 'success' : log.status === 'error' ? 'danger' : 'neutral'}>{log.status}</Badge>
                  {log.error && <span className="max-w-[45%] truncate text-danger" title={log.error}>{log.error}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <CadenceEditor
        cadence={form.cadence}
        onChange={(cadence) => update('cadence', cadence)}
        onSave={() => save.mutate({ ...form, smtpPassword: password || undefined, clearPassword })}
        saving={save.isPending}
      />
    </section>
  )
}

function CadenceEditor({
  cadence,
  onChange,
  onSave,
  saving,
}: {
  cadence: CadenceSettings
  onChange: (cadence: CadenceSettings) => void
  onSave: () => void
  saving: boolean
}) {
  function updatePlaybook(key: 'newLead' | 'proposal', playbook: CadencePlaybook) {
    onChange({ ...cadence, [key]: playbook })
  }
  return (
    <div className="mt-4 rounded-card border border-line/80 bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-[14px] font-semibold">Follow-up cadences</h2>
          <p className="mt-1 max-w-[720px] text-[12px] leading-relaxed text-muted">
            A cadence is an automatic follow-up plan. It creates real follow-ups in the Follow-ups and Next actions pages, so a new lead or a sent proposal never sits without a next touch. The plan is created once per lead; it does not add more work every time you open the page.
          </p>
        </div>
        <Button size="sm" variant="primary" onClick={onSave} loading={saving}>
          Save cadences
        </Button>
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <PlaybookEditor
          title="New lead"
          hint="Starts on the lead's created date."
          explain="When you capture a new lead, this plan schedules its first touches automatically. It runs once per lead, so you never have to remember the first call or WhatsApp."
          playbook={cadence.newLead}
          onChange={(playbook) => updatePlaybook('newLead', playbook)}
        />
        <PlaybookEditor
          title="Proposal sent"
          hint="Starts when the status changes to Proposal Sent."
          explain="When a lead moves to Proposal Sent, this plan schedules the follow-ups that chase feedback and keep the deal warm. It runs once, on that status change."
          playbook={cadence.proposal}
          onChange={(playbook) => updatePlaybook('proposal', playbook)}
        />
      </div>
      <p className="mt-3 rounded-control bg-surface-2/70 px-3 py-2 text-[11.5px] leading-relaxed text-muted">
        How to read a step: <strong>days</strong> is the gap after the start date, <strong>time</strong> is the follow-up time, and <strong>channel</strong> is Call, WhatsApp, Meeting or Email. Turning a cadence off stops future automatic plans; it does not delete follow-ups that already exist.
      </p>
    </div>
  )
}

function PlaybookEditor({
  title,
  hint,
  explain,
  playbook,
  onChange,
}: {
  title: string
  hint: string
  explain: string
  playbook: CadencePlaybook
  onChange: (playbook: CadencePlaybook) => void
}) {
  const plan = playbook.steps.length
    ? playbook.steps.map((step) => `Day ${step.days} ${step.channel}`).join(' · ')
    : 'No steps configured'
  return (
    <div className="rounded-control border border-line p-3">
      <label className="flex items-start justify-between gap-2">
        <span>
          <span className="block text-[13px] font-medium">{title}</span>
          <span className="block text-[11px] text-faint">{hint}</span>
        </span>
        <input type="checkbox" checked={playbook.enabled} onChange={(e) => onChange({ ...playbook, enabled: e.target.checked })} className="mt-0.5 size-4 accent-[var(--color-accent)]" aria-label={`Enable ${title} cadence`} />
      </label>
      <p className="mt-2 text-[11.5px] leading-relaxed text-muted">{explain}</p>
      <div className="mt-2 rounded-control bg-accent-soft px-2.5 py-2 text-[11px] leading-relaxed text-accent">
        <strong>{playbook.enabled ? `${playbook.steps.length} automatic follow-up${playbook.steps.length === 1 ? '' : 's'}` : 'Cadence is off'}</strong>
        {playbook.enabled && playbook.steps.length > 0 ? ` · ${plan}` : ''}
      </div>
      <div className="mt-3 grid grid-cols-[58px_1fr_1fr_28px] items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-faint">
        <span>Days</span>
        <span>Time</span>
        <span>Channel</span>
        <span />
      </div>
      <div className="mt-1 space-y-2">
        {playbook.steps.map((step, index) => (
          <div key={index} className="grid grid-cols-[58px_1fr_1fr_28px] items-center gap-1.5">
            <div className="flex items-center gap-1">
              <Input
                type="number"
                min={0}
                max={365}
                value={step.days}
                onChange={(e) => onChange({ ...playbook, steps: playbook.steps.map((item, i) => (i === index ? { ...item, days: Number(e.target.value) } : item)) })}
                aria-label={`${title} step ${index + 1} day offset`}
                className="px-1.5 text-center"
              />
              <span className="text-[10px] text-faint">d</span>
            </div>
            <Input type="time" value={step.time} onChange={(e) => onChange({ ...playbook, steps: playbook.steps.map((item, i) => (i === index ? { ...item, time: e.target.value } : item)) })} aria-label={`${title} step ${index + 1} time`} />
            <Select value={step.channel} onChange={(e) => onChange({ ...playbook, steps: playbook.steps.map((item, i) => (i === index ? { ...item, channel: e.target.value as CadenceChannel } : item)) })} aria-label={`${title} step ${index + 1} channel`}>
              {CHANNELS.map((channel) => (
                <option key={channel}>{channel}</option>
              ))}
            </Select>
            <button
              type="button"
              aria-label="Remove step"
              onClick={() => onChange({ ...playbook, steps: playbook.steps.filter((_, i) => i !== index) })}
              className="grid size-7 place-items-center rounded-tile text-faint hover:bg-danger-soft hover:text-danger"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))}
        {playbook.steps.length === 0 && <p className="rounded-control bg-surface-2 px-2 py-2 text-[11.5px] text-faint">No steps. This cadence will do nothing.</p>}
      </div>
      {playbook.steps.length < 8 && (
        <Button
          size="sm"
          variant="ghost"
          className="mt-2"
          onClick={() => onChange({ ...playbook, steps: [...playbook.steps, { days: (playbook.steps.at(-1)?.days ?? 0) + 2, time: '10:00', channel: 'WhatsApp' }] })}
        >
          <Plus />
          Add step
        </Button>
      )}
    </div>
  )
}
