import { useEffect, useState } from 'react'
import { Check, QrCode, Sparkles } from 'lucide-react'
import Modal from './Modal'
import UpiQr from './UpiQr'
import { Button, ErrorBanner, Field, inputClass } from './ui'
import { createClient, createInvoice, getClients } from '../lib/api'
import { formatDate, formatINR, parseYMD, todayYMD } from '../lib/format'
import { parseChat } from '../lib/parseChat'

const NEW_CLIENT = '__new__'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const EMPTY_FORM = { clientId: '', title: '', amount: '', dueDate: '', issueDate: '' }
const EMPTY_CLIENT = { name: '', email: '', phone: '' }
const EMPTY_PARSE = { summary: '', note: '' }

const pad = (n) => String(n).padStart(2, '0')

// Local calendar date `days` after today, as YYYY-MM-DD.
function dueDateFromDays(days) {
  const d = parseYMD(todayYMD())
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Mounted fresh each time it opens. Mirrors server rules: title, amount > 0, due_date YYYY-MM-DD.
export default function NewInvoiceModal({ onClose, onCreated, onNotify }) {
  const [clients, setClients] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [newClient, setNewClient] = useState(EMPTY_CLIENT)
  const [errors, setErrors] = useState({})
  const [submitError, setSubmitError] = useState('')
  const [saving, setSaving] = useState(false)
  const [quickPaste, setQuickPaste] = useState('')
  const [parsed, setParsed] = useState(EMPTY_PARSE)
  const [created, setCreated] = useState(null)

  useEffect(() => {
    getClients()
      .then(setClients)
      .catch((err) => setSubmitError(err.message))
  }, [])

  const creatingClient = form.clientId === NEW_CLIENT

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined }))
  }

  function handleParse() {
    const result = parseChat(quickPaste)
    const updates = {}
    const found = []
    let note = ''

    if (result.client) {
      const needle = result.client.toLowerCase()
      const match = clients.find((c) => c.name.toLowerCase().includes(needle))
      if (match) {
        updates.clientId = String(match.id)
        found.push(`client ${match.name}`)
      } else {
        note = 'No matching client: pick one or create it'
      }
    }
    if (result.title) {
      updates.title = result.title
      found.push(`title "${result.title}"`)
    }
    if (result.amount !== null) {
      updates.amount = String(result.amount)
      found.push(`amount ${formatINR(result.amount)}`)
    }
    if (result.dueDays !== null) {
      updates.dueDate = dueDateFromDays(result.dueDays)
      found.push(`due ${formatDate(updates.dueDate)}`)
    }

    const keys = Object.keys(updates)
    if (keys.length) {
      setForm((f) => ({ ...f, ...updates }))
      setErrors((e) => {
        const next = { ...e }
        keys.forEach((k) => {
          next[k] = undefined
        })
        return next
      })
    }
    setParsed({
      summary: found.length ? `Parsed: ${found.join(' · ')}` : 'Nothing recognised in that text.',
      note,
    })
  }

  function validate() {
    const next = {}
    if (creatingClient && !newClient.name.trim()) next.newName = 'Client name is required.'
    if (creatingClient && newClient.email.trim() && !EMAIL_RE.test(newClient.email.trim()))
      next.newEmail = 'Enter a valid email address.'
    if (!form.title.trim()) next.title = 'Title is required.'
    const amount = Number(form.amount)
    if (form.amount === '' || !Number.isFinite(amount) || amount <= 0) next.amount = 'Amount must be greater than 0.'
    if (!DATE_RE.test(form.dueDate)) next.dueDate = 'Due date is required.'
    if (form.issueDate && !DATE_RE.test(form.issueDate)) next.issueDate = 'Enter a valid issue date.'
    return next
  }

  async function submit(e) {
    e.preventDefault()
    const found = validate()
    setErrors(found)
    if (Object.keys(found).length) return

    setSaving(true)
    setSubmitError('')
    let clientId = creatingClient ? null : form.clientId ? Number(form.clientId) : null
    try {
      if (creatingClient) {
        const createdClient = await createClient({
          name: newClient.name.trim(),
          email: newClient.email.trim() || undefined,
          phone: newClient.phone.trim() || undefined,
        })
        clientId = createdClient.id
        // Keep the new client selected so a retry does not create it twice.
        setClients((list) => [...list, createdClient])
        setForm((f) => ({ ...f, clientId: String(createdClient.id) }))
        setNewClient(EMPTY_CLIENT)
      }
      const title = form.title.trim()
      const amount = Number(form.amount)
      await createInvoice({
        client_id: clientId ?? undefined,
        title,
        amount,
        due_date: form.dueDate,
        issue_date: form.issueDate || undefined,
      })
      setCreated({ title, amount, dueDate: form.dueDate })
      onCreated?.()
      onNotify?.('Invoice created')
    } catch (err) {
      setSubmitError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (created) {
    const shareMessage = `Hi, here is the invoice for ${created.title} of ${formatINR(created.amount)}, due ${formatDate(created.dueDate)}. Pay via UPI to apexstudios@upi.`
    return (
      <Modal
        open
        onClose={onClose}
        title="New invoice"
        footer={<Button onClick={onClose}>Done</Button>}
      >
        <div className="flex flex-col items-center gap-4 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200">
            <Check className="h-5 w-5" aria-hidden="true" />
          </span>
          <h3 className="text-base font-semibold text-slate-900">Invoice created</h3>
          <div className="flex flex-col items-center gap-2">
            <UpiQr amount={created.amount} note={created.title} />
            <p className="inline-flex items-center gap-1 text-xs text-slate-500">
              <QrCode className="h-3.5 w-3.5" aria-hidden="true" />
              Scan to pay via UPI
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <dt className="text-slate-500">Amount</dt>
            <dd className="money font-medium text-slate-900">{formatINR(created.amount)}</dd>
            <dt className="text-slate-500">Due</dt>
            <dd className="font-medium text-slate-900">{formatDate(created.dueDate)}</dd>
          </dl>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(shareMessage)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Share on WhatsApp
          </a>
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="New invoice"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="new-invoice-form" disabled={saving}>
            {saving ? 'Creating…' : 'Create invoice'}
          </Button>
        </>
      }
    >
      <form id="new-invoice-form" onSubmit={submit} noValidate className="flex flex-col gap-4">
        <ErrorBanner message={submitError} />

        <div className="flex flex-col gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3">
          <Field label="Quick Paste from WhatsApp/Chat" htmlFor="quickPaste">
            <textarea
              id="quickPaste"
              rows={2}
              className={inputClass}
              placeholder="Send ₹40,000 to Meera for packaging work, due in 15 days"
              value={quickPaste}
              onChange={(e) => setQuickPaste(e.target.value)}
            />
          </Field>
          <div className="flex items-center justify-between gap-3">
            <p role="status" className="min-w-0 flex-1 text-xs text-slate-600">
              {parsed.summary}
              {parsed.note && <span className="block font-medium text-amber-700">{parsed.note}</span>}
            </p>
            <Button variant="secondary" size="sm" onClick={handleParse}>
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Parse Chat
            </Button>
          </div>
        </div>

        <Field label="Client" htmlFor="inv-client">
          <select
            id="inv-client"
            className={inputClass}
            value={form.clientId}
            onChange={(e) => setField('clientId', e.target.value)}
          >
            <option value="">No client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value={NEW_CLIENT}>+ New client</option>
          </select>
        </Field>

        {creatingClient && (
          <div className="flex flex-col gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3">
            <Field label="Client name" htmlFor="nc-name" error={errors.newName}>
              <input
                id="nc-name"
                className={inputClass}
                value={newClient.name}
                onChange={(e) => setNewClient((c) => ({ ...c, name: e.target.value }))}
              />
            </Field>
            <Field label="Email (optional)" htmlFor="nc-email" error={errors.newEmail}>
              <input
                id="nc-email"
                type="email"
                className={inputClass}
                value={newClient.email}
                onChange={(e) => setNewClient((c) => ({ ...c, email: e.target.value }))}
              />
            </Field>
            <Field label="Phone (optional)" htmlFor="nc-phone">
              <input
                id="nc-phone"
                className={inputClass}
                value={newClient.phone}
                onChange={(e) => setNewClient((c) => ({ ...c, phone: e.target.value }))}
              />
            </Field>
          </div>
        )}

        <Field label="Title" htmlFor="inv-title" error={errors.title}>
          <input
            id="inv-title"
            className={inputClass}
            value={form.title}
            onChange={(e) => setField('title', e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Amount (₹)" htmlFor="inv-amount" error={errors.amount}>
            <input
              id="inv-amount"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              className={`${inputClass} money`}
              value={form.amount}
              onChange={(e) => setField('amount', e.target.value)}
            />
          </Field>
          <Field label="Due date" htmlFor="inv-due" error={errors.dueDate}>
            <input
              id="inv-due"
              type="date"
              className={inputClass}
              value={form.dueDate}
              onChange={(e) => setField('dueDate', e.target.value)}
            />
          </Field>
        </div>

        <Field label="Issue date (optional)" htmlFor="inv-issue" error={errors.issueDate}>
          <input
            id="inv-issue"
            type="date"
            className={inputClass}
            value={form.issueDate}
            onChange={(e) => setField('issueDate', e.target.value)}
          />
        </Field>
      </form>
    </Modal>
  )
}
