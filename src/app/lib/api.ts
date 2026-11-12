import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { Activity, CallsData, Company, Contact, DataHealthData, DataSummary, Deal, FollowUpsData, ImportPreview, ImportResult, InvoiceRecord, InvoiceSettings, InvoicesData, LeadDetail, LeadListItem, LeadTemplate, Me, MeetingsData, NextActionsData, NotificationSettings, Overview, ReportsData, StoredFile, Task, TodayData } from '../../shared/types'

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: unknown,
  ) {
    super(message)
  }
}

export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {}
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...rest,
    headers: {
      accept: 'application/json',
      ...(json !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(rest.headers ?? {}),
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  })
  if (!response.ok) {
    let message = response.statusText
    let code: string | undefined
    let details: unknown
    try {
      const body = (await response.json()) as { error?: string; message?: string; duplicates?: unknown }
      message = body.message ?? body.error ?? message
      code = body.error
      details = body.duplicates
    } catch {
      /* no body */
    }
    throw new ApiError(response.status, message, code, details)
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

// Queries

export const useMe = () => useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/me'), retry: false, staleTime: 60_000 })
export const useOverview = () => useQuery({ queryKey: ['overview'], queryFn: () => api<Overview>('/overview') })

export interface ContactsQuery {
  q?: string
  status?: string
  companyId?: string
  sort?: 'activity' | 'name'
  page?: number
}
export const useContacts = (query: ContactsQuery) =>
  useQuery({
    queryKey: ['contacts', query],
    queryFn: () => {
      const params = new URLSearchParams()
      if (query.q) params.set('q', query.q)
      if (query.status) params.set('status', query.status)
      if (query.companyId) params.set('companyId', query.companyId)
      if (query.sort) params.set('sort', query.sort)
      if (query.page) params.set('page', String(query.page))
      return api<{ items: Contact[]; total: number; page: number; pageSize: number }>(`/contacts?${params}`)
    },
    placeholderData: (previous) => previous,
  })

export const useContact = (id: string | undefined) =>
  useQuery({
    queryKey: ['contact', id],
    queryFn: () => api<{ contact: Contact; activities: Activity[]; deals: Deal[]; files: StoredFile[] }>(`/contacts/${id}`),
    enabled: Boolean(id),
  })

export const useCompanies = (q = '') =>
  useQuery({
    queryKey: ['companies', q],
    queryFn: () => api<{ items: Company[] }>(`/companies?q=${encodeURIComponent(q)}`),
    placeholderData: (previous) => previous,
  })

export const useCompany = (id: string | undefined) =>
  useQuery({
    queryKey: ['company', id],
    queryFn: () => api<{ company: Company; contacts: Contact[]; deals: Deal[]; activities: Activity[] }>(`/companies/${id}`),
    enabled: Boolean(id),
  })

export const useDeals = () => useQuery({ queryKey: ['deals'], queryFn: () => api<{ items: Deal[] }>('/deals') })
export const useDeal = (id: string | null) =>
  useQuery({
    queryKey: ['deal', id],
    queryFn: () => api<{ deal: Deal; activities: Activity[]; files: StoredFile[] }>(`/deals/${id}`),
    enabled: Boolean(id),
  })
export const useTasks = () => useQuery({ queryKey: ['tasks'], queryFn: () => api<{ items: Task[] }>('/tasks') })

export const useSearch = (q: string) =>
  useQuery({
    queryKey: ['search', q],
    queryFn: () =>
      api<{
        contacts: { id: string; name: string; email: string | null; hue: number }[]
        companies: { id: string; name: string; domain: string | null; hue: number }[]
        deals: { id: string; title: string; stage: string; value: number }[]
      }>(`/search?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length > 0,
    staleTime: 10_000,
  })

// Mutations. Each invalidates the lists it can affect; detail pages refetch
// through their own keys.

export function useInvalidate() {
  const client = useQueryClient()
  return (...keys: string[]) => Promise.all(keys.map((key) => client.invalidateQueries({ queryKey: [key] })))
}

// One write can affect Today, Next actions, Follow-ups, lead detail and data
// health. Refresh this shared set after every mutation so the related sections
// never show a stale copy from another page.
const CROSS_PAGE_KEYS = [
  'today',
  'next-actions',
  'follow-ups',
  'calls',
  'leads',
  'lead',
  'lead-search',
  'reports',
  'meetings',
  'data-summary',
  'data-health',
  'notification-settings',
  'invoices',
  'invoice',
  'invoice-settings',
]

export function useApiMutation<TInput, TResult>(
  run: (input: TInput) => Promise<TResult>,
  invalidates: string[],
  options?: { onSuccess?: (result: TResult, input: TInput) => void },
) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: run,
    onSuccess: (result, input) => {
      // Close dialogs and show the result immediately; related screens refresh
      // in the background from the same D1 data.
      options?.onSuccess?.(result, input)
      void invalidate(...new Set([...invalidates, ...CROSS_PAGE_KEYS]))
    },
  })
}

export async function uploadFile(
  file: File,
  target: { contactId?: string; dealId?: string; companyId?: string },
): Promise<StoredFile> {
  const form = new FormData()
  form.set('file', file)
  if (target.contactId) form.set('contactId', target.contactId)
  if (target.dealId) form.set('dealId', target.dealId)
  if (target.companyId) form.set('companyId', target.companyId)
  const result = await api<{ file: StoredFile }>('/files', { method: 'POST', body: form })
  return result.file
}

export async function uploadAvatar(contactId: string, file: File): Promise<string> {
  const form = new FormData()
  form.set('file', file)
  const result = await api<{ avatarKey: string }>(`/files/avatar/${contactId}`, { method: 'PUT', body: form })
  return result.avatarKey
}

// Lead management ----------------------------------------------------------

export interface LeadsQuery {
  q?: string
  status?: string
  priority?: string
  source?: string
  product?: string
  orgType?: string
  followUp?: string
  stale?: string
  sort?: string
  archived?: '0' | '1'
}

export const useLeads = (query: LeadsQuery) =>
  useQuery({
    queryKey: ['leads', query],
    queryFn: () => {
      const params = new URLSearchParams()
      for (const [key, value] of Object.entries(query)) if (value) params.set(key, String(value))
      return api<{ items: LeadListItem[]; total: number }>(`/leads?${params}`)
    },
    placeholderData: (previous) => previous,
  })

export const useLead = (id: string | undefined) =>
  useQuery({
    queryKey: ['lead', id],
    queryFn: () => api<LeadDetail>(`/leads/${id}`),
    enabled: Boolean(id),
  })

export const useToday = () =>
  useQuery({ queryKey: ['today'], queryFn: () => api<TodayData>('/today'), refetchInterval: 30_000 })
export const useNextActions = () =>
  useQuery({ queryKey: ['next-actions'], queryFn: () => api<NextActionsData>('/next-actions'), refetchInterval: 30_000 })
export const useDataHealth = () =>
  useQuery({ queryKey: ['data-health'], queryFn: () => api<DataHealthData>('/data-health'), refetchInterval: 60_000 })
export const useNotificationSettings = () =>
  useQuery({
    queryKey: ['notification-settings'],
    queryFn: () => api<NotificationSettings>('/settings/notifications'),
  })

export const useInvoices = (query: { kind?: string; status?: string; q?: string }) =>
  useQuery({
    queryKey: ['invoices', query],
    queryFn: () => {
      const params = new URLSearchParams()
      if (query.kind) params.set('kind', query.kind)
      if (query.status) params.set('status', query.status)
      if (query.q) params.set('q', query.q)
      return api<InvoicesData>(`/invoices?${params}`)
    },
    placeholderData: (previous) => previous,
  })

export const useInvoice = (id: string | undefined) =>
  useQuery({
    queryKey: ['invoice', id],
    queryFn: () => api<InvoiceRecord>(`/invoices/${id}`),
    enabled: Boolean(id),
  })

export const useInvoiceSettings = () =>
  useQuery({ queryKey: ['invoice-settings'], queryFn: () => api<InvoiceSettings>('/invoice-settings') })

export const useReports = () => useQuery({ queryKey: ['reports'], queryFn: () => api<ReportsData>('/reports') })

export const useTemplates = () => useQuery({ queryKey: ['templates'], queryFn: () => api<{ items: LeadTemplate[] }>('/templates') })

export const useMeetings = (query: { when?: string; q?: string; date?: string }) =>
  useQuery({
    queryKey: ['meetings', query],
    queryFn: () => {
      const params = new URLSearchParams()
      if (query.when) params.set('when', query.when)
      if (query.q) params.set('q', query.q)
      if (query.date) params.set('date', query.date)
      return api<MeetingsData>(`/meetings?${params}`)
    },
    placeholderData: (previous) => previous,
  })

export const useCalls = (query: { when?: string; q?: string; date?: string; result?: string }) =>
  useQuery({
    queryKey: ['calls', query],
    queryFn: () => {
      const params = new URLSearchParams()
      if (query.when) params.set('when', query.when)
      if (query.q) params.set('q', query.q)
      if (query.date) params.set('date', query.date)
      if (query.result) params.set('result', query.result)
      return api<CallsData>(`/calls?${params}`)
    },
    placeholderData: (previous) => previous,
  })

export const useFollowUps = (query: { when?: string; q?: string; date?: string }) =>
  useQuery({
    queryKey: ['follow-ups', query],
    queryFn: () => {
      const params = new URLSearchParams()
      if (query.when) params.set('when', query.when)
      if (query.q) params.set('q', query.q)
      if (query.date) params.set('date', query.date)
      return api<FollowUpsData>(`/follow-ups?${params}`)
    },
    placeholderData: (previous) => previous,
    refetchInterval: 30_000,
  })

export const useDataSummary = () => useQuery({ queryKey: ['data-summary'], queryFn: () => api<DataSummary>('/data-summary') })

export const useLeadSearch = (q: string) =>
  useQuery({
    queryKey: ['lead-search', q],
    queryFn: () => api<{ leads: { id: string; code: string; name: string | null; orgName: string | null; phone: string | null; status: string; priorityScore: number }[] }>(`/search?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length > 0,
    staleTime: 10_000,
  })

export const previewImport = (csv: string) => api<ImportPreview>('/import/preview', { method: 'POST', json: { csv } })
export const runImport = (csv: string) => api<ImportResult>('/import', { method: 'POST', json: { csv } })

export type LeadSaveResult = { lead: LeadListItem }
export type LeadDetailResult = LeadDetail
