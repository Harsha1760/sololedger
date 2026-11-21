import { useEffect, useState } from 'react'
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { AlertTriangle, CheckCircle2, CloudRain, Inbox } from 'lucide-react'
import ChaseComposer from '../components/ChaseComposer'
import PaidStamp from '../components/PaidStamp'
import { Button, Card, EmptyState, ErrorBanner, StatusBadge } from '../components/ui'
import { getBills, getCustomers, getForecast, getInvoices, payBill, setInvoiceStatus } from '../lib/api'
import { daysBetween, formatDate, formatDateShort, formatINR, todayYMD } from '../lib/format'

function isOverdueInvoice(inv, today) {
  if (inv.status === 'paid') return false
  return inv.status === 'overdue' || (inv.status === 'sent' && daysBetween(inv.due_date, today) > 0)
}

function lateDays(inv, today) {
  return Math.max(0, daysBetween(inv.due_date, today))
}

function reliabilityTag(customer) {
  if (!customer) return null
  const late = Math.round(Number(customer.avg_late_days) || 0)
  if (late > 0) return `Usually ${late}d late`
  return customer.reliability_label || null
}

function relativeDue(dueDate, today) {
  const diff = daysBetween(today, dueDate)
  if (diff === 0) return 'due today'
  if (diff === 1) return 'due tomorrow'
  if (diff > 1) return `in ${diff} days`
  return `${-diff} day${diff === -1 ? '' : 's'} overdue`
}

