import { useCallback, useEffect, useState } from 'react'
import { RotateCcw, Wallet } from 'lucide-react'
import { Button, ErrorBanner } from './components/ui'
import FollowUpDrawer from './components/FollowUpDrawer'
import OverviewTab from './views/OverviewTab'
import InvoicesTab from './views/InvoicesTab'
import CashForecastTab from './views/CashForecastTab'
import BillsTab from './views/BillsTab'
import { getDashboard, resetDemo } from './lib/api'

const API_DOWN_MESSAGE = 'Cannot reach the API at /api — is the server running on port 5000?'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'invoices', label: 'Invoices' },
  { id: 'forecast', label: 'Cash Forecast' },
  { id: 'bills', label: 'Bills' },
]

export default function App() {
  const [dashboard, setDashboard] = useState(null)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('overview')
  const [followUp, setFollowUp] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [resetting, setResetting] = useState(false)

  // Re-fetches the dashboard and bumps refreshKey so child tabs reload their lists.
  const refresh = useCallback(async () => {
    try {
      const data = await getDashboard()
      setDashboard(data)
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setRefreshKey((k) => k + 1)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function handleReset() {
    if (!window.confirm('Reset all demo data? This replaces every client, invoice and bill.')) return
    setResetting(true)
    setFollowUp(null)
    try {
      await resetDemo()
      await refresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setResetting(false)
    }
  }

  if (!dashboard && !error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-slate-500">Loading SoloLedger…</p>
      </div>
    )
  }

  if (!dashboard) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <ErrorBanner message={API_DOWN_MESSAGE} />
          <p className="mt-3 text-xs text-slate-500">Details: {error}</p>
          <div className="mt-4">
            <Button
              variant="secondary"
              onClick={() => {
                setError('')
                refresh()
              }}
            >
              Retry
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const businessName = dashboard.settings?.business_name

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900">
              <Wallet className="h-4 w-4 text-white" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">SoloLedger</p>
              {businessName && <p className="truncate text-xs text-slate-500">{businessName}</p>}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleReset} disabled={resetting}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            {resetting ? 'Resetting…' : 'Reset Demo Data'}
          </Button>
        </div>

        <nav aria-label="Main sections" className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex gap-6 overflow-x-auto">
            {TABS.map((tab) => {
              const active = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`relative whitespace-nowrap py-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${
                    active ? 'text-slate-900' : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                  {active && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-slate-900" />}
                </button>
              )
            })}
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {error && (
          <div className="mb-4">
            <ErrorBanner message={error} onDismiss={() => setError('')} />
          </div>
        )}

        {activeTab === 'overview' && (
          <OverviewTab
            dashboard={dashboard}
            refreshKey={refreshKey}
            onChanged={refresh}
            openChase={setFollowUp}
            onNavigate={setActiveTab}
          />
        )}
        {activeTab === 'invoices' && (
          <InvoicesTab refreshKey={refreshKey} onChanged={refresh} openChase={setFollowUp} />
        )}
        {activeTab === 'forecast' && <CashForecastTab refreshKey={refreshKey} />}
        {activeTab === 'bills' && <BillsTab refreshKey={refreshKey} onChanged={refresh} />}
      </main>

      {followUp && (
        <FollowUpDrawer
          key={followUp.id}
          invoice={followUp}
          onClose={() => setFollowUp(null)}
          onChanged={refresh}
        />
      )}
    </div>
  )
}
