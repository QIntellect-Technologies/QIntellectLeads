import { Check, ClipboardCopy, MessageSquare, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { TemplateForm } from '../components/lead-forms'
import { Badge, Button, Card, ConfirmDialog, EmptyState, PageHeader, Skeleton, useToast } from '../components/ui'
import { api, useApiMutation, useTemplates } from '../lib/api'
import { PLACEHOLDERS, fillTemplate } from '../../shared/leads'
import type { LeadTemplate } from '../../shared/types'

const sample = {
  name: 'Sample Contact',
  firstName: 'Sample',
  company: 'Sample Organization',
  product: 'AI Attendance System',
  city: 'Lahore',
  orgType: 'School',
  leadCode: 'QT-000',
  designation: 'Manager',
  myName: 'Imran',
}

export function Templates() {
  const { data, isLoading } = useTemplates()
  const toast = useToast()
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<LeadTemplate | undefined>()
  const [deleting, setDeleting] = useState<LeadTemplate | undefined>()
  const [copied, setCopied] = useState<string | null>(null)
  const remove = useApiMutation((id: string) => api(`/templates/${id}`, { method: 'DELETE' }), ['templates', 'lead'], {
    onSuccess: () => {
      setDeleting(undefined)
      toast('Template deleted')
    },
  })

  async function copy(template: LeadTemplate) {
    try {
      await navigator.clipboard.writeText(fillTemplate(template.body, sample))
      setCopied(template.id)
      toast('Message copied')
      window.setTimeout(() => setCopied(null), 1800)
    } catch {
      toast('Could not copy. Select the text instead.', 'danger')
    }
  }

  return (
    <div className="mx-auto max-w-[1240px] p-4 sm:p-6 2xl:p-8">
      <PageHeader
        title="WhatsApp templates"
        subtitle="The full script library. Each lead shows its most relevant scripts with that lead's details filled in."
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus />
            New template
          </Button>
        }
      />

      <div className="mt-5 flex flex-wrap items-center gap-1.5 rounded-control bg-surface-2 px-3 py-2 text-[12px] text-muted">
        <span className="font-medium text-fg">Placeholders:</span>
        {PLACEHOLDERS.map((placeholder) => (
          <code key={placeholder} className="rounded-[5px] bg-surface px-1.5 py-0.5 text-[11.5px]">{`[${placeholder}]`}</code>
        ))}
      </div>

      {isLoading ? (
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[190px] rounded-card" />
          ))}
        </div>
      ) : data && data.items.length === 0 ? (
        <Card className="mt-5">
          <EmptyState
            icon={<MessageSquare />}
            title="No templates yet"
            description="Add the scripts your team sends on WhatsApp so nobody copies from another sheet."
            action={
              <Button variant="primary" onClick={() => setCreating(true)}>
                <Plus />
                New template
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {data?.items.map((template) => (
            <Card key={template.id} className="flex flex-col p-4">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-[14px] font-semibold">{template.name}</h2>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {template.segment && <Badge tone="accent">{template.segment}</Badge>}
                    {template.product && <Badge tone="neutral">{template.product}</Badge>}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <Button variant="ghost" size="icon-sm" aria-label="Edit template" onClick={() => setEditing(template)}>
                    <Pencil />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label="Delete template" onClick={() => setDeleting(template)}>
                    <Trash2 />
                  </Button>
                </div>
              </div>
              {template.usageScenario && <p className="mt-1.5 text-[12px] text-faint">{template.usageScenario}</p>}
              <p className="mt-3 flex-1 whitespace-pre-wrap rounded-control bg-bg p-3 text-[12.5px] leading-relaxed text-fg/90">{fillTemplate(template.body, sample)}</p>
              <div className="mt-3">
                <Button size="sm" onClick={() => copy(template)}>
                  {copied === template.id ? <Check /> : <ClipboardCopy />}
                  {copied === template.id ? 'Copied' : 'Copy message'}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <p className="mt-6 text-[12px] text-faint">
        Pricing and discount scripts are hidden automatically for leads postponed for a personal or family reason.
      </p>

      <TemplateForm open={creating} onClose={() => setCreating(false)} />
      <TemplateForm open={Boolean(editing)} initial={editing} onClose={() => setEditing(undefined)} />
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(undefined)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        loading={remove.isPending}
        title={`Delete ${deleting?.name ?? 'template'}?`}
        description="It disappears from every lead. Existing sent messages are not affected."
      />
    </div>
  )
}
