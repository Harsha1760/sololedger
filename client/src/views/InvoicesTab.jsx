import { useEffect, useState } from 'react'
import { Plus, Receipt, Search } from 'lucide-react'
import { Button, Card, EmptyState, ErrorBanner, StatusBadge, inputClass } from '../components/ui'
import NewInvoiceModal from '../components/NewInvoiceModal'
import PaidStamp from '../components/PaidStamp'
import { getInvoices, setInvoiceStatus } from '../lib/api'
import { daysBetween, formatDate, formatINR, todayYMD } from '../lib/format'

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'unpaid', label: 'Unpaid' },
  { id: 'paid', label: 'Paid' },
]

function matchesFilter(invoice, filter) {
  if (filter === 'overdue') return invoice.status === 'overdue'
  if (filter === 'unpaid') return invoice.status === 'sent' || invoice.status === 'overdue'
  if (filter === 'paid') return invoice.status === 'paid'
  return true
}

function initialsOf(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return parts
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('')
}

export default function InvoicesTab({ refreshKey, onChanged, onChase, openChase, onNotify }) {
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [stampId, setStampId] = useState(null)

  useEffect(() => {
    let ignore = false
    getInvoices()
      .then((rows) => {
        if (!ignore) {
          setInvoices(rows)
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
  }, [refreshKey])

  const chase = onChase || openChase
  const today = todayYMD()
  const counts = Object.fromEntries(FILTERS.map((f) => [f.id, invoices.filter((i) => matchesFilter(i, f.id)).length]))
  const needle = query.trim().toLowerCase()
  const rows = invoices
    .filter((i) => matchesFilter(i, filter))
    .filter((i) => !needle || [i.client_name, i.title].some((v) => String(v || '').toLowerCase().includes(needle)))
    .map((i) => ({
      ...i,
      daysOverdue: i.status === 'paid' || !i.due_date ? null : daysBetween(i.due_date, today),
    }))

  function clearFilters() {
    setQuery('')
    setFilter('all')
  }

  async function markPaid(invoice) {
    setBusyId(invoice.id)
    setError('')
    try {
      await setInvoiceStatus(invoice.id, 'paid')
      setStampId(invoice.id)
      onNotify?.('Marked paid — cash balance updated')
      await onChanged?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              aria-label="Search invoices"
              placeholder="Search client or title"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className={`${inputClass} pl-9`}
            />
          </div>
          <div role="group" aria-label="Filter invoices" className="flex flex-wrap items-center gap-1.5">
            {FILTERS.map((f) => {
              const active = filter === f.id
              return (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilter(f.id)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    active
                      ? 'bg-slate-900 text-white'
                      : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {f.label}
                  <span className={`ml-1.5 tabular-nums ${active ? 'text-slate-300' : 'text-slate-400'}`}>
                    {counts[f.id]}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
        <Button onClick={() => setShowNew(true)}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          New Invoice
        </Button>
      </div>

      <ErrorBanner message={error} onDismiss={() => setError('')} />

      <Card className="overflow-hidden">
        {loading ? (
          <p className="px-5 py-6 text-sm text-slate-500">Loading invoices…</p>
        ) : invoices.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="No invoices yet"
            message="Create your first invoice to start tracking payments."
            action={
              <Button onClick={() => setShowNew(true)}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                New Invoice
              </Button>
            }
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No matching invoices"
            message="Try a different search or filter."
            action={
              <Button variant="secondary" onClick={clearFilters}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Client</th>
                  <th className="px-5 py-3 font-medium">Title</th>
                  <th className="px-5 py-3 text-right font-medium">Amount</th>
                  <th className="px-5 py-3 font-medium">Due Date</th>
                  <th className="px-5 py-3 text-right font-medium">Days Overdue</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Last Chased</th>
                  <th className="px-5 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <span
                          aria-hidden="true"
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-xs font-semibold text-slate-600"
                        >
                          {initialsOf(inv.client_name)}
                        </span>
                        <span className="font-medium text-slate-900">{inv.client_name || '—'}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="relative inline-block">
                        <span className="text-slate-600">{inv.title}</span>
                        <PaidStamp show={stampId === inv.id} onDone={() => setStampId(null)} />
                      </div>
                    </td>
                    <td className="money tabular-nums px-5 py-3 text-right text-slate-900">{formatINR(inv.amount)}</td>
                    <td className="px-5 py-3 text-slate-600">{formatDate(inv.due_date)}</td>
                    <td className="px-5 py-3 text-right">
                      {inv.daysOverdue > 0 ? (
                        <span className="money tabular-nums inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-inset ring-rose-200">
                          {inv.daysOverdue}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={inv.status} />
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {inv.last_chased_at ? formatDate(inv.last_chased_at) : 'Never'}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-2">
                        <Button variant="secondary" size="sm" onClick={() => chase?.(inv)}>
                          Chase
                        </Button>
                        {inv.status !== 'paid' && (
                          <Button
                            variant="success"
                            size="sm"
                            onClick={() => markPaid(inv)}
                            disabled={busyId === inv.id}
                          >
                            Mark Paid
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {showNew && (
        <NewInvoiceModal
          onClose={() => setShowNew(false)}
          onCreated={() => {
            onChanged?.()
            onNotify?.('Invoice created')
          }}
        />
      )}
    </div>
  )
}
