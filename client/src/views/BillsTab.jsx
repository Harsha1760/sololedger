import { useEffect, useState } from 'react'
import { Plus, Receipt } from 'lucide-react'
import { Button, Card, EmptyState, ErrorBanner, Field, inputClass } from '../components/ui'
import { createBill, getBills, payBill } from '../lib/api'
import { daysBetween, formatDate, formatINR, todayYMD } from '../lib/format'

const EMPTY_FORM = { name: '', amount: '', dueDate: '' }
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function billStatus(bill, today) {
  if (bill.is_paid) {
    return { label: 'Paid', className: 'bg-emerald-50 text-emerald-700 ring-emerald-200' }
  }
  const days = daysBetween(today, bill.due_date)
  if (days < 0) {
    return { label: `Overdue · ${-days} day${days === -1 ? '' : 's'}`, className: 'bg-rose-50 text-rose-700 ring-rose-200' }
  }
  if (days === 0) {
    return { label: 'Due today', className: 'bg-amber-50 text-amber-700 ring-amber-200' }
  }
  return { label: `Due in ${days} day${days === 1 ? '' : 's'}`, className: 'bg-slate-100 text-slate-700 ring-slate-200' }
}

export default function BillsTab({ refreshKey, onChanged }) {
  const [bills, setBills] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formErrors, setFormErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState(null)

  useEffect(() => {
    let ignore = false
    getBills()
      .then((rows) => {
        if (!ignore) {
          setBills(rows)
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
  const unpaid = bills.filter((b) => !b.is_paid)
  const unpaidTotal = unpaid.reduce((sum, b) => sum + b.amount, 0)
  const overdueCount = unpaid.filter((b) => daysBetween(b.due_date, today) > 0).length

  async function markPaid(bill) {
    setBusyId(bill.id)
    setError('')
    try {
      await payBill(bill.id)
      await onChanged()
    } catch (err) {
      if (err.status === 409) {
        setError('This bill is already marked as paid.')
        await onChanged()
      } else {
        setError(err.message)
      }
    } finally {
      setBusyId(null)
    }
  }

  function validate() {
    const next = {}
    if (!form.name.trim()) next.name = 'Name is required.'
    const amount = Number(form.amount)
    if (form.amount === '' || !Number.isFinite(amount) || amount <= 0) next.amount = 'Amount must be greater than 0.'
    if (!DATE_RE.test(form.dueDate)) next.dueDate = 'Due date is required.'
    return next
  }

  async function submit(e) {
    e.preventDefault()
    const found = validate()
    setFormErrors(found)
    if (Object.keys(found).length) return

    setSaving(true)
    setError('')
    try {
      await createBill({ name: form.name.trim(), amount: Number(form.amount), due_date: form.dueDate })
      setForm(EMPTY_FORM)
      setFormErrors({})
      setShowForm(false)
      await onChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="p-5">
          <p className="text-sm font-medium text-slate-500">Unpaid total</p>
          <p className="money mt-2 text-2xl font-semibold text-slate-900">{formatINR(unpaidTotal)}</p>
          <p className="mt-1 text-xs text-slate-500">
            {unpaid.length} unpaid bill{unpaid.length === 1 ? '' : 's'}
          </p>
        </Card>
        <Card className={`p-5 ${overdueCount > 0 ? 'border-rose-200' : ''}`}>
          <p className="text-sm font-medium text-slate-500">Overdue bills</p>
          <p className={`money mt-2 text-2xl font-semibold ${overdueCount > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
            {overdueCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">Unpaid and past their due date</p>
        </Card>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">Bills</h2>
        <Button onClick={() => setShowForm((v) => !v)} aria-expanded={showForm}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add Bill
        </Button>
      </div>

      <ErrorBanner message={error} onDismiss={() => setError('')} />

      {showForm && (
        <Card className="p-5">
          <form onSubmit={submit} noValidate className="grid grid-cols-1 items-end gap-4 sm:grid-cols-4">
            <Field label="Name" htmlFor="bill-name" error={formErrors.name}>
              <input
                id="bill-name"
                className={inputClass}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </Field>
            <Field label="Amount (₹)" htmlFor="bill-amount" error={formErrors.amount}>
              <input
                id="bill-amount"
                type="number"
                min="0"
                step="0.01"
                className={`${inputClass} money`}
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              />
            </Field>
            <Field label="Due date" htmlFor="bill-due" error={formErrors.dueDate}>
              <input
                id="bill-due"
                type="date"
                className={inputClass}
                value={form.dueDate}
                onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
              />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save bill'}
              </Button>
              <Button variant="secondary" onClick={() => setShowForm(false)} disabled={saving}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card className="overflow-hidden">
        {loading ? (
          <p className="px-5 py-6 text-sm text-slate-500">Loading bills…</p>
        ) : bills.length === 0 ? (
          <EmptyState icon={Receipt} title="No bills yet" message="Add a bill to track upcoming payments." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Name</th>
                  <th className="px-3 py-2.5 text-right font-medium">Amount</th>
                  <th className="px-3 py-2.5 font-medium">Due Date</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-5 py-2.5 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bills.map((bill) => {
                  const status = billStatus(bill, today)
                  return (
                    <tr key={bill.id} className="hover:bg-slate-50">
                      <td className="px-5 py-3 font-medium text-slate-900">{bill.name}</td>
                      <td className="money px-3 py-3 text-right text-slate-900">{formatINR(bill.amount)}</td>
                      <td className="px-3 py-3 text-slate-600">{formatDate(bill.due_date)}</td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${status.className}`}
                        >
                          {status.label}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Button
                          variant="success"
                          size="sm"
                          onClick={() => markPaid(bill)}
                          disabled={!!bill.is_paid || busyId === bill.id}
                        >
                          Mark Paid
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
