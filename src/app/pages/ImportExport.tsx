import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Upload } from 'lucide-react'
import { useRef, useState } from 'react'

import { Badge, Button, Card, PageHeader, Spinner, useToast } from '../components/ui'
import { previewImport, runImport, useInvalidate } from '../lib/api'
import { cx } from '../lib/cx'
import { LEGACY_STATUS_MAP, dmy, statusLabel } from '../../shared/leads'
import type { ImportPreview, ImportResult } from '../../shared/types'

const fieldLabels: Record<string, string> = {
  code: 'Lead ID',
  createdDate: 'Created date',
  source: 'Lead source',
  product: 'Product',
  status: 'Status',
  assignedTo: 'Assigned to',
  orgName: 'Organization',
  orgType: 'Organization type',
  city: 'City',
  headcount: 'Headcount',
  existingSystem: 'Existing system',
  contactName: 'Contact name',
  phone: 'Phone',
  designation: 'Designation',
  requirementSummary: 'Requirement summary',
  details: 'Requirement details',
  objection: 'Objection type',
  lossReason: 'Loss reason',
  internalRemarks: 'Internal remarks',
  lastNote: 'Last note',
  followUp: 'Follow-up date',
  templateName: 'Template name',
  templateSegment: 'Template segment',
  templateProduct: 'Template product',
  usageScenario: 'Usage scenario',
  templateBody: 'Message body',
}

