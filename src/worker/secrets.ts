import type { Env } from './env'

/**
 * Small at-rest box for the SMTP app password. The password is never returned
 * to the browser. A deployment should set AUTH_SECRET so the key is not the
 * local default; local development still works without extra setup.
 */
const encoder = new TextEncoder()
const decoder = new TextDecoder()

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

let cachedKey: { material: string; key: Promise<CryptoKey> } | undefined

function keyFor(env: Env): Promise<CryptoKey> {
  const material = env.AUTH_SECRET?.trim() || 'qintellect-local-smtp-box'
  if (cachedKey?.material !== material) {
    cachedKey = {
      material,
      key: crypto.subtle
        .digest('SHA-256', encoder.encode(`qintellect:smtp:${material}`))
        .then((digest) => crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])),
    }
  }
  return cachedKey.key
}

export async function encryptSecret(env: Env, value: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, await keyFor(env), encoder.encode(value)),
  )
  return `enc:v1:${toBase64(iv)}:${toBase64(encrypted)}`
}

export async function decryptSecret(env: Env, value: string | null | undefined): Promise<string | null> {
  if (!value) return null
  if (!value.startsWith('enc:v1:')) return value
  try {
    const [, , ivText, payloadText] = value.split(':')
    if (!ivText || !payloadText) return null
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(ivText) as BufferSource },
      await keyFor(env),
      fromBase64(payloadText) as BufferSource,
    )
    return decoder.decode(decrypted)
  } catch {
    return null
  }
}
