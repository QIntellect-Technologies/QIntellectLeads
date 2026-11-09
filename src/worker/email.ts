import { ensureSchema, id, now } from './db'
import type { Env } from './env'
import { listLeads } from './lead-core'
import { resolveNotificationSettings } from './settings'
import { sendSmtpMail } from './smtp'
import { dmy, timeLabel } from '../shared/leads'
import { timeToMinutes, zonedMinutes, zonedTimeLabel, zonedToday } from '../shared/timezone'
import type { LeadListItem } from '../shared/types'

type Row = Record<string, unknown>
type BriefingKind = 'morning' | 'evening'
type EmailKind = BriefingKind | 'test' | 'progress'

interface BriefingFollowUp {
  id: string
  code: string
  name: string
  org: string | null
  phone: string | null
  dueTime: string | null
  dueDate: string
  completed: boolean
}

interface BriefingMeeting {
  id: string
  time: string
  type: string
  status: string
  code: string
  name: string
  org: string | null
}

interface BriefingFacts {
  today: string
  followUps: BriefingFollowUp[]
  meetings: BriefingMeeting[]
  completedToday: number
  todayDone: number
  todayPending: number
  overdueOpen: number
  meetingsDone: number
  meetingsPending: number
}

const escape = (value: string | null | undefined) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

function appUrl(env: Env): string {
  const raw = env.APP_ORIGIN?.trim() || 'http://localhost:5173'
  return raw.replace(/\/+$/, '')
}

async function gatherFacts(db: D1Database, owner: string, timezone: string): Promise<BriefingFacts> {
  const today = zonedToday(timezone)
  const leads = await listLeads(db, owner, 'l.owner_sub = ? AND l.archived = 0', [owner])
  const leadMap = new Map<string, LeadListItem>(leads.map((lead) => [lead.id, lead]))
  const [followRows, meetingRows, completedRows] = await db.batch([
    db
      .prepare(
        `SELECT f.* FROM follow_ups f JOIN leads l ON l.id = f.lead_id AND l.owner_sub = f.owner_sub
         WHERE f.owner_sub = ? AND l.archived = 0
           AND (f.due_date <= ? OR f.completed_on = ?)
         ORDER BY f.due_date ASC, COALESCE(f.due_time, '') ASC LIMIT 500`,
      )
      .bind(owner, today, today),
    db
      .prepare(
        `SELECT m.* FROM meetings m JOIN leads l ON l.id = m.lead_id AND l.owner_sub = m.owner_sub
         WHERE m.owner_sub = ? AND m.scheduled_at LIKE ? AND l.archived = 0
         ORDER BY m.scheduled_at ASC LIMIT 100`,
      )
      .bind(owner, `${today}%`),
    db
      .prepare(`SELECT COUNT(*) AS n FROM follow_ups WHERE owner_sub = ? AND completed_on = ?`)
      .bind(owner, today),
  ])

  const followUps: BriefingFollowUp[] = []
  const seen = new Set<string>()
  for (const row of followRows.results as Row[]) {
    const followUpId = row.id as string
    const lead = leadMap.get(row.lead_id as string)
    if (!lead) continue
    const dueDate = row.due_date as string
    const completed = Boolean(Number(row.is_completed ?? 0))
    // For the evening report we care about work due today plus anything done
    // today; older completed rows are not useful noise.
    if (dueDate < today && !(row.completed_on === today)) continue
    if (seen.has(followUpId)) continue
    seen.add(followUpId)
    followUps.push({
      id: lead.id,
      code: lead.code,
      name: lead.contactName ?? 'Unknown contact',
      org: lead.orgName,
      phone: lead.contactPhone,
      dueTime: (row.due_time as string | null) ?? null,
      dueDate,
      completed,
    })
  }

  const meetings: BriefingMeeting[] = []
  for (const row of meetingRows.results as Row[]) {
    const lead = leadMap.get(row.lead_id as string)
    if (!lead) continue
    const scheduledAt = row.scheduled_at as string
    meetings.push({
      id: lead.id,
      time: scheduledAt.slice(11, 16),
      type: (row.meeting_type as string) ?? 'Meeting',
      status: (row.meeting_status as string) ?? 'Scheduled',
      code: lead.code,
      name: lead.contactName ?? 'Unknown contact',
      org: lead.orgName,
    })
  }

  const todayRows = followUps.filter((item) => item.dueDate === today)
  return {
    today,
    followUps,
    meetings,
    completedToday: Number((completedRows.results?.[0] as { n?: number } | undefined)?.n ?? 0),
    todayDone: todayRows.filter((item) => item.completed).length,
    todayPending: todayRows.filter((item) => !item.completed).length,
    overdueOpen: followUps.filter((item) => !item.completed && item.dueDate < today).length,
    meetingsDone: meetings.filter((item) => item.status === 'Done').length,
    meetingsPending: meetings.filter((item) => item.status === 'Scheduled').length,
  }
}

