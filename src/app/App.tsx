import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'

import { Shell } from './components/Shell'
import { PageLoader, ToastProvider } from './components/ui'
import { ApiError, useMe } from './lib/api'
import { DataHealth } from './pages/DataHealth'
import { FollowUps } from './pages/FollowUps'
import { ImportExport } from './pages/ImportExport'
import { InvoiceBuilder, Invoices } from './pages/Invoices'
import { LeadDetail } from './pages/LeadDetail'
import { Leads } from './pages/Leads'
import { Meetings } from './pages/Meetings'
import { NextActions } from './pages/NextActions'
import { Pipeline } from './pages/Pipeline'
import { Reports } from './pages/Reports'
import { Settings } from './pages/Settings'
import { SetupNeeded, SignIn } from './pages/SignIn'
import { Templates } from './pages/Templates'
import { Today } from './pages/Today'

const client = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      // Every screen reads from the same D1-backed API. Refetch on navigation
      // and focus so an edit on one page is already visible on the next.
      refetchOnWindowFocus: true,
      refetchOnMount: 'always',
      refetchOnReconnect: true,
      staleTime: 0,
    },
  },
})

function Gate() {
  const me = useMe()
  if (me.isLoading) {
    return <PageLoader label="Opening your workspace" />
  }
  if (me.error instanceof ApiError) {
    if (me.error.status === 401) return <SignIn />
    if (me.error.status === 503) return <SetupNeeded message={me.error.message} />
  }
  if (me.error) return <SetupNeeded message={me.error.message} />
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Today />} />
        <Route path="next-actions" element={<NextActions />} />
        <Route path="follow-ups" element={<FollowUps />} />
        <Route path="data-health" element={<DataHealth />} />
        <Route path="leads" element={<Leads />} />
        <Route path="leads/:id" element={<LeadDetail />} />
        <Route path="pipeline" element={<Pipeline />} />
        <Route path="meetings" element={<Meetings />} />
        <Route path="templates" element={<Templates />} />
        <Route path="invoices" element={<Invoices />} />
        <Route path="invoices/new" element={<InvoiceBuilder />} />
        <Route path="invoices/:id" element={<InvoiceBuilder />} />
        <Route path="import-export" element={<ImportExport />} />
        <Route path="reports" element={<Reports />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export function App() {
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <BrowserRouter>
          <Gate />
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  )
}
