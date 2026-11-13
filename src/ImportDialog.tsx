import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase, type Group, type WatchItem } from './lib/supabase'
import { parseTradingView } from './lib/tradingview'

const MAX_IMPORT = 300

/** Import einer TradingView-Watchlist (.txt): Vorschau, dann Gruppen und Werte anlegen. */
export function ImportDialog({
  groups,
  items,
  onClose,
  onDone,
}: {
  groups: Group[]
  items: WatchItem[]
  onClose: () => void
  onDone: (summary: string) => void
}) {
  const { t } = useTranslation()
  const dialog = useRef<HTMLDialogElement>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    dialog.current?.showModal()
  }, [])

  const parsed = useMemo(() => parseTradingView(text), [text])
  const existing = useMemo(() => new Set(items.map((i) => i.symbol)), [items])
  const fresh = parsed.groups.flatMap((g) => g.symbols.filter((s) => !existing.has(s)))
  const dupes = parsed.groups.flatMap((g) => g.symbols.filter((s) => existing.has(s)))
  const tooMany = items.length + fresh.length > MAX_IMPORT

  async function readFile(file: File) {
    if (file.size > 200_000) return setError(t('portfolio.tvFileTooLarge'))
    setError(null)
    setText(await file.text())
  }

  async function run() {
    setBusy(true)
    setError(null)
    try {
      // Gruppen: gleichnamige wiederverwenden, sonst hinten anlegen
      const byName = new Map(groups.map((g) => [g.name.toLowerCase(), g.id]))
      let nextGroupPos = groups.reduce((m, g) => Math.max(m, g.position + 1), 0)
      const newGroups = parsed.groups
        .filter((g) => g.name && !byName.has(g.name.toLowerCase()))
        .map((g) => ({ name: g.name as string, position: nextGroupPos++ }))
      if (newGroups.length) {
        const { data, error } = await supabase.from('watchlist_groups').insert(newGroups).select('id, name')
        if (error) throw error
        for (const g of data) byName.set(g.name.toLowerCase(), g.id)
      }

      // Werte in Dateireihenfolge hinten an die jeweilige Gruppe hängen
      const nextPos = new Map<string | null, number>()
      for (const i of items) nextPos.set(i.group_id, Math.max(nextPos.get(i.group_id) ?? 0, i.position + 1))
      const rows = parsed.groups.flatMap((g) => {
        const groupId = g.name ? (byName.get(g.name.toLowerCase()) ?? null) : null
        return g.symbols
          .filter((s) => !existing.has(s))
          .map((symbol) => {
            const position = nextPos.get(groupId) ?? 0
            nextPos.set(groupId, position + 1)
            return { symbol, group_id: groupId, position }
          })
      })
      if (rows.length) {
        const { error } = await supabase
          .from('watchlist_items')
          .upsert(rows, { onConflict: 'user_id,symbol', ignoreDuplicates: true })
        if (error) throw error
      }
      onDone(
        t('portfolio.tvDone', {
          added: rows.length,
          groups: newGroups.length,
          existing: dupes.length,
          skipped: parsed.unsupported.length,
        }),
      )
    } catch (e) {
      console.error(e)
      setError(t('portfolio.tvError'))
      setBusy(false)
    }
  }

  return (
    <dialog ref={dialog} className="dialog" onClose={onClose} aria-labelledby="import-title">
      <h2 id="import-title">{t('portfolio.tvTitle')}</h2>
      <p className="muted small">
        {t('portfolio.tvHint')}
      </p>
      <input
        type="file"
        accept=".txt,text/plain"
        aria-label={t('portfolio.chooseFile')}
        onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])}
      />
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="###Tech,NASDAQ:NVDA,NASDAQ:MSFT,###China,NASDAQ:BIDU"
        rows={4}
        aria-label={t('portfolio.tvContentAria')}
      />

      {text.trim() && (
        <div className="preview" aria-live="polite">
          <p>
            <strong>{fresh.length}</strong> {t('portfolio.tvNewLabel')} · <strong>{dupes.length}</strong> {t('portfolio.tvExistingLabel')} ·{' '}
            <strong>{parsed.unsupported.length}</strong> {t('portfolio.tvUnsupportedLabel')}
          </p>
          <ul>
            {parsed.groups.map((g) => (
              <li key={g.name ?? '__none'}>
                <span className="sym">{g.name ?? t('portfolio.tvNoGroup')}</span>{' '}
                {g.name && !groups.some((x) => x.name.toLowerCase() === g.name?.toLowerCase()) && (
                  <span className="badge">{t('portfolio.tvNewGroupBadge')}</span>
                )}
                <div className="chips">
                  {g.symbols.map((s) => (
                    <span key={s} className={`chip ${existing.has(s) ? 'dup' : 'new'}`}>
                      {s}
                    </span>
                  ))}
                </div>
              </li>
            ))}
            {parsed.unsupported.length > 0 && (
              <li>
                <span className="sym">{t('portfolio.tvUnsupportedHeading')}</span>
                <div className="chips">
                  {parsed.unsupported.map((u) => (
                    <span key={u.raw} className="chip bad" title={u.reason}>
                      {u.raw}
                    </span>
                  ))}
                </div>
              </li>
            )}
          </ul>
        </div>
      )}

      {tooMany && <p className="error small">{t('portfolio.tvTooMany', { max: MAX_IMPORT })}</p>}
      {error && <p className="error small">{error}</p>}
      <div className="dialog-actions">
        <button className="ghost" onClick={() => dialog.current?.close()} disabled={busy}>
          {t('portfolio.cancel')}
        </button>
        <button className="primary" onClick={run} disabled={busy || fresh.length === 0 || tooMany}>
          {busy ? t('portfolio.tvImporting') : t('portfolio.tvImportCount', { count: fresh.length })}
        </button>
      </div>
    </dialog>
  )
}
