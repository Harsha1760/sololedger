import { useEffect, useState } from 'react'
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, CalendarClock, CheckCircle2, Clock, Info, Receipt, Wallet } from 'lucide-react'
import { Button, Card, EmptyState, ErrorBanner, StatusBadge } from '../components/ui'
import { getBills, getInvoices, setInvoiceStatus } from '../lib/api'
import { daysBetween, formatDate, formatINR, todayYMD } from '../lib/format'

const SEVERITY_STYLES = {
  critical: { Icon: AlertTriangle, className: 'text-rose-600' },
  warning: { Icon: AlertTriangle, className: 'text-amber-600' },
  info: { Icon: Info, className: 'text-blue-600' },
}

const SEVERITY_ACCENTS = {
  critical: 'border-l-rose-500',
  warning: 'border-l-amber-500',
  info: 'border-l-slate-300',
}

const ALERT_ACTION_LABELS = {
  chase: 'Chase Now',
  pay: 'Pay Bill',
  forecast: 'View Forecast',
}

function initialsOf(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length === 0) return '?'
  return parts
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('')
}

function KpiCard({
  icon: Icon,
  iconClass,
  label,
  value,
  sub,
  subClass = 'text-slate-500',
  valueClass = 'text-slate-900',
  borderClass = 'border-slate-200',
}) {
  return (
    <Card className={`p-5 transition-colors hover:border-slate-300 ${borderClass}`}>
      <div className="flex items-center gap-3">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${iconClass}`}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <p className="text-sm font-medium text-slate-500">{label}</p>
      </div>
      <p className={`money tabular-nums mt-3 text-2xl font-semibold ${valueClass}`}>{value}</p>
      {sub && <p className={`mt-1 text-xs ${subClass}`}>{sub}</p>}
    </Card>
  )
}

function ProgressRow({ label, amount, percent, barClass }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-600">{label}</span>
        <span className="money tabular-nums font-medium text-slate-900">{formatINR(amount)}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${barClass}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
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

  const cash = settings.current_cash_balance
  const buffer = settings.safety_buffer
  const cashAboveBuffer = cash > buffer
  const billsExceedCash = upcomingTotal > cash

  const alerts = [...(dashboard.alerts || [])].sort((a, b) => a.priority - b.priority)

  const snapshot = invoices
    .filter((i) => i.status === 'overdue' || i.status === 'sent')
    .map((i) => ({ ...i, daysOverdue: daysBetween(i.due_date, today) }))
    .sort((a, b) => b.daysOverdue - a.daysOverdue)

  const inflowTotal = snapshot.reduce((sum, i) => sum + i.amount, 0)
  const outflowTotal = upcomingTotal
  const maxFlow = Math.max(inflowTotal, outflowTotal)
  const inflowPercent = maxFlow > 0 ? (inflowTotal / maxFlow) * 100 : 0
  const outflowPercent = maxFlow > 0 ? (outflowTotal / maxFlow) * 100 : 0
  const netImpact = inflowTotal - outflowTotal

  const nextDue = [
    ...unpaidInvoices.map((i) => ({
      key: `inv-${i.id}`,
      name: i.client_name || i.title,
      amount: i.amount,
      due_date: i.due_date,
      kind: 'inflow',
    })),
    ...bills
      .filter((b) => !b.is_paid)
      .map((b) => ({ key: `bill-${b.id}`, name: b.name, amount: b.amount, due_date: b.due_date, kind: 'outflow' })),
  ]
    .sort((a, b) => (a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0))
    .slice(0, 3)

  function relativeDue(dueDate) {
    const diff = daysBetween(today, dueDate)
    if (diff === 0) return 'due today'
    if (diff === 1) return 'due tomorrow'
    if (diff > 1) return `in ${diff} days`
    return `${-diff} day${diff === -1 ? '' : 's'} overdue`
  }

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
        <KpiCard
          icon={Wallet}
          iconClass="bg-emerald-50 text-emerald-600"
          label="Current Cash Balance"
          value={formatINR(cash)}
          sub={
            cashAboveBuffer
              ? `${formatINR(cash - buffer)} above safety buffer`
              : `${formatINR(buffer - cash)} below safety buffer`
          }
          subClass={cashAboveBuffer ? 'text-emerald-700' : 'text-amber-700'}
        />
        <KpiCard
          icon={Receipt}
          iconClass="bg-blue-50 text-blue-600"
          label="Total Unpaid"
          value={formatINR(unpaidTotal)}
          sub={`${unpaidInvoices.length} open invoice${unpaidInvoices.length === 1 ? '' : 's'}`}
        />
        <KpiCard
          icon={AlertTriangle}
          iconClass="bg-rose-50 text-rose-600"
          label="Total Overdue"
          value={formatINR(totals.overdueAmount)}
          sub={`${totals.overdueCount} overdue invoice${totals.overdueCount === 1 ? '' : 's'}`}
          valueClass={totals.overdueAmount > 0 ? 'text-rose-600' : 'text-slate-900'}
          borderClass={totals.overdueAmount > 0 ? 'border-rose-200' : 'border-slate-200'}
        />
        <KpiCard
          icon={CalendarClock}
          iconClass="bg-slate-100 text-slate-600"
          label="Upcoming 30-Day Bills"
          value={formatINR(upcomingTotal)}
          sub={`${upcomingBills.length} unpaid bill${upcomingBills.length === 1 ? '' : 's'} · buffer ${formatINR(buffer)}`}
          valueClass={billsExceedCash ? 'text-amber-600' : 'text-slate-900'}
          borderClass={billsExceedCash ? 'border-amber-200' : 'border-slate-200'}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-7">
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
                const accent = SEVERITY_ACCENTS[alert.severity] || SEVERITY_ACCENTS.info
                return (
                  <li
                    key={`${alert.type}-${alert.priority}`}
                    className={`flex items-start gap-3 border-l-4 px-5 py-3 transition-colors hover:bg-slate-50 ${accent}`}
                  >
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

        <Card className="lg:col-span-5">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-base font-semibold text-slate-900">Cash flow snapshot</h2>
          </div>
          <div className="flex flex-col gap-5 px-5 py-5">
            <ProgressRow
              label="Expected inflows"
              amount={inflowTotal}
              percent={inflowPercent}
              barClass="bg-emerald-500"
            />
            <ProgressRow
              label="Scheduled outflows (30 days)"
              amount={outflowTotal}
              percent={outflowPercent}
              barClass={outflowTotal > inflowTotal ? 'bg-amber-500' : 'bg-slate-500'}
            />
            <div className="flex items-center justify-between border-t border-slate-100 pt-4 text-sm">
              <span className="text-slate-600">Net projected impact</span>
              <span
                className={`money tabular-nums font-semibold ${
                  netImpact > 0 ? 'text-emerald-700' : netImpact < 0 ? 'text-rose-600' : 'text-slate-600'
                }`}
              >
                {netImpact > 0 ? '+' : netImpact < 0 ? '-' : ''}
                {formatINR(Math.abs(netImpact))}
              </span>
            </div>
          </div>
          <div className="border-t border-slate-200 px-5 py-4">
            <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              Next due
            </h3>
            {nextDue.length === 0 ? (
              <p className="text-sm text-slate-500">Nothing due right now.</p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {nextDue.map((item) => {
                  const isInflow = item.kind === 'inflow'
                  const DirIcon = isInflow ? ArrowDownLeft : ArrowUpRight
                  return (
                    <li key={item.key} className="flex items-center gap-3 text-sm">
                      <DirIcon
                        className={`h-4 w-4 shrink-0 ${isInflow ? 'text-emerald-600' : 'text-slate-500'}`}
                        aria-hidden="true"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-slate-900">{item.name}</p>
                        <p className="text-xs text-slate-500">{relativeDue(item.due_date)}</p>
                      </div>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                          isInflow ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-slate-100 text-slate-700 ring-slate-200'
                        }`}
                      >
                        {isInflow ? 'Inflow' : 'Outflow'}
                      </span>
                      <span className="money tabular-nums font-medium text-slate-900">{formatINR(item.amount)}</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </Card>
      </section>

      <Card>
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">Overdue &amp; unpaid</h2>
        </div>
        {loading && snapshot.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">Loading invoices…</p>
        ) : snapshot.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="All caught up"
            message="No overdue or unpaid invoices. Every sent invoice is paid."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Client</th>
                  <th className="px-3 py-2.5 font-medium">Invoice</th>
                  <th className="px-3 py-2.5 text-right font-medium">Amount</th>
                  <th className="px-3 py-2.5 font-medium">Days overdue</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-5 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {snapshot.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-slate-100 text-xs font-semibold text-slate-600">
                          {initialsOf(inv.client_name)}
                        </span>
                        <span className="font-medium text-slate-900">{inv.client_name || '—'}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-slate-600">
                      {inv.title}
                      <span className="block text-xs text-slate-400">Due {formatDate(inv.due_date)}</span>
                    </td>
                    <td className="money tabular-nums px-3 py-3 text-right text-slate-900">{formatINR(inv.amount)}</td>
                    <td className="px-3 py-3">
                      {inv.daysOverdue > 0 ? (
                        <span className="money tabular-nums inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-inset ring-rose-200">
                          {inv.daysOverdue} days
                        </span>
                      ) : inv.daysOverdue === 0 ? (
                        <span className="text-slate-500">Due today</span>
                      ) : (
                        <span className="tabular-nums text-slate-500">Due in {-inv.daysOverdue} days</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge status={inv.status} />
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
