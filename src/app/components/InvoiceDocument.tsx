import type { InvoiceInput, InvoiceSettings, InvoiceTotals } from '../../shared/types'
import { formatInvoiceMoney, invoiceAmountInWords } from '../../shared/invoice'

export type InvoiceDocumentData = Omit<InvoiceInput, 'packageNumber' | 'employees' | 'additionalUsers' | 'branches'> & {
  number?: string
  packageNumber?: number | null
  employees?: number
  additionalUsers?: number
  branches?: number
}

function formatDate(value: string) {
  if (!value) return '—'
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
}

export function InvoiceDocument({
  settings,
  data,
  totals,
  className = '',
}: {
  settings: InvoiceSettings
  data: InvoiceDocumentData
  totals: InvoiceTotals
  className?: string
}) {
  const isQuote = data.kind === 'Quotation'
  const title = isQuote ? 'QUOTATION' : 'TAX INVOICE'
  const money = (value: number) => formatInvoiceMoney(value, data.currency || settings.currency)
  const company = settings.company
  const client = data.client
  const plan = settings.pricing.packages.find((item) => item.number === data.packageNumber) ?? null
  const statusClass =
    data.status === 'Paid' || data.status === 'Accepted'
      ? 'border-emerald-300/30 bg-emerald-400/15 text-emerald-200'
      : data.status === 'Cancelled' || data.status === 'Expired'
        ? 'border-rose-300/30 bg-rose-400/15 text-rose-200'
        : 'border-white/15 bg-white/10 text-white/75'

  return (
    <article
      className={`invoice-print relative flex w-[210mm] min-h-[297mm] flex-col overflow-hidden bg-white text-[#17181f] shadow-[0_28px_80px_-24px_rgba(8,9,16,0.5)] ring-1 ring-black/[0.06] ${className}`}
      style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
    >
      <div className="h-[6px] w-full bg-gradient-to-r from-[#6f69ff] via-[#25262e] to-[#38c183]" />

      <header className="premium-dark relative overflow-hidden px-[11mm] pb-[6mm] pt-[7mm] text-white shadow-[inset_0_-1px_0_rgb(255_255_255/0.07)]">
        <div className="premium-grid pointer-events-none absolute inset-0" aria-hidden />
        <div className="pointer-events-none absolute -right-24 -top-28 size-[95mm] rounded-full bg-[#5a55de]/20 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-32 left-[18%] size-[75mm] rounded-full bg-[#1d9a66]/10 blur-3xl" aria-hidden />

        <div className="relative flex items-start justify-between gap-6">
          <div className="flex items-start gap-3.5">
            <div className="grid size-[70px] shrink-0 place-items-center overflow-hidden rounded-full bg-white p-[3px] shadow-[0_8px_24px_rgba(0,0,0,0.18)] ring-1 ring-white/30">
              <img src="/qintellect-logo.svg" alt="QIntellect Technologies" className="size-full object-contain" />
            </div>
            <div className="pt-0.5">
              <div className="text-[19px] font-extrabold leading-tight tracking-[-0.025em]">{company.displayName || company.legalName}</div>
              <div className="mt-1 max-w-[92mm] text-[9.2px] font-medium leading-[1.65] text-white/60">{company.tagline}</div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[9px] text-white/75">
                {company.contact && <span>{company.contact}</span>}
                {company.email && <span>{company.email}</span>}
                {company.website && <span>{company.website}</span>}
              </div>
              {company.address && <div className="mt-0.5 max-w-[88mm] text-[8.5px] leading-relaxed text-white/50">{company.address}</div>}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[9px] font-bold tracking-[0.3em] text-[#b8b4ff]">{title}</div>
            <div className="mt-1 max-w-[62mm] truncate text-[19px] font-extrabold leading-tight tracking-[-0.02em]" title={data.number || 'Auto-generated'}>{data.number || 'AUTO-GENERATED'}</div>
            <div className={`mt-1.5 inline-flex rounded-full border px-2.5 py-[3px] text-[7.5px] font-bold uppercase tracking-[0.14em] ${statusClass}`}>
              {data.status}
            </div>
          </div>
        </div>

        <div className="relative mt-[5mm] grid grid-cols-4 divide-x divide-white/10 overflow-hidden rounded-[8px] border border-white/10 bg-white/[0.055]">
          <div className="px-3 py-2.5">
            <div className="text-[7px] font-semibold uppercase tracking-[0.16em] text-white/45">{isQuote ? 'Quotation date' : 'Invoice date'}</div>
            <div className="mt-0.5 text-[10.5px] font-semibold text-white">{formatDate(data.issueDate)}</div>
          </div>
          <div className="px-3 py-2.5">
            <div className="text-[7px] font-semibold uppercase tracking-[0.16em] text-white/45">{isQuote ? 'Valid until' : 'Payment due'}</div>
            <div className="mt-0.5 text-[10.5px] font-semibold text-white">{formatDate(isQuote ? data.validUntil : data.dueDate)}</div>
          </div>
          <div className="px-3 py-2.5">
            <div className="text-[7px] font-semibold uppercase tracking-[0.16em] text-white/45">Currency / NTN</div>
            <div className="mt-0.5 text-[10.5px] font-semibold text-white">{data.currency || settings.currency} · {company.ntn || '—'}</div>
          </div>
          <div className="bg-[#1d9a66]/15 px-3 py-2.5">
            <div className="text-[7px] font-semibold uppercase tracking-[0.16em] text-[#9ce9bf]">{isQuote ? 'Estimated total' : 'Balance due'}</div>
            <div className="mt-0.5 truncate text-[13.5px] font-extrabold leading-tight tracking-[-0.02em] text-[#82e8b0]">{money(totals.total)}</div>
          </div>
        </div>
      </header>

      <div className="pointer-events-none absolute right-[9mm] top-[102mm] select-none text-[150px] font-black leading-none text-[#101116]/[0.024]" aria-hidden>Q</div>

      <div className="relative flex-1 px-[11mm] pt-[5.5mm]">
        <div className="grid grid-cols-[1.35fr_0.85fr] gap-5">
          <div className="border-l-[3px] border-[#6f69ff] pl-3">
            <div className="text-[7.5px] font-bold uppercase tracking-[0.18em] text-[#8a96a7]">{isQuote ? 'Prepared for' : 'Bill to'}</div>
            <div className="mt-1 text-[14px] font-bold leading-snug text-[#17181f]">{client.company || client.name || 'Client name'}</div>
            {client.company && client.name && <div className="mt-0.5 text-[10.5px] font-semibold text-[#4b5160]">{client.name}</div>}
            <div className="mt-1.5 space-y-0.5 text-[10.2px] leading-relaxed text-[#617084]">
              {client.address && <div className="whitespace-pre-line">{client.address}</div>}
              {client.phone && <div>{client.phone}</div>}
              {client.email && <div>{client.email}</div>}
            </div>
          </div>

          <div className="rounded-[8px] border border-[#e2e9f1] bg-[#f8fafc] px-3.5 py-3">
            <div className="text-[7px] font-bold uppercase tracking-[0.16em] text-[#8a96a7]">Project</div>
            <div className="mt-0.5 text-[10.2px] font-semibold leading-snug text-[#202129]">{data.subject || 'AI Attendance System — Implementation & Subscription'}</div>
            <div className="mt-2 grid grid-cols-2 gap-2 border-t border-[#e5ebf2] pt-2">
              <div>
                <div className="text-[7px] font-semibold uppercase tracking-[0.12em] text-[#9aa5b4]">Plan</div>
                <div className="mt-0.5 text-[9px] font-semibold text-[#353641]">{plan ? plan.label : 'Custom'}</div>
              </div>
              <div>
                <div className="text-[7px] font-semibold uppercase tracking-[0.12em] text-[#9aa5b4]">Team size</div>
                <div className="mt-0.5 text-[9px] font-semibold text-[#353641]">{data.employees ? `${data.employees.toLocaleString()} employees` : '—'}</div>
              </div>
            </div>
          </div>
        </div>

        <table className="mt-4 w-full table-fixed border-collapse">
          <thead>
            <tr className="bg-[#101116] text-white">
              <th className="w-[9mm] px-2 py-2.5 text-left text-[7px] font-bold uppercase tracking-[0.14em]">#</th>
              <th className="px-2 py-2.5 text-left text-[7px] font-bold uppercase tracking-[0.14em]">Description</th>
              <th className="w-[17mm] px-2 py-2.5 text-right text-[7px] font-bold uppercase tracking-[0.14em]">Qty</th>
              <th className="w-[24mm] px-2 py-2.5 text-right text-[7px] font-bold uppercase tracking-[0.14em]">Rate</th>
              <th className="w-[27mm] px-2 py-2.5 text-right text-[7px] font-bold uppercase tracking-[0.14em]">Amount</th>
            </tr>
          </thead>
          <tbody>
            {data.items.filter((item) => item.enabled !== false).map((item, index) => (
              <tr key={item.id || index} className={index % 2 === 0 ? 'bg-white' : 'bg-[#fafcfe]'}>
                <td className="border-b border-[#e5ebf2] px-2 py-2.5 align-top text-[9px] text-[#94a0af]">{String(index + 1).padStart(2, '0')}</td>
                <td className="border-b border-[#e5ebf2] px-2 py-2.5 align-top">
                  <div className="text-[11px] font-semibold leading-snug text-[#202129]">{item.description || 'Line item'}</div>
                  {item.detail && <div className="mt-0.5 text-[9.2px] leading-[1.45] text-[#7b8798]">{item.detail}</div>}
                  <span className={`mt-1 inline-flex rounded px-1.5 py-[2px] text-[6.7px] font-bold uppercase tracking-[0.08em] ${item.kind === 'Monthly' ? 'bg-[#eaf7f0] text-[#1b7a4d]' : 'bg-[#f0f0f3] text-[#555764]'}`}>
                    {item.kind === 'Monthly' ? 'Monthly recurring' : 'One-time'}
                  </span>
                </td>
                <td className="border-b border-[#e5ebf2] px-2 py-2.5 text-right align-top text-[10.5px] font-medium text-[#444650]">{item.quantity.toLocaleString()}</td>
                <td className="border-b border-[#e5ebf2] px-2 py-2.5 text-right align-top text-[10.5px] text-[#444650]">{money(item.rate)}</td>
                <td className="border-b border-[#e5ebf2] px-2 py-2.5 text-right align-top text-[10.8px] font-bold text-[#202129]">{money(item.quantity * item.rate)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 grid grid-cols-[1fr_66mm] gap-5">
          <div>
            <div className="rounded-[7px] border border-[#dce6ee] bg-[#f8fbfd] px-3.5 py-3">
              <div className="text-[7px] font-bold uppercase tracking-[0.16em] text-[#8a96a7]">Amount in words</div>
              <div className="mt-1 text-[10.3px] font-semibold leading-[1.55] text-[#263b54]">{invoiceAmountInWords(totals.total, data.currency)}</div>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div className="rounded-[7px] border border-[#e2e9f1] px-3 py-2">
                <div className="text-[6.8px] font-bold uppercase tracking-[0.14em] text-[#1b9b61]">Monthly recurring</div>
                <div className="mt-0.5 text-[11.5px] font-bold text-[#202129]">{money(totals.monthlyRecurring)}</div>
                <div className="text-[6.8px] text-[#929dab]">Before discount and tax</div>
              </div>
              <div className="rounded-[7px] border border-[#e2e9f1] px-3 py-2">
                <div className="text-[6.8px] font-bold uppercase tracking-[0.14em] text-[#1b9b61]">One-time charges</div>
                <div className="mt-0.5 text-[11.5px] font-bold text-[#202129]">{money(totals.oneTimeTotal)}</div>
                <div className="text-[6.8px] text-[#929dab]">Setup and implementation</div>
              </div>
            </div>
            {data.notes && (
              <div className="mt-3">
                <div className="text-[7px] font-bold uppercase tracking-[0.16em] text-[#8a96a7]">Notes</div>
                <div className="mt-1 whitespace-pre-line text-[9.2px] leading-[1.55] text-[#617084]">{data.notes}</div>
              </div>
            )}
          </div>

          <div className="space-y-1.5 text-[10.2px]">
            <div className="flex justify-between py-0.5 text-[#617084]">
              <span>Subtotal</span>
              <span className="font-semibold text-[#202129]">{money(totals.subtotal)}</span>
            </div>
            {totals.discountAmount > 0 && (
              <div className="flex justify-between py-0.5 text-[#1b8d58]">
                <span>Discount{data.discountType === 'percent' ? ` (${data.discountValue}%)` : ''}</span>
                <span className="font-semibold">− {money(totals.discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-[#e2e9f1] py-1.5 text-[#617084]">
              <span>Taxable amount</span>
              <span className="font-semibold text-[#202129]">{money(totals.taxableAmount)}</span>
            </div>
            {data.taxEnabled && (
              <div className="flex justify-between py-0.5 text-[#617084]">
                <span>{data.taxLabel || 'Sales Tax'} ({totals.taxRate}%)</span>
                <span className="font-semibold text-[#202129]">{money(totals.taxAmount)}</span>
              </div>
            )}
            <div className="premium-dark relative mt-1 flex items-center justify-between overflow-hidden rounded-[7px] border border-white/10 px-3.5 py-3 text-white shadow-[0_8px_20px_-12px_rgb(8_9_16/0.6)]">
              <span className="absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-[#6f69ff] to-[#38c183]" />
              <span className="text-[7.5px] font-bold uppercase tracking-[0.15em] text-white/65">{isQuote ? 'Estimated total' : 'Total due'}</span>
              <span className="text-[14.5px] font-extrabold tracking-[-0.02em]">{money(totals.total)}</span>
            </div>
            {isQuote && <div className="pt-1 text-right text-[6.8px] font-semibold uppercase tracking-[0.08em] text-[#a77c24]">Quotation, not a tax invoice</div>}
          </div>
        </div>

        <div className="mt-3.5 grid grid-cols-[1.15fr_0.85fr] gap-4">
          <div className="rounded-[7px] border border-[#dfe8f0] bg-[#f8fafc] px-3.5 py-3">
            <div className="flex items-center justify-between">
              <div className="text-[7px] font-bold uppercase tracking-[0.16em] text-[#1b8d58]">Payment details</div>
              <div className="text-[6.8px] font-semibold uppercase tracking-[0.12em] text-[#9aa5b4]">Bank transfer</div>
            </div>
            <div className="mt-1.5 space-y-1 text-[9.2px]">
              <div className="flex justify-between gap-4"><span className="text-[#7b8798]">Account title</span><span className="text-right font-semibold text-[#202129]">{settings.bank.accountTitle}</span></div>
              <div className="flex justify-between gap-4"><span className="text-[#7b8798]">Bank</span><span className="text-right font-semibold text-[#202129]">{settings.bank.bankName}</span></div>
              <div className="flex justify-between gap-4"><span className="text-[#7b8798]">IBAN</span><span className="text-right font-semibold tracking-[0.02em] text-[#202129]">{settings.bank.iban}</span></div>
              <div className="flex justify-between gap-4"><span className="text-[#7b8798]">NTN</span><span className="text-right font-semibold text-[#202129]">{settings.bank.ntn}</span></div>
            </div>
          </div>
          <div>
            <div className="text-[7px] font-bold uppercase tracking-[0.16em] text-[#8a96a7]">Terms & conditions</div>
            <div className="mt-1 whitespace-pre-line text-[9px] leading-[1.5] text-[#6d7989]">{data.terms}</div>
            {isQuote && (
              <div className="mt-2 rounded border border-[#f0dfba] bg-[#fff9ec] px-2 py-1.5 text-[7.6px] leading-relaxed text-[#8a641c]">
                Prices are valid until {formatDate(data.validUntil)} and subject to confirmation.
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 flex items-end justify-between gap-6">
          <div className="max-w-[105mm] text-[7.9px] leading-[1.55] text-[#98a3b1]">
            {isQuote
              ? 'This quotation is an estimate and not a tax invoice. Prices are exclusive of applicable taxes unless stated otherwise.'
              : 'This is a computer-generated tax invoice. Prices exclude applicable taxes unless stated otherwise. Hardware, cameras, computers, cabling, internet and static IP are provided by the client.'}
          </div>
          <div className="w-[52mm] text-center">
            <div className="h-8" />
            <div className="border-t border-[#8f9bab] pt-1.5 text-[8.2px] font-semibold text-[#526176]">For {company.displayName || company.legalName}</div>
            <div className="mt-0.5 text-[6.8px] uppercase tracking-[0.12em] text-[#9aa5b4]">Authorized signature</div>
          </div>
        </div>
      </div>

      <footer className="premium-dark relative mt-auto flex items-center justify-between overflow-hidden border-t border-white/10 px-[11mm] py-[4mm] text-white">
        <div className="premium-grid pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative flex items-center gap-2.5">
          <span className="grid size-7 place-items-center rounded-full bg-white p-[2px] ring-1 ring-white/20">
            <img src="/qintellect-logo.svg" alt="" className="size-full object-contain" />
          </span>
          <div>
            <div className="text-[8.5px] font-semibold text-white/90">{settings.footerNote || 'Thank you for choosing QIntellect Technologies.'}</div>
            <div className="mt-0.5 text-[7.4px] text-white/45">{company.email} · {company.contact}</div>
          </div>
        </div>
        <div className="relative text-right text-[7px] leading-relaxed text-white/45">
          <div>NTN {company.ntn || settings.bank.ntn}</div>
          <div>{company.website || company.email}</div>
        </div>
      </footer>
    </article>
  )
}
