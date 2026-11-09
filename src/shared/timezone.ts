/** Time-zone helpers shared by the Worker scheduler and the Settings UI. */

export const COMMON_TIMEZONES = [
  'Asia/Karachi',
  'Asia/Dubai',
  'Asia/Riyadh',
  'Asia/Kolkata',
  'Asia/Dhaka',
  'Asia/Singapore',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Australia/Sydney',
  'UTC',
] as const

export const DEFAULT_TIMEZONE = 'Asia/Karachi'

export type ZonedParts = {
  date: string
  time: string
  year: number
  month: number
  day: number
  hour: number
  minute: number
  weekday: string
}

export function validTimezone(value: string | null | undefined): string {
  const timeZone = value?.trim() || DEFAULT_TIMEZONE
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date())
    return timeZone
  } catch {
    return DEFAULT_TIMEZONE
  }
}

export function zonedParts(date: Date = new Date(), timeZone: string = DEFAULT_TIMEZONE): ZonedParts {
  const zone = validTimezone(timeZone)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'long',
    hourCycle: 'h23',
  }).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ''
  const year = Number(get('year'))
  const month = Number(get('month'))
  const day = Number(get('day'))
  const hour = Number(get('hour'))
  const minute = Number(get('minute'))
  return {
    date: `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    year,
    month,
    day,
    hour,
    minute,
    weekday: get('weekday'),
  }
}

export function zonedToday(timeZone: string = DEFAULT_TIMEZONE, date: Date = new Date()): string {
  return zonedParts(date, timeZone).date
}

export function zonedMinutes(timeZone: string = DEFAULT_TIMEZONE, date: Date = new Date()): number {
  const parts = zonedParts(date, timeZone)
  return parts.hour * 60 + parts.minute
}

export function timeToMinutes(value: string): number | null {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null
  const [hour, minute] = value.split(':').map(Number)
  return hour * 60 + minute
}

export function addDaysToDate(date: string, days: number): string {
  const base = new Date(`${date}T00:00:00Z`)
  base.setUTCDate(base.getUTCDate() + days)
  return base.toISOString().slice(0, 10)
}

export function zonedTimeLabel(time: string): string {
  const minutes = timeToMinutes(time)
  if (minutes === null) return time
  const hour = Math.floor(minutes / 60)
  const minute = minutes % 60
  const suffix = hour >= 12 ? 'pm' : 'am'
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  return `${h12}:${String(minute).padStart(2, '0')} ${suffix}`
}
