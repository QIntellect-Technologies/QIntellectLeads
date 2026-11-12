import { AnimatePresence, motion } from 'motion/react'
import { Handshake, LayoutGrid, PhoneCall, Search, TrendingUp, Upload, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'

import { useLeadSearch } from '../lib/api'
import { cx } from '../lib/cx'
import { priorityLevel, statusLabel } from '../../shared/leads'
import { Avatar } from './ui'

type Item = { key: string; label: string; detail?: string; to: string; icon: React.ReactNode }

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const navigate = useNavigate()
  const { data } = useLeadSearch(q)

  useEffect(() => {
    if (!open) {
      setQ('')
      setActive(0)
    }
  }, [open])

  const items = useMemo<Item[]>(() => {
    if (!data) return []
    return data.leads.map((lead) => ({
      key: `l-${lead.id}`,
      label: `${lead.name ?? 'Unnamed'}${lead.orgName ? ` · ${lead.orgName}` : ''}`,
      detail: `${lead.code} · ${statusLabel(lead.status)} · ${priorityLevel(lead.priorityScore)}`,
      to: `/leads/${lead.id}`,
      icon: <Avatar name={lead.name ?? lead.code} hue={210} size={24} />,
    }))
  }, [data])

  const shortcuts: Item[] = [
    { key: 's-today', label: 'Go to today', to: '/', icon: <LayoutGrid className="size-4 text-muted" /> },
    { key: 's-leads', label: 'Go to leads', to: '/leads', icon: <Users className="size-4 text-muted" /> },
    { key: 's-calls', label: 'Go to calls', to: '/calls', icon: <PhoneCall className="size-4 text-muted" /> },
    { key: 's-pipeline', label: 'Go to pipeline', to: '/pipeline', icon: <Handshake className="size-4 text-muted" /> },
    { key: 's-reports', label: 'Go to reports', to: '/reports', icon: <TrendingUp className="size-4 text-muted" /> },
    { key: 's-import', label: 'Import or export', to: '/import-export', icon: <Upload className="size-4 text-muted" /> },
  ]
  const list = q.trim() ? items : shortcuts

  useEffect(() => setActive(0), [q, list.length])

  function go(item: Item) {
    onClose()
    navigate(item.to)
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center bg-fg/25 px-4 pt-[12vh] backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            role="dialog"
            aria-label="Search"
            className="w-full max-w-[560px] overflow-hidden rounded-dialog bg-surface shadow-dialog"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex h-12 items-center gap-3 border-b border-line px-4">
              <Search className="size-4 text-faint" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') (e.preventDefault(), setActive((a) => Math.min(a + 1, list.length - 1)))
                  if (e.key === 'ArrowUp') (e.preventDefault(), setActive((a) => Math.max(a - 1, 0)))
                  if (e.key === 'Enter' && list[active]) go(list[active])
                  if (e.key === 'Escape') onClose()
                }}
                placeholder="Search leads by name, number, company or QT number"
                className="h-full flex-1 bg-transparent text-[14px] outline-none placeholder:text-faint"
              />
            </div>
            <ul className="max-h-[50vh] overflow-y-auto p-1.5">
              {q.trim() && list.length === 0 && <li className="px-3 py-8 text-center text-[13.5px] text-muted">Nothing matches “{q}”</li>}
              {list.map((item, i) => (
                <li key={item.key}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(item)}
                    className={cx('flex h-11 w-full items-center gap-3 rounded-control px-2.5 text-left', i === active && 'bg-surface-2')}
                  >
                    {item.icon}
                    <span className="min-w-0 flex-1 truncate text-[13.5px]">{item.label}</span>
                    {item.detail && <span className="truncate text-[12px] text-faint">{item.detail}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
