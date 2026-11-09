import { Hono } from 'hono'

import { privateJson } from '../auth'
import type { AppContext } from '../env'
import { runDueEmails, sendProgressEmail, sendTestEmail } from '../email'
import { SettingsError, notificationSettingsForApi, saveNotificationSettings } from '../settings'
import type { NotificationSettingsInput } from '../../shared/types'

export const notifications = new Hono<AppContext>()

notifications.get('/settings/notifications', async (c) => {
  const settings = await notificationSettingsForApi(c.get('db'), c.get('user').sub, c.env)
  return privateJson(c, settings)
})

notifications.put('/settings/notifications', async (c) => {
  const input = await c.req.json<NotificationSettingsInput>()
  if (
    typeof input?.enabled !== 'boolean' ||
    typeof input.morningEnabled !== 'boolean' ||
    typeof input.eveningEnabled !== 'boolean' ||
    typeof input.timezone !== 'string' ||
    typeof input.morningTime !== 'string' ||
    typeof input.eveningTime !== 'string'
  ) {
    return c.json({ error: 'Invalid notification settings.' }, 400)
  }
  try {
    await saveNotificationSettings(c.get('db'), c.get('user').sub, c.env, input)
    const settings = await notificationSettingsForApi(c.get('db'), c.get('user').sub, c.env)
    return privateJson(c, settings)
  } catch (error) {
    if (error instanceof SettingsError) return c.json({ error: error.message }, 400)
    throw error
  }
})

notifications.post('/settings/notifications/test', async (c) => {
  const input = await c.req.json<{ kind?: 'morning' | 'evening' }>().catch(() => ({} as { kind?: 'morning' | 'evening' }))
  const kind = input.kind === 'evening' ? 'evening' : 'morning'
  try {
    await sendTestEmail(c.env, c.get('user').sub, kind)
    const settings = await notificationSettingsForApi(c.get('db'), c.get('user').sub, c.env)
    return privateJson(c, { ok: true, settings })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Could not send the test email.' }, 400)
  }
})

notifications.post('/settings/notifications/send-now', async (c) => {
  try {
    await sendProgressEmail(c.env, c.get('user').sub)
    const settings = await notificationSettingsForApi(c.get('db'), c.get('user').sub, c.env)
    return privateJson(c, { ok: true, settings })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Could not send the progress email.' }, 400)
  }
})

// Called by the local dev scheduler and the browser heartbeat. The once-per-day
// email_log claim makes concurrent calls safe.
notifications.post('/settings/notifications/tick', async (c) => {
  const result = await runDueEmails(c.env)
  return privateJson(c, result)
})
