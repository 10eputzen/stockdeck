import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { holdings, sum, valuate } from '../supabase/functions/_shared/positions.ts'
import { CsvImport } from './CsvImport'
import { readCache, writeCache } from './lib/cache'
import { exportCsv } from './lib/csv'
import { eur, pct } from './lib/format'
import {
  fetchFx,
  fetchProfiles,
  fetchQuotes,
  supabase,
  TX_COLS,
  type Portfolio,
  type Profile,
  type Quote,
  type Transaction,
} from './lib/supabase'
import { PfMenu, PosHead, PosRow, TotalsCard, type Mode } from './portfolio/Rows'
import { pfDir as dirOf } from './portfolio/format'
import { TxDialog } from './TxDialog'
import { useDialogs } from './ui/useDialogs'

type Data = {
  portfolios: Portfolio[]
  txs: Transaction[]
  quotes: Record<string, Quote>
  fx: Record<string, number>
  profiles: Record<string, Profile>
}


/** Letztes vollständiges Laden je Nutzer: ein Tab-Wechsel innerhalb von 30 s lädt nicht alles erneut. */
const lastLoaded = new Map<string, number>()
const RELOAD_MS = 30_000

/** Depots, Transaktionen, Kurse und EZB-Kurse laden; der letzte Stand liegt sofort aus dem Cache vor. */
function usePortfolio(userId: string) {
  const { t } = useTranslation()
  const key = `pf1:${userId}`
  const [data, setData] = useState<Data | null>(() => readCache<Data>(key))
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const loadInner = useCallback(async () => {
    const [pf, tx, fx] = await Promise.all([
      supabase.from('portfolios').select('id, name, currency, position, collapsed').order('position'),
      supabase.from('transactions').select(TX_COLS).order('date').limit(20000),
      fetchFx().catch(() => null),
    ])
    if (pf.error || tx.error) {
      setError(t('portfolio.loadError'))
      return
    }
    const txs = tx.data as Transaction[]
    const rates = fx?.rates ?? readCache<Data>(key)?.fx ?? { EUR: 1 }
    const symbols = [...new Set(holdings(txs, rates).filter((h) => h.quantity > 0).map((h) => h.symbol))]
    const chunks = Array.from({ length: Math.ceil(symbols.length / 50) }, (_, i) => symbols.slice(i * 50, i * 50 + 50))
    const [qs, ps] = await Promise.all([
      Promise.all(chunks.map((c) => fetchQuotes(c).catch(() => []))).then((r) => r.flat()),
      Promise.all(chunks.map((c) => fetchProfiles(c).catch(() => []))).then((r) => r.flat()),
    ])
    setError(null)
    lastLoaded.set(key, Date.now())
    setData((old) => ({
      portfolios: pf.data,
      txs,
      fx: rates,
      // Fehlt ein Kurs gerade, den letzten bekannten behalten
      quotes: { ...(old?.quotes ?? {}), ...Object.fromEntries(qs.map((q) => [q.symbol, q])) },
      profiles: { ...(old?.profiles ?? {}), ...Object.fromEntries(ps.map((p) => [p.symbol, p])) },
    }))
  }, [key, t])
  const load = useCallback(async () => {
    setRefreshing(true)
    try {
      await loadInner()
    } finally {
      setRefreshing(false)
    }
  }, [loadInner])
  useEffect(() => {
    // Gerade erst geladen (Hin- und Herwechseln der Tabs): Stand aus dem Cache reicht
    if (readCache<Data>(key) && Date.now() - (lastLoaded.get(key) ?? 0) < RELOAD_MS) return
    load()
  }, [key, load])
  useEffect(() => {
    if (data) writeCache(key, data)
  }, [key, data])
  return { data, setData, error, load, refreshing }
}

