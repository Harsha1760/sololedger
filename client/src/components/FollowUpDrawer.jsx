import { useEffect, useRef, useState } from 'react'
import { Copy } from 'lucide-react'
import Modal from './Modal'
import { Button, ErrorBanner } from './ui'
import { chaseInvoice } from '../lib/api'
import { formatDate, formatINR } from '../lib/format'

const TONES = [
  { id: 'polite', label: 'Polite' },
  { id: 'firm', label: 'Firm' },
  { id: 'final', label: 'Final' },
]

const TONE_ACTIVE = {
  polite: 'bg-slate-900 text-white shadow-sm',
  firm: 'bg-amber-600 text-white shadow-sm',
  final: 'bg-rose-600 text-white shadow-sm',
}

// Fetches the chase drafts for one invoice on open, lets the user pick/edit one, and copies it.
export default function FollowUpDrawer({ invoice, onClose, onChanged, onNotify }) {
  const [data, setData] = useState(null)
  const [tone, setTone] = useState('polite')
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const startedFor = useRef(null)
  const copyTimer = useRef(null)

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

  useEffect(() => () => clearTimeout(copyTimer.current), [])

  function pickTone(next) {
    setTone(next)
    setText(data.drafts[next])
    setCopied(false)
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      onNotify?.('Follow-up message copied')
      clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Could not copy to the clipboard. Select the text and copy it manually.')
    }
  }

  const title = `Follow up · ${invoice?.client_name || invoice?.title || 'Invoice'}`
  const lastChased = data?.last_chased_at ?? invoice?.last_chased_at

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
            <Copy className="h-4 w-4" aria-hidden="true" />
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
              <span className="money tabular-nums">{formatINR(invoice.amount)}</span> · due {formatDate(invoice.due_date)}
            </p>
            {lastChased && <p className="mt-1 text-xs text-slate-500">Last chased: {formatDate(lastChased)}</p>}
          </div>
        )}

        <ErrorBanner message={error} />

        {loading ? (
          <p className="text-sm text-slate-500">Drafting messages…</p>
        ) : (
          data && (
            <>
              <div role="tablist" aria-label="Message tone" className="inline-flex gap-1 self-start rounded-full bg-slate-100 p-1">
                {TONES.map((t) => {
                  const active = tone === t.id
                  return (
                    <button
                      key={t.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => pickTone(t.id)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        active ? TONE_ACTIVE[t.id] : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {t.label}
                    </button>
                  )
                })}
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
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 font-sans text-sm leading-relaxed text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10"
              />
            </>
          )
        )}
      </div>
    </Modal>
  )
}
