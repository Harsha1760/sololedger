import { useEffect, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ArrowRightLeft, CalendarClock, TrendingDown, Wallet } from 'lucide-react'
import { Button, Card, ErrorBanner, inputClass } from '../components/ui'
import { getForecast, getInvoices } from '../lib/api'
import { formatDate, formatDateShort, formatINR } from '../lib/format'

const HORIZONS = [30, 60, 90]
const OPEN_STATUSES = ['sent', 'overdue']

const signedINR = (n) => `${n < 0 ? '-' : '+'}${formatINR(Math.abs(n))}`

function minBalance(series) {
  return series.length ? series.reduce((m, p) => Math.min(m, p.balance), Infinity) : 0
}

function countBelow(series, buffer) {
  return series.filter((p) => p.balance < buffer).length
}

function CashTooltip({ active, payload, label, buffer = 0 }) {
  if (!active || !payload?.length) return null
  const balance = Number(payload[0].payload.balance) || 0
  const margin = balance - buffer
  return (
    <div className="rounded-lg bg-slate-900 px-3 py-2 text-xs text-white shadow-lg tabular-nums">
      <p className="font-medium text-slate-300">{formatDate(label)}</p>
      <div className="mt-1 flex items-center justify-between gap-4">
        <span className="text-slate-400">Projected Balance</span>
        <span className="money tabular-nums">{formatINR(balance)}</span>
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-4">
        <span className="text-slate-400">Buffer Margin</span>
        <span className={`money tabular-nums ${margin >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
          {signedINR(margin)}
        </span>
      </div>
    </div>
  )
}

export default function CashForecastTab({ refreshKey }) {
  const [days, setDays] = useState(90)
  const [openInvoices, setOpenInvoices] = useState([])
  const [whatIfId, setWhatIfId] = useState('')
  const [delayDays, setDelayDays] = useState(7)
  const [data, setData] = useState(null)
  const [baseData, setBaseData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let ignore = false
    getInvoices()
      .then((rows) => {
        if (!ignore) setOpenInvoices(rows.filter((i) => OPEN_STATUSES.includes(i.status)))
      })
      .catch((err) => {
        if (!ignore) setError(err.message)
      })
    return () => {
      ignore = true
    }
  }, [refreshKey])

  useEffect(() => {
    let ignore = false
    // Short debounce so dragging the delay slider does not fire a request per pixel.
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        if (whatIfId) {
          const [base, sim] = await Promise.all([
            getForecast({ days }),
            getForecast({ days, delayInvoiceId: whatIfId, delayDays }),
          ])
          if (ignore) return
          setBaseData(base)
          setData(sim)
        } else {
          const res = await getForecast({ days })
          if (ignore) return
          setBaseData(null)
          setData(res)
        }
        setError('')
      } catch (err) {
        if (!ignore) setError(err.message)
      } finally {
        if (!ignore) setLoading(false)
      }
    }, 150)
    return () => {
      ignore = true
      clearTimeout(timer)
    }
  }, [days, whatIfId, delayDays, refreshKey])

  const buffer = data?.safetyBuffer ?? 0
  const primarySeries = data?.simulated ?? data?.baseline ?? []
  const showCompare = Boolean(whatIfId && baseData && data?.simulated)
  const baseSeries = showCompare ? baseData.baseline : []
  const simSeries = showCompare ? data.simulated : []

  const chartData = primarySeries.map((point, i) => ({
    date: point.date,
    balance: point.balance,
    baseline: showCompare ? baseSeries[i]?.balance : undefined,
  }))

  const values = chartData.flatMap((p) => [p.balance, p.baseline]).filter((v) => typeof v === 'number')
  values.push(buffer)
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const pad = Math.max((hi - lo) * 0.08, 1000)
  const minY = lo - pad
  const maxY = lo < 0 ? Math.max(hi + pad, 0) : hi + pad

  const daysBelowBuffer = countBelow(primarySeries, buffer)
  const lowest = data?.lowestBalance ?? 0
  const lowestClass = lowest < 0 ? 'text-rose-600' : lowest < buffer ? 'text-amber-600' : 'text-emerald-600'

  const baseLowest = minBalance(baseSeries)
  const simLowest = minBalance(simSeries)
  const lowestDelta = simLowest - baseLowest
  const extraDays = countBelow(simSeries, buffer) - countBelow(baseSeries, buffer)
  const extraAbs = Math.abs(extraDays)
  const extraLabel = `${extraDays > 0 ? '+' : extraDays < 0 ? '-' : ''}${extraAbs} ${
    extraAbs === 1 ? 'day' : 'days'
  } below buffer`

  return (
    <div className="flex flex-col gap-4">
      <ErrorBanner message={error} onDismiss={() => setError('')} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Forecast horizon" className="inline-flex rounded-lg bg-slate-100 p-1">
          {HORIZONS.map((h) => (
            <button
              key={h}
              type="button"
              aria-pressed={days === h}
              onClick={() => setDays(h)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                days === h ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {h} days
            </button>
          ))}
        </div>
        {loading && data && <span className="text-xs text-slate-500">Updating…</span>}
      </div>

      {showCompare && (
        <Card className="rounded-xl border-slate-200 p-5 shadow-sm">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                <ArrowRightLeft className="h-4 w-4" aria-hidden="true" />
              </span>
              <p className="text-sm font-semibold text-slate-900">Impact of delay</p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Baseline lowest cash</p>
              <p className="money tabular-nums mt-1 text-lg font-semibold text-slate-900">{formatINR(baseLowest)}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Simulated lowest cash</p>
              <p className="money tabular-nums mt-1 text-lg font-semibold text-slate-900">{formatINR(simLowest)}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Change</p>
              <p
                className={`money tabular-nums mt-1 text-lg font-semibold ${
                  lowestDelta < 0 ? 'text-rose-600' : 'text-emerald-700'
                }`}
              >
                {signedINR(lowestDelta)}
              </p>
            </div>
            <p className={`text-sm font-medium ${extraDays > 0 ? 'text-rose-600' : 'text-slate-600'}`}>{extraLabel}</p>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className={`rounded-xl border-slate-200 p-5 shadow-sm ${lowest < buffer ? 'border-amber-200' : ''}`}>
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
              <TrendingDown className="h-4 w-4" aria-hidden="true" />
            </span>
            <p className="text-sm font-medium text-slate-500">Lowest projected balance</p>
          </div>
          <p className={`money tabular-nums mt-3 text-2xl font-semibold ${lowestClass}`}>
            {data ? formatINR(lowest) : '—'}
          </p>
          <p className="mt-1 text-xs text-slate-500">{data ? `on ${formatDate(data.lowestDate)}` : ' '}</p>
        </Card>
        <Card className={`rounded-xl border-slate-200 p-5 shadow-sm ${daysBelowBuffer > 0 ? 'border-rose-200' : ''}`}>
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <CalendarClock className="h-4 w-4" aria-hidden="true" />
            </span>
            <p className="text-sm font-medium text-slate-500">Days below safety buffer</p>
          </div>
          <p
            className={`money tabular-nums mt-3 text-2xl font-semibold ${
              daysBelowBuffer > 0 ? 'text-rose-600' : 'text-slate-900'
            }`}
          >
            {daysBelowBuffer}
          </p>
          <p className="mt-1 text-xs text-slate-500">of {days} days in the horizon</p>
        </Card>
        <Card className="rounded-xl border-slate-200 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <Wallet className="h-4 w-4" aria-hidden="true" />
            </span>
            <p className="text-sm font-medium text-slate-500">Starting cash</p>
          </div>
          <p className="money tabular-nums mt-3 text-2xl font-semibold text-slate-900">
            {data ? formatINR(data.startingBalance) : '—'}
          </p>
          <p className="mt-1 text-xs text-slate-500">Safety buffer {data ? formatINR(buffer) : '—'}</p>
        </Card>
      </div>

      <Card className="rounded-xl border-slate-200 p-5 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span className="flex items-center gap-2">
            <span className="inline-block h-0.5 w-4 bg-emerald-600" aria-hidden="true" />
            {showCompare ? 'Simulated balance' : 'Projected balance'}
          </span>
          {showCompare && (
            <span className="flex items-center gap-2">
              <span className="inline-block h-0 w-4 border-t-2 border-dashed border-slate-500" aria-hidden="true" />
              Baseline
            </span>
          )}
        </div>
        <div className="h-80 w-full">
          {!data ? (
            <p className="text-sm text-slate-500">Loading forecast…</p>
          ) : chartData.length === 0 ? (
            <p className="text-sm text-slate-500">No forecast data for this horizon.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
                <defs>
                  <linearGradient id="cashFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDateShort}
                  minTickGap={24}
                  tick={{ fill: '#64748b', fontSize: 12 }}
                  stroke="#cbd5e1"
                />
                <YAxis
                  domain={[minY, maxY]}
                  tickFormatter={(v) => formatINR(v)}
                  width={100}
                  tick={{ fill: '#64748b', fontSize: 12 }}
                  stroke="#cbd5e1"
                />
                <ReferenceArea y1={minY} y2={buffer} fill="#fef3c7" fillOpacity={0.6} />
                {minY < 0 && <ReferenceArea y1={minY} y2={0} fill="#fff1f2" fillOpacity={1} />}
                <ReferenceLine
                  y={buffer}
                  stroke="#d97706"
                  strokeDasharray="4 4"
                  label={{ value: 'Buffer', position: 'insideTopRight', fill: '#b45309', fontSize: 12 }}
                />
                <Tooltip content={<CashTooltip buffer={buffer} />} />
                <Area
                  type="monotone"
                  dataKey="balance"
                  stroke="#059669"
                  strokeWidth={2}
                  fill="url(#cashFill)"
                  dot={false}
                  isAnimationActive
                />
                {showCompare && (
                  <Line
                    type="monotone"
                    dataKey="baseline"
                    stroke="#64748b"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={false}
                    isAnimationActive
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      <Card className="rounded-xl border-slate-200 p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">What if an invoice is delayed?</h2>
        <p className="mt-1 text-sm text-slate-500">Pick an open invoice and push its payment date back to see the effect.</p>
        <div className="mt-4 grid grid-cols-1 items-end gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="whatif-invoice" className="text-xs font-medium text-slate-600">
              Invoice
            </label>
            <select
              id="whatif-invoice"
              className={inputClass}
              value={whatIfId}
              onChange={(e) => setWhatIfId(e.target.value)}
            >
              <option value="">No delay</option>
              {openInvoices.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {`${inv.client_name || 'No client'} · ${inv.title} (${formatINR(inv.amount)})`}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="whatif-delay" className="text-xs font-medium text-slate-600">
              Delay by {delayDays} day{delayDays === 1 ? '' : 's'}
            </label>
            <div className="flex items-center gap-3">
              <input
                id="whatif-delay"
                type="range"
                min="0"
                max="30"
                step="1"
                value={delayDays}
                disabled={!whatIfId}
                onChange={(e) => setDelayDays(Number(e.target.value))}
                className="w-full accent-slate-900 disabled:opacity-50"
              />
              <Button variant="ghost" size="sm" onClick={() => setWhatIfId('')} disabled={!whatIfId}>
                Clear
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
