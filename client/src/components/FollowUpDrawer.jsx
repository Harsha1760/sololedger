import { useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import Modal from './Modal'
import { Button, ErrorBanner } from './ui'
import { chaseInvoice } from '../lib/api'
import { formatDate, formatINR } from '../lib/format'

const TONES = [
  { id: 'polite', label: 'Polite' },
  { id: 'firm', label: 'Firm' },
  { id: 'final', label: 'Final' },
]

// Fetches the chase drafts for one invoice on open, lets the user pick/edit one, and copies it.
export default function FollowUpDrawer({ invoice, onClose, onChanged }) {
  const [data, setData] = useState(null)
  const [tone, setTone] = useState('polite')
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const startedFor = useRef(null)

  useEffect(() => {
    if (!invoice || startedFor.current === invoice.id) return
    startedFor.current = invoice.id
    chaseInvoice(invoice.id)
      .then((res) => {
        setData(res)
        setTone(res.tone)
        setText(res.drafts[res.tone])
        setLoading(false)
        onChanged?.()
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }, [invoice, onChanged])

  function pickTone(next) {
    setTone(next)
    setText(data.drafts[next])
    setCopied(false)
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Could not copy to the clipboard. Select the text and copy it manually.')
    }
  }

  const title = `Follow up · ${invoice?.client_name || invoice?.title || 'Invoice'}`

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      variant="drawer"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" onClick={copy} disabled={!text}>
            {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
            {copied ? 'Copied' : 'Copy message'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {invoice && (
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            <p className="font-medium text-slate-900">{invoice.title}</p>
            <p>
              <span className="money">{formatINR(invoice.amount)}</span> · due {formatDate(invoice.due_date)}
            </p>
            {data?.last_chased_at && (
              <p className="mt-1 text-xs text-slate-500">Last chased: {formatDate(data.last_chased_at)}</p>
            )}
          </div>
        )}

        <ErrorBanner message={error} />

        {loading ? (
          <p className="text-sm text-slate-500">Drafting messages…</p>
        ) : (
          data && (
            <>
              <div role="tablist" aria-label="Message tone" className="flex gap-1 rounded-lg bg-slate-100 p-1">
                {TONES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={tone === t.id}
                    onClick={() => pickTone(t.id)}
                    className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                      tone === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <label htmlFor="follow-up-text" className="sr-only">
                Message
              </label>
              <textarea
                id="follow-up-text"
                value={text}
                onChange={(e) => {
                  setText(e.target.value)
                  setCopied(false)
                }}
                rows={12}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm leading-relaxed text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
              />
            </>
          )
        )}
      </div>
    </Modal>
  )
}
