import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Ctx, type ConfirmOptions, type PromptOptions } from './useDialogs'

type Request = { id: number } & (
  | { kind: 'confirm'; opts: ConfirmOptions; resolve: (ok: boolean) => void }
  | { kind: 'prompt'; opts: PromptOptions; resolve: (value: string | null) => void }
)

let nextId = 0

/** Ersatz für window.confirm/prompt: eigener Dialog im App-Design (Promise-API). */
export function DialogProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<Request[]>([])

  const confirm = useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => setQueue((q) => [...q, { id: ++nextId, kind: 'confirm', opts, resolve }])),
    [],
  )
  const prompt = useCallback(
    (opts: PromptOptions) =>
      new Promise<string | null>((resolve) => setQueue((q) => [...q, { id: ++nextId, kind: 'prompt', opts, resolve }])),
    [],
  )
  const api = useMemo(() => ({ confirm, prompt }), [confirm, prompt])
  const current = queue[0]
  const next = () => setQueue((q) => q.slice(1))

  return (
    <Ctx.Provider value={api}>
      {children}
      {current && (
        <AskDialog
          key={current.id}
          request={current}
          onDone={(value) => {
            if (current.kind === 'confirm') current.resolve(value === true)
            else current.resolve(typeof value === 'string' ? value : null)
            next()
          }}
        />
      )}
    </Ctx.Provider>
  )
}

function AskDialog({ request, onDone }: { request: Request; onDone: (value: boolean | string | null) => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const okBtn = useRef<HTMLButtonElement>(null)
  const result = useRef<boolean | string | null>(null)
  const [text, setText] = useState(request.kind === 'prompt' ? (request.opts.initial ?? '') : '')

  useEffect(() => {
    dialog.current?.showModal()
    input.current?.select()
    // Löschen: Fokus bleibt auf „Abbrechen“ (sicherer Standard), sonst auf der Bestätigung
    if (!input.current && !(request.kind === 'confirm' && request.opts.danger)) okBtn.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isPrompt = request.kind === 'prompt'
  const trimmed = text.trim()
  const canSubmit = !isPrompt || trimmed.length > 0

  function submit() {
    if (!canSubmit) return
    result.current = isPrompt ? trimmed : true
    dialog.current?.close()
  }

  return (
    // <dialog> via showModal(): Fokus-Falle, Escape und Hintergrund-Sperre kommen vom Browser.
    <dialog
      ref={dialog}
      className="dialog ask"
      role={isPrompt ? 'dialog' : 'alertdialog'}
      aria-labelledby="ask-title"
      aria-describedby={request.kind === 'confirm' && request.opts.message ? 'ask-msg' : undefined}
      onClose={() => onDone(result.current)}
      onClick={(e) => {
        if (e.target === dialog.current) dialog.current?.close()
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <h2 id="ask-title">{request.opts.title}</h2>
        {request.kind === 'confirm' && request.opts.message && (
          <p id="ask-msg" className="ask-msg">
            {request.opts.message}
          </p>
        )}
        {request.kind === 'prompt' && (
          <label className="ask-field">
            {request.opts.label && <span>{request.opts.label}</span>}
            <input
              ref={input}
              value={text}
              maxLength={request.opts.maxLength ?? 60}
              onChange={(e) => setText(e.target.value)}
              autoComplete="off"
            />
          </label>
        )}
        <div className="dialog-actions">
          <button type="button" className="ghost" onClick={() => dialog.current?.close()}>
            Abbrechen
          </button>
          <button
            type="submit"
            className={request.kind === 'confirm' && request.opts.danger ? 'primary danger' : 'primary'}
            disabled={!canSubmit}
            ref={okBtn}
          >
            {request.opts.confirmLabel ?? (isPrompt ? 'Speichern' : 'OK')}
          </button>
        </div>
      </form>
    </dialog>
  )
}
