import { motion } from 'motion/react'
import {
  AlertCircle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Database,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from 'lucide-react'
import { useState, type FormEvent } from 'react'

import { Avatar, Button, Input } from '../components/ui'
import { api } from '../lib/api'

// Shown when /api/me returns 401. The Worker validates the credentials and
// sets an HttpOnly session cookie, so the browser never stores the password.
export function SignIn() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const currentPath = `${window.location.pathname}${window.location.search}`
  const returnTo = currentPath.startsWith('/') && !currentPath.startsWith('//') ? currentPath : '/'

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await api('/auth/login', { method: 'POST', json: { email, password } })
      window.location.assign(returnTo)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not sign in.')
      setBusy(false)
    }
  }

  return (
    <div className="grid h-full lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
      <div className="scrollbar-thin relative flex h-full min-h-0 flex-col overflow-y-auto bg-bg">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_50%_at_10%_0%,rgb(90_85_222/0.08),transparent),radial-gradient(50%_40%_at_90%_100%,rgb(29_154_102/0.05),transparent)]" />

        <div className="relative flex items-center gap-2.5 p-7 sm:p-10">
          <span className="grid size-9 place-items-center rounded-[11px] bg-fg text-white shadow-[0_8px_20px_-10px_rgb(20_20_24/0.6)]">
            <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden>
              <circle cx="9" cy="9" r="3.2" />
              <path d="M3.5 19c.8-3.6 3.2-5.5 5.5-5.5s4.7 1.9 5.5 5.5z" />
              <circle cx="17" cy="8" r="2.2" />
              <path d="M14 14.5c.5-2 1.8-3 3-3s2.5 1 3 3z" />
            </svg>
          </span>
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold leading-tight tracking-tight">QIntellect Technologies</span>
            <span className="mt-0.5 block text-[10.5px] font-semibold uppercase tracking-[0.16em] text-faint">Leads workspace</span>
          </span>
        </div>

        <div className="relative flex flex-1 items-center justify-center px-7 py-10 sm:px-10">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-[400px]"
          >
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] font-medium text-muted shadow-card">
              <ShieldCheck className="size-3.5 text-success" />
              Secure admin access
            </span>

            <h1 className="mt-5 text-balance text-[34px] font-semibold leading-[1.08] tracking-[-0.03em]">Welcome back.</h1>
            <p className="mt-2.5 max-w-sm text-[14.5px] leading-relaxed text-muted">
              Sign in to pick up your leads, follow-ups and today&apos;s conversations.
            </p>

            <form onSubmit={submit} className="mt-8 flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium">Email address</span>
                <span className="relative block">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-faint" />
                  <Input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    autoComplete="username"
                    placeholder="you@qintellecttechnologies.com"
                    autoFocus
                    required
                    disabled={busy}
                    className="h-11 rounded-[13px] pl-10"
                  />
                </span>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium">Password</span>
                <span className="relative block">
                  <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-faint" />
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    required
                    disabled={busy}
                    className="h-11 rounded-[13px] pl-10 pr-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-[9px] text-faint transition-colors hover:bg-surface-2 hover:text-fg"
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </span>
              </label>

              {error && (
                <p role="alert" className="flex items-start gap-2 rounded-control border border-danger/15 bg-danger-soft px-3 py-2.5 text-[12.5px] leading-relaxed text-danger">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  {error}
                </p>
              )}

              <Button type="submit" variant="primary" loading={busy} className="mt-1 h-11 rounded-[13px] text-[13.5px]">
                {busy ? 'Signing in' : 'Sign in to workspace'}
                {!busy && <ArrowRight />}
              </Button>
            </form>

            <div className="mt-5 flex items-center gap-2 text-[11.5px] text-faint">
              <LockKeyhole className="size-3.5" />
              <span>Protected session. Expires automatically after 7 days.</span>
            </div>

            <p className="mt-8 border-t border-line pt-5 text-[12px] leading-relaxed text-faint">
              Access is limited to the QIntellect sales administrator. Contact your workspace owner if you need another account.
            </p>
          </motion.div>
        </div>

        <div className="relative flex items-center justify-between gap-3 px-7 py-6 text-[11.5px] text-faint sm:px-10">
          <span>© {new Date().getFullYear()} QIntellect Technologies</span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-success" />
            Systems operational
          </span>
        </div>
      </div>

      <div className="relative hidden min-h-0 overflow-hidden bg-[#111116] lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(80%_60%_at_72%_18%,rgb(90_85_222/0.30),transparent),radial-gradient(55%_55%_at_10%_85%,rgb(29_154_102/0.18),transparent)]" />
        <div
          className="absolute inset-0 opacity-[0.055] [mask-image:radial-gradient(ellipse_at_center,black,transparent_78%)]"
          style={{
            backgroundImage:
              'linear-gradient(rgb(255 255 255 / 0.8) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255 / 0.8) 1px, transparent 1px)',
            backgroundSize: '42px 42px',
          }}
        />
        <div className="absolute -right-24 top-1/3 size-80 rounded-full bg-accent/20 blur-[110px]" />
        <div className="absolute -bottom-20 left-1/4 size-72 rounded-full bg-success/10 blur-[100px]" />

        <div className="relative flex h-full flex-col p-10 xl:p-14">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[11px] font-medium text-white/65 backdrop-blur">
              <Sparkles className="size-3.5 text-[#a7a3ff]" />
              Live workspace preview
            </span>
            <span className="text-[11.5px] font-medium uppercase tracking-[0.14em] text-white/30">QIntellect Leads</span>
          </div>

          <div className="mt-10 max-w-[500px] xl:mt-12">
            <p className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-[#a7a3ff]">Built for follow-through</p>
            <h2 className="mt-3 text-balance text-[38px] font-semibold leading-[1.06] tracking-[-0.035em] text-white xl:text-[44px]">
              Every lead, followed through.
            </h2>
            <p className="mt-4 max-w-md text-[14px] leading-relaxed text-white/50">
              Conversations, next steps and the full history in one calm view — so nothing goes quiet for too long.
            </p>
          </div>

          <div className="relative mt-8 flex min-h-0 flex-1 items-center">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
              className="relative mx-auto w-full max-w-[560px]"
            >
              <div className="rounded-[26px] border border-white/10 bg-white/[0.07] p-2 shadow-[0_40px_100px_-30px_rgb(0_0_0/0.8)] backdrop-blur-sm">
                <div className="overflow-hidden rounded-[19px] bg-[#fbfbfd]">
                  <div className="flex items-center justify-between border-b border-[#e9e9ef] px-4 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <span className="grid size-7 place-items-center rounded-[9px] bg-fg text-white">
                        <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor" aria-hidden>
                          <circle cx="9" cy="9" r="3.2" />
                          <path d="M3.5 19c.8-3.6 3.2-5.5 5.5-5.5s4.7 1.9 5.5 5.5z" />
                        </svg>
                      </span>
                      <div>
                        <p className="text-[12.5px] font-semibold leading-tight">Today</p>
                        <p className="text-[10.5px] text-[#9494a0]">Monday, 09 November</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-[#eeedfc] px-2 py-1 text-[10px] font-semibold text-[#5a55de]">17 due today</span>
                      <Avatar name="Admin" hue={210} size={24} />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 px-4 py-3.5">
                    {[
                      { label: 'Due today', value: '17', tone: 'text-[#c27a12]', bar: 'bg-[#e7a83d]' },
                      { label: 'Overdue', value: '160', tone: 'text-[#d4462f]', bar: 'bg-[#e77964]' },
                      { label: 'High priority', value: '27', tone: 'text-[#5a55de]', bar: 'bg-[#8c88ec]' },
                    ].map((item) => (
                      <div key={item.label} className="rounded-[12px] border border-[#ececf1] bg-white p-2.5">
                        <p className="text-[10px] font-medium text-[#8b8b98]">{item.label}</p>
                        <p className={`mt-1 text-[19px] font-semibold tracking-[-0.03em] ${item.tone}`}>{item.value}</p>
                        <span className={`mt-2 block h-[2px] w-8 rounded-full ${item.bar}`} />
                      </div>
                    ))}
                  </div>

                  <div className="px-4 pb-4">
                    <div className="flex items-center justify-between">
                      <p className="text-[11.5px] font-semibold">Follow-ups</p>
                      <span className="text-[10.5px] text-[#9b9ba6]">See all</span>
                    </div>
                    <ul className="mt-2 divide-y divide-[#f0f0f4]">
                      {[
                        { name: 'Ayesha Khan', org: 'Northstar Academy', due: 'Today · 10:30', hue: 215, tone: 'warning' },
                        { name: 'Bilal Ahmed', org: 'Meridian Foods', due: '2 days overdue', hue: 155, tone: 'danger' },
                        { name: 'Sana Malik', org: 'Clifton Dental', due: 'Tomorrow · 12:00', hue: 335, tone: 'muted' },
                      ].map((lead) => (
                        <li key={lead.name} className="flex items-center gap-2.5 py-2.5">
                          <Avatar name={lead.name} hue={lead.hue} size={26} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[11.5px] font-medium">{lead.name}</span>
                            <span className="block truncate text-[10.5px] text-[#9b9ba6]">{lead.org}</span>
                          </span>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[9.5px] font-semibold ${
                              lead.tone === 'danger'
                                ? 'bg-[#fdebe8] text-[#d4462f]'
                                : lead.tone === 'warning'
                                  ? 'bg-[#fdf1df] text-[#c27a12]'
                                  : 'bg-[#f3f3f5] text-[#6a6a76]'
                            }`}
                          >
                            {lead.due}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              <motion.div
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: 0.45, ease: [0.22, 1, 0.36, 1] }}
                className="absolute -right-4 top-12 hidden w-[156px] rounded-[16px] border border-white/10 bg-[#1b1b23]/95 p-3.5 text-white shadow-[0_24px_50px_-20px_rgb(0_0_0/0.9)] backdrop-blur xl:block"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[9.5px] font-semibold uppercase tracking-[0.13em] text-white/40">Priority</span>
                  <TrendingUp className="size-3.5 text-[#8f8aff]" />
                </div>
                <p className="mt-1.5 text-[26px] font-semibold leading-none tracking-[-0.04em]">92</p>
                <p className="mt-1 text-[10px] text-white/45">High intent · B2B</p>
                <div className="mt-3 flex items-end gap-1">
                  {[38, 55, 44, 72, 64, 88, 100].map((height, index) => (
                    <span key={index} className="flex-1 rounded-sm bg-[#8f8aff]" style={{ height: `${height * 0.22}px`, opacity: 0.35 + index * 0.09 }} />
                  ))}
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: 0.55, ease: [0.22, 1, 0.36, 1] }}
                className="absolute -bottom-7 -left-5 hidden w-[230px] rounded-[16px] border border-white/10 bg-white/95 p-3.5 shadow-[0_24px_60px_-20px_rgb(0_0_0/0.65)] backdrop-blur xl:block"
              >
                <div className="flex items-center gap-2">
                  <span className="grid size-7 place-items-center rounded-[9px] bg-[#e5f6ed] text-[#1d9a66]">
                    <MessageCircle className="size-3.5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[10.5px] font-semibold">WhatsApp follow-up</p>
                    <p className="text-[9.5px] text-[#9b9ba6]">Ayesha Khan · just now</p>
                  </div>
                </div>
                <p className="mt-2.5 rounded-[10px] rounded-tl-[3px] bg-[#f3f3f5] px-2.5 py-2 text-[10.5px] leading-relaxed text-[#4d4d58]">
                  Shared the proposal. I&apos;ll follow up Friday morning.
                </p>
                <p className="mt-2 flex items-center gap-1 text-[9.5px] font-medium text-[#1d9a66]">
                  <CheckCircle2 className="size-3" />
                  Logged to lead history
                </p>
              </motion.div>
            </motion.div>
          </div>

          <div className="mt-10 grid grid-cols-3 gap-3 border-t border-white/10 pt-6 xl:mt-8">
            {[
              { icon: CalendarClock, label: 'Follow-ups', detail: 'Never miss a due date' },
              { icon: MessageCircle, label: 'Conversations', detail: 'Every touch stays attached' },
              { icon: TrendingUp, label: 'Clear reporting', detail: 'Know what is moving' },
            ].map(({ icon: Icon, label, detail }) => (
              <div key={label} className="flex items-start gap-2.5">
                <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-[9px] border border-white/10 bg-white/[0.05] text-white/55">
                  <Icon className="size-3.5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[11.5px] font-medium text-white/80">{label}</span>
                  <span className="mt-0.5 block text-[10.5px] leading-snug text-white/35">{detail}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function SetupNeeded({ message }: { message: string }) {
  return (
    <div className="grid h-full place-items-center p-6">
      <div className="max-w-md text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-card bg-surface-2 text-muted">
          <Database className="size-5" />
        </div>
        <h1 className="mt-4 text-[20px] font-semibold tracking-tight">Almost there</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">{message}</p>
        <p className="mt-4 text-[13px] text-faint">In Freebuff, ask the agent to add D1 storage named DB and R2 storage named FILES, then deploy again.</p>
      </div>
    </div>
  )
}
