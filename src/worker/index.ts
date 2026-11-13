import { Hono } from 'hono'

import { authMode, getAuth, handleLogin, handleLogout, requireUser } from './auth'
import { requireDb } from './db'
import { runDueEmails } from './email'
import type { AppContext, Env } from './env'
import { activities } from './routes/activities'
import { companies } from './routes/companies'
import { contacts } from './routes/contacts'
import { deals } from './routes/deals'
import { calls } from './routes/calls'
import { callingList } from './routes/calling-list'
import { files } from './routes/files'
import { insights } from './routes/insights'
import { invoices } from './routes/invoices'
import { leadActivity } from './routes/lead-activity'
import { leadBackup } from './routes/lead-backup'
import { leads } from './routes/leads'
import { notifications } from './routes/notifications'
import { productivity } from './routes/productivity'
import { tasks } from './routes/tasks'
import { templates } from './routes/templates'
import { workspace } from './routes/workspace'

const app = new Hono<AppContext>()

// Public: lets the app know how to sign in before any private call.
app.get('/api/auth/status', (c) => {
  const mode = authMode(c.env, c.req.raw)
  c.header('Cache-Control', 'private, no-store')
  return c.json({ mode, database: Boolean(c.env.DB), files: Boolean(c.env.FILES) })
})

app.get('/api/health', (c) => c.json({ ok: true }))

app.post('/api/auth/login', handleLogin)
app.post('/api/auth/logout', handleLogout)

const api = new Hono<AppContext>()
api.use('*', requireUser, requireDb)
// Lead management routes come first: /search and /today are lead-specific.
api.route('/', leadBackup)
api.route('/', insights)
api.route('/', productivity)
api.route('/', notifications)
api.route('/', invoices)
api.route('/', calls)
api.route('/', callingList)
api.route('/templates', templates)
api.route('/leads', leads)
api.route('/', leadActivity)
// The original CRM endpoints stay mounted for older workspaces.
api.route('/', workspace)
api.route('/contacts', contacts)
api.route('/companies', companies)
api.route('/deals', deals)
api.route('/tasks', tasks)
api.route('/activities', activities)
api.route('/files', files)
app.route('/api', api)

app.onError((error, c) => {
  console.error(error)
  return c.json({ error: 'Something went wrong.' }, 500)
})

app.notFound((c) => (c.req.path.startsWith('/api/') ? c.json({ error: 'Not found.' }, 404) : c.env.ASSETS.fetch(c.req.raw)))

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Sign in with Freebuff owns /auth/freebuff/* and keeps sessions fresh. It
    // wraps the whole app once per isolate; without a client ID the app falls
    // back to the loopback development user (see auth.ts).
    const auth = getAuth(env, request)
    const handler = (req: Request) => Promise.resolve(app.fetch(req, env, ctx))
    return auth ? auth.wrap(handler)(request) : handler(request)
  },
  scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): void {
    ctx.waitUntil(runDueEmails(env))
  },
}
