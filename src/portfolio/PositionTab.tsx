import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { holdings, valuate } from '../../supabase/functions/_shared/positions.ts'
import { eur, eurSigned, isoDate, money, pct } from '../lib/format'
import { fetchFx, supabase, TX_COLS, type Portfolio, type Quote, type Transaction } from '../lib/supabase'
import { TX_LABEL } from '../lib/txLabels'
import { TxDialog } from '../TxDialog'
import { pfDir as dirOf, qty, qtyExact } from './format'

/** Position und Transaktionen eines Werts über alle Depots; Transaktionen anlegen/bearbeiten. */
export function PositionTab({ symbol, quote }: { symbol: string; quote?: Quote }) {
  const { t } = useTranslation()
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
              {t('portfolio.sharesQty', { qty: qty.format(p.quantity) })} · {p.value == null ? '–' : eur.format(p.value)}
            </span>
          </div>
          <div className="metric">
            <span className="lbl">{t('portfolio.avgCost')}</span>
            <span className="val">{eur.format(p.cost / p.quantity)}</span>
          </div>
          <div className="metric">
            <span className="lbl">{t('portfolio.totalCost')}</span>
            <span className="val">{eur.format(p.cost)}</span>
          </div>
          <div className="metric">
            <span className="lbl">{t('portfolio.gainLoss')}</span>
            <span className={`val ${dirOf(p.gain)}`}>
              {p.gain == null ? '–' : `${eurSigned.format(p.gain)} (${p.gain_pct == null ? '' : pct.format(p.gain_pct)})`}
            </span>
          </div>
          <div className="metric">
            <span className="lbl">{t('portfolio.heldSince')}</span>
            <span className="val">{p.opened ? isoDate(p.opened) : '–'}</span>
          </div>
        </div>
      ))}
      {positions.length === 0 && <p className="muted">{t('portfolio.noPositionInSymbol')}</p>}
      {msg && <p className="small" role="status">{msg}</p>}
      <div className="listhead pt">
        <h2 className="mh2">{t('portfolio.transactions')}</h2>
        <button className="ghost" onClick={() => setEdit('new')}>
          {t('portfolio.addTx')}
        </button>
      </div>
      {state.txs.length > 0 ? (
        <div className="txtable-wrap">
          <table className="txtable">
            <thead>
              <tr>
                <th>{t('portfolio.colDate')}</th>
                <th>{t('portfolio.colType')}</th>
                <th className="hide-sm">{t('portfolio.colDepot')}</th>
                <th className="num">{t('portfolio.colShares')}</th>
                <th className="num">{t('portfolio.colPrice')}</th>
                <th className="num hide-sm">{t('portfolio.colFees')}</th>
              </tr>
            </thead>
            <tbody>
              {state.txs.map((tx) => (
                <tr key={tx.id} tabIndex={0} onClick={() => setEdit(tx)} onKeyDown={(e) => e.key === 'Enter' && setEdit(tx)} title={t('portfolio.edit')}>
                  <td>{isoDate(tx.date)}</td>
                  <td>{TX_LABEL[tx.type]}</td>
                  <td className="hide-sm">{byPf.get(tx.portfolio_id)}</td>
                  <td className="num">{tx.quantity ? qtyExact.format(tx.quantity) : ''}</td>
                  <td className="num">{tx.type === 'split' ? `1:${qtyExact.format(tx.quantity)}` : money(tx.currency).format(tx.price)}</td>
                  <td className="num hide-sm">{tx.fees ? money(tx.currency).format(tx.fees) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted small">{t('portfolio.noTransactionsYet')}</p>
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
