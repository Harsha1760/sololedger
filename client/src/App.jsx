import { useCallback, useEffect, useRef, useState } from 'react'
import { Landmark, Moon, RotateCcw, Settings, Sun, Zap } from 'lucide-react'
import { Button, ErrorBanner, Field, inputClass } from './components/ui'
import Modal from './components/Modal'
import NewInvoiceModal from './components/NewInvoiceModal'
import FollowUpDrawer from './components/FollowUpDrawer'
import OverviewTab from './views/OverviewTab'
import CustomersTab from './views/CustomersTab'
import InvoicesTab from './views/InvoicesTab'
import CashForecastTab from './views/CashForecastTab'
import BillsTab from './views/BillsTab'
import { getDashboard, resetDemo, updateSettings } from './lib/api'

const API_DOWN_MESSAGE = 'Cannot reach the API at /api — is the server running on port 5000?'
const THEME_KEY = 'sololedger-theme'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'customers', label: 'Customers' },
  { id: 'invoices', label: 'Invoices' },
  { id: 'forecast', label: 'Forecast' },
  { id: 'bills', label: 'Bills' },
]

const CASH_HEALTH = {
  crunch: { label: 'Cash Crunch', className: 'bg-rose-50 text-rose-700 ring-rose-200', dot: 'bg-rose-500' },
  watch: { label: 'Watch Cash', className: 'bg-amber-50 text-amber-700 ring-amber-200', dot: 'bg-amber-500' },
  healthy: { label: 'Healthy Buffer', className: 'bg-emerald-50 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500' },
}

function getCashHealth(settings) {
  if (!settings) return null
  const cash = Number(settings.current_cash_balance)
  const buffer = Number(settings.safety_buffer)
  if (cash < 0) return CASH_HEALTH.crunch
  if (cash <= buffer) return CASH_HEALTH.watch
  return CASH_HEALTH.healthy
}

