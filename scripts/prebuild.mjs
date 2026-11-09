// Start from a clean output tree. The Cloudflare Vite plugin names its Worker
// output after the Worker, so a renamed Worker must not leave a stale bundle
// that `wrangler deploy` could pick up instead.
import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

rmSync(fileURLToPath(new URL('../dist', import.meta.url)), { recursive: true, force: true })
