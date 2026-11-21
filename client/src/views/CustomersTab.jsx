import { useEffect, useMemo, useState } from 'react'
import { Mail, Phone, Search, Users } from 'lucide-react'
import { Button, Card, EmptyState, ErrorBanner, StatusBadge, inputClass } from '../components/ui'
import { getCustomers, setInvoiceStatus } from '../lib/api'
import { formatDate, formatINR } from '../lib/format'

function initialsOf(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return parts
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('')
}

function reliabilityTone(label) {
  const text = String(label || '')
  if (/new/i.test(text)) return 'new'
  if (/on time/i.test(text)) return 'ontime'
  return 'late'
}

const TONE_STYLES = {
  ontime: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  late: 'bg-amber-50 text-amber-700 ring-amber-200',
  new: 'bg-slate-100 text-slate-600 ring-slate-200',
}

function ReliabilityTag({ label }) {
  const tone = reliabilityTone(label)
  const text = label || 'New client'
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONE_STYLES[tone]}`}
    >
      {text}
    </span>
  )
}

function Avatar({ name, size = 'sm' }) {
  const sizing = size === 'lg' ? 'h-12 w-12 text-base' : 'h-8 w-8 text-xs'
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-md bg-slate-100 font-semibold text-slate-600 ${sizing}`}
    >
      {initialsOf(name)}
    </span>
  )
}

function Stat({ label, value, tone = 'default' }) {
  const valueClass = tone === 'rose' ? 'text-rose-600' : 'text-slate-900'
  return (
    <div className="min-w-0">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`money tabular-nums mt-1 text-lg font-semibold ${valueClass}`}>{value}</p>
    </div>
  )
}

export default function CustomersTab({ onNotify, onChanged, onChase }) {
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [busyId, setBusyId] = useState(null)

  async function loadCustomers() {
    try {
      const rows = await getCustomers()
      setCustomers(Array.isArray(rows) ? rows : [])
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let ignore = false
    getCustomers()
      .then((rows) => {
        if (!ignore) {
          setCustomers(Array.isArray(rows) ? rows : [])
          setError('')
        }
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
  }, [])

  const needle = query.trim().toLowerCase()
  const filtered = useMemo(
    () =>
      customers.filter(
        (c) =>
          !needle ||
          [c.name, c.email].some((v) => String(v || '').toLowerCase().includes(needle)),
      ),
    [customers, needle],
  )

  const selected = customers.find((c) => c.id === selectedId) ?? customers[0] ?? null

  async function markPaid(invoice) {
    setBusyId(invoice.id)
    setError('')
    try {
      await setInvoiceStatus(invoice.id, 'paid')
      await loadCustomers()
      onNotify?.('Marked paid — cash balance updated')
      onChanged?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <ErrorBanner message={error} onDismiss={() => setError('')} />

      {loading ? (
        <Card>
          <p className="px-5 py-6 text-sm text-slate-500">Loading clients…</p>
        </Card>
      ) : customers.length === 0 ? (
        <Card>
          <EmptyState
            icon={Users}
            title="No clients yet"
            message="Clients appear here once you create an invoice for them."
          />
        </Card>
      ) : (
        <div className="lg:grid lg:grid-cols-12 gap-6">
          <Card className="flex flex-col gap-3 p-3 lg:col-span-5">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="search"
                aria-label="Search customers"
                placeholder="Search clients"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className={`${inputClass} pl-9`}
              />
            </div>

            {filtered.length === 0 ? (
              <EmptyState icon={Search} title="No matching clients" message="Try a different name or email." />
            ) : (
              <ul className="flex flex-col gap-1">
                {filtered.map((c) => {
                  const active = selected?.id === c.id
                  const overdue = Number(c.overdue_amount) || 0
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        aria-pressed={active}
                        onClick={() => setSelectedId(c.id)}
                        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-slate-50 ${
                          active ? 'bg-slate-50 ring-1 ring-slate-300' : ''
                        }`}
                      >
                        <Avatar name={c.name} />
                        <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
                          <span className="w-full truncate text-sm font-medium text-slate-900">{c.name || '—'}</span>
                          <ReliabilityTag label={c.reliability_label} />
                        </span>
                        {overdue > 0 ? (
                          <span className="money tabular-nums shrink-0 text-sm font-medium text-rose-600">
                            {formatINR(overdue)}
                          </span>
                        ) : (
                          <span className="shrink-0 text-sm text-slate-400">—</span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>

          {selected && (
            <Card className="mt-6 flex min-w-0 flex-col gap-6 p-5 lg:col-span-7 lg:mt-0">
              <div className="flex flex-wrap items-start gap-4">
                <Avatar name={selected.name} size="lg" />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <h2 className="truncate text-lg font-semibold text-slate-900">{selected.name || '—'}</h2>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
                    <span className="inline-flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                      {selected.email || '—'}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                      {selected.phone || '—'}
                    </span>
                  </div>
                  <div>
                    <ReliabilityTag label={selected.reliability_label} />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 border-y border-slate-100 py-4 sm:grid-cols-4">
                <Stat label="Total billed" value={formatINR(selected.total_billed)} />
                <Stat label="Open amount" value={formatINR(selected.open_amount)} />
                <Stat
                  label="Overdue amount"
                  value={formatINR(selected.overdue_amount)}
                  tone={Number(selected.overdue_amount) > 0 ? 'rose' : 'default'}
                />
                <Stat label="Invoices" value={Number(selected.invoice_count) || 0} />
              </div>

              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-medium text-slate-900">Invoice history</h3>
                {(selected.invoices || []).length === 0 ? (
                  <p className="py-6 text-center text-sm text-slate-500">No invoices for this client yet.</p>
                ) : (
                  <div className="-mx-5 overflow-x-auto">
                    <table className="w-full min-w-[640px] text-left text-sm">
                      <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-5 py-3 font-medium">Title</th>
                          <th className="px-5 py-3 text-right font-medium">Amount</th>
                          <th className="px-5 py-3 font-medium">Due</th>
                          <th className="px-5 py-3 font-medium">Status</th>
                          <th className="px-5 py-3 font-medium">Late</th>
                          <th className="px-5 py-3 text-right font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selected.invoices.map((inv) => {
                          const isPaid = inv.status === 'paid'
                          const daysLate = Number(inv.days_late) || 0
                          return (
                            <tr key={inv.id} className="hover:bg-slate-50">
                              <td className="px-5 py-3 text-slate-900">{inv.title}</td>
                              <td className="money tabular-nums px-5 py-3 text-right text-slate-900">
                                {formatINR(inv.amount)}
                              </td>
                              <td className="px-5 py-3 text-slate-600">{formatDate(inv.due_date)}</td>
                              <td className="px-5 py-3">
                                <StatusBadge status={inv.status} />
                              </td>
                              <td className="px-5 py-3 text-xs">
                                {isPaid ? (
                                  <span className="text-slate-600">
                                    {daysLate > 0 ? `Paid ${daysLate}d late` : 'On time'}
                                  </span>
                                ) : daysLate > 0 ? (
                                  <span className="money tabular-nums font-medium text-rose-600">
                                    {daysLate}d overdue
                                  </span>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>
                              <td className="px-5 py-3">
                                {!isPaid ? (
                                  <div className="flex justify-end gap-2">
                                    <Button variant="secondary" size="sm" onClick={() => onChase?.(inv)}>
                                      Chase
                                    </Button>
                                    <Button
                                      variant="success"
                                      size="sm"
                                      onClick={() => markPaid(inv)}
                                      disabled={busyId === inv.id}
                                    >
                                      Mark Paid
                                    </Button>
                                  </div>
                                ) : null}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
