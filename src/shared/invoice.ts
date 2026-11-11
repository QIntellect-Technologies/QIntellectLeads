import type {
  InvoiceLine,
  InvoicePricing,
  InvoiceSettings,
  InvoiceTotals,
} from './types'

export const DEFAULT_INVOICE_PACKAGES = [
  { number: 1, label: 'Package 1', employeeRange: '1–20', minEmployees: 1, maxEmployees: 20, monthlyRate: 330, setupCharge: 12_000, branchSetup: 4_800 },
  { number: 2, label: 'Package 2', employeeRange: '21–50', minEmployees: 21, maxEmployees: 50, monthlyRate: 285, setupCharge: 15_000, branchSetup: 4_800 },
  { number: 3, label: 'Package 3', employeeRange: '51–100', minEmployees: 51, maxEmployees: 100, monthlyRate: 228, setupCharge: 18_000, branchSetup: 4_800 },
  { number: 4, label: 'Package 4', employeeRange: '101–200', minEmployees: 101, maxEmployees: 200, monthlyRate: 168, setupCharge: 21_000, branchSetup: 9_600 },
  { number: 5, label: 'Package 5', employeeRange: '201–500', minEmployees: 201, maxEmployees: 500, monthlyRate: 132, setupCharge: 27_000, branchSetup: 9_600 },
  { number: 6, label: 'Package 6', employeeRange: '501–1,000', minEmployees: 501, maxEmployees: 1_000, monthlyRate: 108, setupCharge: 60_000, branchSetup: 9_600 },
  { number: 7, label: 'Package 7', employeeRange: '1,001–2,000', minEmployees: 1_001, maxEmployees: 2_000, monthlyRate: 78, setupCharge: 150_000, branchSetup: 21_000 },
  { number: 8, label: 'Package 8', employeeRange: '2,001–5,000', minEmployees: 2_001, maxEmployees: 5_000, monthlyRate: 54, setupCharge: 300_000, branchSetup: 36_000 },
  { number: 9, label: 'Package 9', employeeRange: '5,001–10,000', minEmployees: 5_001, maxEmployees: 10_000, monthlyRate: 42, setupCharge: 600_000, branchSetup: 54_000 },
  { number: 10, label: 'Package 10', employeeRange: 'Above 10,000', minEmployees: 10_001, maxEmployees: null, monthlyRate: 36, setupCharge: 900_000, branchSetup: 78_000 },
]

export const DEFAULT_INVOICE_PRICING: InvoicePricing = {
  packages: DEFAULT_INVOICE_PACKAGES,
  // The current Freedom Sale rate. The standard poster rate is Rs. 5,000.
  additionalUserMonthly: 3_000,
  additionalUserStandard: 5_000,
}

export const DEFAULT_INVOICE_SETTINGS: InvoiceSettings = {
  company: {
    legalName: 'QIntellect Technologies',
    displayName: 'QIntellect Technologies',
    tagline: 'Driving the Future of Technology, Powered by Quantum & AI',
    ntn: 'J756903',
    contact: '0302 9633999',
    email: 'info@qintellecttechnologies.com',
    website: '',
    address: '',
  },
  bank: {
    accountTitle: 'QIntellect Technologies',
    bankName: 'United Bank Limited (UBL)',
    iban: 'PK46UNIL0109000400912116',
    ntn: 'J756903',
  },
  currency: 'PKR',
  taxRate: 16,
  taxLabel: 'Sales Tax',
  taxEnabled: true,
  defaultTerms:
    'Payment is due within 14 days of the invoice date. Monthly subscription charges are billed in advance. Setup and additional branch charges are one-time and due with the first invoice. Prices are exclusive of applicable taxes unless stated otherwise. Hardware, cameras, computers, cabling, internet and static IP are provided by the client.',
  invoicePrefix: 'QT-INV',
  quotationPrefix: 'QT-QTN',
  footerNote: 'Thank you for choosing QIntellect Technologies.',
  pricing: DEFAULT_INVOICE_PRICING,
}

const round2 = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100

export function clampNumber(value: unknown, min: number, max: number, fallback = min): number {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, number))
}

