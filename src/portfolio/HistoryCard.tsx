import {
  AreaSeries,
  ColorType,
  CrosshairMode,
  LineSeries,
  LineStyle,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type Time,
} from 'lightweight-charts'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LOCALE } from '../i18n'
import { alpha, themeColors } from '../lib/chartTheme'
import { dirOf, eur, eurSigned, isoDate, pct } from '../lib/format'
import type { FxRates, Quote, Transaction } from '../lib/supabase'
import { THEME_EVENT } from '../lib/theme'
import { rangeStart, slice, thin, type HistPoint, type HistRange } from './history'
import { useHistory } from './useHistory'

const RANGES: HistRange[] = ['1mo', '6mo', '1y', 'max']
const RANGE_KEY = 'stockdeck.pfHistRange'
const compact = new Intl.NumberFormat(LOCALE, { notation: 'compact', maximumFractionDigits: 1, style: 'currency', currency: 'EUR' })
const toTime = (date: string) => date as Time

function savedRange(): HistRange {
  try {
    const v = localStorage.getItem(RANGE_KEY)
    return RANGES.includes(v as HistRange) ? (v as HistRange) : '1y'
  } catch {
    return '1y'
  }
}

/** Depotverlauf: Wert (Fläche) und Einstand (gestrichelt) über die Zeit, mit Gewinn im gewählten Zeitraum. */
export function HistoryCard({
  userId,
  txs,
  fx,
  quotes,
}: {
  userId: string
  txs?: Transaction[]
  fx?: FxRates
  quotes?: Record<string, Quote>
}) {
  const { t } = useTranslation()
  const { points, first, loading, failed, empty } = useHistory(userId, txs, fx, quotes)
  const [range, setRange] = useState<HistRange>(savedRange)
  const [hover, setHover] = useState<HistPoint | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const chart = useRef<IChartApi | null>(null)
  const value = useRef<ISeriesApi<'Area'> | null>(null)
  const invested = useRef<ISeriesApi<'Line'> | null>(null)

  const view = useMemo(() => {
    if (!points?.length || !first) return null
    const today = points[points.length - 1].date
    const v = slice(points, rangeStart(range, today, first))
    return { ...v, points: thin(v.points) }
  }, [points, first, range])
  const viewRef = useRef(view)
  viewRef.current = view

  const paint = () => {
    const v = viewRef.current
    if (!v || !value.current || !invested.current || !chart.current) return
    const c = themeColors()
    const col = (v.gain ?? 0) >= 0 ? c.up : c.down
    value.current.applyOptions({ lineColor: col, topColor: alpha(col, 0.28), bottomColor: alpha(col, 0) })
    invested.current.applyOptions({ color: c.muted })
    value.current.setData(v.points.map((p) => ({ time: toTime(p.date), value: p.value })))
    invested.current.setData(v.points.map((p) => ({ time: toTime(p.date), value: p.invested })))
    chart.current.timeScale().fitContent()
  }

  // Chart einmal anlegen, wenn es Transaktionen gibt
  useEffect(() => {
    if (empty || !box.current) return
    const c = themeColors()
    const api = createChart(box.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: c.bg }, textColor: c.muted, fontFamily: 'inherit', attributionLogo: true },
      grid: { vertLines: { visible: false }, horzLines: { color: c.border } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.1, bottom: 0.05 } },
      timeScale: { borderVisible: false, fixLeftEdge: true, fixRightEdge: true },
      crosshair: { mode: CrosshairMode.Magnet },
      handleScroll: false,
      handleScale: false,
      localization: { locale: LOCALE, priceFormatter: (n: number) => compact.format(n) },
    })
    value.current = api.addSeries(AreaSeries, { lineWidth: 2, priceLineVisible: false, lastValueVisible: false })
    invested.current = api.addSeries(LineSeries, { lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false })
    chart.current = api
    const onMove = (p: MouseEventParams<Time>) => {
      const v = viewRef.current
      const tm = p.time as string | { year: number; month: number; day: number } | undefined
      const date = tm == null ? null : typeof tm === 'string' ? tm : `${tm.year}-${String(tm.month).padStart(2, '0')}-${String(tm.day).padStart(2, '0')}`
      setHover(date == null || !v ? null : (v.points.find((x) => x.date === date) ?? null))
    }
    api.subscribeCrosshairMove(onMove)
    const retheme = () => {
      const n = themeColors()
      api.applyOptions({ layout: { background: { type: ColorType.Solid, color: n.bg }, textColor: n.muted }, grid: { horzLines: { color: n.border } } })
      paint()
    }
    window.addEventListener(THEME_EVENT, retheme)
    paint()
    return () => {
      window.removeEventListener(THEME_EVENT, retheme)
      api.unsubscribeCrosshairMove(onMove)
      api.remove()
      chart.current = null
    }
    // paint liest nur Refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empty])

  useEffect(paint, [view])

  const pick = (r: HistRange) => {
    setRange(r)
    try {
      localStorage.setItem(RANGE_KEY, r)
    } catch {
      /* ohne Speicher gilt die Wahl für diese Sitzung */
    }
  }

  if (empty) return null
  const shown = hover ?? view?.points[view.points.length - 1] ?? null
  return (
    <div className="mcard pf-hist">
      <div className="pf-hist-head">
        <div className="pf-hist-legend num">
          {shown ? (
            <>
              <span className="muted">{hover ? isoDate(shown.date) : t('portfolio.history.title')}</span>
              <span>
                <span className="dot val" /> {eur.format(shown.value)}
              </span>
              <span className="muted">
                <span className="dot inv" /> {t('portfolio.history.invested')} {eur.format(shown.invested)}
              </span>
            </>
          ) : (
            <span className="muted">{t('portfolio.history.title')}</span>
          )}
        </div>
        {view?.gain != null && (
          <span className={`pf-hist-gain num ${dirOf(view.gain)}`} title={t('portfolio.history.gainHint')}>
            {eurSigned.format(view.gain)} {view.gainPct != null && <span className="small">({pct.format(view.gainPct)})</span>}
          </span>
        )}
        <div className="ranges pf-hist-ranges" role="group" aria-label={t('portfolio.history.rangeAria')}>
          {RANGES.map((r) => (
            <button key={r} className={r === range ? 'active' : ''} aria-pressed={r === range} onClick={() => pick(r)}>
              {t(`portfolio.history.range.${r}`)}
            </button>
          ))}
        </div>
      </div>
      <div className="pf-hist-box">
        <div ref={box} className="chart" data-testid="pf-history" />
        {(loading || (!points && !failed)) && <div className="chart-cover sk" aria-hidden="true" />}
        {failed && !loading && <p className="chart-cover msg muted">{t('portfolio.history.unavailable')}</p>}
      </div>
    </div>
  )
}
