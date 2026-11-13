import { useCallback, useEffect, useState } from 'react'
import { holdings, valuate } from '../../supabase/functions/_shared/positions.ts'
import { eur, eurSigned, money, pct } from '../lib/format'
import { fetchFx, supabase, TX_COLS, type Portfolio, type Quote, type Transaction } from '../lib/supabase'
import { TX_LABEL } from '../lib/txLabels'
import { TxDialog } from '../TxDialog'
import { pfDir as dirOf, qty, qtyExact } from './format'

/** Position und Transaktionen eines Werts über alle Depots; Transaktionen anlegen/bearbeiten. */
export function PositionTab({ symbol, quote }: { symbol: string; quote?: Quote }) {
  const [state, setState] = useState<{ portfolios: Portfolio[]; txs: Transaction[]; fx: Record<string, number> } | null>(null)
  const [edit, setEdit] = useState<Transaction | 'new' | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const load = useCallback(async () => {
    const [pf, tx, fx] = await Promise.all([
      supabase.from('portfolios').select('id, name, currency, position, collapsed').order('position'),
      supabase.from('transactions').select(TX_COLS).eq('symbol', symbol).order('date', { ascending: false }),
      fetchFx().catch(() => ({ rates: { EUR: 1 } })),
    ])
    setState({ portfolios: pf.data ?? [], txs: (tx.data ?? []) as Transaction[], fx: fx.rates })
  }, [symbol])
  useEffect(() => {
    load()
  }, [load])

  if (!state)
    return (
      <div className="metrics" aria-busy="true">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="metric sk" style={{ height: 62 }} />
        ))}
      </div>
    )
  const quotes = quote ? { [symbol]: quote } : {}
  const { positions } = valuate(holdings(state.txs, state.fx), quotes, state.fx)
  const byPf = new Map(state.portfolios.map((p) => [p.id, p.name]))
  return (
    <div className="postab">
      {positions.map((p) => (
        <div key={p.portfolio_id} className="metrics">
          <div className="metric range52">
            <span className="lbl">{byPf.get(p.portfolio_id)}</span>
            <span className="val">
              {qty.format(p.quantity)} Stück · {p.value == null ? '–' : eur.format(p.value)}
            </span>
          </div>
          <div className="metric">
            <span className="lbl">Ø Einstand</span>
            <span className="val">{eur.format(p.cost / p.quantity)}</span>
          </div>
          <div className="metric">
            <span className="lbl">Einstand gesamt</span>
            <span className="val">{eur.format(p.cost)}</span>
          </div>
          <div className="metric">
            <span className="lbl">Gewinn/Verlust</span>
            <span className={`val ${dirOf(p.gain)}`}>
              {p.gain == null ? '–' : `${eurSigned.format(p.gain)} (${p.gain_pct == null ? '' : pct.format(p.gain_pct)})`}
            </span>
          </div>
          <div className="metric">
            <span className="lbl">Gekauft seit</span>
            <span className="val">{p.opened ? p.opened.split('-').reverse().join('.') : '–'}</span>
          </div>
        </div>
      ))}
      {positions.length === 0 && <p className="muted">Keine offene Position in diesem Wert.</p>}
      {msg && <p className="small" role="status">{msg}</p>}
      <div className="listhead pt">
        <h2 className="mh2">Transaktionen</h2>
        <button className="ghost" onClick={() => setEdit('new')}>
          + Transaktion
        </button>
      </div>
      {state.txs.length > 0 ? (
        <div className="txtable-wrap">
          <table className="txtable">
            <thead>
              <tr>
                <th>Datum</th>
                <th>Art</th>
                <th className="hide-sm">Depot</th>
                <th className="num">Stück</th>
                <th className="num">Kurs</th>
                <th className="num hide-sm">Gebühren</th>
              </tr>
            </thead>
            <tbody>
              {state.txs.map((t) => (
                <tr key={t.id} tabIndex={0} onClick={() => setEdit(t)} onKeyDown={(e) => e.key === 'Enter' && setEdit(t)} title="Bearbeiten">
                  <td>{t.date.split('-').reverse().join('.')}</td>
                  <td>{TX_LABEL[t.type]}</td>
                  <td className="hide-sm">{byPf.get(t.portfolio_id)}</td>
                  <td className="num">{t.quantity ? qtyExact.format(t.quantity) : ''}</td>
                  <td className="num">{t.type === 'split' ? `1:${qtyExact.format(t.quantity)}` : money(t.currency).format(t.price)}</td>
                  <td className="num hide-sm">{t.fees ? money(t.currency).format(t.fees) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted small">Noch keine Transaktionen.</p>
      )}
      {edit && (
        <TxDialog
          portfolios={state.portfolios}
          tx={edit === 'new' ? undefined : edit}
          symbol={symbol}
          onClose={() => setEdit(null)}
          onSaved={(text) => {
            setEdit(null)
            setMsg(text)
            load()
          }}
        />
      )}
    </div>
  )
}
