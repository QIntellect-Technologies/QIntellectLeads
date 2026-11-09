import { now } from './db'
import { decryptSecret, encryptSecret } from './secrets'
import type { Env } from './env'
import { DEFAULT_TIMEZONE, validTimezone, timeToMinutes } from '../shared/timezone'
import type {
  CadenceChannel,
  CadencePlaybook,
  CadenceSettings,
  CadenceStep,
  EmailLogEntry,
  NotificationSettings,
  NotificationSettingsInput,
} from '../shared/types'

type Row = Record<string, unknown>

export class SettingsError extends Error {}

export const DEFAULT_CADENCE: CadenceSettings = {
  newLead: {
    enabled: true,
    steps: [
      { days: 0, time: '10:00', channel: 'WhatsApp' },
      { days: 1, time: '11:00', channel: 'Call' },
      { days: 3, time: '10:00', channel: 'WhatsApp' },
      { days: 7, time: '11:00', channel: 'Call' },
    ],
  },
  proposal: {
    enabled: true,
    steps: [
      { days: 2, time: '10:00', channel: 'WhatsApp' },
      { days: 4, time: '11:00', channel: 'Call' },
      { days: 7, time: '11:00', channel: 'Call' },
    ],
  },
}

const CHANNELS: CadenceChannel[] = ['Call', 'WhatsApp', 'Meeting', 'Email']

const isTime = (value: unknown): value is string => typeof value === 'string' && timeToMinutes(value) !== null
const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

function cleanCadenceSteps(value: unknown): CadenceStep[] {
  if (!Array.isArray(value)) return []
  return value
    .slice(0, 8)
    .map((raw, index) => {
      const step = raw as Partial<CadenceStep>
      const days = Number(step.days)
      if (!Number.isInteger(days) || days < 0 || days > 365) {
        throw new SettingsError(`Cadence step ${index + 1} needs a day offset between 0 and 365.`)
      }
      const time = isTime(step.time) ? step.time : '10:00'
      const channel = CHANNELS.includes(step.channel as CadenceChannel) ? (step.channel as CadenceChannel) : 'WhatsApp'
      return { days, time, channel }
    })
    .sort((a, b) => a.days - b.days || a.time.localeCompare(b.time))
}

function cleanPlaybook(value: unknown): CadencePlaybook {
  const playbook = (value ?? {}) as Partial<CadencePlaybook>
  return {
    enabled: playbook.enabled !== false,
    steps: cleanCadenceSteps(playbook.steps),
  }
}

export function cleanCadence(value: unknown): CadenceSettings {
  const cadence = (value ?? {}) as Partial<CadenceSettings>
  return {
    newLead: cleanPlaybook(cadence.newLead ?? DEFAULT_CADENCE.newLead),
    proposal: cleanPlaybook(cadence.proposal ?? DEFAULT_CADENCE.proposal),
  }
}

export async function loadCadence(db: D1Database, owner: string, env: Env): Promise<CadenceSettings> {
  const row = await ensureNotificationSettings(db, owner, env)
  return parseCadence(row.cadence_json)
}

function parseCadence(value: unknown): CadenceSettings {
  if (typeof value !== 'string' || !value) return structuredClone(DEFAULT_CADENCE)
  try {
    return cleanCadence(JSON.parse(value))
  } catch {
    return structuredClone(DEFAULT_CADENCE)
  }
}

function defaultSmtp(env: Env) {
  const user = env.SMTP_USER?.trim() || env.ADMIN_EMAIL?.trim() || 'admin@qintellecttechnologies.com'
  return {
    host: env.SMTP_HOST?.trim() || 'smtp.gmail.com',
    port: Number(env.SMTP_PORT) || 465,
    user,
    from: env.SMTP_FROM?.trim() || user,
    to: env.EMAIL_TO?.trim() || user,
  }
}

