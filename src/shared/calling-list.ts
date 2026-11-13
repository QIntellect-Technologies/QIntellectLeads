// Calling list vocabulary shared by the Worker and the app. The list is a
// number-first outreach pool: every row is one phone number, and a row only
// becomes a lead when someone presses "Convert to lead".

import type { CallResult, Tone } from './leads'

export const OUTREACH_STATUSES = [
  'Not called',
  'Connected',
  'Interested',
  'Not interested',
  'No answer',
  'Busy',
  'Voicemail',
  'Wrong number',
  'Callback',
  'Converted',
] as const

export type OutreachStatus = (typeof OUTREACH_STATUSES)[number]

export const isOutreachStatus = (value: unknown): value is OutreachStatus =>
  typeof value === 'string' && OUTREACH_STATUSES.includes(value as OutreachStatus)

/** The status a call result moves a number to. Unknown keeps the old status. */
export const RESULT_TO_STATUS: Record<CallResult, OutreachStatus | null> = {
  Connected: 'Connected',
  'No answer': 'No answer',
  Busy: 'Busy',
  Voicemail: 'Voicemail',
  'Wrong number': 'Wrong number',
  'Callback requested': 'Callback',
  Unknown: null,
}

export function resultToStatus(result: CallResult): OutreachStatus | null {
  return RESULT_TO_STATUS[result] ?? null
}

/** Result badge tone, reusing the badge vocabulary from the app. */
export function resultTone(result: string | null | undefined): Tone {
  if (result === 'Connected') return 'success'
  if (result === 'No answer' || result === 'Wrong number') return 'danger'
  if (result === 'Busy' || result === 'Voicemail' || result === 'Callback requested') return 'warning'
  return 'neutral'
}

export function outreachStatusTone(status: string): Tone {
  if (status === 'Converted' || status === 'Interested' || status === 'Connected') return 'success'
  if (status === 'Not interested' || status === 'Wrong number') return 'danger'
  if (status === 'Callback' || status === 'Busy' || status === 'Voicemail') return 'warning'
  if (status === 'Not called') return 'neutral'
  return 'info'
}
