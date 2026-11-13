import { useEffect } from 'react'

export type ToastState = { text: string; action?: { label: string; run: () => void } } | null

export function Toast({ toast, onClose }: { toast: ToastState; onClose: () => void }) {
  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(onClose, 6000)
    return () => window.clearTimeout(id)
  }, [toast, onClose])
  return (
    <div className="toast-wrap" role="status" aria-live="polite">
      {toast && (
        <div className="toast">
          <span>{toast.text}</span>
          {toast.action && (
            <button
              className="link"
              onClick={() => {
                toast.action?.run()
                onClose()
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