function greeting(kind: BriefingKind): string {
  return kind === 'morning' ? 'Good morning' : 'Good evening'
}

function summaryLine(facts: BriefingFacts, kind: BriefingKind): string {
  if (kind === 'morning') {
    return `${facts.meetings.length} meeting${facts.meetings.length === 1 ? '' : 's'} and ${facts.todayPending} follow-up${facts.todayPending === 1 ? '' : 's'} are on today's list.`
  }
  return `${facts.meetingsDone} of ${facts.meetings.length} meetings done · ${facts.todayDone} of ${facts.todayDone + facts.todayPending} follow-ups completed · ${facts.todayPending} still pending.`
}

function rowHtml(cells: string[]): string {
  return `<tr>${cells
    .map(
      (cell, index) =>
        `<td style="padding:11px 10px;border-bottom:1px solid #eef0f4;font-size:13px;color:${index === 0 ? '#111827' : '#4b5563'};vertical-align:top">${cell}</td>`,
    )
    .join('')}</tr>`
}

function section(title: string, meta: string, content: string): string {
  return `<div style="margin:0 0 22px">
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin:0 0 8px">
      <h2 style="margin:0;font-size:15px;letter-spacing:.01em;color:#111827">${escape(title)}</h2>
      <span style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em">${escape(meta)}</span>
    </div>
    ${content}
  </div>`
}

function statCard(label: string, value: string | number, tone = '#111827'): string {
  return `<td style="width:25%;padding:4px">
    <div style="border:1px solid #e8ebf0;border-radius:12px;padding:12px 10px;background:#fafbfc">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#6b7280">${escape(label)}</div>
      <div style="font-size:24px;font-weight:700;color:${tone};line-height:1.25;margin-top:2px">${escape(String(value))}</div>
    </div>
  </td>`
}