export function ImportExport() {
  const toast = useToast()
  const invalidate = useInvalidate()
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [csv, setCsv] = useState('')
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function choose(file: File) {
    setBusy(true)
    setError(null)
    setResult(null)
    setPreview(null)
    setFileName(file.name)
    try {
      const text = await file.text()
      if (!text.trim()) {
        setError('That file is empty.')
        return
      }
      setCsv(text)
      setPreview(await previewImport(text))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that file.')
    } finally {
      setBusy(false)
    }
  }

  async function commit() {
    if (!csv) return
    setImporting(true)
    setError(null)
    try {
      const outcome = await runImport(csv)
      setResult(outcome)
      await invalidate('leads', 'lead', 'today', 'reports', 'templates', 'lead-search')
      toast(`Imported ${outcome.kind === 'templates' ? outcome.templates : outcome.imported} ${outcome.kind === 'templates' ? 'templates' : 'leads'}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.')
    } finally {
      setImporting(false)
    }
  }

  function downloadMapping() {
    const rows = [['Old status', 'New status'], ...Object.entries(LEGACY_STATUS_MAP).map(([raw, key]) => [raw, statusLabel(key)])]
    const csvText = rows.map((row) => row.map((cell) => (/[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join(',')).join('\r\n')
    const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'status-mapping.csv'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="mx-auto max-w-[1240px] p-4 sm:p-6 2xl:p-8">
      <PageHeader title="Import / Export" subtitle="Bring the Google Sheet in once, then export a CSV whenever you want a backup." />

      <div className="mt-6 grid gap-3 lg:grid-cols-2">
        <Card className="flex flex-col p-5">
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-tile bg-success-soft text-success">
              <Download className="size-4" />
            </span>
            <div>
              <h2 className="text-[14px] font-semibold">Export a backup</h2>
              <p className="text-[12.5px] text-muted">Every lead with its organization, contact, requirement and next follow-up.</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <a
              href="/api/export/leads.csv"
              className="inline-flex h-9 items-center gap-1.5 rounded-control bg-fg px-3.5 text-[13.5px] font-medium text-white transition-colors hover:bg-[#26262c]"
            >
              <Download className="size-4" />
              Download leads CSV
            </a>
            <Button onClick={downloadMapping}>
              <FileSpreadsheet />
              Status mapping
            </Button>
          </div>
          <p className="mt-3 text-[12px] text-faint">The CSV opens in Google Sheets or Excel. Dates are ISO; the app displays them as DD-MMM-YYYY.</p>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-tile bg-accent-soft text-accent">
              <Upload className="size-4" />
            </span>
            <div>
              <h2 className="text-[14px] font-semibold">Import the sheet</h2>
              <p className="text-[12.5px] text-muted">CSV only. Nothing is written until you review the preview.</p>
            </div>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && choose(e.target.files[0])}
          />
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button variant="primary" onClick={() => inputRef.current?.click()} loading={busy}>
              <Upload />
              Choose CSV file
            </Button>
            {fileName && <span className="truncate text-[12.5px] text-muted">{fileName}</span>}
          </div>
          <ul className="mt-3 grid gap-1.5 text-[12px] text-faint">
            <li>· Old statuses are mapped to the standard pipeline.</li>
            <li>· Existing lead IDs such as QT-001 are kept unchanged.</li>
            <li>· The old Last Note becomes the first interaction.</li>
            <li>· Empty rows and duplicate lead IDs are skipped.</li>
          </ul>
        </Card>
      </div>

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-control bg-danger-soft px-3 py-2.5 text-[13px] text-danger">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {error}
        </div>
      )}

      {busy && (
        <div className="mt-6 flex items-center gap-2 text-[13px] text-muted">
          <Spinner />
          Reading the file...
        </div>
      )}

      {preview && !result && (
        <div className="mt-6 flex flex-col gap-3">
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-[14px] font-semibold">{preview.kind === 'templates' ? 'Template import preview' : 'Lead import preview'}</h2>
                <p className="text-[12.5px] text-muted">
                  {preview.total} {preview.kind === 'templates' ? 'scripts' : 'rows'} ready · {preview.skipped} empty rows skipped
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {preview.existingCodes.length > 0 && <Badge tone="warning">{preview.existingCodes.length} existing IDs</Badge>}
                {preview.unmappedStatuses.length > 0 && <Badge tone="danger">{preview.unmappedStatuses.length} unknown statuses</Badge>}
                <Button variant="primary" onClick={commit} loading={importing}>
                  <CheckCircle2 />
                  {preview.kind === 'templates' ? `Import ${preview.total} templates` : `Import ${preview.total} leads`}
                </Button>
              </div>
            </div>

            {preview.unmappedStatuses.length > 0 && (
              <p className="mt-3 rounded-control bg-warning-soft px-3 py-2 text-[12.5px] text-warning">
                These statuses are not recognised and will import as New: {preview.unmappedStatuses.join(', ')}. Add them to the mapping document first if they should mean something else.
              </p>
            )}
            {preview.existingCodes.length > 0 && (
              <p className="mt-3 rounded-control bg-warning-soft px-3 py-2 text-[12.5px] text-warning">
                These lead IDs already exist and will be skipped: {preview.existingCodes.slice(0, 10).join(', ')}
                {preview.existingCodes.length > 10 ? ` and ${preview.existingCodes.length - 10} more` : ''}.
              </p>
            )}
          </Card>

          <div className="grid gap-3 lg:grid-cols-2">
            <Card className="p-5">
              <h3 className="text-[13px] font-semibold">Columns detected</h3>
              <ul className="mt-2 divide-y divide-line">
                {Object.entries(preview.mapping).map(([field, header]) => (
                  <li key={field} className="flex items-center justify-between gap-3 py-1.5 text-[12.5px]">
                    <span className="text-muted">{fieldLabels[field] ?? field}</span>
                    <span className="truncate font-medium">{header}</span>
                  </li>
                ))}
                {Object.keys(preview.mapping).length === 0 && <li className="py-2 text-[12.5px] text-faint">No known columns found.</li>}
              </ul>
            </Card>

            <Card className="p-5">
              <h3 className="text-[13px] font-semibold">Status mapping</h3>
              <ul className="mt-2 max-h-[280px] divide-y divide-line overflow-y-auto scrollbar-thin">
                {preview.statuses.map((status) => (
                  <li key={status.raw} className="flex items-center justify-between gap-3 py-1.5 text-[12.5px]">
                    <span className="truncate text-muted">{status.raw}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="tabular-nums text-faint">{status.count}</span>
                      {status.mapped ? <Badge tone="success">{statusLabel(status.mapped)}</Badge> : <Badge tone="danger">New</Badge>}
                    </span>
                  </li>
                ))}
                {preview.statuses.length === 0 && <li className="py-2 text-[12.5px] text-faint">No status column found.</li>}
              </ul>
            </Card>
          </div>

          {preview.kind === 'leads' && preview.rows.length > 0 && (
            <Card className="overflow-hidden">
              <div className="border-b border-line px-5 py-3">
                <h3 className="text-[13px] font-semibold">First rows</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-[12.5px]">
                  <thead>
                    <tr className="h-9 border-b border-line bg-bg/60 text-muted">
                      <th className="px-4 font-medium">Line</th>
                      <th className="px-4 font-medium">Lead ID</th>
                      <th className="px-4 font-medium">Contact</th>
                      <th className="px-4 font-medium">Organization</th>
                      <th className="px-4 font-medium">Phone</th>
                      <th className="px-4 font-medium">Status</th>
                      <th className="px-4 font-medium">Follow-up</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {preview.rows.map((row) => (
                      <tr key={row.line} className="h-9">
                        <td className="px-4 tabular-nums text-faint">{row.line}</td>
                        <td className="px-4 tabular-nums">{row.code ?? <span className="text-faint">new</span>}</td>
                        <td className="truncate px-4">{row.name ?? <span className="text-faint">—</span>}</td>
                        <td className="truncate px-4 text-muted">{row.org ?? '—'}</td>
                        <td className="px-4 tabular-nums text-muted">{row.phone ?? '—'}</td>
                        <td className="px-4">
                          <span className={cx(row.status ? 'text-fg' : 'text-danger')}>{row.status ? statusLabel(row.status) : row.statusRaw ?? 'New'}</span>
                        </td>
                        <td className="px-4 tabular-nums text-muted">{row.followUp ? dmy(row.followUp) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {preview.kind === 'templates' && (
            <Card className="p-5 text-[12.5px] text-muted">
              This file looks like the WhatsApp scripts sheet: {preview.total} templates will be added, {preview.skipped} empty rows skipped.
            </Card>
          )}
        </div>
      )}

      {result && (
        <Card className="mt-6 p-5">
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-tile bg-success-soft text-success">
              <CheckCircle2 className="size-4" />
            </span>
            <div>
              <h2 className="text-[14px] font-semibold">Import finished</h2>
              <p className="text-[12.5px] text-muted">
                {result.kind === 'templates'
                  ? `${result.templates} templates imported · ${result.skipped} skipped`
                  : `${result.imported} leads imported · ${result.skipped} skipped · ${result.interactions} notes restored · ${result.templates} templates`}
              </p>
            </div>
          </div>
          {result.errors.length > 0 && (
            <div className="mt-3 rounded-control bg-warning-soft p-3 text-[12px] text-warning">
              <p className="font-medium">Warnings</p>
              <ul className="mt-1 max-h-[200px] list-disc overflow-y-auto pl-4">
                {result.errors.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-4 flex gap-2">
            <a href="/leads" className="inline-flex h-9 items-center rounded-control bg-fg px-3.5 text-[13.5px] font-medium text-white hover:bg-[#26262c]">
              Open leads
            </a>
            <Button onClick={() => (setResult(null), setPreview(null), setFileName(null), setCsv(''), inputRef.current?.click())}>Import another file</Button>
          </div>
        </Card>
      )}
    </div>
  )
}
