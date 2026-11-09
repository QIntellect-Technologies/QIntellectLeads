import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'

/**
 * Local development has no Cloudflare cron. While `npm run dev` is running,
 * sign in as the local admin and tick the same idempotent scheduler so morning
 * and evening briefings arrive even if the CRM tab is closed.
 */
function localEmailScheduler(): Plugin {
  return {
    name: 'qintellect-email-scheduler',
    apply: 'serve',
    configureServer(server) {
      let cookie = ''
      let busy = false
      const tick = async () => {
        if (busy) return
        const address = server.httpServer?.address()
        if (!address || typeof address === 'string') return
        busy = true
        try {
          const origin = `http://localhost:${address.port}`
          if (!cookie) {
            const login = await fetch(`${origin}/api/auth/login`, {
              method: 'POST',
              headers: { 'content-type': 'application/json', origin },
              body: JSON.stringify({
                email: process.env.ADMIN_EMAIL || 'admin@qintellecttechnologies.com',
                password: process.env.ADMIN_PASSWORD || 'admin123',
              }),
            })
            if (!login.ok) return
            const setCookie = login.headers.get('set-cookie')
            cookie = setCookie?.split(';')[0] ?? ''
          }
          const response = await fetch(`${origin}/api/settings/notifications/tick`, {
            method: 'POST',
            headers: { cookie, origin },
          })
          if (response.status === 401) cookie = ''
        } catch {
          // The dev server may still be starting; the next tick retries.
        } finally {
          busy = false
        }
      }
      const timer = setInterval(() => void tick(), 60_000)
      server.httpServer?.on('close', () => clearInterval(timer))
      setTimeout(() => void tick(), 8_000)
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare(), localEmailScheduler()],
  server: { port: 5173, strictPort: false },
})
