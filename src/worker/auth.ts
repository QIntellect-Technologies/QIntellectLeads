import { createFreebuffAuth, isSameOriginRequest } from '@freebuff/auth'
import type { FreebuffAuth, FreebuffUser } from '@freebuff/auth'
import type { Context, MiddlewareHandler } from 'hono'
import { deleteCookie, setCookie } from 'hono/cookie'

import type { AppContext, Env } from './env'

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]'])

const DEFAULT_ADMIN_EMAIL = 'admin@qintellecttechnologies.com'
const DEFAULT_ADMIN_PASSWORD = 'admin123'
const SESSION_COOKIE = 'qintellect_session'
const SESSION_AGE_SECONDS = 60 * 60 * 24 * 7
const encoder = new TextEncoder()

export type AuthMode = 'password' | 'freebuff' | 'development'

export function isLoopback(request: Request): boolean {
  return LOOPBACK.has(new URL(request.url).hostname)
}

export function authMode(_env: Env, _request: Request): AuthMode {
  return 'password'
}

/** The admin keeps the original workspace owner ID so existing data stays put. */
function adminUser(env: Env): FreebuffUser {
  return {
    sub: 'dev-user',
    name: env.ADMIN_NAME?.trim() || 'Admin',
    email: (env.ADMIN_EMAIL?.trim() || DEFAULT_ADMIN_EMAIL).toLowerCase(),
    email_verified: true,
  }
}

function adminPassword(env: Env): string {
  return env.ADMIN_PASSWORD ?? DEFAULT_ADMIN_PASSWORD
}

function sessionSecret(env: Env): string {
  return env.AUTH_SECRET || `qintellect:${adminUser(env).email}:${adminPassword(env)}`
}

function base64url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  const binary = atob(padded)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

async function hmac(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return base64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value))))
}

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index++) difference |= left[index] ^ right[index]
  return difference === 0
}

function readCookie(request: Request, name: string): string | null {
  const matches = (request.headers.get('cookie') ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${name}=`))
  if (matches.length !== 1) return null
  try {
    return decodeURIComponent(matches[0].slice(name.length + 1))
  } catch {
    return null
  }
}

async function createSession(env: Env, user: FreebuffUser): Promise<string> {
  const payload = base64url(
    encoder.encode(JSON.stringify({ sub: user.sub, name: user.name, email: user.email, exp: Date.now() + SESSION_AGE_SECONDS * 1000 })),
  )
  return `${payload}.${await hmac(payload, sessionSecret(env))}`
}

async function readSession(env: Env, request: Request): Promise<FreebuffUser | null> {
  const token = readCookie(request, SESSION_COOKIE)
  if (!token) return null
  const [payload, signature] = token.split('.')
  if (!payload || !signature) return null
  const expected = await hmac(payload, sessionSecret(env))
  if (signature.length !== expected.length) return null
  let difference = 0
  for (let index = 0; index < signature.length; index++) difference |= signature.charCodeAt(index) ^ expected.charCodeAt(index)
  if (difference !== 0) return null

  try {
    const data = JSON.parse(new TextDecoder().decode(fromBase64url(payload))) as {
      sub?: unknown
      name?: unknown
      email?: unknown
      exp?: unknown
    }
    if (typeof data.sub !== 'string' || typeof data.exp !== 'number' || data.exp < Date.now()) return null
    return {
      sub: data.sub,
      name: typeof data.name === 'string' ? data.name : undefined,
      email: typeof data.email === 'string' ? data.email : undefined,
      email_verified: true,
    }
  } catch {
    return null
  }
}

async function verifyCredentials(env: Env, email: string, password: string): Promise<FreebuffUser | null> {
  const expectedEmail = adminUser(env).email?.toLowerCase() ?? DEFAULT_ADMIN_EMAIL
  const [actualHash, expectedHash] = await Promise.all([digest(password), digest(adminPassword(env))])
  if (email.trim().toLowerCase() !== expectedEmail || !bytesEqual(actualHash, expectedHash)) return null
  return adminUser(env)
}

function setSessionCookie(c: Context<AppContext>, request: Request, token: string) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: new URL(request.url).protocol === 'https:',
    path: '/',
    maxAge: SESSION_AGE_SECONDS,
  })
}

export async function handleLogin(c: Context<AppContext>) {
  const request = c.req.raw
  if (!isSameOriginRequest(request, appOrigin(c.env, request))) {
    return c.json({ error: 'Cross-origin request refused.' }, 403)
  }
  const body = await c.req.json<{ email?: unknown; password?: unknown }>().catch(() => null)
  const email = typeof body?.email === 'string' ? body.email.trim() : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  if (!email || !password) return c.json({ error: 'Email and password are required.' }, 400)

  const user = await verifyCredentials(c.env, email, password)
  if (!user) {
    c.header('Cache-Control', 'private, no-store')
    return c.json({ error: 'Incorrect email or password.' }, 401)
  }

  setSessionCookie(c, request, await createSession(c.env, user))
  c.header('Cache-Control', 'private, no-store')
  return c.json({ user: { sub: user.sub, name: user.name, email: user.email } })
}

export function handleLogout(c: Context<AppContext>) {
  const request = c.req.raw
  if (!isSameOriginRequest(request, appOrigin(c.env, request))) {
    return c.json({ error: 'Cross-origin request refused.' }, 403)
  }
  deleteCookie(c, SESSION_COOKIE, { path: '/' })
  c.header('Cache-Control', 'private, no-store')
  return c.json({ ok: true })
}

let cached: { key: string; auth: FreebuffAuth } | undefined

/** One auth instance per isolate; recreated only if the config changes. */
export function getAuth(env: Env, request: Request): FreebuffAuth | null {
  if (!env.FREEBUFF_CLIENT_ID) return null
  const baseUrl = env.APP_ORIGIN ?? new URL(request.url).origin
  const key = `${env.FREEBUFF_CLIENT_ID}|${env.FREEBUFF_ISSUER ?? ''}|${baseUrl}`
  if (cached?.key !== key) {
    cached = {
      key,
      auth: createFreebuffAuth({
        clientId: env.FREEBUFF_CLIENT_ID,
        issuer: env.FREEBUFF_ISSUER || undefined,
        baseUrl,
        allowInsecureLocalhost: new URL(baseUrl).protocol === 'http:' && LOOPBACK.has(new URL(baseUrl).hostname),
      }),
    }
  }
  return cached.auth
}

export async function currentUser(env: Env, request: Request): Promise<FreebuffUser | null> {
  const session = await readSession(env, request)
  if (session) return session
  const auth = getAuth(env, request)
  if (!auth) return null
  try {
    return await auth.getUser(request)
  } catch {
    return null
  }
}

export function appOrigin(env: Env, request: Request): string {
  return env.APP_ORIGIN ?? new URL(request.url).origin
}

/** Requires a signed-in user and, for mutations, a same-origin request. */
export const requireUser: MiddlewareHandler<AppContext> = async (c, next) => {
  const request = c.req.raw
  if (request.method !== 'GET' && request.method !== 'HEAD' && !isSameOriginRequest(request, appOrigin(c.env, request))) {
    return c.json({ error: 'Cross-origin request refused.' }, 403)
  }
  const user = await currentUser(c.env, request)
  if (!user) return c.json({ error: 'Sign in required.' }, 401)
  c.set('user', user)
  await next()
}

export function privateJson<T>(c: Context<AppContext>, body: T, status = 200) {
  c.header('Cache-Control', 'private, no-store')
  return c.json(body as never, status as never)
}
