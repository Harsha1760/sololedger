import { useEffect, useRef } from 'react'

// Parent must be position: relative. Shows a rotated PAID stamp for 1s, then calls onDone.
export default function PaidStamp({ show, onDone }) {
  const doneRef = useRef(onDone)
  doneRef.current = onDone

  useEffect(() => {
    if (!show) return
    const timer = setTimeout(() => doneRef.current?.(), 1000)
    return () => clearTimeout(timer)
  }, [show])

  if (!show) return null

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <span className="animate-paid-stamp rounded-md border-4 border-emerald-600 px-3 py-1 text-2xl font-black tracking-[0.2em] text-emerald-600">
        PAID
      </span>
    </div>
  )
}
