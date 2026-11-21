import { useEffect, useState } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Button, Card, ErrorBanner, inputClass } from '../components/ui'
import { getForecast, getInvoices } from '../lib/api'
import { formatDate, formatDateShort, formatINR } from '../lib/format'

const HORIZONS = [30, 60, 90]
const OPEN_STATUSES = ['sent', 'overdue']

export default function CashForecastTab({ refreshKey }) {
  const [days, setDays] = useState(90)
  const [openInvoices, setOpenInvoices] = useState([])
  const [whatIfId, setWhatIfId] = useState('')
  const [delayDays, setDelayDays] = useState(7)
  const [data, setData] = useState(null)
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
    const timer = setTimeout(() => {
      setLoading(true)
      getForecast({
        days,
        delayInvoiceId: whatIfId || undefined,
        delayDays: whatIfId ? delayDays : undefined,
      })
        .then((res) => {
          if (ignore) return
          setData(res)
          setError('')
        })
        .catch((err) => {
          if (!ignore) setError(err.message)
        })
        .finally(() => {
          if (!ignore) setLoading(false)
        })
    }, 150)
    return () => {
      ignore = true
      clearTimeout(timer)
    }
  }, [days, whatIfId, delayDays, refreshKey])

  const buffer = data?.safetyBuffer ?? 0
  const chartData = (data?.baseline || []).map((point, i) => {
    const bal = point.balance
    return {
      date: point.date,
      above: bal >= buffer ? bal : null,
      below: bal < buffer ? bal : null,
      delayed: data.simulated ? data.simulated[i].balance : null,
    }
  })

  const activeSeries = data?.simulated ?? data?.baseline ?? []
  const daysBelowBuffer = activeSeries.filter((p) => p.balance < buffer).length
  const lowest = data?.lowestBalance ?? 0
  const lowestClass = lowest < 0 ? 'text-rose-600' : lowest < buffer ? 'text-amber-600' : 'text-emerald-600'

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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className={`p-5 ${lowest < buffer ? 'border-amber-200' : ''}`}>
          <p className="text-sm font-medium text-slate-500">Lowest projected balance</p>
          <p className={`money mt-2 text-2xl font-semibold ${lowestClass}`}>{data ? formatINR(lowest) : '—'}</p>
          <p className="mt-1 text-xs text-slate-500">{data ? `on ${formatDate(data.lowestDate)}` : ' '}</p>
        </Card>
        <Card className={`p-5 ${daysBelowBuffer > 0 ? 'border-rose-200' : ''}`}>
          <p className="text-sm font-medium text-slate-500">Days below safety buffer</p>
          <p className={`money mt-2 text-2xl font-semibold ${daysBelowBuffer > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
            {daysBelowBuffer}
          </p>
          <p className="mt-1 text-xs text-slate-500">of {days} days in the horizon</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm font-medium text-slate-500">Starting cash</p>
          <p className="money mt-2 text-2xl font-semibold text-slate-900">
            {data ? formatINR(data.startingBalance) : '—'}
          </p>
          <p className="mt-1 text-xs text-slate-500">Safety buffer {data ? formatINR(buffer) : '—'}</p>
        </Card>
      </div>

      <Card className="p-5">
        <div className="h-80 w-full">
          {!data ? (
            <p className="text-sm text-slate-500">Loading forecast…</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDateShort}
                  minTickGap={24}
                  tick={{ fill: '#64748b', fontSize: 12 }}
                  stroke="#cbd5e1"
                />
                <YAxis
                  tickFormatter={(v) => formatINR(v)}
                  width={100}
                  tick={{ fill: '#64748b', fontSize: 12 }}
                  stroke="#cbd5e1"
                />
                <Tooltip
                  labelFormatter={(label) => formatDate(label)}
                  formatter={(value, name) => [formatINR(value), name]}
                />
                <Legend />
                <ReferenceLine
                  y={buffer}
                  stroke="#f59e0b"
                  strokeDasharray="4 4"
                  label={{ value: 'Safety buffer', position: 'insideTopRight', fill: '#b45309', fontSize: 12 }}
                />
                <Line
                  type="monotone"
                  dataKey="above"
                  name="Above buffer"
                  stroke="#059669"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="below"
                  name="Below buffer"
                  stroke="#e11d48"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
                {data.simulated && (
                  <Line
                    type="monotone"
                    dataKey="delayed"
                    name="With delay"
                    stroke="#475569"
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    dot={false}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      <Card className="p-5">
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