function buildEmail(
  facts: BriefingFacts,
  kind: BriefingKind,
  timezone: string,
  env: Env,
  options?: { subject?: string; heading?: string },
) {
  const todayLabel = dmy(facts.today)
  const subject =
    options?.subject ??
    (kind === 'morning'
      ? `Morning briefing · ${facts.meetings.length} meetings, ${facts.todayPending} follow-ups · ${todayLabel}`
      : `End of day · ${facts.meetingsDone}/${facts.meetings.length} meetings done, ${facts.todayPending} follow-ups pending · ${todayLabel}`)
  const stats =
    kind === 'morning'
      ? [
          statCard('Meetings today', facts.meetings.length),
          statCard('Follow-ups today', facts.todayPending, '#b45309'),
          statCard('Overdue', facts.overdueOpen, facts.overdueOpen ? '#b91c1c' : '#111827'),
          statCard('Agenda items', facts.meetings.length + facts.todayPending),
        ]
      : [
          statCard('Meetings done', `${facts.meetingsDone}/${facts.meetings.length}`, '#047857'),
          statCard('Follow-ups done', `${facts.todayDone}/${facts.todayDone + facts.todayPending}`, '#047857'),
          statCard('Still pending', facts.todayPending, facts.todayPending ? '#b45309' : '#047857'),
          statCard('Overdue', facts.overdueOpen, facts.overdueOpen ? '#b91c1c' : '#111827'),
        ]

  const meetingRows = facts.meetings.length
    ? facts.meetings
        .map((meeting) =>
          rowHtml([
            `<strong>${escape(zonedTimeLabel(meeting.time))}</strong>`,
            `${escape(meeting.type)} · ${escape(meeting.status)}`,
            `<a href="${escape(appUrl(env))}/leads/${encodeURIComponent(meeting.id)}" style="color:#4338ca;text-decoration:none"><strong>${escape(meeting.code)}</strong></a><br>${escape(meeting.name)}${meeting.org ? ` · ${escape(meeting.org)}` : ''}`,
          ]),
        )
        .join('')
    : `<tr><td style="padding:14px 10px;color:#6b7280;font-size:13px">No meetings scheduled for today.</td></tr>`
  const meetingsTable = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e8ebf0;border-radius:12px;overflow:hidden">
    ${meetingRows}
  </table>`

  const pendingFollowUps = facts.followUps.filter((item) => !item.completed)
  const followRows = pendingFollowUps.length
    ? pendingFollowUps
        .slice(0, 20)
        .map((item) =>
          rowHtml([
            `<a href="${escape(appUrl(env))}/leads/${encodeURIComponent(item.id)}" style="color:#4338ca;text-decoration:none"><strong>${escape(item.code)}</strong></a><br>${escape(item.name)}${item.org ? ` · ${escape(item.org)}` : ''}`,
            item.dueDate < facts.today
              ? `<span style="color:#b91c1c">${dmy(item.dueDate)} · overdue</span>`
              : escape(item.dueTime ? timeLabel(item.dueTime) : 'Today'),
            escape(item.phone ?? '—'),
          ]),
        )
        .join('')
    : `<tr><td style="padding:14px 10px;color:#047857;font-size:13px">Nothing pending — today's follow-ups are clear.</td></tr>`
  const followTable = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e8ebf0;border-radius:12px;overflow:hidden">
    ${followRows}
  </table>`

  const note =
    kind === 'morning'
      ? facts.overdueOpen
        ? `<div style="margin:0 0 20px;padding:12px 14px;border-radius:10px;background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;font-size:13px">You also have <strong>${facts.overdueOpen} overdue</strong> follow-up${facts.overdueOpen === 1 ? '' : 's'} from earlier days. Clear the oldest first in the Next actions queue.</div>`
        : ''
      : facts.todayPending
        ? `<div style="margin:0 0 20px;padding:12px 14px;border-radius:10px;background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;font-size:13px"><strong>${facts.todayPending} follow-up${facts.todayPending === 1 ? '' : 's'} still pending.</strong> Complete them with a next step, or reschedule with a reason so nothing silently drops.</div>`
        : `<div style="margin:0 0 20px;padding:12px 14px;border-radius:10px;background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46;font-size:13px"><strong>Everything due today is done.</strong> Great close to the day.</div>`

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:620px;margin:0 auto;padding:24px 14px">
    <div style="border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;background:#ffffff">
      <div style="background:#0b1120;padding:24px 26px;color:#ffffff">
        <div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#a5b4fc">QIntellect CRM</div>
        <div style="margin-top:8px;font-size:23px;font-weight:700;letter-spacing:-.02em">${escape(options?.heading ?? `${greeting(kind)} — here is your day`)}</div>
        <div style="margin-top:6px;font-size:13px;color:#cbd5e1">${todayLabel} · ${facts.meetings.length ? facts.meetings[0].time : '—'} first meeting · ${escape(timezone)}</div>
      </div>
      <div style="padding:24px 26px">
        <p style="margin:0 0 18px;font-size:14px;color:#374151;line-height:1.55">${summaryLine(facts, kind)}</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px"><tr>${stats.join('')}</tr></table>
        ${note}
        ${section(kind === 'morning' ? "Today's meetings" : "Today's meetings", `${facts.meetingsDone} done · ${facts.meetingsPending} pending`, meetingsTable)}
        ${section(kind === 'morning' ? "Today's follow-ups" : 'Follow-ups still pending', `${facts.todayPending} due today`, followTable)}
        <div style="margin-top:26px;text-align:center">
          <a href="${escape(appUrl(env))}/" style="display:inline-block;background:#4338ca;color:#ffffff;text-decoration:none;padding:11px 22px;border-radius:10px;font-size:13px;font-weight:600">Open today's command centre</a>
        </div>
      </div>
      <div style="padding:14px 26px;background:#f9fafb;border-top:1px solid #eef0f4;color:#6b7280;font-size:11px;line-height:1.5">
        Sent automatically by your QIntellect CRM · Times and delivery are controlled in Settings → Email briefings.
      </div>
    </div>
  </div>
</body></html>`

  const lines: string[] = [
    `${options?.heading ?? greeting(kind)} — ${todayLabel}`,
    '',
    summaryLine(facts, kind),
    '',
    `MEETINGS TODAY (${facts.meetings.length})`,
  ]
  if (facts.meetings.length) {
    for (const meeting of facts.meetings) {
      lines.push(`- ${zonedTimeLabel(meeting.time)} · ${meeting.type} · ${meeting.status} · ${meeting.code} ${meeting.name}${meeting.org ? ` (${meeting.org})` : ''}`)
    }
  } else lines.push('- None scheduled.')
  lines.push('', kind === 'morning' ? `FOLLOW-UPS TODAY (${facts.todayPending} pending)` : `FOLLOW-UPS STILL PENDING (${facts.todayPending})`)
  if (pendingFollowUps.length) {
    for (const item of pendingFollowUps.slice(0, 20)) {
      lines.push(`- ${item.dueDate < facts.today ? 'OVERDUE ' : ''}${item.dueTime ? timeLabel(item.dueTime) : 'Today'} · ${item.code} ${item.name}${item.org ? ` (${item.org})` : ''}${item.phone ? ` · ${item.phone}` : ''}`)
    }
  } else lines.push('- Nothing pending.')
  if (kind === 'evening') {
    lines.push(
      '',
      `Done today: ${facts.meetingsDone}/${facts.meetings.length} meetings · ${facts.todayDone}/${facts.todayDone + facts.todayPending} follow-ups due today · ${facts.completedToday} follow-ups completed in total.`,
    )
  }
  lines.push('', `Open the CRM: ${appUrl(env)}/`, '', 'Manage times or switch this off in Settings → Email briefings.')

  return { subject, html, text: lines.join('\n') }
}