function CashSparkline({ points }) {
  return (
    <div className="h-24 w-full text-emerald-600">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="overviewCashFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity={0.3} />
              <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="date" hide />
          <YAxis hide domain={['auto', 'auto']} />
          <Area
            type="monotone"
            dataKey="balance"
            stroke="currentColor"
            strokeWidth={2}
            fill="url(#overviewCashFill)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

export default function OverviewTab({ dashboard, refreshKey, onChanged, onNotify, onNavigate }) {
  const [invoices, setInvoices] = useState([])
  const [bills, setBills] = useState([])
  const [customers, setCustomers] = useState([])
  const [baseForecast, setBaseForecast] = useState(null)
  const [whatIf, setWhatIf] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyKey, setBusyKey] = useState(null)
  const [stampKey, setStampKey] = useState(null)
  const [rowError, setRowError] = useState(null)
  const [selectedKey, setSelectedKey] = useState(null)
  const [delayDays, setDelayDays] = useState(0)
  const [badDay, setBadDay] = useState(false)
  const [doneKeys, setDoneKeys] = useState(() => new Set())
  const [settledKeys, setSettledKeys] = useState(() => new Set())

  useEffect(() => {
    let ignore = false
    Promise.all([getInvoices(), getBills(), getCustomers().catch(() => [])])
      .then(([inv, b, c]) => {
        if (ignore) return
        setInvoices(inv)
        setBills(b)
        setCustomers(c)
        setSettledKeys(new Set())
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

  useEffect(() => {
    let ignore = false
    getForecast({ days: 30 })
      .then((f) => {
        if (!ignore) setBaseForecast(f)
      })
      .catch(() => {
        if (!ignore) setBaseForecast(null)
      })
    return () => {
      ignore = true
    }
  }, [refreshKey])

  const today = todayYMD()
  const { settings, totals } = dashboard
  const cash = settings.current_cash_balance
  const buffer = settings.safety_buffer

  const unpaidInvoices = invoices.filter((i) => i.status !== 'paid')
  const unpaidTotal = unpaidInvoices.reduce((sum, i) => sum + i.amount, 0)
  const upcomingBills = bills.filter((b) => !b.is_paid && daysBetween(today, b.due_date) <= 30)
  const upcomingTotal = upcomingBills.reduce((sum, b) => sum + b.amount, 0)
  const billsExceedCash = upcomingTotal > cash

  const overdueByLate = invoices
    .filter((i) => isOverdueInvoice(i, today))
    .sort((a, b) => lateDays(b, today) - lateDays(a, today))
  const overdueByAmount = invoices
    .filter((i) => isOverdueInvoice(i, today))
    .sort((a, b) => b.amount - a.amount)
  const sentByAmount = invoices
    .filter((i) => i.status === 'sent' && !isOverdueInvoice(i, today))
    .sort((a, b) => b.amount - a.amount)
  const chaseQueue = [...overdueByAmount, ...sentByAmount]

  const feed = [
    ...overdueByLate.map((inv) => ({ key: `inv-${inv.id}`, kind: 'invoice', inv })),
    ...upcomingBills
      .slice()
      .sort((a, b) => (a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0))
      .map((bill) => ({ key: `bill-${bill.id}`, kind: 'bill', bill })),
  ]

  const customerByName = new Map(customers.map((c) => [String(c.name).toLowerCase(), c]))

  const selectedInvoice = selectedKey?.startsWith('inv-')
    ? invoices.find((i) => `inv-${i.id}` === selectedKey) || null
    : null
  const selectedBill = selectedKey?.startsWith('bill-')
    ? bills.find((b) => `bill-${b.id}` === selectedKey) || null
    : null
  const selectedInvoiceId = selectedInvoice && selectedInvoice.status !== 'paid' ? selectedInvoice.id : null

  function firstActionableKey() {
    const inv =
      overdueByLate.find((i) => !settledKeys.has(`inv-${i.id}`)) ||
      unpaidInvoices.find((i) => !settledKeys.has(`inv-${i.id}`))
    if (inv) return `inv-${inv.id}`
    const bill = feed.find((item) => item.kind === 'bill' && !settledKeys.has(item.key))
    return bill ? bill.key : null
  }

  const nextKey = firstActionableKey()
  const selectedRecordMissing = selectedKey !== null && !selectedInvoice && !selectedBill
  const selectedDone =
    selectedKey !== null &&
    (settledKeys.has(selectedKey) || selectedInvoice?.status === 'paid' || selectedBill?.is_paid === true)

  useEffect(() => {
    if (loading) return
    if (selectedKey !== null && !selectedDone && !selectedRecordMissing) return
    if (nextKey !== selectedKey) {
      setSelectedKey(nextKey)
      setDelayDays(0)
    }
  }, [loading, selectedKey, selectedDone, selectedRecordMissing, nextKey])

  useEffect(() => {
    if (selectedInvoiceId === null || delayDays === 0) {
      setWhatIf(null)
      return
    }
    let ignore = false
    getForecast({ days: 30, delayInvoiceId: selectedInvoiceId, delayDays })
      .then((f) => {
        if (!ignore) setWhatIf(f)
      })
      .catch(() => {
        if (!ignore) setWhatIf(null)
      })
    return () => {
      ignore = true
    }
  }, [selectedInvoiceId, delayDays])

  const points = (baseForecast?.baseline || []).map((d) => ({ date: d.date, balance: d.balance }))

  const gap = cash - buffer
  const status =
    cash < 0
      ? { text: `Crunch · ${formatINR(buffer - cash)} short`, className: 'text-rose-600' }
      : gap >= 0
        ? { text: `Safe · ${formatINR(gap)} above buffer`, className: 'text-emerald-700' }
        : { text: `Watch · ${formatINR(-gap)} below buffer`, className: 'text-amber-600' }

  const rescueInvoices = overdueByAmount.slice(0, 2)
  const rescueTotal = rescueInvoices.reduce((sum, i) => sum + i.amount, 0)
  const afterRescue = cash + rescueTotal
  const stillShort = buffer - afterRescue

  const lowestNow = baseForecast?.lowestBalance
  const lowestWhatIf = whatIf?.lowestBalance
  const delayDiff = lowestWhatIf !== undefined && lowestNow !== undefined ? lowestWhatIf - lowestNow : 0

  function selectItem(key) {
    setSelectedKey(key)
    setDelayDays(0)
  }

  function toggleDone(key) {
    setDoneKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function markInvoicePaid(inv) {
    const key = `inv-${inv.id}`
    setBusyKey(key)
    setError('')
    setRowError(null)
    try {
      await setInvoiceStatus(inv.id, 'paid')
      setSettledKeys((prev) => new Set(prev).add(key))
      onNotify('Marked paid — cash balance updated')
      setStampKey(key)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyKey(null)
    }
  }

  async function payBillItem(bill) {
    const key = `bill-${bill.id}`
    setBusyKey(key)
    setError('')
    setRowError(null)
    try {
      await payBill(bill.id)
      setSettledKeys((prev) => new Set(prev).add(key))
      onNotify('Bill paid')
      setStampKey(key)
    } catch (err) {
      if (err.status === 409) setRowError({ key, message: err.message })
      else setError(err.message)
    } finally {
      setBusyKey(null)
    }
  }

  function handleStampDone() {
    setStampKey(null)
    onChanged()
  }

  const doneCount = chaseQueue.filter((i) => doneKeys.has(`inv-${i.id}`)).length

  return (
    <div className="flex flex-col gap-6">
      <ErrorBanner message={error} onDismiss={() => setError('')} />

      <div className="flex justify-end">
        <button
          type="button"
          aria-pressed={badDay}
          onClick={() => setBadDay((v) => !v)}
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
            badDay
              ? 'border-rose-300 bg-rose-50 text-rose-700'
              : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          <span
            className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
              badDay ? 'bg-rose-600' : 'bg-slate-300'
            }`}
          >
            <span
              className={`inline-block h-3 w-3 rounded-full bg-white transition-transform ${
                badDay ? 'translate-x-3.5' : 'translate-x-0.5'
              }`}
            />
          </span>
          Bad Day Mode
        </button>
      </div>

      <Card className="p-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-500">Current cash</p>
            <p className="money tabular-nums mt-2 text-5xl font-semibold text-slate-900">{formatINR(cash)}</p>
            <p className={`mt-3 text-sm font-medium ${status.className}`}>{status.text}</p>
          </div>
          <div className="w-full lg:w-80">
            <p className="mb-1 text-xs font-medium text-slate-500">Next 30 days</p>
            {points.length > 0 && <CashSparkline points={points} />}
          </div>
        </div>
        <dl className="mt-6 grid grid-cols-3 gap-4 border-t border-slate-200 pt-4">
          <div>
            <dt className="text-xs text-slate-500">Total unpaid</dt>
            <dd className="money tabular-nums mt-0.5 text-sm font-medium text-slate-900">{formatINR(unpaidTotal)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Overdue</dt>
            <dd
              className={`money tabular-nums mt-0.5 text-sm font-medium ${
                totals.overdueAmount > 0 ? 'text-rose-600' : 'text-slate-900'
              }`}
            >
              {formatINR(totals.overdueAmount)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Bills due in 30 days</dt>
            <dd
              className={`money tabular-nums mt-0.5 text-sm font-medium ${
                billsExceedCash ? 'text-amber-600' : 'text-slate-900'
              }`}
            >
              {formatINR(upcomingTotal)}
            </dd>
          </div>
        </dl>
      </Card>

      {badDay && (
        <Card className="border-rose-200 bg-rose-50 shadow-none">
          <div className="flex items-start gap-3 px-5 py-4">
            <CloudRain className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold text-slate-900">Bad Day rescue plan</h2>
              {overdueByAmount.length === 0 ? (
                <p className="mt-1 text-sm text-emerald-700">Nothing is overdue today. Your collections are on track.</p>
              ) : (
                <p className="mt-1 text-sm text-rose-800">
                  Chase {rescueInvoices.map((i) => i.client_name || i.title).join(' & ')} today to recover{' '}
                  <span className="money tabular-nums font-semibold">{formatINR(rescueTotal)}</span> and keep your cash
                  above buffer.
                  {stillShort > 0 && (
                    <span className="money tabular-nums font-medium text-amber-700">
                      {' '}
                      Still {formatINR(stillShort)} short of buffer after these.
                    </span>
                  )}
                </p>
              )}
            </div>
          </div>
          {chaseQueue.length > 0 && (
            <div className="border-t border-rose-200 bg-white px-5 py-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Chase All</h3>
                <span className="money tabular-nums text-xs text-slate-500">
                  {doneCount} of {chaseQueue.length} done
                </span>
              </div>
              <ol className="divide-y divide-slate-100">
                {chaseQueue.map((inv, index) => {
                  const key = `inv-${inv.id}`
                  const done = doneKeys.has(key)
                  const late = lateDays(inv, today)
                  return (
                    <li key={key} className={`flex items-center gap-3 py-2.5 ${done ? 'opacity-50' : ''}`}>
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={`truncate text-sm font-medium text-slate-900 ${done ? 'line-through' : ''}`}>
                          {inv.client_name || 'Client'}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {inv.title} · {late > 0 ? `${late}d late` : `due ${formatDateShort(inv.due_date)}`}
                        </p>
                      </div>
                      <span className="money tabular-nums text-sm font-medium text-slate-900">{formatINR(inv.amount)}</span>
                      <Button variant="secondary" size="sm" onClick={() => selectItem(key)}>
                        Chase
                      </Button>
                      <label className="flex items-center gap-1.5 text-xs text-slate-600">
                        <input
                          type="checkbox"
                          checked={done}
                          onChange={() => toggleDone(key)}
                          className="h-4 w-4 accent-slate-900"
                        />
                        Done
                      </label>
                    </li>
                  )
                })}
              </ol>
            </div>
          )}
        </Card>
      )}

      <section className="grid gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <h2 className="text-base font-semibold text-slate-900">Action feed</h2>
            <span className="text-xs text-slate-500">{feed.length} item{feed.length === 1 ? '' : 's'}</span>
          </div>
          {loading && invoices.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">Loading…</p>
          ) : feed.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="All clear"
              message="Nothing is overdue and no bills are due in the next 30 days."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {feed.map((item) => {
                const selected = selectedKey === item.key
                const isInvoice = item.kind === 'invoice'
                const busy = busyKey === item.key
                const sentence = isInvoice
                  ? `${item.inv.client_name || item.inv.title} owes you ${formatINR(item.inv.amount)} (${lateDays(item.inv, today)}d late)`
                  : `${item.bill.name} is due (${formatINR(item.bill.amount)}) on ${formatDateShort(item.bill.due_date)}`
                const tag = isInvoice ? reliabilityTag(customerByName.get(String(item.inv.client_name).toLowerCase())) : null
                return (
                  <li key={item.key} className="relative">
                    <div className={`flex items-center gap-3 px-5 py-3 ${selected ? 'bg-slate-50' : 'hover:bg-slate-50'}`}>
                      <button
                        type="button"
                        onClick={() => selectItem(item.key)}
                        aria-pressed={selected}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="text-sm text-slate-900">{sentence}</p>
                        {tag && (
                          <span className="mt-1 inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-200">
                            {tag}
                          </span>
                        )}
                        {!isInvoice && (
                          <span className="mt-1 block text-xs text-slate-500">
                            {relativeDue(item.bill.due_date, today)}
                          </span>
                        )}
                      </button>
                      {isInvoice ? (
                        <Button variant="success" size="sm" onClick={() => markInvoicePaid(item.inv)} disabled={busy}>
                          Mark Paid
                        </Button>
                      ) : (
                        <Button variant="primary" size="sm" onClick={() => payBillItem(item.bill)} disabled={busy}>
                          Pay
                        </Button>
                      )}
                    </div>
                    {rowError && rowError.key === item.key && (
                      <p role="alert" className="px-5 pb-3 text-xs text-rose-600">
                        {rowError.message}
                      </p>
                    )}
                    <PaidStamp show={stampKey === item.key} onDone={handleStampDone} />
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        <Card className="lg:col-span-5">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-base font-semibold text-slate-900">Chase stage</h2>
          </div>
          {selectedInvoice ? (
            <div className="flex flex-col gap-5 px-5 py-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-slate-900">
                    {selectedInvoice.client_name || 'Client'}
                  </p>
                  <p className="truncate text-sm text-slate-600">{selectedInvoice.title}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="money tabular-nums text-xl font-semibold text-slate-900">
                    {formatINR(selectedInvoice.amount)}
                  </span>
                  <StatusBadge status={selectedInvoice.status} />
                </div>
              </div>

              {selectedInvoiceId !== null && (
                <div className="rounded-lg border border-slate-200 p-4">
                  <div className="flex items-center justify-between">
                    <label htmlFor="overview-delay" className="text-sm font-medium text-slate-700">
                      What if delayed?
                    </label>
                    <span className="money tabular-nums text-sm text-slate-600">{delayDays} days</span>
                  </div>
                  <input
                    id="overview-delay"
                    type="range"
                    min={0}
                    max={30}
                    step={1}
                    value={delayDays}
                    onChange={(e) => setDelayDays(Number(e.target.value))}
                    className="mt-3 w-full accent-slate-900"
                  />
                  <p className="money tabular-nums mt-3 text-sm text-slate-600">
                    Lowest projected cash (30 days): {formatINR(lowestNow ?? 0)}
                  </p>
                  {delayDays > 0 && whatIf && (
                    <p className="money tabular-nums mt-1 text-sm">
                      {delayDiff < 0 ? (
                        <span className="font-semibold text-rose-600">{formatINR(-delayDiff)} worse</span>
                      ) : (
                        <span className="text-slate-600">No change to the low point</span>
                      )}
                      <span className="text-slate-500"> with a {delayDays}-day delay</span>
                    </p>
                  )}
                </div>
              )}

              <ChaseComposer invoice={selectedInvoice} onNotify={onNotify} onChased={onChanged} />
            </div>
          ) : selectedBill ? (
            <div className="flex flex-col gap-4 px-5 py-5">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Bill</p>
                <p className="mt-1 text-base font-semibold text-slate-900">{selectedBill.name}</p>
                <p className="money tabular-nums mt-1 text-xl font-semibold text-slate-900">
                  {formatINR(selectedBill.amount)}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  Due {formatDate(selectedBill.due_date)} · {relativeDue(selectedBill.due_date, today)}
                </p>
              </div>
              {rowError && rowError.key === `bill-${selectedBill.id}` && (
                <p role="alert" className="text-xs text-rose-600">
                  {rowError.message}
                </p>
              )}
              <div>
                <Button
                  variant="primary"
                  onClick={() => payBillItem(selectedBill)}
                  disabled={busyKey === `bill-${selectedBill.id}`}
                >
                  Pay bill
                </Button>
              </div>
            </div>
          ) : (
            <EmptyState icon={Inbox} title="Select an item to see the chase stage." />
          )}
        </Card>
      </section>

      {!loading && overdueByAmount.length === 0 && (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <AlertTriangle className="h-4 w-4 text-slate-300" aria-hidden="true" />
          No overdue invoices. Every sent invoice is on schedule.
        </p>
      )}
    </div>
  )
}
