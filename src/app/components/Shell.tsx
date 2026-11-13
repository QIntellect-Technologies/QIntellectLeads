import { AlarmClock, CalendarClock, Handshake, LayoutGrid, ListChecks, LogOut, Menu as MenuIcon, MessageSquare, Phone, PhoneCall, ReceiptText, Search, Settings, ShieldCheck, TrendingUp, Upload, Users, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'

import { api, useMe } from '../lib/api'
import { cx } from '../lib/cx'
import { CommandPalette } from './CommandPalette'
import { Avatar, BrandMark } from './ui'

const links = [
  { to: '/', label: 'Today', icon: LayoutGrid, end: true },
  { to: '/next-actions', label: 'Next actions', icon: ListChecks },
  { to: '/follow-ups', label: 'Follow-ups', icon: AlarmClock },
  { to: '/calls', label: 'Calls', icon: PhoneCall },
  { to: '/calling-list', label: 'Calling list', icon: Phone },
  { to: '/leads', label: 'Leads', icon: Users },
  { to: '/pipeline', label: 'Pipeline', icon: Handshake },
  { to: '/meetings', label: 'Meetings', icon: CalendarClock },
  { to: '/templates', label: 'Templates', icon: MessageSquare },
  { to: '/invoices', label: 'Invoices', icon: ReceiptText },
  { to: '/reports', label: 'Reports', icon: TrendingUp },
  { to: '/data-health', label: 'Data health', icon: ShieldCheck },
  { to: '/import-export', label: 'Import / Export', icon: Upload },
]

export function Shell() {
  const { data: me } = useMe()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const location = useLocation()

  useEffect(() => setMobileOpen(false), [location.pathname])

  // Browser heartbeat covers hosts without cron. The server log makes the
  // morning/evening send idempotent, so multiple tabs or the dev scheduler
  // cannot send the same briefing twice.
  useEffect(() => {
    const tick = () => api('/settings/notifications/tick', { method: 'POST' }).catch(() => undefined)
    const timer = setInterval(tick, 60_000)
    const first = setTimeout(tick, 5_000)
    return () => {
      clearInterval(timer)
      clearTimeout(first)
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  async function signOut() {
    setSigningOut(true)
    try {
      await api('/auth/logout', { method: 'POST' })
      window.location.assign('/')
    } catch {
      setSigningOut(false)
    }
  }

  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

  const sidebar = (
    <div className="relative flex h-full flex-col px-3 py-4">
      <div className="flex h-11 items-center gap-2.5 px-2">
        <BrandMark size={31} inverted />
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-semibold tracking-[-0.035em] text-white">QIntellect Technologies</span>
          <span className="block truncate text-[10px] font-medium uppercase tracking-[0.14em] text-white/35">{me?.workspace.name ?? 'Leads workspace'}</span>
        </span>
      </div>

      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        className="mt-4 flex h-9 items-center gap-2 rounded-control border border-white/[0.09] bg-white/[0.055] px-2.5 text-[13px] text-white/50 transition-colors hover:bg-white/[0.09] hover:text-white/80"
      >
        <Search className="size-4" />
        <span className="flex-1 text-left">Search</span>
        <kbd className="rounded-[6px] border border-white/10 bg-white/[0.05] px-1.5 py-0.5 font-sans text-[10.5px] text-white/35">{isMac ? '⌘' : 'Ctrl'} K</kbd>
      </button>

      <p className="mb-1.5 mt-6 px-2.5 text-[9.5px] font-semibold uppercase tracking-[0.18em] text-white/25">Workspace</p>
      <nav className="flex flex-col gap-0.5">
        {links.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cx(
                'group relative flex h-9 items-center gap-2.5 rounded-[10px] px-2.5 text-[13.5px] font-medium transition-colors',
                isActive
                  ? 'bg-white/[0.09] text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.08)]'
                  : 'text-white/55 hover:bg-white/[0.05] hover:text-white/90',
              )
            }
          >
            {({ isActive }) => (
              <>
                <span
                  aria-hidden
                  className={cx(
                    'absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-[#aaa5ff] transition-opacity',
                    isActive ? 'opacity-100' : 'opacity-0',
                  )}
                />
                <Icon className={cx('size-4', isActive ? 'text-[#bbb7ff]' : 'text-white/45 group-hover:text-white/70')} />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-0.5 border-t border-white/[0.07] pt-3">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cx(
              'group relative flex h-9 items-center gap-2.5 rounded-[10px] px-2.5 text-[13.5px] font-medium transition-colors',
              isActive ? 'bg-white/[0.09] text-white' : 'text-white/55 hover:bg-white/[0.05] hover:text-white/90',
            )
          }
        >
          <Settings className="size-4 text-white/45" />
          Settings
        </NavLink>
        <button
          type="button"
          onClick={signOut}
          disabled={signingOut}
          className="flex h-9 items-center gap-2.5 rounded-[10px] px-2.5 text-[13.5px] font-medium text-white/55 transition-colors hover:bg-white/[0.05] hover:text-white/90 disabled:opacity-50"
        >
          <LogOut className="size-4 text-white/45" />
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
        {me && (
          <NavLink to="/settings" className="mt-1 flex items-center gap-2.5 rounded-control px-2 py-2 transition-colors hover:bg-white/[0.05]">
            <Avatar name={me.user.name ?? me.user.email ?? 'You'} hue={210} src={me.user.picture} size={28} className="ring-1 ring-white/15" />
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-medium text-white/85">{me.user.name ?? 'Signed in'}</span>
              {me.user.email && <span className="block truncate text-[11.5px] text-white/35">{me.user.email}</span>}
            </span>
          </NavLink>
        )}
      </div>
    </div>
  )

  return (
    <div className="flex h-full">
      <aside className="hidden w-[236px] shrink-0 p-2 lg:block">
        <div className="premium-dark relative h-full overflow-hidden rounded-[22px] shadow-[0_24px_60px_-32px_rgb(8_9_16/0.55)] ring-1 ring-white/[0.07]">
          <div aria-hidden className="premium-grid pointer-events-none absolute inset-0" />
          <span aria-hidden className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
          {sidebar}
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="fixed inset-x-0 top-0 z-30 flex h-12 items-center justify-between border-b border-white/[0.08] bg-[#101116]/95 px-3 text-white backdrop-blur-xl lg:hidden">
        <button type="button" aria-label="Open menu" onClick={() => setMobileOpen(true)} className="grid size-9 place-items-center rounded-control text-white/70 hover:bg-white/[0.06] hover:text-white">
          <MenuIcon className="size-5" />
        </button>
        <span className="flex min-w-0 items-center gap-2">
          <BrandMark size={23} inverted />
          <span className="truncate text-[13px] font-semibold tracking-tight">QIntellect</span>
        </span>
        <button type="button" aria-label="Search" onClick={() => setPaletteOpen(true)} className="grid size-9 place-items-center rounded-control text-white/70 hover:bg-white/[0.06] hover:text-white">
          <Search className="size-5" />
        </button>
      </div>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setMobileOpen(false)}>
          <div className="absolute inset-0 bg-[#08090f]/45 backdrop-blur-[2px]" />
          <aside className="premium-dark absolute inset-y-0 left-0 w-[280px] overflow-hidden text-white shadow-dialog" onClick={(e) => e.stopPropagation()}>
            <div aria-hidden className="premium-grid pointer-events-none absolute inset-0" />
            <button type="button" aria-label="Close menu" onClick={() => setMobileOpen(false)} className="absolute right-3 top-3 z-10 grid size-9 place-items-center rounded-control text-white/55 hover:bg-white/[0.06] hover:text-white">
              <X className="size-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <main className="min-w-0 flex-1 pt-12 lg:p-2 lg:pl-0 lg:pt-2">
        <div className="scrollbar-thin h-full overflow-y-auto bg-[#f8f9fc] lg:rounded-[22px] lg:border lg:border-white/80 lg:shadow-[0_1px_2px_rgb(20_21_29/0.04),0_26px_60px_-42px_rgb(20_21_29/0.45)]">
          <div key={location.pathname} className="h-full animate-fade">
            <Outlet />
          </div>
        </div>
      </main>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  )
}
