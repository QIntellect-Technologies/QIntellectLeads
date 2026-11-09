import { Hono } from 'hono'

import { privateJson } from '../auth'
import { id, now } from '../db'
import type { AppContext } from '../env'
import { asText } from '../lead-core'
import type { LeadTemplate } from '../../shared/types'

export const templates = new Hono<AppContext>()

const mapTemplate = (r: Record<string, unknown>): LeadTemplate => ({
  id: r.id as string,
  name: r.template_name as string,
  segment: (r.segment as string | null) ?? null,
  product: (r.product as string | null) ?? null,
  usageScenario: (r.usage_scenario as string | null) ?? null,
  body: r.message_body as string,
  createdAt: Number(r.created_at ?? 0),
})

templates.get('/', async (c) => {
  const rows = await c.get('db').prepare(`SELECT * FROM message_templates WHERE owner_sub = ? ORDER BY template_name ASC`).bind(c.get('user').sub).all()
  return privateJson(c, { items: (rows.results as Record<string, unknown>[]).map(mapTemplate) })
})

type TemplateInput = { name?: string; segment?: string | null; product?: string | null; usageScenario?: string | null; body?: string }

templates.post('/', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const input = await c.req.json<TemplateInput>()
  const name = asText(input.name, 120)
  const body = asText(input.body, 4000)
  if (!name) return c.json({ error: 'Template name is required.' }, 400)
  if (!body) return c.json({ error: 'Message body is required.' }, 400)
  const t = now()
  const templateId = id()
  await db
    .prepare(`INSERT INTO message_templates (id, owner_sub, template_name, segment, product, usage_scenario, message_body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(templateId, owner, name, asText(input.segment, 60), asText(input.product, 60), asText(input.usageScenario, 120), body, t, t)
    .run()
  const row = await db.prepare(`SELECT * FROM message_templates WHERE owner_sub = ? AND id = ?`).bind(owner, templateId).first()
  return privateJson(c, { template: mapTemplate(row as Record<string, unknown>) }, 201)
})

templates.patch('/:id', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const templateId = c.req.param('id')
  const existing = await db.prepare(`SELECT * FROM message_templates WHERE owner_sub = ? AND id = ?`).bind(owner, templateId).first<Record<string, unknown>>()
  if (!existing) return c.json({ error: 'Not found.' }, 404)
  const input = await c.req.json<TemplateInput>()
  const name = asText(input.name, 120) ?? (existing.template_name as string)
  const body = asText(input.body, 4000) ?? (existing.message_body as string)
  await db
    .prepare(`UPDATE message_templates SET template_name = ?, segment = ?, product = ?, usage_scenario = ?, message_body = ?, updated_at = ? WHERE owner_sub = ? AND id = ?`)
    .bind(
      name,
      input.segment === undefined ? (existing.segment as string | null) : asText(input.segment, 60),
      input.product === undefined ? (existing.product as string | null) : asText(input.product, 60),
      input.usageScenario === undefined ? (existing.usage_scenario as string | null) : asText(input.usageScenario, 120),
      body,
      now(),
      owner,
      templateId,
    )
    .run()
  const row = await db.prepare(`SELECT * FROM message_templates WHERE owner_sub = ? AND id = ?`).bind(owner, templateId).first()
  return privateJson(c, { template: mapTemplate(row as Record<string, unknown>) })
})

templates.delete('/:id', async (c) => {
  await c.get('db').prepare(`DELETE FROM message_templates WHERE owner_sub = ? AND id = ?`).bind(c.get('user').sub, c.req.param('id')).run()
  return privateJson(c, { ok: true })
})
