import { connect } from 'cloudflare:sockets'

/**
 * Minimal SMTP client for Cloudflare Workers. It supports implicit TLS (465)
 * and STARTTLS (usually 587), which covers Gmail and Google Workspace app
 * passwords without pulling a Node-only mail package into the Worker.
 */
export interface SmtpConfig {
  host: string
  port: number
  user: string
  password: string
  from: string
  to: string
}

export interface MailMessage {
  subject: string
  html: string
  text: string
}

const encoder = new TextEncoder()

function base64(value: string): string {
  const bytes = encoder.encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function wrapBase64(value: string, width = 76): string {
  const encoded = base64(value)
  return encoded.match(new RegExp(`.{1,${width}}`, 'g'))?.join('\r\n') ?? ''
}

function header(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim()
}

function encodedSubject(value: string): string {
  const subject = header(value)
  return /^[\x20-\x7E]*$/.test(subject) ? subject : `=?UTF-8?B?${base64(subject)}?=`
}

function messageId(from: string): string {
  const domain = from.split('@')[1]?.replace(/[^a-z0-9.-]/gi, '') || 'qintellect.local'
  return `<${crypto.randomUUID()}@${domain}>`
}

function buildMime(config: SmtpConfig, message: MailMessage): string {
  const boundary = `qintellect-${crypto.randomUUID()}`
  const recipients = config.to
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .join(', ')
  return [
    `Date: ${new Date().toUTCString()}`,
    `From: QIntellect CRM <${header(config.from)}>`,
    `To: ${header(recipients)}`,
    `Subject: ${encodedSubject(message.subject)}`,
    `Message-ID: ${messageId(config.from)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrapBase64(message.text),
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrapBase64(message.html),
    '',
    `--${boundary}--`,
    '',
  ].join('\r\n')
}

class SmtpLineClient {
  private socket: Socket
  private reader: ReadableStreamDefaultReader<Uint8Array>
  private writer: WritableStreamDefaultWriter<Uint8Array>
  private buffer = ''
  private decoder = new TextDecoder()

  constructor(socket: Socket) {
    this.socket = socket
    this.reader = socket.readable.getReader()
    this.writer = socket.writable.getWriter()
  }

  private async readChunk(timeoutMs = 20_000): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('SMTP server timed out.')), timeoutMs)
    })
    try {
      const result = await Promise.race([this.reader.read(), timeout])
      if (result.done) throw new Error('SMTP server closed the connection.')
      this.buffer += this.decoder.decode(result.value, { stream: true })
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  private async readLine(timeoutMs = 20_000): Promise<string> {
    for (;;) {
      const index = this.buffer.indexOf('\r\n')
      if (index >= 0) {
        const line = this.buffer.slice(0, index)
        this.buffer = this.buffer.slice(index + 2)
        return line
      }
      await this.readChunk(timeoutMs)
    }
  }

  async readResponse(timeoutMs = 20_000): Promise<{ code: number; message: string }> {
    const lines: string[] = []
    let code = 0
    for (;;) {
      const line = await this.readLine(timeoutMs)
      lines.push(line)
      if (/^\d{3}/.test(line)) code = Number(line.slice(0, 3))
      if (line.length < 4 || line[3] !== '-') break
    }
    return { code, message: lines.join('\n') }
  }

  async command(value: string, expected: number[] | number, timeoutMs = 20_000): Promise<{ code: number; message: string }> {
    await this.writer.write(encoder.encode(`${value}\r\n`))
    const response = await this.readResponse(timeoutMs)
    const accepted = Array.isArray(expected) ? expected : [expected]
    if (!accepted.includes(response.code)) {
      throw new Error(`SMTP ${response.code || 'error'}: ${response.message.replace(/\s+/g, ' ').slice(0, 180)}`)
    }
    return response
  }

  async writeData(value: string): Promise<void> {
    await this.writer.write(encoder.encode(value))
  }

  async startTls(host: string): Promise<void> {
    this.reader.releaseLock()
    this.writer.releaseLock()
    this.socket = this.socket.startTls({ expectedServerHostname: host })
    await this.socket.opened
    this.reader = this.socket.readable.getReader()
    this.writer = this.socket.writable.getWriter()
    this.buffer = ''
    this.decoder = new TextDecoder()
  }

  async close(): Promise<void> {
    try {
      await this.writer.write(encoder.encode('QUIT\r\n'))
    } catch {
      /* best effort */
    }
    try {
      this.reader.releaseLock()
      this.writer.releaseLock()
    } catch {
      /* locks may already be released */
    }
    try {
      await this.socket.close()
    } catch {
      /* best effort */
    }
  }
}

export async function sendSmtpMail(config: SmtpConfig, message: MailMessage): Promise<void> {
  if (!config.host || !config.user || !config.password) {
    throw new Error('SMTP is not fully configured. Add the Gmail address and app password in Settings.')
  }
  if (!config.to.trim()) throw new Error('Add at least one briefing recipient in Settings.')
  const secure = config.port === 465
  const socket = connect(
    { hostname: config.host, port: config.port },
    { secureTransport: secure ? 'on' : 'off', allowHalfOpen: false },
  )
  const client = new SmtpLineClient(socket)
  try {
    await socket.opened
    const greeting = await client.readResponse()
    if (greeting.code !== 220) throw new Error(`SMTP greeted with ${greeting.code}.`)

    await client.command('EHLO qintellect.local', 250)
    if (!secure) {
      await client.command('STARTTLS', 220)
      await client.startTls(config.host)
      await client.command('EHLO qintellect.local', 250)
    }

    await client.command('AUTH LOGIN', 334)
    await client.command(base64(config.user), 334)
    try {
      await client.command(base64(config.password), 235)
    } catch {
      throw new Error('Gmail rejected the SMTP login. Check the Gmail address and app password in Settings.')
    }

    await client.command(`MAIL FROM:<${header(config.from)}>`, 250)
    const recipients = config.to
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
    for (const recipient of recipients) {
      await client.command(`RCPT TO:<${header(recipient)}>`, [250, 251])
    }
    await client.command('DATA', 354)

    const mime = buildMime(config, message)
    const dotStuffed = mime
      .split('\r\n')
      .map((line) => (line.startsWith('.') ? `.${line}` : line))
      .join('\r\n')
    await client.writeData(`${dotStuffed}\r\n.\r\n`)
    const accepted = await client.readResponse(30_000)
    if (accepted.code !== 250) {
      throw new Error(`SMTP did not accept the message (${accepted.code}).`)
    }
    await client.close()
  } catch (error) {
    await client.close()
    throw error
  }
}