export default function App() {
  const [dashboard, setDashboard] = useState(null)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('overview')
  const [followUp, setFollowUp] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [resetting, setResetting] = useState(false)
  const [toast, setToast] = useState('')
  const toastTimer = useRef(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsForm, setSettingsForm] = useState({ cash: '', buffer: '' })
  const [settingsError, setSettingsError] = useState('')
  const [savingSettings, setSavingSettings] = useState(false)
  const [newInvoiceOpen, setNewInvoiceOpen] = useState(false)
  const [isDark, setIsDark] = useState(true)

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

  const showToast = useCallback((message) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(message)
    toastTimer.current = setTimeout(() => setToast(''), 3000)
  }, [])

  useEffect(() => () => clearTimeout(toastTimer.current), [])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'))
  }, [])

  function toggleTheme() {
    const next = !isDark
    document.documentElement.classList.toggle('dark', next)
    try {
      localStorage.setItem(THEME_KEY, next ? 'dark' : 'light')
    } catch (err) {
      // Storage unavailable: the theme still applies for this session.
    }
    setIsDark(next)
  }

  async function handleReset() {
    if (!window.confirm('Reset all demo data? This replaces every client, invoice and bill.')) return
    setResetting(true)
    setFollowUp(null)
    try {
      await resetDemo()
      await refresh()
      showToast('Demo data reset')
    } catch (err) {
      setError(err.message)
    } finally {
      setResetting(false)
    }
  }

  function openSettings() {
    setSettingsForm({
      cash: String(dashboard?.settings?.current_cash_balance ?? ''),
      buffer: String(dashboard?.settings?.safety_buffer ?? ''),
    })
    setSettingsError('')
    setSettingsOpen(true)
  }

  function closeSettings() {
    setSettingsOpen(false)
  }

  async function handleSaveSettings(e) {
    e.preventDefault()
    const cashText = settingsForm.cash.trim()
    const bufferText = settingsForm.buffer.trim()
    const cash = cashText === '' ? NaN : Number(cashText)
    const buffer = bufferText === '' ? NaN : Number(bufferText)
    if (!Number.isFinite(cash)) {
      setSettingsError('Current cash balance must be a valid number.')
      return
    }
    if (!Number.isFinite(buffer) || buffer < 0) {
      setSettingsError('Safety buffer must be a number of 0 or more.')
      return
    }
    setSavingSettings(true)
    setSettingsError('')
    try {
      await updateSettings({ current_cash_balance: cash, safety_buffer: buffer })
      setSettingsOpen(false)
      await refresh()
      showToast('Workspace settings updated')
    } catch (err) {
      setSettingsError(err.message)
    } finally {
      setSavingSettings(false)
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

  const businessName = dashboard.settings?.business_name || 'Apex Studios'
  const cashHealth = getCashHealth(dashboard.settings)
  const badgeCounts = {
    invoices: dashboard.totals?.overdueCount ?? 0,
    bills: dashboard.totals?.unpaidBillsCount ?? 0,
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900">
              <Landmark className="h-4 w-4 text-white" aria-hidden="true" />
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <p className="text-sm font-semibold text-slate-900">SoloLedger</p>
              <p className="truncate text-xs text-slate-500">• {businessName}</p>
              <p className="hidden text-xs text-slate-400 sm:block">Hyderabad</p>
              {cashHealth && (
                <span
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${cashHealth.className}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${cashHealth.dot}`} aria-hidden="true" />
                  {cashHealth.label}
                </span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button size="sm" onClick={() => setNewInvoiceOpen(true)}>
              <Zap className="h-3.5 w-3.5" aria-hidden="true" />
              + 20s Invoice
            </Button>
            <Button variant="ghost" size="sm" onClick={openSettings} aria-label="Workspace settings">
              <Settings className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
            <Button variant="ghost" size="sm" onClick={toggleTheme} aria-label="Toggle theme">
              {isDark ? <Moon className="h-3.5 w-3.5" aria-hidden="true" /> : <Sun className="h-3.5 w-3.5" aria-hidden="true" />}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleReset} disabled={resetting}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              {resetting ? 'Resetting…' : 'Reset Demo Data'}
            </Button>
          </div>
        </div>

        <nav aria-label="Main sections" className="mx-auto max-w-7xl px-4 pb-3 sm:px-6">
          <div className="inline-flex max-w-full gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1">
            {TABS.map((tab) => {
              const active = activeTab === tab.id
              const count = badgeCounts[tab.id] ?? 0
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${
                    active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                  {count > 0 && (
                    <span
                      className={`rounded-full px-1.5 text-xs font-medium ${
                        tab.id === 'invoices' ? 'bg-rose-100 text-rose-700' : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {count}
                    </span>
                  )}
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
            onChase={setFollowUp}
            onNavigate={setActiveTab}
            onNotify={showToast}
          />
        )}
        {activeTab === 'customers' && (
          <CustomersTab
            refreshKey={refreshKey}
            onChanged={refresh}
            onChase={setFollowUp}
            onNavigate={setActiveTab}
            onNotify={showToast}
          />
        )}
        {activeTab === 'invoices' && (
          <InvoicesTab
            refreshKey={refreshKey}
            onChanged={refresh}
            openChase={setFollowUp}
            onChase={setFollowUp}
            onNavigate={setActiveTab}
            onNotify={showToast}
          />
        )}
        {activeTab === 'forecast' && (
          <CashForecastTab
            refreshKey={refreshKey}
            onChanged={refresh}
            onChase={setFollowUp}
            onNavigate={setActiveTab}
            onNotify={showToast}
          />
        )}
        {activeTab === 'bills' && (
          <BillsTab
            refreshKey={refreshKey}
            onChanged={refresh}
            onChase={setFollowUp}
            onNavigate={setActiveTab}
            onNotify={showToast}
          />
        )}
      </main>

      {followUp && (
        <FollowUpDrawer
          key={followUp.id}
          invoice={followUp}
          onClose={() => setFollowUp(null)}
          onChanged={refresh}
          onNotify={showToast}
        />
      )}

      {newInvoiceOpen && (
        <NewInvoiceModal onClose={() => setNewInvoiceOpen(false)} onCreated={refresh} />
      )}

      <Modal
        open={settingsOpen}
        onClose={closeSettings}
        title="Workspace settings"
        footer={
          <>
            <Button variant="secondary" onClick={closeSettings} disabled={savingSettings}>
              Cancel
            </Button>
            <Button type="submit" form="workspace-settings-form" disabled={savingSettings}>
              {savingSettings ? 'Saving…' : 'Save'}
            </Button>
          </>
        }
      >
        <form id="workspace-settings-form" onSubmit={handleSaveSettings} className="flex flex-col gap-4">
          <Field label="Current cash balance (₹)" htmlFor="settings-cash">
            <input
              id="settings-cash"
              type="number"
              step="any"
              inputMode="decimal"
              className={inputClass}
              value={settingsForm.cash}
              onChange={(e) => setSettingsForm((f) => ({ ...f, cash: e.target.value }))}
            />
          </Field>
          <Field label="Safety buffer (₹)" htmlFor="settings-buffer">
            <input
              id="settings-buffer"
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              className={inputClass}
              value={settingsForm.buffer}
              onChange={(e) => setSettingsForm((f) => ({ ...f, buffer: e.target.value }))}
            />
          </Field>
          {settingsError && (
            <p role="alert" className="text-sm text-rose-600">
              {settingsError}
            </p>
          )}
        </form>
      </Modal>

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 right-4 z-50 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-lg"
        >
          {toast}
        </div>
      )}
    </div>
  )
}
