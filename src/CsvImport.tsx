import { LOCALE } from './i18n'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isoDate } from './lib/format'
import { parseCsv } from './lib/csv'
import { resolveIsins, supabase, type Portfolio } from './lib/supabase'
import { TX_LABEL } from './lib/txLabels'

const MAX_ROWS = 5000
const FORMAT_LABEL = { parqet: 'portfolio.csvFormatParqet', einfach: 'portfolio.csvFormatSimple', connector: 'portfolio.csvFormatConnector' } as const

/** CSV-Import mit Vorschau: Parqet-Export oder einfaches Format, Dubletten werden erkannt. */
export function CsvImport({
  portfolios,
  knownIds,
  onClose,
  onDone,
}: {
  portfolios: Portfolio[]
  /** external_id aller vorhandenen Transaktionen, für die Vorschau */
  knownIds: Set<string>
  onClose: () => void
  onDone: (text: string) => void
}) {
  const { t } = useTranslation()
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    dialog.current?.showModal()
  }, [])
  const [text, setText] = useState('')
  const [target, setTarget] = useState(portfolios[0]?.id ?? 'new')
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const parsed = useMemo(() => (text.trim() ? parseCsv(text) : null), [text])
  const fresh = parsed?.rows.filter((r) => !knownIds.has(r.external_id)) ?? []
  const dupes = (parsed?.rows.length ?? 0) - fresh.length

  async function readFile(file: File) {
    const buf = await file.arrayBuffer()
    // Parqet exportiert UTF-8; ältere Broker-CSVs oft Windows-1252
    let t = new TextDecoder('utf-8').decode(buf)
    if (t.includes('�')) t = new TextDecoder('windows-1252').decode(buf)
    setText(t)
  }

  async function run() {
    if (!parsed) return
    setError(null)
    setBusy(true)
    try {
      let portfolio_id = target
      if (target === 'new') {
        const name = newName.trim()
        if (!name) throw new Error(t('portfolio.errNewDepotNameMissing'))
        const { data, error } = await supabase.from('portfolios').insert({ name, position: portfolios.length }).select('id').single()
        if (error) throw new Error(error.code === '23505' ? t('portfolio.depotExists') : error.message)
        portfolio_id = data.id
      }
      const isins = [...new Set(fresh.filter((r) => !r.symbol && r.isin).map((r) => r.isin!))]
      const map = new Map<string, { symbol: string | null; name: string | null }>()
      for (let i = 0; i < isins.length; i += 50) {
        for (const r of await resolveIsins(isins.slice(i, i + 50))) map.set(r.isin, r)
      }
      const unresolved = new Set<string>()
      const rows = fresh.flatMap((r) => {
        const hit = r.isin ? map.get(r.isin) : undefined
        const symbol = r.symbol ?? hit?.symbol
        if (!symbol) {
          unresolved.add(r.isin ?? '?')
          return []
        }
        return [
          {
            portfolio_id,
            symbol,
            isin: r.isin,
            name: r.name ?? hit?.name ?? null,
            type: r.type,
            date: r.date,
            quantity: r.quantity,
            price: r.price,
            currency: r.currency,
            fees: r.fees,
            taxes: r.taxes,
            source: parsed.format === 'parqet' ? 'parqet' : 'csv',
            external_id: r.external_id,
          },
        ]
      })
      let inserted = 0
      for (let i = 0; i < rows.length; i += 500) {
        const { data, error } = await supabase
          .from('transactions')
          .upsert(rows.slice(i, i + 500), { onConflict: 'user_id,external_id', ignoreDuplicates: true })
          .select('id')
        if (error) throw new Error(error.message)
        inserted += data.length
      }
      onDone(
        t('portfolio.csvDoneBase', { inserted, existing: dupes + rows.length - inserted }) +
          (unresolved.size ? t('portfolio.csvDoneUnresolved', { count: unresolved.size, list: [...unresolved].slice(0, 3).join(', ') }) : '') +
          (parsed.skipped.length ? t('portfolio.csvDoneSkipped', { count: parsed.skipped.length }) : '.'),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : t('portfolio.importFailed'))
      setBusy(false)
    }
  }

  const tooMany = (parsed?.rows.length ?? 0) > MAX_ROWS
  return (
    <dialog ref={dialog} className="dialog wide-dialog" onClose={onClose} aria-labelledby="csv-title">
      <h2 id="csv-title">{t('portfolio.csvTitle')}</h2>
      <p className="muted small">
        {t('portfolio.csvHint')}
      </p>
      <p className="muted small">{t('portfolio.csvConnectorHint')}</p>
      <pre className="csvhint">{t('portfolio.csvExample')}</pre>
      <input type="file" accept=".csv,.txt,text/csv,text/plain" aria-label={t('portfolio.chooseFile')} onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} />
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder={t('portfolio.csvPlaceholder')} aria-label={t('portfolio.csvContentAria')} />
      <div className="fgrid">
        <label>
          {t('portfolio.intoDepot')}
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            {portfolios.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            <option value="new">{t('portfolio.newDepotOption')}</option>
          </select>
        </label>
        {target === 'new' && (
          <label>
            {t('portfolio.depotNameLabel')}
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t('portfolio.csvDepotPlaceholder')} maxLength={60} />
          </label>
        )}
      </div>
      {parsed && (
        <div className="preview" aria-live="polite">
          <p className="small">
            {t('portfolio.csvDetected')}: <strong>{t(FORMAT_LABEL[parsed.format])}</strong> · {t('portfolio.countNew', { count: fresh.length })}
            {dupes > 0 && ` · ${t('portfolio.countExisting', { count: dupes })}`}
            {parsed.skipped.length > 0 && ` · ${t('portfolio.countSkipped', { count: parsed.skipped.length })}`}
          </p>
          {fresh.length > 0 && (
            <div className="txtable-wrap">
              <table className="txtable">
                <thead>
                  <tr>
                    <th>{t('portfolio.colDate')}</th>
                    <th>{t('portfolio.colType')}</th>
                    <th>{t('portfolio.colSecurity')}</th>
                    <th className="num">{t('portfolio.colShares')}</th>
                    <th className="num">{t('portfolio.colPrice')}</th>
                  </tr>
                </thead>
                <tbody>
                  {fresh.slice(0, 8).map((r) => (
                    <tr key={r.external_id}>
                      <td>{isoDate(r.date)}</td>
                      <td>{TX_LABEL[r.type]}</td>
                      <td className="ellipsis">{r.symbol ?? r.isin}</td>
                      <td className="num">{r.quantity || ''}</td>
                      <td className="num">
                        {r.price.toLocaleString(LOCALE, { maximumFractionDigits: 4 })} {r.currency}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {fresh.length > 8 && <p className="muted small">{t('portfolio.andMore', { count: fresh.length - 8 })}</p>}
            </div>
          )}
          {parsed.skipped.length > 0 && (
            <p className="muted small">
              {t('portfolio.skippedPrefix')}: {parsed.skipped.slice(0, 4).map((s) => t('portfolio.skippedLine', { line: s.line, reason: s.reason })).join(', ')}
              {parsed.skipped.length > 4 && ' …'}
            </p>
          )}
        </div>
      )}
      {tooMany && <p className="error small">{t('portfolio.csvTooMany', { max: MAX_ROWS })}</p>}
      {error && <p className="error small">{error}</p>}
      <div className="dialog-actions">
        <button className="ghost" onClick={() => dialog.current?.close()} disabled={busy}>
          {t('portfolio.cancel')}
        </button>
        <button className="primary" onClick={run} disabled={busy || fresh.length === 0 || tooMany}>
          {busy ? t('portfolio.csvImporting') : t('portfolio.csvImportCount', { count: fresh.length })}
        </button>
      </div>
    </dialog>
  )
}
