import { LogOut } from 'lucide-react'
import { useState } from 'react'

import { EmailSettings } from '../components/email-settings'
import { Avatar, Badge, Button, ConfirmDialog, Field, Input, PageHeader, useToast } from '../components/ui'
import { api, useApiMutation, useDataSummary, useMe } from '../lib/api'

export function Settings() {
  const { data: me } = useMe()
  const { data: summary } = useDataSummary()
  const toast = useToast()
  const [name, setName] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)

  const rename = useApiMutation((value: string) => api('/workspace', { method: 'PATCH', json: { name: value } }), ['me'], {
    onSuccess: () => toast('Workspace renamed'),
  })
  const clear = useApiMutation(() => api('/workspace/data', { method: 'DELETE' }), ['me', 'today', 'leads', 'lead', 'reports', 'templates', 'lead-search', 'meetings', 'data-summary'], {
    onSuccess: () => {
      setConfirm(false)
      toast('Workspace cleared')
    },
  })
  const signOut = useApiMutation(() => api('/auth/logout', { method: 'POST' }), [], {
    onSuccess: () => window.location.assign('/'),
  })

  if (!me) return null
  const value = name ?? me.workspace.name

  return (
    <div className="mx-auto max-w-[1080px] p-5 sm:p-8">
      <PageHeader title="Settings" />

      <section className="mt-8">
        <h2 className="text-[14px] font-semibold">Account</h2>
        <div className="mt-3 flex items-center gap-4 rounded-card border border-line/80 bg-surface p-4 shadow-card">
          <Avatar name={me.user.name ?? me.user.email ?? 'You'} hue={210} src={me.user.picture} size={48} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-medium">{me.user.name ?? 'Signed in'}</p>
            {me.user.email && <p className="truncate text-[13px] text-muted">{me.user.email}</p>}
          </div>
          <Button onClick={() => signOut.mutate(undefined)} loading={signOut.isPending}>
            <LogOut />
            Sign out
          </Button>
        </div>
      </section>

      <EmailSettings />

      <section className="mt-8">
        <h2 className="text-[14px] font-semibold">Workspace</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (value.trim() && value !== me.workspace.name) rename.mutate(value.trim())
          }}
          className="mt-3 flex items-end gap-2"
        >
          <Field label="Name" className="flex-1">
            <Input value={value} onChange={(e) => setName(e.target.value)} maxLength={60} />
          </Field>
          <Button variant="primary" type="submit" loading={rename.isPending} disabled={!value.trim() || value === me.workspace.name}>
            Save
          </Button>
        </form>
      </section>

      <section className="mt-8">
        <h2 className="text-[14px] font-semibold">Connections</h2>
        <ul className="mt-3 divide-y divide-line rounded-card border border-line/80 bg-surface shadow-card">
          {[
            ['Database', me.capabilities.database, 'D1 via the DB binding'],
            ['Sign-in', me.capabilities.auth !== 'development', me.capabilities.auth === 'password' ? 'Email and password' : 'Freebuff account'],
          ].map(([label, ok, detail]) => (
            <li key={label as string} className="flex h-13 items-center gap-3 px-4">
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-medium">{label}</span>
                <span className="block truncate text-[12px] text-faint">{detail}</span>
              </span>
              <Badge tone={ok ? 'success' : 'neutral'} dot>
                {ok ? 'Connected' : 'Not connected'}
              </Badge>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[14px] font-semibold">Imported data</h2>
            <p className="mt-0.5 text-[12.5px] text-muted">Coverage from QT-Leads-WhatsAPP.xlsx.</p>
          </div>
          <Badge tone="success" dot>
            Accounted for
          </Badge>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ['Leads', summary?.counts.leads],
            ['History entries', summary?.counts.interactions],
            ['Follow-ups', summary?.counts.followUps],
            ['Meetings', summary?.counts.meetings],
            ['Contacts', summary?.counts.contacts],
            ['Templates', summary?.counts.templates],
            ['Organizations', summary?.counts.organizations],
            ['Requirements', summary?.counts.requirements],
          ].map(([label, count]) => (
            <div key={label as string} className="rounded-control border border-line/80 bg-surface p-3 shadow-card">
              <p className="text-[11.5px] text-faint">{label}</p>
              <p className="mt-1 text-[19px] font-semibold tabular-nums">{typeof count === 'number' ? count.toLocaleString() : '—'}</p>
            </div>
          ))}
        </div>
        <ul className="mt-3 divide-y divide-line rounded-card border border-line/80 bg-surface text-[12.5px] shadow-card">
          {[
            ['Master_Leads', 'All 354 leads, contacts, requirements and current status', 'Imported'],
            ['History', 'All 3,080 rows kept; 3,099 timeline entries including notes', 'Imported'],
            ['Queries', 'All 46 WhatsApp and call scripts', 'Imported'],
            ['Sheet1', 'Scratch notes merged where they added new detail', 'Merged'],
            ['Settings', 'Statuses, sources, salespeople and company types', 'Used'],
            ['FollowUps_Internal', 'Same 207 follow-up dates as Master — not duplicated', 'Skipped'],
            ['Logger', 'Script error log — not lead data', 'Ignored'],
          ].map(([tab, detail, status]) => (
            <li key={tab} className="flex items-start gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{tab}</span>
                <span className="block text-[12px] text-muted">{detail}</span>
              </span>
              <Badge tone={status === 'Imported' || status === 'Merged' || status === 'Used' ? 'success' : 'neutral'}>{status}</Badge>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11.5px] text-faint">
          Known gaps: QT-072 and QT-320 have no loss reason in the sheet, and undated meeting notes stay in the lead history.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-[14px] font-semibold">Data</h2>
        <div className="mt-3 divide-y divide-line rounded-card border border-line/80 bg-surface shadow-card">
          <div className="flex items-center gap-3 p-4">
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-medium">Back up your data</span>
              <span className="block text-[12.5px] text-muted">Download every lead, contact, note and follow-up as a CSV from Import / Export.</span>
            </span>
            <Button onClick={() => (window.location.href = '/api/export/leads.csv')}>Download</Button>
          </div>
          <div className="flex items-center gap-3 p-4">
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-medium">Clear workspace</span>
              <span className="block text-[12.5px] text-muted">Deletes every lead, interaction, follow-up, meeting and template. This cannot be undone.</span>
            </span>
            <Button variant="danger" onClick={() => setConfirm(true)}>
              Clear
            </Button>
          </div>
        </div>
      </section>

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => clear.mutate(undefined)}
        loading={clear.isPending}
        title="Clear the workspace?"
        description="Every lead, interaction, follow-up, meeting and WhatsApp template is deleted. The workspace stays empty."
        confirmLabel="Clear everything"
      />
    </div>
  )
}