export function buildPricingLines(
  pricing: InvoicePricing,
  packageNumber: number,
  employees: number,
  additionalUsers: number,
  branches: number,
): InvoiceLine[] {
  const selected = pricing.packages.find((item) => item.number === packageNumber) ?? pricing.packages[0]
  if (!selected) return []
  const lines: InvoiceLine[] = []
  if (employees > 0) {
    lines.push({
      id: crypto.randomUUID(),
      description: `AI Attendance System — ${selected.label}`,
      detail: `${selected.employeeRange} employees · monthly subscription · includes 1 user`,
      quantity: employees,
      rate: selected.monthlyRate,
      kind: 'Monthly',
      source: 'Package',
    })
  }
  lines.push({
    id: crypto.randomUUID(),
    description: `Implementation, onboarding & setup — ${selected.label}`,
    detail: 'One-time setup, configuration, training and deployment',
    quantity: 1,
    rate: selected.setupCharge,
    kind: 'One-time',
    source: 'Setup',
  })
  if (additionalUsers > 0) {
    lines.push({
      id: crypto.randomUUID(),
      description: 'Additional users',
      detail: `Monthly · standard rate ${formatInvoiceMoney(pricing.additionalUserStandard, 'PKR')}`,
      quantity: additionalUsers,
      rate: pricing.additionalUserMonthly,
      kind: 'Monthly',
      source: 'Users',
    })
  }
  if (branches > 0) {
    lines.push({
      id: crypto.randomUUID(),
      description: 'Additional branch setup',
      detail: `One-time · ${selected.label} branch rate`,
      quantity: branches,
      rate: selected.branchSetup,
      kind: 'One-time',
      source: 'Branches',
    })
  }
  return lines.map((line) => ({ ...line, enabled: true }))
}

export function newCustomInvoiceLine(): InvoiceLine {
  return {
    id: crypto.randomUUID(),
    description: '',
    detail: null,
    quantity: 1,
    rate: 0,
    kind: 'One-time',
    source: 'Custom',
    enabled: true,
  }
}

export function detectInvoicePackage(pricing: InvoicePricing, employees: number) {
  return (
    pricing.packages.find((item) => employees >= item.minEmployees && (item.maxEmployees === null || employees <= item.maxEmployees)) ??
    pricing.packages[pricing.packages.length - 1]
  )
}

export function calculateInvoiceTotals(
  items: InvoiceLine[],
  options: {
    taxEnabled: boolean
    taxRate: number
    discountType: 'amount' | 'percent'
    discountValue: number
  },
): InvoiceTotals {
  const activeItems = items.filter((item) => item.enabled !== false)
  const subtotal = round2(activeItems.reduce((sum, item) => sum + Math.max(0, item.quantity) * Math.max(0, item.rate), 0))
  const discountValue = Math.max(0, Number(options.discountValue) || 0)
  const discountAmount = round2(
    options.discountType === 'percent'
      ? subtotal * (Math.min(100, discountValue) / 100)
      : Math.min(subtotal, discountValue),
  )
  const taxableAmount = round2(subtotal - discountAmount)
  const taxRate = options.taxEnabled ? clampNumber(options.taxRate, 0, 100, 0) : 0
  const taxAmount = round2(taxableAmount * (taxRate / 100))
  const total = round2(taxableAmount + taxAmount)
  const monthlyRecurring = round2(
    activeItems.filter((item) => item.kind === 'Monthly').reduce((sum, item) => sum + Math.max(0, item.quantity) * Math.max(0, item.rate), 0),
  )
  const oneTimeTotal = round2(
    activeItems.filter((item) => item.kind === 'One-time').reduce((sum, item) => sum + Math.max(0, item.quantity) * Math.max(0, item.rate), 0),
  )
  return { subtotal, discountAmount, taxableAmount, taxRate, taxAmount, total, monthlyRecurring, oneTimeTotal }
}

