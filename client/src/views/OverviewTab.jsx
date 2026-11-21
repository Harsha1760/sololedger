import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react'
import { Button, Card, EmptyState, ErrorBanner } from '../components/ui'
import { getBills, getInvoices, setInvoiceStatus } from '../lib/api'
import { daysBetween, formatDate, formatINR, todayYMD } from '../lib/format'

const SEVERITY_STYLES = {
  critical: { Icon: AlertTriangle, className: 'text-rose-600' },
  warning: { Icon: AlertTriangle, className: 'text-amber-600' },
  info: { Icon: Info, className: 'text-blue-600' },
}

const ALERT_ACTION_LABELS = {
  chase: 'Chase Now',
  pay: 'Pay Bill',
  forecast: 'View Forecast',
}

function KpiCard({ label, value, sub, valueClass = 'text-slate-900', borderClass = 'border-slate-200' }) {
  return (
    <Card className={`p-5 ${borderClass}`}>
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className={`money mt-2 text-2xl font-semibold ${valueClass}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </Card>
  )
}

export default function OverviewTab({ dashboard, refreshKey, onChanged, openChase, onNavigate }) {
  const [invoices, setInvoices] = useState([])
  const [bills, setBills] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)

  useEffect(() => {
    let ignore = false
    Promise.all([getInvoices(), getBills()])
      .then(([inv, b]) => {
        if (ignore) return
        setInvoices(inv)
        setBills(b)
        setError('')
      })
      .catch((err) => {
        if (!ignore) setError(err.message)
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })
    return () => {
      ignore = true
    }
  }, [refreshKey])

  const today = todayYMD()
  const { settings, totals } = dashboard

  const unpaidInvoices = invoices.filter((i) => i.status !== 'paid')
  const unpaidTotal = unpaidInvoices.reduce((sum, i) => sum + i.amount, 0)

  const upcomingBills = bills.filter((b) => !b.is_paid && daysBetween(today, b.due_date) <= 30)
  const upcomingTotal = upcomingBills.reduce((sum, b) => sum + b.amount, 0)
  const cashBelowBuffer = settings.current_cash_balance < settings.safety_buffer

  const alerts = [...(dashboard.alerts || [])].sort((a, b) => a.priority - b.priority)

  const snapshot = invoices
    .filter((i) => i.status === 'overdue' || i.status === 'sent')
    .map((i) => ({ ...i, daysOverdue: daysBetween(i.due_date, today) }))
    .sort((a, b) => b.daysOverdue - a.daysOverdue)

  function runAlertAction(alert) {
    const action = alert.action || {}
    if (action.type === 'chase') {
      openChase(invoices.find((i) => i.id === action.invoiceId) || { id: action.invoiceId })
    } else if (action.type === 'pay') {
      onNavigate('bills')
    } else if (action.type === 'forecast') {
      onNavigate('forecast')
    }
  }

  async function markPaid(invoice) {
    setBusyId(invoice.id)
    setError('')
    try {
      await setInvoiceStatus(invoice.id, 'paid')
      await onChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <ErrorBanner message={error} onDismiss={() => setError('')} />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Current Cash Balance" value={formatINR(settings.current_cash_balance)} />
        <KpiCard
          label="Total Unpaid"
          value={formatINR(unpaidTotal)}
          sub={`${unpaidInvoices.length} open invoice${unpaidInvoices.length === 1 ? '' : 's'}`}
        />
        <KpiCard
          label="Total Overdue"
          value={formatINR(totals.overdueAmount)}
          sub={`${totals.overdueCount} overdue invoice${totals.overdueCount === 1 ? '' : 's'}`}
          valueClass={totals.overdueAmount > 0 ? 'text-rose-600' : 'text-slate-900'}
          borderClass={totals.overdueAmount > 0 ? 'border-rose-200' : 'border-slate-200'}
        />
        <KpiCard
          label="Upcoming 30-Day Bills"
          value={formatINR(upcomingTotal)}
          sub={`${upcomingBills.length} unpaid bill${upcomingBills.length === 1 ? '' : 's'} · buffer ${formatINR(settings.safety_buffer)}`}
          valueClass={cashBelowBuffer ? 'text-amber-600' : 'text-slate-900'}
          borderClass={cashBelowBuffer ? 'border-amber-200' : 'border-slate-200'}
        />
      </section>

      <Card>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">Actionable alerts</h2>
          <span className="text-xs text-slate-500">{alerts.length} active</span>
        </div>
        {alerts.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="All clear" message="No alerts need your attention right now." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {alerts.map((alert) => {
              const { Icon, className } = SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.info
              return (
                <li key={`${alert.type}-${alert.priority}`} className="flex items-start gap-3 px-5 py-3">
                  <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${className}`} aria-hidden="true" />
                  <p className="flex-1 text-sm text-slate-700">{alert.message}</p>
                  {alert.action && ALERT_ACTION_LABELS[alert.action.type] && (
                    <Button variant="secondary" size="sm" onClick={() => runAlertAction(alert)}>
                      {ALERT_ACTION_LABELS[alert.action.type]}
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <Card>
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">Overdue &amp; unpaid</h2>
        </div>
        {loading && snapshot.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">Loading invoices…</p>
        ) : snapshot.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="Nothing outstanding" message="Every sent invoice is paid." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Client</th>
                  <th className="px-3 py-2.5 font-medium">Invoice</th>
                  <th className="px-3 py-2.5 text-right font-medium">Amount</th>
                  <th className="px-3 py-2.5 font-medium">Days overdue</th>
                  <th className="px-5 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {snapshot.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-medium text-slate-900">{inv.client_name || '—'}</td>
                    <td className="px-3 py-3 text-slate-600">
                      {inv.title}
                      <span className="block text-xs text-slate-400">Due {formatDate(inv.due_date)}</span>
                    </td>
                    <td className="money px-3 py-3 text-right text-slate-900">{formatINR(inv.amount)}</td>
                    <td className="px-3 py-3">
                      {inv.daysOverdue > 0 ? (
                        <span className="money font-medium text-rose-600">{inv.daysOverdue} days</span>
                      ) : inv.daysOverdue === 0 ? (
                        <span className="text-slate-500">Due today</span>
                      ) : (
                        <span className="text-slate-500">Due in {-inv.daysOverdue} days</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="success"
                          size="sm"
                          onClick={() => markPaid(inv)}
                          disabled={busyId === inv.id}
                        >
                          Mark Paid
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => openChase(inv)}>
                          Chase
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
