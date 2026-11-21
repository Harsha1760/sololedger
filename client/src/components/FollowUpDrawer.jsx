import Modal from './Modal'
import ChaseComposer from './ChaseComposer'
import { Button } from './ui'
import { formatINR } from '../lib/format'

// Drawer wrapper around ChaseComposer. Chase drafting and copy logic live in ChaseComposer.
export default function FollowUpDrawer({ invoice, onClose, onChanged, onNotify }) {
  const title = `Follow-up for ${invoice?.client_name || invoice?.title || 'client'}`

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      variant="drawer"
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      {invoice && (
        <div className="flex flex-col gap-4">
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            <p className="font-medium text-slate-900">{invoice.title}</p>
            <p>
              <span className="money tabular-nums">{formatINR(invoice.amount)}</span>
            </p>
          </div>
          <ChaseComposer invoice={invoice} onNotify={onNotify} onChased={() => onChanged?.()} />
        </div>
      )}
    </Modal>
  )
}
