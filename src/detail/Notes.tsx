import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { time } from '../lib/format'
import { supabase } from '../lib/supabase'

const MAX = 10000
const SAVE_DELAY = 800

type State = 'loading' | 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

/** Eigene Notiz zum Wert (Investment-These, Kaufgründe). Speichert beim Tippen automatisch; leer = gelöscht. */
export function Notes({ symbol }: { symbol: string }) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const [state, setState] = useState<State>('loading')
  const [updated, setUpdated] = useState<string | null>(null)
  const pending = useRef<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    let live = true
    supabase
      .from('stock_notes')
      .select('body, updated_at')
      .eq('symbol', symbol)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!live) return
        setText(data?.body ?? '')
        setUpdated(data?.updated_at ?? null)
        setState(error ? 'error' : 'idle')
      })
    return () => {
      live = false
    }
  }, [symbol])

  async function save(body: string) {
    pending.current = null
    setState('saving')
    const now = new Date().toISOString()
    const { error } = body.trim()
      ? await supabase.from('stock_notes').upsert({ symbol, body, updated_at: now }, { onConflict: 'user_id,symbol' })
      : await supabase.from('stock_notes').delete().eq('symbol', symbol)
    // Während des Speicherns weitergetippt? Dann bleibt es „ungespeichert“, der nächste Lauf folgt
    if (pending.current != null) return
    setState(error ? 'error' : 'saved')
    if (!error) setUpdated(body.trim() ? now : null)
  }

  // Beim Verlassen der Seite Ungespeichertes sofort schreiben
  useEffect(
    () => () => {
      clearTimeout(timer.current)
      if (pending.current != null) void save(pending.current)
    },
    // save liest nur Refs und das feste Symbol dieser Instanz
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  function change(v: string) {
    setText(v)
    setState('dirty')
    pending.current = v
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      if (pending.current != null) void save(pending.current)
    }, SAVE_DELAY)
  }

  const status =
    state === 'saving' || state === 'dirty'
      ? t('notes.saving')
      : state === 'error'
        ? t('notes.error')
        : updated
          ? t('notes.savedAt', { time: time.format(new Date(updated)) })
          : t('notes.private')
  return (
    <div className="notes">
      <textarea
        className="notes-text"
        value={text}
        onChange={(e) => change(e.target.value)}
        maxLength={MAX}
        disabled={state === 'loading'}
        placeholder={t('notes.placeholder')}
        aria-label={t('notes.label', { symbol })}
      />
      <div className="notes-foot muted tiny">
        <span className={state === 'error' ? 'down' : ''} role="status">
          {status}
        </span>
        <span>{text.length > MAX * 0.8 ? `${text.length} / ${MAX}` : t('notes.mcpHint')}</span>
      </div>
    </div>
  )
}
