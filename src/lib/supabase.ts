import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string

export const supabase = createClient(url, key, {
  // Sitzung im Browser halten und still erneuern; PKCE statt Token im URL-Fragment
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
})

export type Quote = {
  symbol: string
  price: number
  change: number
  change_pct: number
  prev_close: number
  day_high: number
  day_low: number
  quote_time: string | null
  fetched_at: string
  ext_session: 'pre' | 'post' | null
  ext_price: number | null
  ext_change_pct: number | null
  ext_time: string | null
  /** USD bei US-Werten, sonst Landeswährung (Yahoo) */
  currency?: string | null
}

export type Profile = { symbol: string; name: string | null; logo_url: string | null }

export type WatchItem = {
  id: string
  symbol: string
  name: string | null
  group_id: string | null
  position: number
}
export type Group = { id: string; name: string; position: number; collapsed: boolean }

/** Geteilte Liste: Besitzer lädt per E-Mail ein, alle Mitglieder bearbeiten die Werte. */
export type SharedList = {
  id: string
  name: string
  owner_id: string
  owner_name: string
  members: { email: string }[]
}
export type SharedItem = {
  id: string
  list_id: string
  symbol: string
  name: string | null
  added_by: string | null
  added_by_name: string
  position: number
}
export type SearchResult = { symbol: string; name: string }

async function market<T>(body: object): Promise<T> {
  const { data, error } = await supabase.functions.invoke('market', { body })
  if (error) throw error
  return data as T
}

export const fetchQuotes = (symbols: string[]) =>
  market<{ quotes: Quote[] }>({ action: 'quotes', symbols }).then((d) => d.quotes)

export const searchSymbols = (q: string) =>
  market<{ results: SearchResult[] }>({ action: 'search', q }).then((d) => d.results)

// Eigene Logo-Kopien kommen als Pfad unter der Supabase-URL (siehe Edge Function `market`)
export const fetchProfiles = (symbols: string[]) =>
  market<{ profiles: Profile[] }>({ action: 'profiles', symbols }).then((d) =>
    d.profiles.map((p) => (p.logo_url?.startsWith('/') ? { ...p, logo_url: url + p.logo_url } : p)),
  )

export type ChartRange = '1d' | '5d' | '1mo' | '6mo' | 'ytd' | '1y' | '5y' | 'max'
export type Bar = { t: number; o: number; h: number; l: number; c: number; v: number }
export type ChartData = {
  symbol: string
  range: ChartRange
  interval: string
  gmtoffset: number
  prev_close: number | null
  more: boolean
  bars: Bar[]
}
export type NewsItem = { time: string; headline: string; source: string; summary: string; url: string; image: string | null }

export const fetchChart = (symbol: string, range: ChartRange, before?: number) =>
  market<ChartData>({ action: 'chart', symbol, range, ...(before ? { before } : {}) })

/** Eine Seite News (10 Stück) samt Gesamtzahl; Bilder lädt der Server je Seite nach. */
export const fetchNews = (symbol: string, offset = 0) =>
  market<{ news: NewsItem[]; total: number }>({ action: 'news', symbol, offset })

export type EarningsEvent = {
  symbol: string
  next_date: string | null
  hour: 'bmo' | 'amc' | 'dmh' | null
  quarter: number | null
  fiscal_year: number | null
  eps_estimate: number | null
  revenue_estimate: number | null
}

/** Nächster Quartalstermin je Symbol (Server-Cache 24 h). */
export type Signals = {
  symbol: string
  analysts: {
    strong_buy: number
    buy: number
    hold: number
    sell: number
    strong_sell: number
    score: number | null
    label: 'Stark kaufen' | 'Kaufen' | 'Halten' | 'Verkaufen' | 'Stark verkaufen' | null
  } | null
  target: { mean: number; high: number | null; low: number | null; count: number | null; currency: string | null } | null
  earnings: { quarter: string; actual: number | null; estimate: number | null; surprise_pct: number | null }[]
  insiders: {
    months: number
    buys: number
    sells: number
    buy_value: number
    sell_value: number
    recent: { name: string; date: string; buy: boolean; shares: number; price: number | null }[]
  } | null
  short: { pct_float: number | null; days_to_cover: number | null; date: string | null } | null
  technicals: {
    high52: number | null
    from_high_pct: number | null
    sma200: number | null
    vs_sma200_pct: number | null
    rsi14: number | null
  } | null
  fetched_at: string
}

export const fetchSignals = (symbols: string[]) =>
  market<{ signals: Signals[] }>({ action: 'signals', symbols }).then((d) => d.signals)

export const fetchEvents = (symbols: string[]) =>
  market<{ events: EarningsEvent[] }>({ action: 'events', symbols }).then((d) => d.events)

export type Metrics = {
  symbol: string
  currency: string | null
  market_cap: number | null
  pe: number | null
  ps: number | null
  pb: number | null
  eps: number | null
  dividend_yield: number | null
  beta: number | null
  week52_high: number | null
  week52_low: number | null
  gross_margin: number | null
  operating_margin: number | null
  net_margin: number | null
  revenue_growth: number | null
  eps_growth: number | null
  roe: number | null
  source: 'finnhub' | 'yahoo'
}

export const fetchMetrics = (symbol: string) =>
  market<{ metrics: Metrics }>({ action: 'metrics', symbol }).then((d) => d.metrics)

import type { TxType } from '../../supabase/functions/_shared/positions.ts'
export type { Tx, TxType, FxRates, Holding, Position, Totals } from '../../supabase/functions/_shared/positions.ts'

export type Portfolio = { id: string; name: string; currency: string; position: number; collapsed: boolean }

export type Transaction = {
  id: string
  portfolio_id: string
  symbol: string
  isin: string | null
  name: string | null
  type: TxType
  date: string
  quantity: number
  price: number
  currency: string
  fees: number
  taxes: number
  fx_rate: number | null
  note: string | null
  source: string
  external_id: string | null
  created_at: string
}

export const TX_COLS =
  'id, portfolio_id, symbol, isin, name, type, date, quantity, price, currency, fees, taxes, fx_rate, note, source, external_id, created_at'

/** EZB-Tageskurse (Einheiten je 1 EUR). */
export const fetchFx = () => market<{ date: string; rates: Record<string, number> }>({ action: 'fx' })

/** ISINs → Kurssymbole (OpenFIGI/Yahoo, serverseitig gemerkt). */
export const resolveIsins = (isins: string[]) =>
  market<{ results: { isin: string; symbol: string | null; name: string | null }[] }>({ action: 'resolve', isins }).then(
    (d) => d.results,
  )
