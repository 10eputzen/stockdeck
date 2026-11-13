import { useEffect, useRef, useState } from 'react'
import { ISIN_RE, parseNum as num } from './lib/csv'
import { resolveIsins, supabase, type Portfolio, type Transaction, type TxType } from './lib/supabase'
import { TX_LABEL } from './lib/txLabels'
import { useDialogs } from './ui/useDialogs'


const today = () => new Date().toISOString().slice(0, 10)
const de = (n: number | null | undefined) => (n == null || n === 0 ? '' : String(n).replace('.', ','))

/** Transaktion anlegen oder bearbeiten (Löschen nur beim Bearbeiten). */
export function TxDialog({
  portfolios,
  tx,
  symbol: fixedSymbol,
  defaultPortfolio,
  onClose,
  onSaved,
}: {
  portfolios: Portfolio[]
  tx?: Transaction
  symbol?: string
  defaultPortfolio?: string
  onClose: () => void
  onSaved: (text: string) => void
}) {
  const { confirm } = useDialogs()
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    dialog.current?.showModal()
  }, [])
  const [f, setF] = useState({
    portfolio_id: tx?.portfolio_id ?? defaultPortfolio ?? portfolios[0]?.id ?? '',
    newPortfolio: '',
    type: (tx?.type ?? 'buy') as TxType,
    date: tx?.date ?? today(),
    symbol: tx?.symbol ?? fixedSymbol ?? '',
    quantity: de(tx?.quantity),
    price: de(tx?.price),
    currency: tx?.currency ?? (fixedSymbol && !/^[A-Z]{1,6}(\.[AB])?$/.test(fixedSymbol) ? 'EUR' : fixedSymbol ? 'USD' : 'EUR'),
    fees: de(tx?.fees),
    taxes: de(tx?.taxes),
    fx_rate: de(tx?.fx_rate),
    note: tx?.note ?? '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((o) => ({ ...o, [k]: e.target.value }))
  const needsQty = f.type !== 'dividend' && f.type !== 'fee'
  const priceLabel = f.type === 'split' ? null : needsQty ? 'Kurs je Stück' : 'Betrag (oder Kurs je Stück)'

  async function save() {
    setError(null)
    const quantity = num(f.quantity)
    const price = num(f.price)
    const fees = num(f.fees)
    const taxes = num(f.taxes)
    const fx = f.fx_rate.trim() ? num(f.fx_rate) : null
    if ([quantity, price, fees, taxes].some((n) => !Number.isFinite(n) || n < 0) || (fx != null && !(fx > 0)))
      return setError('Bitte Zahlen prüfen.')
    if (needsQty && quantity <= 0) return setError(f.type === 'split' ? 'Verhältnis fehlt (4 = aus 1 werden 4).' : 'Stückzahl fehlt.')
    if (!/^[A-Z]{3}$/.test(f.currency.trim().toUpperCase())) return setError('Währung als Kürzel, z. B. EUR.')
    setBusy(true)
    try {
      let symbol = f.symbol.trim().toUpperCase()
      let isin: string | null = tx?.isin ?? null
      let name: string | null = tx?.name ?? null
      if (ISIN_RE.test(symbol)) {
        const r = (await resolveIsins([symbol]))[0]
        if (!r?.symbol) throw new Error('ISIN nicht gefunden – bitte das Kürzel eingeben (z. B. SAP.DE).')
        isin = symbol
        symbol = r.symbol
        name = r.name ?? name
      }
      if (!/^[A-Z0-9.\-:]{1,20}$/.test(symbol)) throw new Error('Kürzel fehlt (z. B. AAPL, SAP.DE oder eine ISIN).')
      let portfolio_id = f.portfolio_id
      if (portfolio_id === 'new' || !portfolio_id) {
        const name = f.newPortfolio.trim()
        if (!name) throw new Error('Name des neuen Depots fehlt.')
        const { data, error } = await supabase
          .from('portfolios')
          .insert({ name, position: portfolios.length })
          .select('id')
          .single()
        if (error) throw new Error(error.code === '23505' ? 'Dieses Depot gibt es schon.' : error.message)
        portfolio_id = data.id
      }
      const row = {
        portfolio_id,
        symbol,
        isin,
        name,
        type: f.type,
        date: f.date,
        quantity,
        price: f.type === 'split' ? 0 : price,
        currency: f.currency.trim().toUpperCase(),
        fees,
        taxes,
        fx_rate: f.currency.trim().toUpperCase() === 'EUR' ? null : fx,
        note: f.note.trim() || null,
      }
      const { error } = tx
        ? await supabase.from('transactions').update(row).eq('id', tx.id)
        : await supabase.from('transactions').insert({ ...row, source: 'manual' })
      if (error) throw new Error(error.message)
      onSaved(tx ? 'Transaktion gespeichert.' : `${TX_LABEL[f.type]} ${symbol} angelegt.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen.')
      setBusy(false)
    }
  }

  async function remove() {
    if (!tx || !(await confirm({ title: 'Transaktion löschen?', confirmLabel: 'Löschen', danger: true }))) return
    setBusy(true)
    const { error } = await supabase.from('transactions').delete().eq('id', tx.id)
    if (error) {
      setError('Löschen fehlgeschlagen.')
      setBusy(false)
    } else onSaved('Transaktion gelöscht.')
  }

  return (
    <dialog ref={dialog} className="dialog txform" onClose={onClose} aria-labelledby="tx-title">
      <h2 id="tx-title">{tx ? 'Transaktion bearbeiten' : 'Transaktion erfassen'}</h2>
      <p className="muted small">Nur Aufzeichnung fürs Portfolio – es wird nichts gehandelt.</p>
      <div className="fgrid">
        <label>
          Depot
          <select value={f.portfolio_id || 'new'} onChange={set('portfolio_id')}>
            {portfolios.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            <option value="new">+ Neues Depot …</option>
          </select>
        </label>
        {(f.portfolio_id === 'new' || !f.portfolio_id) && (
          <label>
            Name des Depots
            <input value={f.newPortfolio} onChange={set('newPortfolio')} placeholder="z. B. Trade Republic" maxLength={60} />
          </label>
        )}
        <label>
          Art
          <select value={f.type} onChange={set('type')}>
            {(Object.keys(TX_LABEL) as TxType[]).map((t) => (
              <option key={t} value={t}>
                {TX_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Datum
          <input type="date" value={f.date} onChange={set('date')} required />
        </label>
        <label className="wide">
          Wert
          <input
            value={f.symbol}
            onChange={set('symbol')}
            placeholder="AAPL, SAP.DE, BTC-EUR oder ISIN"
            disabled={Boolean(fixedSymbol) && !tx}
            autoCapitalize="characters"
          />
        </label>
        <label>
          {f.type === 'split' ? 'Verhältnis (neu je alt)' : 'Stück'}
          <input inputMode="decimal" value={f.quantity} onChange={set('quantity')} />
        </label>
        {priceLabel && (
          <label>
            {priceLabel}
            <input inputMode="decimal" value={f.price} onChange={set('price')} />
          </label>
        )}
        <label>
          Währung
          <input value={f.currency} onChange={set('currency')} maxLength={3} autoCapitalize="characters" />
        </label>
        {f.currency.trim().toUpperCase() !== 'EUR' && (
          <label>
            Kurs {f.currency.toUpperCase()} je EUR
            <input inputMode="decimal" value={f.fx_rate} onChange={set('fx_rate')} placeholder="leer = EZB heute" />
          </label>
        )}
        <label>
          Gebühren
          <input inputMode="decimal" value={f.fees} onChange={set('fees')} />
        </label>
        <label>
          Steuern
          <input inputMode="decimal" value={f.taxes} onChange={set('taxes')} />
        </label>
        <label className="wide">
          Notiz
          <input value={f.note} onChange={set('note')} maxLength={500} />
        </label>
      </div>
      {error && <p className="error small">{error}</p>}
      <div className="dialog-actions">
        {tx && (
          <button className="ghost danger-text" onClick={remove} disabled={busy} style={{ marginRight: 'auto' }}>
            Löschen
          </button>
        )}
        <button className="ghost" onClick={() => dialog.current?.close()} disabled={busy}>
          Abbrechen
        </button>
        <button className="primary" onClick={save} disabled={busy}>
          {busy ? 'Speichert …' : 'Speichern'}
        </button>
      </div>
    </dialog>
  )
}
