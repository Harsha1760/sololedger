import { useEffect, useRef, useState } from 'react'
import { Check, Copy, Landmark, Mail, MessageCircle } from 'lucide-react'
import { Button, ErrorBanner } from './ui'
import { chaseInvoice } from '../lib/api'
import { formatDate } from '../lib/format'

const UPI_ID = 'apexstudios@upi'

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

const LINK_CLASS =
  'inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50'

// Fetches chase drafts for an invoice, lets the user pick a tone and edit the text, then copy or send it.
export default function ChaseComposer({ invoice, onNotify, onChased }) {
  const [response, setResponse] = useState(null)
  const [tone, setTone] = useState('polite')
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState('')
  const copyTimer = useRef(null)
  const onChasedRef = useRef(onChased)
  onChasedRef.current = onChased

  const invoiceId = invoice?.id

  useEffect(() => {
    if (invoiceId === undefined || invoiceId === null) return
    let cancelled = false
    setResponse(null)
    setError('')
    setCopied(false)
    setCopyError('')
    setLoading(true)
    chaseInvoice(invoiceId)
      .then((res) => {
        if (cancelled) return
        setResponse(res)
        setTone(res.tone)
        setText(res.drafts[res.tone])
        setLoading(false)
        onChasedRef.current?.(res)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err.message)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [invoiceId])

  useEffect(() => () => clearTimeout(copyTimer.current), [])

  function pickTone(next) {
    if (!response) return
    setTone(next)
    setText(response.drafts[next])
    setCopied(false)
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopyError('')
      setCopied(true)
      onNotify?.('Follow-up message copied')
      clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopyError('Could not copy to the clipboard. Select the text and copy it manually.')
    }
  }

  async function copyUpi() {
    try {
      await navigator.clipboard.writeText(UPI_ID)
      setCopyError('')
      onNotify?.('UPI ID copied')
    } catch {
      setCopyError('Could not copy the UPI ID. Copy it manually: ' + UPI_ID)
    }
  }

  const title = invoice?.title ?? ''
  const lastChased = response?.last_chased_at ?? invoice?.last_chased_at
  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(text)}`
  const emailHref = `mailto:?subject=${encodeURIComponent('Payment reminder: ' + title)}&body=${encodeURIComponent(text)}`

  return (
    <div className="flex flex-col gap-4">
      {lastChased && <p className="text-xs text-slate-500">Last chased: {formatDate(lastChased)}</p>}

      <ErrorBanner message={error} />

      {loading && <p className="text-sm text-slate-500">Drafting messages…</p>}

      {response && (
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

          <label htmlFor="chase-composer-text" className="sr-only">
            Message
          </label>
          <textarea
            id="chase-composer-text"
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setCopied(false)
            }}
            rows={12}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 font-sans text-sm leading-relaxed text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10"
          />

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" size="sm" onClick={copy} disabled={!text}>
              {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
              {copied ? 'Copied' : 'Copy message'}
            </Button>
            <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
              <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
              WhatsApp
            </a>
            <a href={emailHref} className={LINK_CLASS}>
              <Mail className="h-3.5 w-3.5" aria-hidden="true" />
              Email
            </a>
            <Button variant="secondary" size="sm" onClick={copyUpi}>
              <Landmark className="h-3.5 w-3.5" aria-hidden="true" />
              Copy UPI ID
            </Button>
          </div>

          {copyError && (
            <p role="alert" className="text-xs text-rose-600">
              {copyError}
            </p>
          )}
        </>
      )}
    </div>
  )
}
