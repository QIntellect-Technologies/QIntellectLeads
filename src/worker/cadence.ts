import { id, now } from './db'
import { addInteraction } from './lead-core'
import { addDaysToDate } from '../shared/timezone'
import type { CadencePlaybook, CadenceSettings } from '../shared/types'

export type CadenceKey = 'new-lead' | 'proposal'

function playbookFor(cadence: CadenceSettings, key: CadenceKey): CadencePlaybook {
  return key === 'new-lead' ? cadence.newLead : cadence.proposal
}

/**
 * Schedules every step in a cadence once per lead. The unique cadence_runs row
 * makes this safe to call from both lead creation and repeated status changes.
 */
export async function applyCadence(
  db: D1Database,
  owner: string,
  leadId: string,
  key: CadenceKey,
  baseDate: string,
  cadence: CadenceSettings,
): Promise<number> {
  const playbook = playbookFor(cadence, key)
  if (!playbook.enabled || !playbook.steps.length) return 0

  const claimed = await db
    .prepare(`INSERT OR IGNORE INTO cadence_runs (owner_sub, lead_id, cadence_key, applied_at) VALUES (?, ?, ?, ?)`)
    .bind(owner, leadId, key, now())
    .run()
  if (Number(claimed.meta.changes ?? 0) === 0) return 0

  let created = 0
  for (const step of playbook.steps) {
    const dueDate = addDaysToDate(baseDate, step.days)
    const duplicate = await db
      .prepare(`SELECT id FROM follow_ups WHERE owner_sub = ? AND lead_id = ? AND is_completed = 0 AND due_date = ? LIMIT 1`)
      .bind(owner, leadId, dueDate)
      .first<{ id: string }>()
    if (duplicate) continue
    await db
      .prepare(
        `INSERT INTO follow_ups (id, owner_sub, lead_id, due_date, due_time, creation_mode, is_completed, created_at)
         VALUES (?, ?, ?, ?, ?, 'Cadence', 0, ?)`,
      )
      .bind(id(), owner, leadId, dueDate, step.time, now())
      .run()
    created += 1
  }

  if (created) {
    const label = key === 'new-lead' ? 'New lead cadence' : 'Proposal follow-up cadence'
    await addInteraction(db, owner, leadId, {
      channel: 'System',
      outcome: 'Cadence scheduled',
      note: `${label}: ${created} follow-up${created === 1 ? '' : 's'} scheduled automatically.`,
    })
  }
  return created
}
