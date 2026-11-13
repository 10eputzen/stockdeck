// Quartalstermine und Kennzahlen. US-Werte über Finnhub (Free-Plan), andere Börsen
// nur das, was Yahoos Chartdaten liefern (52-Wochen-Spanne).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { SYMBOL_RE } from "./finnhub.ts";
import { isUsSymbol, yahooQuote } from "./yahoo.ts";

const FINNHUB = "https://finnhub.io/api/v1";
const EVENT_TTL_MS = 24 * 3600_000;
const EVENT_HORIZON_DAYS = 120;
const MAX_FETCH = 40;

export { isUsSymbol };

async function finnhub(path: string, params: Record<string, string>) {
  const url = new URL(FINNHUB + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { "X-Finnhub-Token": Deno.env.get("FINNHUB_API_KEY") ?? "" } });
  if (!res.ok) throw new Error(`Finnhub ${path} ${res.status}`);
  return res.json();
}

export type EarningsEvent = {
  symbol: string;
  next_date: string | null;
  hour: "bmo" | "amc" | "dmh" | null;
  quarter: number | null;
  fiscal_year: number | null;
  eps_estimate: number | null;
  revenue_estimate: number | null;
  fetched_at: string;
};

const day = (d: Date) => d.toISOString().slice(0, 10);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

async function fetchEvent(symbol: string): Promise<EarningsEvent> {
  const now = new Date();
  const base: EarningsEvent = {
    symbol,
    next_date: null,
    hour: null,
    quarter: null,
    fiscal_year: null,
    eps_estimate: null,
    revenue_estimate: null,
    fetched_at: now.toISOString(),
  };
  if (!isUsSymbol(symbol)) return base;
  const to = new Date(now.getTime() + EVENT_HORIZON_DAYS * 86400_000);
  const r = await finnhub("/calendar/earnings", { from: day(now), to: day(to), symbol: symbol.replace(".", "-") });
  const next = ((r?.earningsCalendar ?? []) as Record<string, unknown>[])
    .filter((e) => typeof e.date === "string")
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))[0];
  if (!next) return base;
  const hour = ["bmo", "amc", "dmh"].includes(String(next.hour)) ? (next.hour as EarningsEvent["hour"]) : null;
  return {
    ...base,
    next_date: String(next.date),
    hour,
    quarter: num(next.quarter),
    fiscal_year: num(next.year),
    eps_estimate: num(next.epsEstimate),
    revenue_estimate: num(next.revenueEstimate),
  };
}

/** Nächster Quartalstermin je Symbol, 24 h in `symbol_events` gemerkt. `admin` = Service-Role. */
export async function getEvents(admin: SupabaseClient, input: unknown[]): Promise<EarningsEvent[]> {
  const symbols = [...new Set(input.map(String))].filter((s) => SYMBOL_RE.test(s)).slice(0, 200);
  if (symbols.length === 0) return [];
  const { data: cached } = await admin.from("symbol_events").select("*").in("symbol", symbols);
  const today = day(new Date());
  const result = new Map<string, EarningsEvent>(
    (cached ?? [])
      .filter((e) => Date.now() - new Date(e.fetched_at).getTime() < EVENT_TTL_MS)
      // Ein vergangener Termin ist veraltet, auch wenn der Cache noch frisch ist
      .filter((e) => !e.next_date || e.next_date >= today)
      .map((e) => [e.symbol, e as EarningsEvent]),
  );
  // Finnhub erlaubt 60 Abrufe pro Minute; der Rest kommt beim nächsten Aufruf dran
  const missing = symbols.filter((s) => !result.has(s)).slice(0, MAX_FETCH);
  const fetched = await Promise.all(
    missing.map((s) =>
      fetchEvent(s).catch((e) => {
        console.error("earnings", s, e);
        return null;
      })
    ),
  );
  const rows = fetched.filter((e): e is EarningsEvent => e !== null);
  if (rows.length) await admin.from("symbol_events").upsert(rows);
  for (const r of rows) result.set(r.symbol, r);
  return symbols.map((s) => result.get(s)).filter((e): e is EarningsEvent => Boolean(e));
}

export type Metrics = {
  symbol: string;
  currency: string | null;
  /** in Millionen der Währung */
  market_cap: number | null;
  pe: number | null;
  ps: number | null;
  pb: number | null;
  eps: number | null;
  /** alle Prozentwerte als Prozent, also 1.5 = 1,5 % */
  dividend_yield: number | null;
  beta: number | null;
  week52_high: number | null;
  week52_low: number | null;
  gross_margin: number | null;
  operating_margin: number | null;
  net_margin: number | null;
  revenue_growth: number | null;
  eps_growth: number | null;
  roe: number | null;
  source: "finnhub" | "yahoo";
};

const metricCache = new Map<string, { until: number; value: Metrics }>();

const EMPTY = {
  currency: null,
  market_cap: null,
  pe: null,
  ps: null,
  pb: null,
  eps: null,
  dividend_yield: null,
  beta: null,
  week52_high: null,
  week52_low: null,
  gross_margin: null,
  operating_margin: null,
  net_margin: null,
  revenue_growth: null,
  eps_growth: null,
  roe: null,
};

async function yahooRange(symbol: string): Promise<Pick<Metrics, "currency" | "week52_high" | "week52_low">> {
  const y = await yahooQuote(symbol);
  if (!y) throw new Error("yahoo: kein Kurs");
  return { currency: y.currency, week52_high: y.week52_high, week52_low: y.week52_low };
}

/** Kennzahlen eines Werts, 12 h im Speicher der Function gemerkt. */
export async function getMetrics(symbol: string): Promise<Metrics> {
  const hit = metricCache.get(symbol);
  if (hit && hit.until > Date.now()) return hit.value;
  let value: Metrics;
  if (isUsSymbol(symbol)) {
    const r = await finnhub("/stock/metric", { symbol: symbol.replace(".", "-"), metric: "all" });
    const m = (r?.metric ?? {}) as Record<string, unknown>;
    const n = (k: string) => num(m[k]);
    value = {
      symbol,
      currency: "USD",
      market_cap: n("marketCapitalization"),
      pe: n("peTTM") ?? n("peBasicExclExtraTTM"),
      ps: n("psTTM"),
      pb: n("pbQuarterly") ?? n("pbAnnual"),
      eps: n("epsTTM"),
      dividend_yield: n("dividendYieldIndicatedAnnual") ?? n("currentDividendYieldTTM"),
      beta: n("beta"),
      week52_high: n("52WeekHigh"),
      week52_low: n("52WeekLow"),
      gross_margin: n("grossMarginTTM"),
      operating_margin: n("operatingMarginTTM"),
      net_margin: n("netProfitMarginTTM"),
      revenue_growth: n("revenueGrowthTTMYoy"),
      eps_growth: n("epsGrowthTTMYoy"),
      roe: n("roeTTM"),
      source: "finnhub",
    };
  } else {
    value = { symbol, ...EMPTY, ...(await yahooRange(symbol)), source: "yahoo" };
  }
  if (metricCache.size > 500) metricCache.clear();
  metricCache.set(symbol, { until: Date.now() + 12 * 3600_000, value });
  return value;
}