export function PortfolioPage({
  userId,
  narrow,
  onOpen,
  onToast,
}: {
  userId: string
  narrow: boolean
  onOpen: (symbol: string) => void
  onToast: (text: string) => void
}) {
  const { t } = useTranslation()
  const { data, setData, error, load, refreshing } = usePortfolio(userId)
  const [mode, setMode] = useState<Mode>(() => {
    try {
      return localStorage.getItem('pf-mode') === 'total' ? 'total' : 'day'
    } catch {
      return 'day'
    }
  })
  const pick = (m: Mode) => {
    setMode(m)
    try {
      localStorage.setItem('pf-mode', m)
    } catch {
      /* ohne Speicher bleibt es bei der Sitzung */
    }
  }
  const { confirm, prompt } = useDialogs()
  const [dialog, setDialog] = useState<null | 'tx' | 'csv'>(null)
  const view = useMemo(() => {
    if (!data) return null
    const hs = holdings(data.txs, data.fx)
    return valuate(hs, data.quotes, data.fx)
  }, [data])

  async function toggle(p: Portfolio) {
    setData((d) => d && { ...d, portfolios: d.portfolios.map((x) => (x.id === p.id ? { ...x, collapsed: !x.collapsed } : x)) })
    await supabase.from('portfolios').update({ collapsed: !p.collapsed }).eq('id', p.id)
  }
  async function addPortfolio() {
    const name = (await prompt({ title: t('portfolio.newDepotTitle'), label: t('portfolio.nameLabel'), confirmLabel: t('portfolio.createConfirm') }))?.trim()
    if (!name) return
    const { error } = await supabase.from('portfolios').insert({ name: name.slice(0, 60), position: data?.portfolios.length ?? 0 })
    onToast(error ? (error.code === '23505' ? t('portfolio.depotExists') : t('portfolio.createError')) : t('portfolio.depotCreated', { name }))
    load()
  }
  async function renamePortfolio(p: Portfolio) {
    const name = (await prompt({ title: t('portfolio.renameDepotTitle'), label: t('portfolio.newNameLabel'), initial: p.name }))?.trim()
    if (!name || name === p.name) return
    const { error } = await supabase.from('portfolios').update({ name: name.slice(0, 60) }).eq('id', p.id)
    if (error) onToast(t('portfolio.renameError'))
    load()
  }
  async function deletePortfolio(p: Portfolio) {
    const n = data?.txs.filter((tx) => tx.portfolio_id === p.id).length ?? 0
    if (!(await confirm({ title: t('portfolio.deleteDepotTitle', { name: p.name }), message: t('portfolio.deleteDepotMessage', { count: n }), confirmLabel: t('portfolio.deleteConfirm'), danger: true }))) return
    const { error } = await supabase.from('portfolios').delete().eq('id', p.id)
    onToast(error ? t('portfolio.deleteError') : t('portfolio.depotDeleted', { name: p.name }))
    load()
  }

  function exportTxs(p?: Portfolio) {
    if (!data) return
    const txs = p ? data.txs.filter((tx) => tx.portfolio_id === p.id) : data.txs
    const slug = p ? p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'depot' : 'all'
    const url = URL.createObjectURL(new Blob(['\ufeff' + exportCsv(txs, data.portfolios)], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `stockdeck-${slug}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    onToast(t('portfolio.exported', { count: txs.length }))
  }

  const done = (text: string) => {
    setDialog(null)
    onToast(text)
    load()
  }

  const loading = !data
  const empty = data && data.portfolios.length === 0
  return (
    <section className="pf">
      <div className={`refreshbar ${refreshing ? 'on' : ''}`} aria-hidden="true" />
      <div className="listhead">
        <h1>{t('portfolio.title')}</h1>
        <div className="seg" role="group" aria-label={t('portfolio.changeModeAria')}>
          <button className={mode === 'day' ? 'on' : ''} aria-pressed={mode === 'day'} onClick={() => pick('day')}>
            {t('portfolio.today')}
          </button>
          <button className={mode === 'total' ? 'on' : ''} aria-pressed={mode === 'total'} onClick={() => pick('total')}>
            {t('portfolio.total')}
          </button>
        </div>
        <div className={narrow ? 'mtools' : 'tools'}>
          {narrow && (
            <button className={`ghost iconbtn refreshbtn ${refreshing ? 'spin' : ''}`} onClick={() => load()} aria-label={t('portfolio.refresh')} title={t('portfolio.refresh')}>
              <span><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.5-5.8" /><path d="M20 4v5h-5" /></svg></span>
            </button>
          )}
          <button className="ghost" onClick={() => setDialog('tx')} disabled={loading}>
            {narrow ? t('portfolio.addTxShort') : t('portfolio.addTx')}
          </button>
          <button className="ghost" onClick={() => setDialog('csv')} disabled={loading}>
            {t('portfolio.import')}
          </button>
          {!narrow && (
            <button className="ghost" onClick={() => exportTxs()} disabled={!data?.txs.length}>
              {t('portfolio.export')}
            </button>
          )}
          {!narrow && (
            <button className="ghost" onClick={addPortfolio} disabled={loading}>
              {t('portfolio.addDepot')}
            </button>
          )}
        </div>
      </div>
      {error && <p className="error small">{error}</p>}

      <TotalsCard t={view?.totals} />

      {empty ? (
        <div className="mcard pf-empty">
          <p>{t('portfolio.emptyHint')}</p>
          <div className="tools">
            <button className="primary" onClick={addPortfolio}>
              {t('portfolio.createDepot')}
            </button>
            <button className="ghost" onClick={() => setDialog('csv')}>
              {t('portfolio.importCsv')}
            </button>
          </div>
        </div>
      ) : (
        <div className={`watch pf-list ${refreshing && !loading ? 'stale' : ''}`}>
          {!narrow && <PosHead mode={mode} />}
          {loading
            ? Array.from({ length: 5 }, (_, i) => <PosRow key={i} mode={mode} narrow={narrow} />)
            : data.portfolios.map((p) => {
                const rows = view!.positions.filter((r) => r.portfolio_id === p.id)
                const tot = sum(rows)
                return (
                  <div key={p.id} className="group">
                    <div className="grouphead pf-head">
                      <button
                        className="ghost icon chev"
                        aria-expanded={!p.collapsed}
                        aria-label={p.collapsed ? t('portfolio.expandDepot', { name: p.name }) : t('portfolio.collapseDepot', { name: p.name })}
                        onClick={() => toggle(p)}
                      >
                        {p.collapsed ? '▸' : '▾'}
                      </button>
                      <button className="groupname static grow" onClick={() => toggle(p)}>
                        {p.name} <span className="muted small-count">{rows.length}</span>
                      </button>
                      <span className="num pf-headval">{eur.format(tot.value)}</span>
                      <span className={`num small pf-headchg ${dirOf(mode === 'day' ? tot.day : tot.gain)}`}>
                        {(mode === 'day' ? tot.day_pct : tot.gain_pct) == null ? '' : pct.format((mode === 'day' ? tot.day_pct : tot.gain_pct)!)}
                      </span>
                      <PfMenu onRename={() => renamePortfolio(p)} onExport={() => exportTxs(p)} onDelete={() => deletePortfolio(p)} />
                    </div>
                    {!p.collapsed &&
                      (rows.length ? (
                        rows.map((r) => (
                          <PosRow key={r.symbol} r={r} mode={mode} narrow={narrow} logo={data.profiles[r.symbol]?.logo_url} name={data.profiles[r.symbol]?.name} onOpen={() => onOpen(r.symbol)} />
                        ))
                      ) : (
                        <p className="muted small pf-none">{t('portfolio.noOpenPositions')}</p>
                      ))}
                  </div>
                )
              })}
        </div>
      )}
      {data && data.portfolios.length > 0 && (
        <p className="muted small">{t('portfolio.valuationNote')}</p>
      )}

      {dialog === 'tx' && data && <TxDialog portfolios={data.portfolios} onClose={() => setDialog(null)} onSaved={done} />}
      {dialog === 'csv' && data && (
        <CsvImport
          portfolios={data.portfolios}
          knownIds={new Set(data.txs.map((tx) => tx.external_id).filter((x): x is string => Boolean(x)))}
          onClose={() => setDialog(null)}
          onDone={done}
        />
      )}
    </section>
  )
}
