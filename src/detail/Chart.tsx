import { THEME_EVENT } from '../lib/theme'
import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  TickMarkType,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts'
import { useEffect, useRef, useState } from 'react'
import { money, pct } from '../lib/format'
import {
  fetchChart,
  type Bar,
  type ChartData,
  type ChartRange,
} from '../lib/supabase'
import { dirOf } from '../lib/format'

const RANGES: { r: ChartRange; label: string }[] = [
  { r: '1d', label: '1T' },
  { r: '5d', label: '5T' },
  { r: '1mo', label: '1M' },
  { r: '6mo', label: '6M' },
  { r: 'ytd', label: 'YTD' },
  { r: '1y', label: '1J' },
  { r: '5y', label: '5J' },
  { r: 'max', label: 'Max' },
]
const INTRADAY = new Set(['5m', '15m', '60m'])
/** Nur US-Werte haben Termine und volle Kennzahlen (Finnhub Free). */
/* ---------- Chart ---------- */

/** Hex-Farbe mit Deckkraft; der Chart versteht kein color-mix(). */
function alpha(hex: string, a: number) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return hex
  const n = parseInt(m[1], 16)
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

function themeColors() {
  const css = getComputedStyle(document.documentElement)
  const v = (n: string) => css.getPropertyValue(n).trim()
  return { bg: v('--surface'), text: v('--text'), muted: v('--muted'), border: v('--border'), up: v('--up'), down: v('--down') }
}

const fmtTime = (intraday: boolean) =>
  new Intl.DateTimeFormat('de-DE', {
    timeZone: 'UTC',
    ...(intraday ? { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: '2-digit', year: 'numeric' }),
  })
