import { Hono } from 'hono'

import { privateJson } from '../auth'
import type { AppContext } from '../env'
import { listLeads } from '../lead-core'
import { PLACEHOLDERS, phoneKey, todayISO } from '../../shared/leads'
import type { DataHealthData, FollowUpRow, LeadListItem, NextActionsData } from '../../shared/types'

export const productivity = new Hono<AppContext>()

const DAY = 86_400_000

productivity.get('/next-actions', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const today = todayISO()
  const items = await listLeads(db, owner, 'l.owner_sub = ? AND l.archived = 0', [owner])
  const leadMap = new Map(items.map((lead) => [lead.id, lead]))
  const [followRows, stats, meetings, meetingStats] = await db.batch([
    db
      .prepare(
        `SELECT f.* FROM follow_ups f JOIN leads l ON l.id = f.lead_id AND l.owner_sub = f.owner_sub
         WHERE f.owner_sub = ? AND f.is_completed = 0 AND l.archived = 0
         ORDER BY f.due_date ASC, COALESCE(f.due_time, '') ASC LIMIT 500`,
      )
      .bind(owner),
    db
      .prepare(
        `SELECT COUNT(*) AS completed_today, COALESCE(SUM(CASE WHEN due_date = ? THEN 1 ELSE 0 END), 0) AS today_done
         FROM follow_ups WHERE owner_sub = ? AND completed_on = ?`,
      )
      .bind(today, owner, today),
    db
      .prepare(
        `SELECT m.* FROM meetings m JOIN leads l ON l.id = m.lead_id AND l.owner_sub = m.owner_sub
         WHERE m.owner_sub = ? AND m.scheduled_at LIKE ? AND l.archived = 0
         ORDER BY m.scheduled_at ASC LIMIT 100`,
      )
      .bind(owner, `${today}%`),
    db
      .prepare(
        `SELECT COUNT(*) AS done FROM meetings m JOIN leads l ON l.id = m.lead_id AND l.owner_sub = m.owner_sub
         WHERE m.owner_sub = ? AND m.scheduled_at LIKE ? AND m.meeting_status = 'Done' AND l.archived = 0`,
      )
      .bind(owner, `${today}%`),
  ])

  const queue: FollowUpRow[] = []
  for (const row of followRows.results as Record<string, unknown>[]) {
    const lead = leadMap.get(row.lead_id as string)
    if (!lead) continue
    queue.push({
      lead,
      followUp: {
        id: row.id as string,
        dueDate: row.due_date as string,
        dueTime: (row.due_time as string | null) ?? null,
        mode: (row.creation_mode as 'Auto' | 'Manual' | 'Cadence') ?? 'Manual',
        completed: false,
        completedOn: (row.completed_on as string | null) ?? null,
        rescheduleReason: (row.reschedule_reason as string | null) ?? null,
        createdAt: Number(row.created_at ?? 0),
      },
    })
  }
  const todayRows = queue.filter((row) => row.followUp.dueDate === today)
  const overdue = queue.filter((row) => row.followUp.dueDate < today)
  const upcoming = queue.filter((row) => row.followUp.dueDate > today).slice(0, 15)
  const openStatus = (lead: LeadListItem) => lead.status !== 'won' && lead.status !== 'lost'
  const noNextStep = items
    .filter((lead) => openStatus(lead) && !lead.nextFollowUp)
    .sort((a, b) => b.priorityScore - a.priorityScore)

  const meetingRows = meetings.results ?? []
  const body: NextActionsData = {
    today,
    queue: [...overdue, ...todayRows, ...upcoming].slice(0, 60),
    noNextStep: noNextStep.slice(0, 40),
    progress: {
      completedToday: Number((stats.results?.[0] as { completed_today?: number } | undefined)?.completed_today ?? 0),
      todayDone: Number((stats.results?.[0] as { today_done?: number } | undefined)?.today_done ?? 0),
      pendingToday: todayRows.length,
      overdue: overdue.length,
      meetingsToday: meetingRows.length,
      meetingsDone: Number((meetingStats.results?.[0] as { done?: number } | undefined)?.done ?? 0),
      meetingsPending: meetingRows.filter((row) => (row as Record<string, unknown>).meeting_status === 'Scheduled').length,
    },
  }
  return privateJson(c, body)
})

productivity.get('/data-health', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const items = await listLeads(db, owner, 'l.owner_sub = ? AND l.archived = 0', [owner])
  const openLeads = items.filter((lead) => lead.status !== 'won' && lead.status !== 'lost')
  const noNextStep = openLeads.filter((lead) => !lead.nextFollowUp).sort((a, b) => b.priorityScore - a.priorityScore)
  const missingPhone = items.filter((lead) => !lead.contactPhone?.trim())
  const placeholderSet = new Set(PLACEHOLDERS.map((value) => value.toLowerCase()))
  const placeholderNames = items.filter((lead) => {
    const name = lead.contactName?.trim().toLowerCase()
    return Boolean(name && placeholderSet.has(name))
  })
  const stale = items
    .filter((lead) => {
      if (lead.priorityScore < 60) return false
      const last = new Date(lead.lastInteractionAt ?? `${lead.createdDate}T00:00:00`).getTime()
      return Number.isFinite(last) && Date.now() - last > 14 * DAY
    })
    .sort((a, b) => b.priorityScore - a.priorityScore)

  const groups = new Map<string, LeadListItem[]>()
  for (const lead of items) {
    const key = phoneKey(lead.contactPhone)
    if (key.length < 7) continue
    const group = groups.get(key) ?? []
    group.push(lead)
    groups.set(key, group)
  }
  const duplicates = [...groups.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([phone, group]) => ({
      phone,
      leads: group.map((lead) => ({
        id: lead.id,
        code: lead.code,
        contactName: lead.contactName,
        orgName: lead.orgName,
        status: lead.status,
        assignedTo: lead.assignedTo,
      })),
    }))
    .sort((a, b) => b.leads.length - a.leads.length)

  const body: DataHealthData = {
    counts: {
      noNextStep: noNextStep.length,
      duplicateGroups: duplicates.length,
      missingPhone: missingPhone.length,
      placeholderNames: placeholderNames.length,
      stale: stale.length,
    },
    noNextStep: noNextStep.slice(0, 40),
    duplicates: duplicates.slice(0, 30),
    missingPhone: missingPhone.slice(0, 40),
    placeholderNames: placeholderNames.slice(0, 40),
    stale: stale.slice(0, 40),
  }
  return privateJson(c, body)
})
