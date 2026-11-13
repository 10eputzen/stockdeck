import { LOCALE } from '../i18n'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { compactNum, earningsLong } from '../lib/events'
import { pct, usd } from '../lib/format'
import {
  fetchMetrics,
  type EarningsEvent,
  type Metrics,
} from '../lib/supabase'
import { num2 } from './shared'

/* ---------- Quartalszahlen und Kennzahlen ---------- */

const pctPlain = new Intl.NumberFormat(LOCALE, { style: 'percent', maximumFractionDigits: 1 })

export function EarningsText({ ev }: { ev: EarningsEvent }) {
  const { t } = useTranslation()
  const parts = [
    ev.eps_estimate != null && t('detail.earningsEpsEstimate', { value: usd.format(ev.eps_estimate) }),
    ev.revenue_estimate != null && t('detail.earningsRevenueEstimate', { value: compactNum(ev.revenue_estimate) }),
  ].filter(Boolean)
  return (
    <>
      {t('detail.earningsLabel')}{ev.quarter ? ` Q${ev.quarter}` : ''}: <strong>{earningsLong(ev)}</strong>
      {parts.length > 0 && ` · ${parts.join(' · ')}`}
    </>
  )
}

export function MetricsView({ symbol, price }: { symbol: string; price?: number }) {
  const { t } = useTranslation()
  const [m, setM] = useState<Metrics | null>()
  useEffect(() => {
    let live = true
    fetchMetrics(symbol).then((r) => live && setM(r), () => live && setM(null))
    return () => {
      live = false
    }
  }, [symbol])

  if (m === undefined)
    return (
      <div className="metrics" aria-busy="true">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="metric sk" style={{ height: 62 }} />
        ))}
      </div>
    )
  if (m === null) return <p className="muted">{t('detail.metricsUnavailable')}</p>

  const cur = m.currency ?? 'USD'
  // Wachstum mit Vorzeichen, Margen und Renditen ohne
  const g = (v: number | null) => (v == null ? null : pct.format(v / 100))
  const p = (v: number | null) => (v == null ? null : pctPlain.format(v / 100))
  const tiles: [string, string | null][] = [
    [t('detail.metricMarketCap'), m.market_cap == null ? null : `${compactNum(m.market_cap * 1e6)} ${cur === 'USD' ? '$' : cur}`],
    [t('detail.metricPe'), m.pe == null ? null : num2.format(m.pe)],
    [t('detail.metricPs'), m.ps == null ? null : num2.format(m.ps)],
    [t('detail.metricPb'), m.pb == null ? null : num2.format(m.pb)],
    [t('detail.metricEps'), m.eps == null ? null : usd.format(m.eps)],
    [t('detail.metricDividendYield'), p(m.dividend_yield)],
    [t('detail.metricBeta'), m.beta == null ? null : num2.format(m.beta)],
    [t('detail.metricGrossMargin'), p(m.gross_margin)],
    [t('detail.metricOperatingMargin'), p(m.operating_margin)],
    [t('detail.metricNetMargin'), p(m.net_margin)],
    [t('detail.metricRevenueGrowth'), g(m.revenue_growth)],
    [t('detail.metricEpsGrowth'), g(m.eps_growth)],
    [t('detail.metricRoe'), p(m.roe)],
  ]
  const lo = m.week52_low
  const hi = m.week52_high
  const pos = lo != null && hi != null && price != null && hi > lo ? Math.min(100, Math.max(0, ((price - lo) / (hi - lo)) * 100)) : null
  const fmt = (v: number) => (cur === 'USD' ? usd.format(v) : `${num2.format(v)} ${cur}`)
  return (
    <div className="metrics" data-testid="metrics">
      {lo != null && hi != null && (
        <div className="metric range52">
          <span className="lbl">{t('detail.week52Range')}</span>
          <div className="bar">{pos != null && <span className="dot" style={{ left: `${pos}%` }} />}</div>
          <div className="ends">
            <span>{fmt(lo)}</span>
            <span>{fmt(hi)}</span>
          </div>
        </div>
      )}
      {tiles
        .filter(([, v]) => v != null)
        .map(([l, v]) => (
          <div key={l} className="metric">
            <span className="lbl">{l}</span>
            <span className="val">{v}</span>
          </div>
        ))}
      {m.source === 'yahoo' && (
        <p className="muted small" style={{ gridColumn: '1 / -1' }}>
          {t('detail.metricsNonUsNote')}
        </p>
      )}
    </div>
  )
}
