import { LOCALE } from './i18n'
import { useEffect, useMemo, useRef, useState } from 'react'
import { parseCsv } from './lib/csv'
import { resolveIsins, supabase, type Portfolio } from './lib/supabase'
import { TX_LABEL } from './lib/txLabels'

const MAX_ROWS = 5000

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
        if (!name) throw new Error('Name des neuen Depots fehlt.')
        const { data, error } = await supabase.from('portfolios').insert({ name, position: portfolios.length }).select('id').single()
        if (error) throw new Error(error.code === '23505' ? 'Dieses Depot gibt es schon.' : error.message)
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
        `Import fertig: ${inserted} neu, ${dupes + rows.length - inserted} schon vorhanden` +
          (unresolved.size ? `, ${unresolved.size} ISIN nicht gefunden (${[...unresolved].slice(0, 3).join(', ')})` : '') +
          (parsed.skipped.length ? `, ${parsed.skipped.length} Zeilen übersprungen.` : '.'),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import fehlgeschlagen.')
      setBusy(false)
    }
  }

  const tooMany = (parsed?.rows.length ?? 0) > MAX_ROWS
  return (
    <dialog ref={dialog} className="dialog wide-dialog" onClose={onClose} aria-labelledby="csv-title">
      <h2 id="csv-title">Transaktionen importieren</h2>
      <p className="muted small">
        Parqet-Export (Aktivitäten als CSV) oder eigenes Format mit Kopfzeile, Semikolon getrennt:
      </p>
      <pre className="csvhint">Datum;Typ;Symbol;Stück;Kurs;Währung;Gebühren{'\n'}15.01.2026;Kauf;SAP.DE;5;200,50;EUR;1</pre>
      <input type="file" accept=".csv,.txt,text/csv,text/plain" aria-label="Datei wählen" onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} />
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder="CSV hier einfügen" aria-label="CSV-Inhalt" />
      <div className="fgrid">
        <label>
          In Depot
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            {portfolios.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            <option value="new">+ Neues Depot …</option>
          </select>
        </label>
        {target === 'new' && (
          <label>
            Name des Depots
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="z. B. DKB" maxLength={60} />
          </label>
        )}
      </div>
      {parsed && (
        <div className="preview" aria-live="polite">
          <p className="small">
            Erkannt: <strong>{parsed.format === 'parqet' ? 'Parqet-Export' : 'einfaches Format'}</strong> · {fresh.length} neu
            {dupes > 0 && ` · ${dupes} schon vorhanden`}
            {parsed.skipped.length > 0 && ` · ${parsed.skipped.length} übersprungen`}
          </p>
          {fresh.length > 0 && (
            <div className="txtable-wrap">
              <table className="txtable">
                <thead>
                  <tr>
                    <th>Datum</th>
                    <th>Art</th>
                    <th>Wert</th>
                    <th className="num">Stück</th>
                    <th className="num">Kurs</th>
                  </tr>
                </thead>
                <tbody>
                  {fresh.slice(0, 8).map((r) => (
                    <tr key={r.external_id}>
                      <td>{r.date.split('-').reverse().join('.')}</td>
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
              {fresh.length > 8 && <p className="muted small">… und {fresh.length - 8} weitere</p>}
            </div>
          )}
          {parsed.skipped.length > 0 && (
            <p className="muted small">
              Übersprungen: {parsed.skipped.slice(0, 4).map((s) => `Zeile ${s.line} (${s.reason})`).join(', ')}
              {parsed.skipped.length > 4 && ' …'}
            </p>
          )}
        </div>
      )}
      {tooMany && <p className="error small">Mehr als {MAX_ROWS} Zeilen auf einmal sind nicht möglich.</p>}
      {error && <p className="error small">{error}</p>}
      <div className="dialog-actions">
        <button className="ghost" onClick={() => dialog.current?.close()} disabled={busy}>
          Abbrechen
        </button>
        <button className="primary" onClick={run} disabled={busy || fresh.length === 0 || tooMany}>
          {busy ? 'Importiert …' : `${fresh.length} importieren`}
        </button>
      </div>
    </dialog>
  )
}