export function formatInvoiceMoney(value: number, currency = 'PKR'): string {
  const amount = Number.isFinite(value) ? value : 0
  const formatted = new Intl.NumberFormat('en-PK', {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount)
  return currency === 'PKR' ? `Rs. ${formatted}` : `${currency} ${formatted}`
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function underThousand(value: number): string {
  if (value < 20) return ONES[value]
  if (value < 100) return `${TENS[Math.floor(value / 10)]}${value % 10 ? ` ${ONES[value % 10]}` : ''}`
  return `${ONES[Math.floor(value / 100)]} Hundred${value % 100 ? ` ${underThousand(value % 100)}` : ''}`
}

function indianWords(value: number): string {
  if (value === 0) return 'Zero'
  const crore = Math.floor(value / 10_000_000)
  const lakh = Math.floor((value % 10_000_000) / 100_000)
  const thousand = Math.floor((value % 100_000) / 1_000)
  const rest = value % 1_000
  const parts: string[] = []
  if (crore) parts.push(`${underThousand(crore)} Crore`)
  if (lakh) parts.push(`${underThousand(lakh)} Lakh`)
  if (thousand) parts.push(`${underThousand(thousand)} Thousand`)
  if (rest) parts.push(underThousand(rest))
  return parts.join(' ')
}

export function invoiceAmountInWords(value: number, currency = 'PKR'): string {
  const amount = round2(Math.abs(value))
  const whole = Math.floor(amount)
  const paise = Math.round((amount - whole) * 100)
  const unit = currency === 'PKR' ? 'Rupees' : currency
  const words = `${unit} ${indianWords(whole)}`
  return `${words}${paise ? ` and ${indianWords(paise)} Paisa` : ''} Only`
}

export function generateInvoiceNumber(prefix: string, year: number, sequence: number): string {
  return `${prefix}-${year}-${String(sequence).padStart(3, '0')}`
}

export function invoiceStatuses(kind: 'Invoice' | 'Quotation'): string[] {
  return kind === 'Quotation'
    ? ['Draft', 'Sent', 'Accepted', 'Expired', 'Cancelled']
    : ['Draft', 'Sent', 'Paid', 'Partially Paid', 'Cancelled']
}

export function normalizeInvoiceSettings(value: unknown): InvoiceSettings {
  const input = (value && typeof value === 'object' ? value : {}) as Partial<InvoiceSettings>
  const company = {
    ...DEFAULT_INVOICE_SETTINGS.company,
    ...(input.company && typeof input.company === 'object' ? input.company : {}),
  }
  const bank = {
    ...DEFAULT_INVOICE_SETTINGS.bank,
    ...(input.bank && typeof input.bank === 'object' ? input.bank : {}),
  }
  const rawPricing = (input.pricing && typeof input.pricing === 'object' ? input.pricing : {}) as Partial<InvoicePricing>
  const rawPackages = Array.isArray(rawPricing.packages) ? rawPricing.packages : []
  const packages = DEFAULT_INVOICE_PRICING.packages.map((fallback) => {
    const row = rawPackages.find((item) => item.number === fallback.number)
    return {
      number: fallback.number,
      label: String(row?.label ?? fallback.label).slice(0, 60),
      employeeRange: String(row?.employeeRange ?? fallback.employeeRange).slice(0, 40),
      minEmployees: Math.round(clampNumber(row?.minEmployees, 0, 10_000_000, fallback.minEmployees)),
      maxEmployees:
        row?.maxEmployees === null || row?.maxEmployees === undefined
          ? fallback.maxEmployees
          : Math.round(clampNumber(row.maxEmployees, 0, 10_000_000, fallback.maxEmployees ?? 0)),
      monthlyRate: round2(clampNumber(row?.monthlyRate, 0, 10_000_000, fallback.monthlyRate)),
      setupCharge: round2(clampNumber(row?.setupCharge, 0, 1_000_000_000, fallback.setupCharge)),
      branchSetup: round2(clampNumber(row?.branchSetup, 0, 1_000_000_000, fallback.branchSetup)),
    }
  })
  return {
    company: {
      legalName: String(company.legalName ?? '').slice(0, 160),
      displayName: String(company.displayName ?? '').slice(0, 160),
      tagline: String(company.tagline ?? '').slice(0, 240),
      ntn: String(company.ntn ?? '').slice(0, 60),
      contact: String(company.contact ?? '').slice(0, 80),
      email: String(company.email ?? '').slice(0, 160),
      website: String(company.website ?? '').slice(0, 160),
      address: String(company.address ?? '').slice(0, 300),
    },
    bank: {
      accountTitle: String(bank.accountTitle ?? '').slice(0, 160),
      bankName: String(bank.bankName ?? '').slice(0, 160),
      iban: String(bank.iban ?? '').slice(0, 80),
      ntn: String(bank.ntn ?? '').slice(0, 60),
    },
    currency: String(input.currency ?? 'PKR').slice(0, 8).toUpperCase() || 'PKR',
    taxRate: round2(clampNumber(input.taxRate, 0, 100, DEFAULT_INVOICE_SETTINGS.taxRate)),
    taxLabel: String(input.taxLabel ?? DEFAULT_INVOICE_SETTINGS.taxLabel).slice(0, 60) || DEFAULT_INVOICE_SETTINGS.taxLabel,
    taxEnabled: input.taxEnabled !== false,
    defaultTerms: String(input.defaultTerms ?? DEFAULT_INVOICE_SETTINGS.defaultTerms).slice(0, 4000),
    invoicePrefix: String(input.invoicePrefix ?? DEFAULT_INVOICE_SETTINGS.invoicePrefix).slice(0, 30) || DEFAULT_INVOICE_SETTINGS.invoicePrefix,
    quotationPrefix: String(input.quotationPrefix ?? DEFAULT_INVOICE_SETTINGS.quotationPrefix).slice(0, 30) || DEFAULT_INVOICE_SETTINGS.quotationPrefix,
    footerNote: String(input.footerNote ?? DEFAULT_INVOICE_SETTINGS.footerNote).slice(0, 300),
    pricing: {
      packages,
      additionalUserMonthly: round2(clampNumber(rawPricing.additionalUserMonthly, 0, 1_000_000, DEFAULT_INVOICE_PRICING.additionalUserMonthly)),
      additionalUserStandard: round2(clampNumber(rawPricing.additionalUserStandard, 0, 1_000_000, DEFAULT_INVOICE_PRICING.additionalUserStandard)),
    },
  }
}
