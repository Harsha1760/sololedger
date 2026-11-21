import { useEffect, useState } from 'react'
import Modal from './Modal'
import { Button, ErrorBanner, Field, inputClass } from './ui'
import { createClient, createInvoice, getClients } from '../lib/api'

const NEW_CLIENT = '__new__'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const EMPTY_FORM = { clientId: '', title: '', amount: '', dueDate: '', issueDate: '' }
const EMPTY_CLIENT = { name: '', email: '', phone: '' }

// Mounted fresh each time it opens. Mirrors server rules: title, amount > 0, due_date YYYY-MM-DD.
export default function NewInvoiceModal({ onClose, onCreated }) {
  const [clients, setClients] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [newClient, setNewClient] = useState(EMPTY_CLIENT)
  const [errors, setErrors] = useState({})
  const [submitError, setSubmitError] = useState('')
  const [saving, setSaving] = useState(false)

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
        const created = await createClient({
          name: newClient.name.trim(),
          email: newClient.email.trim() || undefined,
          phone: newClient.phone.trim() || undefined,
        })
        clientId = created.id
        // Keep the new client selected so a retry does not create it twice.
        setClients((list) => [...list, created])
        setForm((f) => ({ ...f, clientId: String(created.id) }))
        setNewClient(EMPTY_CLIENT)
      }
      await createInvoice({
        client_id: clientId ?? undefined,
        title: form.title.trim(),
        amount: Number(form.amount),
        due_date: form.dueDate,
        issue_date: form.issueDate || undefined,
      })
      onCreated?.()
      onClose?.()
    } catch (err) {
      setSubmitError(err.message)
    } finally {
      setSaving(false)
    }
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