async function claimEmail(
  db: D1Database,
  owner: string,
  kind: EmailKind,
  sentOn: string,
  recipient: string,
): Promise<boolean> {
  const inserted = await db
    .prepare(
      `INSERT OR IGNORE INTO email_log (id, owner_sub, kind, sent_on, sent_at, status, recipient, error, attempts)
       VALUES (?, ?, ?, ?, ?, 'sending', ?, NULL, 1)`,
    )
    .bind(id(), owner, kind, sentOn, now(), recipient)
    .run()
  if (Number(inserted.meta.changes ?? 0) > 0) return true
  const existing = await db
    .prepare(`SELECT status, attempts FROM email_log WHERE owner_sub = ? AND kind = ? AND sent_on = ?`)
    .bind(owner, kind, sentOn)
    .first<{ status: string; attempts: number }>()
  if (!existing || existing.status !== 'error' || Number(existing.attempts) >= 3) return false
  const retry = await db
    .prepare(
      `UPDATE email_log SET status = 'sending', attempts = attempts + 1, sent_at = ?, error = NULL
       WHERE owner_sub = ? AND kind = ? AND sent_on = ? AND status = 'error' AND attempts < 3`,
    )
    .bind(now(), owner, kind, sentOn)
    .run()
  return Number(retry.meta.changes ?? 0) > 0
}

async function markEmail(
  db: D1Database,
  owner: string,
  kind: EmailKind,
  sentOn: string,
  status: 'sent' | 'error',
  error: string | null,
): Promise<void> {
  await db
    .prepare(`UPDATE email_log SET status = ?, error = ? WHERE owner_sub = ? AND kind = ? AND sent_on = ?`)
    .bind(status, error?.slice(0, 400) ?? null, owner, kind, sentOn)
    .run()
}

async function deliver(
  db: D1Database,
  env: Env,
  owner: string,
  kind: BriefingKind,
  test = false,
): Promise<'sent' | 'skipped'> {
  const settings = await resolveNotificationSettings(db, owner, env)
  if (!test && (!settings.enabled || !settings.smtp.password)) return 'skipped'
  if (!settings.smtp.password) {
    throw new Error('No SMTP app password is saved. Add it in Settings → Email briefings.')
  }
  const sentOn = test ? `test-${now()}` : zonedToday(settings.timezone)
  if (!test && !(await claimEmail(db, owner, kind, sentOn, settings.smtp.to))) return 'skipped'
  if (test) {
    // Tests are always allowed and never consume the once-per-day automatic slot.
    await db
      .prepare(
        `INSERT INTO email_log (id, owner_sub, kind, sent_on, sent_at, status, recipient, error, attempts)
         VALUES (?, ?, 'test', ?, ?, 'sending', ?, NULL, 1)`,
      )
      .bind(id(), owner, sentOn, now(), settings.smtp.to)
      .run()
  }
  try {
    const facts = await gatherFacts(db, owner, settings.timezone)
    const message = buildEmail(facts, kind, settings.timezone, env)
    await sendSmtpMail(
      {
        host: settings.smtp.host,
        port: settings.smtp.port,
        user: settings.smtp.user,
        password: settings.smtp.password,
        from: settings.smtp.from,
        to: settings.smtp.to,
      },
      test
        ? {
            ...message,
            subject: `[Test] ${message.subject}`,
            text: `This is a test of your QIntellect ${kind} briefing.\n\n${message.text}`,
          }
        : message,
    )
    await markEmail(db, owner, test ? 'test' : kind, sentOn, 'sent', null)
    if (!test) {
      await db
        .prepare(`UPDATE notification_settings SET last_${kind}_sent_on = ?, updated_at = ? WHERE owner_sub = ?`)
        .bind(sentOn, now(), owner)
        .run()
    }
    return 'sent'
  } catch (error) {
    await markEmail(db, owner, test ? 'test' : kind, sentOn, 'error', error instanceof Error ? error.message : 'Send failed.')
    throw error
  }
}

