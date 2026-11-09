import type { FreebuffUser } from '@freebuff/auth'

export interface Env {
  ASSETS: Fetcher
  // Attached by Freebuff Sites once provisioned (sites_add_storage). Optional so
  // the app can explain what is missing instead of crashing.
  DB?: D1Database
  FILES?: R2Bucket
  // Injected on deploy once Sign in with Freebuff is enabled (sites_enable_auth).
  FREEBUFF_CLIENT_ID?: string
  FREEBUFF_ISSUER?: string
  APP_ORIGIN?: string
  // Optional overrides for the single workspace administrator. Defaults are
  // defined in auth.ts so a local install works without extra setup.
  ADMIN_EMAIL?: string
  ADMIN_PASSWORD?: string
  ADMIN_NAME?: string
  AUTH_SECRET?: string
  // Optional SMTP fallback for local development or Sites secrets. Values
  // entered in Settings are stored in D1 and take precedence.
  SMTP_HOST?: string
  SMTP_PORT?: string
  SMTP_USER?: string
  SMTP_PASSWORD?: string
  SMTP_FROM?: string
  EMAIL_TO?: string
}

export type Variables = {
  user: FreebuffUser
  db: D1Database
}

export type AppContext = { Bindings: Env; Variables: Variables }
