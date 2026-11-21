import { useEffect, useState } from 'react'
import { Plus, Receipt } from 'lucide-react'
import { Button, Card, EmptyState, ErrorBanner, StatusBadge } from '../components/ui'
import NewInvoiceModal from '../components/NewInvoiceModal'
import { getInvoices, setInvoiceStatus } from '../lib/api'
import { daysBetween, formatDate, formatINR, todayYMD } from '../lib/format'

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'sent', label: 'Sent' },
  { id: 'paid', label: 'Paid' },
]

function matchesFilter(invoice, filter) {
  if (filter === 'overdue') return invoice.status !== 'paid' && invoice.daysOverdue > 0
  if (filter === 'sent') return invoice.status === 'sent'
  if (filter === 'paid') return invoice.status === 'paid'
  return true
}

export default function InvoicesTab({ refreshKey, onChanged, openChase }) {
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('all')
  const [showNew, setShowNew] = useState(false)
  const [busyId, setBusyId] = useState(null)

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

  const today = todayYMD()
  const rows = invoices
    .map((i) => ({ ...i, daysOverdue: i.status === 'paid' ? null : daysBetween(i.due_date, today) }))
    .filter((i) => matchesFilter(i, filter))

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
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Filter invoices" className="inline-flex rounded-lg bg-slate-100 p-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                filter === f.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {f.label}
            </button>
          ))}
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
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="No invoices here"
            message={filter === 'all' ? 'Create your first invoice to start tracking payments.' : 'Try a different filter.'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Client</th>
                  <th className="px-3 py-2.5 font-medium">Title</th>
                  <th className="px-3 py-2.5 text-right font-medium">Amount</th>
                  <th className="px-3 py-2.5 font-medium">Due Date</th>
                  <th className="px-3 py-2.5 text-right font-medium">Days Overdue</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 font-medium">Last Chased</th>
                  <th className="px-5 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-medium text-slate-900">{inv.client_name || '—'}</td>
                    <td className="px-3 py-3 text-slate-600">{inv.title}</td>
                    <td className="money px-3 py-3 text-right text-slate-900">{formatINR(inv.amount)}</td>
                    <td className="px-3 py-3 text-slate-600">{formatDate(inv.due_date)}</td>
                    <td className="money px-3 py-3 text-right">
                      {inv.daysOverdue > 0 ? (
                        <span className="font-medium text-rose-600">{inv.daysOverdue}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge status={inv.status} />
                    </td>
                    <td className="px-3 py-3 text-slate-600">
                      {inv.last_chased_at ? formatDate(inv.last_chased_at) : 'Never'}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-2">
                        <Button variant="secondary" size="sm" onClick={() => openChase(inv)}>
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
          onCreated={() => onChanged()}
        />
      )}
    </div>
  )
}