export async function sendTestEmail(env: Env, owner: string, kind: BriefingKind = 'morning'): Promise<void> {
  if (!env.DB) throw new Error('Database is not connected.')
  await ensureSchema(env.DB)
  await deliver(env.DB, env, owner, kind, true)
}

/** Immediate on-demand progress email. Never consumes or changes the automatic
 * morning/evening slot, so it is safe to send at any time. */
export async function sendProgressEmail(env: Env, owner: string): Promise<void> {
  if (!env.DB) throw new Error('Database is not connected.')
  const db = env.DB
  await ensureSchema(db)
  const settings = await resolveNotificationSettings(db, owner, env)
  if (!settings.smtp.password) {
    throw new Error('No SMTP app password is saved. Add it in Settings → Email briefings.')
  }
  const sentOn = `progress-${now()}`
  await db
    .prepare(
      `INSERT INTO email_log (id, owner_sub, kind, sent_on, sent_at, status, recipient, error, attempts)
       VALUES (?, ?, 'progress', ?, ?, 'sending', ?, NULL, 1)`,
    )
    .bind(id(), owner, sentOn, now(), settings.smtp.to)
    .run()
  try {
    const facts = await gatherFacts(db, owner, settings.timezone)
    const message = buildEmail(facts, 'evening', settings.timezone, env, {
      subject: `Progress update · ${dmy(facts.today)} · ${facts.todayPending} follow-ups pending`,
      heading: "Today's progress — where the day stands",
    })
    await sendSmtpMail(
      {
        host: settings.smtp.host,
        port: settings.smtp.port,
        user: settings.smtp.user,
        password: settings.smtp.password,
        from: settings.smtp.from,
        to: settings.smtp.to,
      },
      message,
    )
    await markEmail(db, owner, 'progress', sentOn, 'sent', null)
  } catch (error) {
    await markEmail(db, owner, 'progress', sentOn, 'error', error instanceof Error ? error.message : 'Send failed.')
    throw error
  }
}

function withinWindow(current: number, target: string, windowMinutes = 15): boolean {
  const minutes = timeToMinutes(target)
  if (minutes === null) return false
  return current >= minutes && current < minutes + windowMinutes
}

export interface EmailTickResult {
  checked: number
  sent: number
  skipped: number
  failed: number
}

export async function runDueEmails(env: Env): Promise<EmailTickResult> {
  if (!env.DB) return { checked: 0, sent: 0, skipped: 0, failed: 0 }
  const db = env.DB
  await ensureSchema(db)
  const result: EmailTickResult = { checked: 0, sent: 0, skipped: 0, failed: 0 }
  const owners = await db.prepare(
    `SELECT owner_sub FROM leads GROUP BY owner_sub
     UNION SELECT owner_sub FROM notification_settings GROUP BY owner_sub
     LIMIT 100`,
  ).all<{ owner_sub: string }>()
  for (const owner of owners.results ?? []) {
    const ownerId = owner.owner_sub
    const settings = await resolveNotificationSettings(db, ownerId, env).catch(() => null)
    if (!settings) continue
    result.checked += 1
    if (!settings.enabled || !settings.smtp.password) {
      result.skipped += 1
      continue
    }
    const today = zonedToday(settings.timezone)
    const current = zonedMinutes(settings.timezone)
    const due: BriefingKind[] = []
    if (settings.morningEnabled && withinWindow(current, settings.morningTime) && settings.lastMorningSentOn !== today) {
      due.push('morning')
    }
    if (settings.eveningEnabled && withinWindow(current, settings.eveningTime) && settings.lastEveningSentOn !== today) {
      due.push('evening')
    }
    if (!due.length) {
      result.skipped += 1
      continue
    }
    for (const kind of due) {
      try {
        const outcome = await deliver(db, env, ownerId, kind)
        if (outcome === 'sent') result.sent += 1
        else result.skipped += 1
      } catch (error) {
        result.failed += 1
        console.error(`Briefing ${kind} failed for ${ownerId}:`, error instanceof Error ? error.message : error)
      }
    }
  }
  return result
}