const tick = {
  year: new Intl.DateTimeFormat('de-DE', { timeZone: 'UTC', year: 'numeric' }),
  month: new Intl.DateTimeFormat('de-DE', { timeZone: 'UTC', month: 'short' }),
  day: new Intl.DateTimeFormat('de-DE', { timeZone: 'UTC', day: 'numeric', month: 'numeric' }),
  time: new Intl.DateTimeFormat('de-DE', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' }),
}
/** Achsenbeschriftung auf Deutsch (Zeiten sind bereits auf New York verschoben, daher UTC). */
function tickLabel(t: Time, type: TickMarkType) {
  const d = new Date(Number(t) * 1000)
  if (type === TickMarkType.Year) return tick.year.format(d)
  if (type === TickMarkType.Month) return tick.month.format(d)
  if (type === TickMarkType.DayOfMonth) return tick.day.format(d)
  return tick.time.format(d)
}
const compact = new Intl.NumberFormat('de-DE', { notation: 'compact', maximumFractionDigits: 1 })

type Legend = { time: string; o: number; h: number; l: number; c: number; v: number } | null

type Series = {
  candles: ISeriesApi<'Candlestick'>
  line: ISeriesApi<'Area'>
  volume: ISeriesApi<'Histogram'>
}

/** Daten in die Serien schreiben (Zeiten auf New-Yorker Ortszeit verschoben); liefert die Veränderung im Zeitraum. */
function paintSeries(s: Series, d: ChartData): number | null {
  const c = themeColors()
  const shift = (t: number) => (t + d.gmtoffset) as UTCTimestamp
  const base = d.range === '1d' && d.prev_close ? d.prev_close : d.bars[0]?.o
  const last = d.bars[d.bars.length - 1]?.c
  const up = base != null && last != null ? last >= base : true
  const col = up ? c.up : c.down
  s.candles.setData(d.bars.map((b) => ({ time: shift(b.t), open: b.o, high: b.h, low: b.l, close: b.c })))
  s.line.setData(d.bars.map((b) => ({ time: shift(b.t), value: b.c })))
  s.line.applyOptions({ lineColor: col, topColor: alpha(col, 0.28), bottomColor: alpha(col, 0) })
  s.volume.setData(
    d.bars.map((b) => ({
      time: shift(b.t),
      value: b.v,
      color: alpha(b.c >= b.o ? c.up : c.down, 0.35),
    })),
  )
  return base && last != null ? (last - base) / base : null
}

export function PriceChart({ symbol, currency }: { symbol: string; currency?: string | null }) {
  // Der Chart wird einmal angelegt; die Währung kommt evtl. erst mit dem Kurs
  const curRef = useRef(currency)
  useEffect(() => {
    curRef.current = currency
  }, [currency])
  const [range, setRange] = useState<ChartRange>('1d')
  const [kind, setKind] = useState<'candle' | 'line'>(() => {
    try {
      return localStorage.getItem('stockdeck.chartKind') === 'candle' ? 'candle' : 'line'
    } catch {
      return 'line'
    }
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [legend, setLegend] = useState<Legend>(null)
  const [change, setChange] = useState<number | null>(null)
  const [meta, setMeta] = useState<{ intraday: boolean; gmtoffset: number; empty: boolean } | null>(null)

  const box = useRef<HTMLDivElement>(null)
  const chart = useRef<IChartApi | null>(null)
  const candles = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const line = useRef<ISeriesApi<'Area'> | null>(null)
  const volume = useRef<ISeriesApi<'Histogram'> | null>(null)
  const data = useRef<ChartData | null>(null)
  const paint = (d: ChartData) => {
    if (!candles.current || !line.current || !volume.current) return
    setChange(paintSeries({ candles: candles.current, line: line.current, volume: volume.current }, d))
  }
  const olderBusy = useRef(false)
  const req = useRef(0)

  // Chart einmal anlegen, Farben folgen dem hellen/dunklen Modus
  useEffect(() => {
    const el = box.current!
    const c = themeColors()
    const api = createChart(el, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: c.bg }, textColor: c.muted, fontFamily: 'inherit', attributionLogo: true },
      grid: { vertLines: { visible: false }, horzLines: { color: c.border } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: 0.24 } },
      timeScale: { borderVisible: false, rightOffset: 2, tickMarkFormatter: tickLabel },
      crosshair: { mode: CrosshairMode.Magnet },
      handleScroll: { vertTouchDrag: false },
      localization: { locale: 'de-DE', priceFormatter: (n: number) => money(curRef.current).format(n) },
    })
    candles.current = api.addSeries(CandlestickSeries, {
      upColor: c.up,
      downColor: c.down,
      wickUpColor: c.up,
      wickDownColor: c.down,
      borderVisible: false,
      priceLineVisible: false,
    })
    line.current = api.addSeries(AreaSeries, { lineWidth: 2, priceLineVisible: false })
    volume.current = api.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'vol', lastValueVisible: false, priceLineVisible: false })
    api.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 }, visible: false })
    chart.current = api

    const onMove = (p: MouseEventParams<Time>) => {
      const d = data.current
      const t = p.time as number | undefined
      if (!d || t == null) return setLegend(lastLegend(d))
      const bar = findBar(d.bars, t - d.gmtoffset)
      setLegend(bar ? toLegend(bar) : lastLegend(d))
    }
    api.subscribeCrosshairMove(onMove)

    const retheme = () => {
      const n = themeColors()
      api.applyOptions({ layout: { background: { type: ColorType.Solid, color: n.bg }, textColor: n.muted }, grid: { horzLines: { color: n.border } } })
      candles.current?.applyOptions({ upColor: n.up, downColor: n.down, wickUpColor: n.up, wickDownColor: n.down })
      if (data.current) paint(data.current)
    }
    window.addEventListener(THEME_EVENT, retheme)
    return () => {
      window.removeEventListener(THEME_EVENT, retheme)
      api.unsubscribeCrosshairMove(onMove)
      api.remove()
      chart.current = null
    }
  }, [])

  useEffect(() => {
    candles.current?.applyOptions({ visible: kind === 'candle' })
    line.current?.applyOptions({ visible: kind === 'line' })
    try {
      localStorage.setItem('stockdeck.chartKind', kind)
    } catch {
      /* egal */
    }
  }, [kind])

  // Zeitraum laden
  useEffect(() => {
    const my = ++req.current
    setLoading(true)
    setError(false)
    fetchChart(symbol, range).then(
      (d) => {
        if (my !== req.current || !chart.current) return
        data.current = d
        const intra = INTRADAY.has(d.interval)
        const crossFmt = fmtTime(intra)
        chart.current.applyOptions({
          timeScale: { timeVisible: intra, secondsVisible: false },
          localization: { timeFormatter: (t: Time) => crossFmt.format(new Date(Number(t) * 1000)) },
        })
        paint(d)
        chart.current.timeScale().fitContent()
        setLegend(lastLegend(d))
        setMeta({ intraday: INTRADAY.has(d.interval), gmtoffset: d.gmtoffset, empty: d.bars.length === 0 })
        setLoading(false)
      },
      () => {
        if (my !== req.current) return
        setError(true)
        setLoading(false)
      },
    )
  }, [symbol, range])

  // Ältere Daten nachladen, wenn man an den linken Rand scrollt
  useEffect(() => {
    const api = chart.current
    if (!api) return
    const ts = api.timeScale()
    const onRange = (lr: { from: number; to: number } | null) => {
      const d = data.current
      if (!lr || !d || !d.more || olderBusy.current || lr.from > 8 || d.bars.length === 0) return
      olderBusy.current = true
      const my = req.current
      fetchChart(symbol, d.range, d.bars[0].t)
        .then((older) => {
          const cur = data.current
          if (my !== req.current || !cur || !chart.current) return
          const add = older.bars.filter((b) => b.t < cur.bars[0].t)
          const vr = ts.getVisibleLogicalRange()
          data.current = { ...cur, bars: [...add, ...cur.bars], more: older.more && add.length > 0 }
          paint(data.current)
          if (vr && add.length) ts.setVisibleLogicalRange({ from: vr.from + add.length, to: vr.to + add.length })
        })
        .catch(() => {
          if (data.current) data.current = { ...data.current, more: false }
        })
        .finally(() => {
          olderBusy.current = false
        })
    }
    ts.subscribeVisibleLogicalRangeChange(onRange)
    return () => ts.unsubscribeVisibleLogicalRangeChange(onRange)
  }, [symbol])

  const intraday = meta?.intraday ?? true
  return (
    <div className="chartwrap">
      <div className="ranges" role="group" aria-label="Zeitraum">
        {RANGES.map((x) => (
          <button key={x.r} className={x.r === range ? 'active' : ''} aria-pressed={x.r === range} onClick={() => setRange(x.r)}>
            {x.label}
          </button>
        ))}
      </div>
      <div className="legend">
        <span className="legend-text num">
          {legend ? (
            <>
              <span className="muted">{fmtTime(intraday).format(new Date((Number(legend.time) + (meta?.gmtoffset ?? 0)) * 1000))}</span>{' '}
              {kind === 'candle' ? (
                <>
                  O {legend.o.toFixed(2)} H {legend.h.toFixed(2)} T {legend.l.toFixed(2)} S {legend.c.toFixed(2)}
                </>
              ) : (
                money(currency).format(legend.c)
              )}{' '}
              <span className="muted">Vol {compact.format(legend.v)}</span>
            </>
          ) : (
            ' '
          )}
        </span>
        {change != null && <span className={`legend-chg ${dirOf(change)}`}>{pct.format(change)}</span>}
        <span className="kind" role="group" aria-label="Darstellung">
          <button className={kind === 'line' ? 'active' : ''} aria-pressed={kind === 'line'} onClick={() => setKind('line')} title="Linie">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M3 17l5-6 4 3 6-8 3 3" />
            </svg>
          </button>
          <button className={kind === 'candle' ? 'active' : ''} aria-pressed={kind === 'candle'} onClick={() => setKind('candle')} title="Kerzen">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M7 3v4M7 15v6M17 3v8M17 17v4" />
              <rect x="5" y="7" width="4" height="8" rx="1" />
              <rect x="15" y="11" width="4" height="6" rx="1" />
            </svg>
          </button>
        </span>
      </div>
      <div className="chartbox">
        <div ref={box} className="chart" data-testid="chart" />
        {loading && <div className="chart-cover sk" aria-hidden="true" />}
        {error && !loading && <p className="chart-cover msg muted">Kursverlauf gerade nicht verfügbar.</p>}
        {!loading && !error && meta?.empty && <p className="chart-cover msg muted">Keine Kursdaten für diesen Zeitraum.</p>}
      </div>
      <p className="muted tiny">
        Kursdaten von Yahoo, Zeiten in New Yorker Ortszeit. Chart:{' '}
        <a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer">
          TradingView Lightweight Charts™
        </a>{' '}
        © TradingView, Inc.
      </p>
    </div>
  )
}

function findBar(bars: Bar[], t: number): Bar | undefined {
  let lo = 0
  let hi = bars.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (bars[mid].t === t) return bars[mid]
    if (bars[mid].t < t) lo = mid + 1
    else hi = mid - 1
  }
  return undefined
}
const toLegend = (b: Bar): Legend => ({ time: String(b.t), o: b.o, h: b.h, l: b.l, c: b.c, v: b.v })
const lastLegend = (d: ChartData | null): Legend => {
  const b = d?.bars[d.bars.length - 1]
  return b ? toLegend(b) : null
}