export async function ensureNotificationSettings(db: D1Database, owner: string, env: Env): Promise<Row> {
  const existing = await db.prepare(`SELECT * FROM notification_settings WHERE owner_sub = ?`).bind(owner).first<Row>()
  if (existing) return existing
  const smtp = defaultSmtp(env)
  await db
    .prepare(
      `INSERT OR IGNORE INTO notification_settings
       (owner_sub, enabled, timezone, morning_enabled, morning_time, evening_enabled, evening_time,
        smtp_host, smtp_port, smtp_user, email_from, email_to, cadence_json, updated_at)
       VALUES (?, 1, ?, 1, '08:30', 1, '18:30', ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      owner,
      DEFAULT_TIMEZONE,
      smtp.host,
      smtp.port,
      smtp.user,
      smtp.from,
      smtp.to,
      JSON.stringify(DEFAULT_CADENCE),
      now(),
    )
    .run()
  return (await db.prepare(`SELECT * FROM notification_settings WHERE owner_sub = ?`).bind(owner).first<Row>()) ?? {}
}

export interface ResolvedNotification {
  owner: string
  enabled: boolean
  timezone: string
  morningEnabled: boolean
  morningTime: string
  eveningEnabled: boolean
  eveningTime: string
  smtp: {
    host: string
    port: number
    user: string
    from: string
    to: string
    password: string | null
    passwordSource: 'settings' | 'environment' | 'none'
  }
  cadence: CadenceSettings
  lastMorningSentOn: string | null
  lastEveningSentOn: string | null
}

export async function resolveNotificationSettings(
  db: D1Database,
  owner: string,
  env: Env,
): Promise<ResolvedNotification> {
  const row = await ensureNotificationSettings(db, owner, env)
  const defaults = defaultSmtp(env)
  const encrypted = (row.smtp_password as string | null) ?? null
  const storedPassword = encrypted ? await decryptSecret(env, encrypted) : null
  const environmentPassword = env.SMTP_PASSWORD?.trim().replace(/\s+/g, '') || null
  const password = storedPassword || environmentPassword
  return {
    owner,
    enabled: Boolean(Number(row.enabled ?? 1)),
    timezone: validTimezone((row.timezone as string | null) ?? DEFAULT_TIMEZONE),
    morningEnabled: Boolean(Number(row.morning_enabled ?? 1)),
    morningTime: isTime(row.morning_time) ? (row.morning_time as string) : '08:30',
    eveningEnabled: Boolean(Number(row.evening_enabled ?? 1)),
    eveningTime: isTime(row.evening_time) ? (row.evening_time as string) : '18:30',
    smtp: {
      host: (row.smtp_host as string | null) || defaults.host,
      port: Number(row.smtp_port) || defaults.port,
      user: (row.smtp_user as string | null) || defaults.user,
      from: (row.email_from as string | null) || defaults.from,
      to: (row.email_to as string | null) || defaults.to,
      password,
      passwordSource: storedPassword ? 'settings' : environmentPassword ? 'environment' : 'none',
    },
    cadence: parseCadence(row.cadence_json),
    lastMorningSentOn: (row.last_morning_sent_on as string | null) ?? null,
    lastEveningSentOn: (row.last_evening_sent_on as string | null) ?? null,
  }
}

function mapLog(row: Row): EmailLogEntry {
  return {
    id: row.id as string,
    kind: (row.kind as EmailLogEntry['kind']) ?? 'test',
    sentOn: row.sent_on as string,
    sentAt: Number(row.sent_at ?? 0),
    status: (row.status as EmailLogEntry['status']) ?? 'sending',
    recipient: (row.recipient as string) ?? '',
    error: (row.error as string | null) ?? null,
  }
}

export async function notificationSettingsForApi(db: D1Database, owner: string, env: Env): Promise<NotificationSettings> {
  const resolved = await resolveNotificationSettings(db, owner, env)
  const logs = await db
    .prepare(`SELECT * FROM email_log WHERE owner_sub = ? ORDER BY sent_at DESC LIMIT 8`)
    .bind(owner)
    .all<Row>()
  return {
    enabled: resolved.enabled,
    timezone: resolved.timezone,
    morning: { enabled: resolved.morningEnabled, time: resolved.morningTime },
    evening: { enabled: resolved.eveningEnabled, time: resolved.eveningTime },
    smtp: {
      host: resolved.smtp.host,
      port: resolved.smtp.port,
      user: resolved.smtp.user,
      from: resolved.smtp.from,
      to: resolved.smtp.to,
      passwordConfigured: Boolean(resolved.smtp.password),
      passwordSource: resolved.smtp.passwordSource,
    },
    cadence: resolved.cadence,
    lastMorningSentOn: resolved.lastMorningSentOn,
    lastEveningSentOn: resolved.lastEveningSentOn,
    logs: (logs.results ?? []).map(mapLog),
  }
}

function cleanRecipients(value: string): string {
  const recipients = value
    .split(/[,;]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 5)
  if (!recipients.length) throw new SettingsError('Add at least one briefing recipient.')
  if (recipients.some((email) => !isEmail(email))) throw new SettingsError('One of the recipient email addresses is invalid.')
  return recipients.join(', ')
}

export async function saveNotificationSettings(
  db: D1Database,
  owner: string,
  env: Env,
  input: NotificationSettingsInput,
): Promise<void> {
  const current = await ensureNotificationSettings(db, owner, env)
  const defaults = defaultSmtp(env)
  const timezone = validTimezone(input.timezone)
  if (input.timezone && timezone !== input.timezone.trim()) throw new SettingsError('Choose a valid time zone.')
  if (!isTime(input.morningTime) || !isTime(input.eveningTime)) throw new SettingsError('Briefing times must use HH:MM.')
  const morningTime = input.morningTime
  const eveningTime = input.eveningTime
  if (timeToMinutes(morningTime)! >= timeToMinutes(eveningTime)!) {
    throw new SettingsError('The morning briefing must be earlier than the evening briefing.')
  }
  const host = input.smtpHost.trim().slice(0, 160) || defaults.host
  const port = Number(input.smtpPort)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new SettingsError('SMTP port is invalid.')
  const user = input.smtpUser.trim().slice(0, 160) || defaults.user
  if (!isEmail(user)) throw new SettingsError('SMTP username must be an email address.')
  const from = input.emailFrom.trim().slice(0, 160) || user
  if (!isEmail(from)) throw new SettingsError('The From address is invalid.')
  const to = cleanRecipients(input.emailTo)
  const cadence = cleanCadence(input.cadence)

  let password = (current.smtp_password as string | null) ?? null
  if (input.clearPassword) password = null
  const newPassword = input.smtpPassword?.trim().replace(/\s+/g, '')
  if (newPassword) password = await encryptSecret(env, newPassword)

  await db
    .prepare(
      `UPDATE notification_settings SET
        enabled = ?, timezone = ?, morning_enabled = ?, morning_time = ?, evening_enabled = ?, evening_time = ?,
        smtp_host = ?, smtp_port = ?, smtp_user = ?, smtp_password = ?, email_from = ?, email_to = ?,
        cadence_json = ?, updated_at = ?
       WHERE owner_sub = ?`,
    )
    .bind(
      input.enabled ? 1 : 0,
      timezone,
      input.morningEnabled ? 1 : 0,
      morningTime,
      input.eveningEnabled ? 1 : 0,
      eveningTime,
      host,
      port,
      user,
      password,
      from,
      to,
      JSON.stringify(cadence),
      now(),
      owner,
    )
    .run()
}
