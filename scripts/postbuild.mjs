// Strips files the Sites uploader refuses (hidden files and source maps)
// from the build output, so `deploy.json` can point straight at dist/.
import { readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

function clean(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (name.startsWith('.') || name.endsWith('.map')) {
      rmSync(path, { recursive: true, force: true })
      continue
    }
    if (statSync(path).isDirectory()) {
      clean(path)
      continue
    }
    // Wrangler rejects a bundle whose sourceMappingURL points at a map that
    // Sites does not upload. Strip the comment whenever the map is removed.
    if (name.endsWith('.js') || name.endsWith('.mjs')) {
      const source = readFileSync(path, 'utf8')
      const stripped = source.replace(/\n?\/\/# sourceMappingURL=[^\n\r]*/g, '')
      if (stripped !== source) writeFileSync(path, stripped)
    }
  }
}

clean(fileURLToPath(new URL('../dist', import.meta.url)))
