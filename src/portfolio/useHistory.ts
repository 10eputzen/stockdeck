import { useEffect, useMemo, useState } from 'react'
import { readCache, writeCache } from '../lib/cache'
import { fetchChart, type FxRates, type Quote, type Transaction } from '../lib/supabase'
import { buildHistory, mergeCloses, neededRanges, tradingDays, type Closes, type HistPoint, type Split } from './history'

/** Kursdaten je Symbol: Datum und Kurs als Spalten (kompakt), Kurswährung und Splits laut Yahoo. */
type Series = { d: string[]; c: number[]; cur?: string | null; sp?: Split[] }
/** Einmal pro Tag geladen; Symbole ohne Daten stehen mit leeren Spalten drin, damit sie nicht bei jedem Besuch neu laden. */
type Stored = { v: 2; day: string; first: string; series: Record<string, Series> }

const PARALLEL = 6

const today = () => new Date().toISOString().slice(0, 10)
const toCloses = (s: Series): Closes => s.d.map((date, i) => ({ date, close: s.c[i] }))
const isoDay = (t: number) => new Date(t * 1000).toISOString().slice(0, 10)

/** Aufgaben mit begrenzter Parallelität abarbeiten (schont die Edge Function und Yahoo). */
async function pool<T>(items: T[], run: (item: T) => Promise<void>) {
  let i = 0
  await Promise.all(
    Array.from({ length: Math.min(PARALLEL, items.length) }, async () => {
      while (i < items.length) await run(items[i++])
    }),
  )
}

async function loadSeries(symbol: string, ranges: ('1y' | '5y' | 'max')[]): Promise<Series | null> {
  const sets = (await Promise.all(ranges.map((r) => fetchChart(symbol, r).catch(() => null)))).filter((s) => s != null)
  if (!sets.length) return null
  const merged = mergeCloses(sets)
  // Splits aus allen Zeiträumen (gleicher Tag nur einmal); ältere Edge Functions liefern keine
  const withSplits = sets.filter((s) => Array.isArray(s.splits))
  const sp = withSplits.length
    ? [...new Map(withSplits.flatMap((s) => s.splits!).map((x) => [isoDay(x.t), { date: isoDay(x.t), factor: x.factor }])).values()]
    : undefined
  return { d: merged.map((c) => c.date), c: merged.map((c) => c.close), cur: sets.find((s) => s.currency)?.currency ?? null, sp }
}

/**
 * Depotverlauf: lädt historische Kurse aller jemals gehaltenen Werte (pro Tag einmal, aus dem Cache sofort)
 * und rechnet daraus Wert und Einstand je Handelstag. Der letzte Punkt nutzt die Live-Kurse.
 */
export function useHistory(userId: string, txs: Transaction[] | undefined, fx: FxRates | undefined, quotes: Record<string, Quote> | undefined) {
  const key = `pfhist2:${userId}`
  const [series, setSeries] = useState<Record<string, Series> | null>(() => readCache<Stored>(key)?.series ?? null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  const relevant = useMemo(() => (txs ?? []).filter((t) => t.type !== 'dividend' && t.type !== 'fee'), [txs])
  const first = relevant.reduce<string | null>((m, t) => (m == null || t.date < m ? t.date : m), null)
  const symbolKey = useMemo(() => [...new Set(relevant.map((t) => t.symbol))].sort().join(','), [relevant])

  useEffect(() => {
    if (!first || !symbolKey) return
    const day = today()
    const stored = readCache<Stored>(key)
    const fresh = stored && stored.v === 2 && stored.day === day && stored.first <= first ? stored.series : {}
    const missing = symbolKey.split(',').filter((s) => !fresh[s])
    if (!missing.length) return
    let cancelled = false
    setLoading(true)
    setFailed(false)
    const ranges = neededRanges(first, day)
    const got: Record<string, Series> = { ...fresh }
    let errors = 0
    pool(missing, async (symbol) => {
      const s = await loadSeries(symbol, ranges)
      if (!s) errors++
      got[symbol] = s ?? { d: [], c: [] }
    }).then(() => {
      if (cancelled) return
      writeCache(key, { v: 2, day, first, series: got } satisfies Stored)
      setSeries(got)
      setFailed(errors === missing.length)
      setLoading(false)
    })
    return () => {
      cancelled = true
      setLoading(false)
    }
  }, [key, first, symbolKey])

  const points = useMemo<HistPoint[] | null>(() => {
    if (!series || !first || !fx || !txs) return null
    const closes = Object.fromEntries(Object.entries(series).map(([k, v]) => [k, toCloses(v)]))
    const splits = Object.fromEntries(Object.entries(series).map(([k, v]) => [k, v.sp]))
    const live = Object.fromEntries(Object.entries(quotes ?? {}).map(([s, q]) => [s, { price: q.price, currency: q.currency }]))
    // Währung: aktueller Kurs, sonst Kursdaten (auch für verkaufte Werte), sonst die der Transaktion
    const cur = (symbol: string, fallback: string) => quotes?.[symbol]?.currency ?? series[symbol]?.cur ?? fallback
    return buildHistory(txs, closes, fx, cur, tradingDays(closes, first, today()), live, splits)
  }, [series, first, fx, txs, quotes])

  return { points, first, loading: loading && !points?.length, failed, empty: txs != null && !first }
}
