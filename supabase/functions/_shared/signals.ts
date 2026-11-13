// Signale je Wert: Analysten-Konsens, Kursziel, Quartalszahlen-Überraschung, Leerverkauf (Yahoo,
// inoffiziell, alle Börsen), Insider-Handel (Finnhub, nur US) und Technik aus den Tageskursen.
// Reine Information, keine Empfehlung. Gemerkt 12 h in `symbol_signals`.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { SYMBOL_RE } from "./finnhub.ts";
import { getChart } from "./history.ts";
import { isUsSymbol, yahooSummary } from "./yahoo.ts";
import { technicals, type Technicals } from "./technicals.ts";

export type { Technicals };

const TTL_MS = 12 * 3600_000;
const MAX_FETCH = 12;

export type Analysts = {
  strong_buy: number;
  buy: number;
  hold: number;
  sell: number;
  strong_sell: number;
  /** 1 = stark kaufen … 5 = stark verkaufen */
  score: number | null;
  label: "Stark kaufen" | "Kaufen" | "Halten" | "Verkaufen" | "Stark verkaufen" | null;
};
export type Target = { mean: number; high: number | null; low: number | null; count: number | null; currency: string | null };
export type Surprise = { quarter: string; actual: number | null; estimate: number | null; surprise_pct: number | null };
export type InsiderTx = { name: string; date: string; buy: boolean; shares: number; price: number | null };
export type Insiders = { months: number; buys: number; sells: number; buy_value: number; sell_value: number; recent: InsiderTx[] };
export type Short = { pct_float: number | null; days_to_cover: number | null; date: string | null };
export type Signals = {
  symbol: string;
  analysts: Analysts | null;
  target: Target | null;
  earnings: Surprise[];
  insiders: Insiders | null;
  short: Short | null;
  technicals: Technicals | null;
  fetched_at: string;
};

const raw = (v: unknown) => {
  const x = v && typeof v === "object" ? (v as { raw?: unknown }).raw : v;
  return typeof x === "number" && Number.isFinite(x) ? x : null;
};
const round = (n: number | null, d = 2) => (n == null ? null : Math.round(n * 10 ** d) / 10 ** d);

function analysts(trend: Record<string, unknown> | undefined): Analysts | null {
  if (!trend) return null;
  const c = {
    strong_buy: raw(trend.strongBuy) ?? 0,
    buy: raw(trend.buy) ?? 0,
    hold: raw(trend.hold) ?? 0,
    sell: raw(trend.sell) ?? 0,
    strong_sell: raw(trend.strongSell) ?? 0,
  };
  const n = c.strong_buy + c.buy + c.hold + c.sell + c.strong_sell;
  if (n === 0) return null;
  const score = (c.strong_buy + 2 * c.buy + 3 * c.hold + 4 * c.sell + 5 * c.strong_sell) / n;
  const label = score < 1.5 ? "Stark kaufen" : score < 2.5 ? "Kaufen" : score < 3.5 ? "Halten" : score < 4.5 ? "Verkaufen" : "Stark verkaufen";
  return { ...c, score: round(score), label };
}

async function fromYahoo(symbol: string) {
  const r = await yahooSummary(symbol, ["recommendationTrend", "financialData", "defaultKeyStatistics", "earningsHistory"]);
  if (!r) return { analysts: null, target: null, earnings: [], short: null };
  // deno-lint-ignore no-explicit-any
  const trend = (r.recommendationTrend?.trend ?? []).find((t: any) => t.period === "0m");
  const f = r.financialData ?? {};
  const mean = raw(f.targetMeanPrice);
  const k = r.defaultKeyStatistics ?? {};
  const shortPct = raw(k.shortPercentOfFloat);
  const shortDate = raw(k.dateShortInterest);
  // deno-lint-ignore no-explicit-any
  const hist = (r.earningsHistory?.history ?? []) as any[];
  return {
    analysts: analysts(trend),
    target: mean == null
      ? null
      : { mean: round(mean)!, high: round(raw(f.targetHighPrice)), low: round(raw(f.targetLowPrice)), count: raw(f.numberOfAnalystOpinions), currency: f.financialCurrency ?? null },
    earnings: hist
      .map((h) => ({
        quarter: String(h.quarter?.fmt ?? ""),
        actual: raw(h.epsActual),
        estimate: raw(h.epsEstimate),
        surprise_pct: round(raw(h.surprisePercent) == null ? null : raw(h.surprisePercent)! * 100, 1),
      }))
      .filter((h) => h.quarter)
      .slice(-4),
    short: shortPct == null && raw(k.shortRatio) == null
      ? null
      : {
        pct_float: round(shortPct == null ? null : shortPct * 100, 2),
        days_to_cover: round(raw(k.shortRatio), 1),
        date: shortDate ? new Date(shortDate * 1000).toISOString().slice(0, 10) : null,
      },
  };
}

const INSIDER_MONTHS = 6;

async function fromFinnhub(symbol: string): Promise<Insiders | null> {
  if (!isUsSymbol(symbol)) return null;
  const from = new Date(Date.now() - INSIDER_MONTHS * 30 * 86400_000).toISOString().slice(0, 10);
  const url = new URL("https://finnhub.io/api/v1/stock/insider-transactions");
  url.searchParams.set("symbol", symbol.replace(".", "-"));
  url.searchParams.set("from", from);
  const res = await fetch(url, { headers: { "X-Finnhub-Token": Deno.env.get("FINNHUB_API_KEY") ?? "" } });
  if (!res.ok) throw new Error(`Finnhub insider ${res.status}`);
  // deno-lint-ignore no-explicit-any
  const rows = ((await res.json())?.data ?? []) as any[];
  // Nur Käufe (P) und Verkäufe (S) an der Börse; Optionsausübungen, Schenkungen usw. sagen wenig
  const tx: InsiderTx[] = rows
    .filter((t) => !t.isDerivative && (t.transactionCode === "P" || t.transactionCode === "S") && typeof t.change === "number" && t.change !== 0)
    .map((t) => ({
      name: String(t.name ?? ""),
      date: String(t.transactionDate ?? t.filingDate ?? ""),
      buy: t.transactionCode === "P",
      shares: Math.abs(t.change),
      price: typeof t.transactionPrice === "number" && t.transactionPrice > 0 ? round(t.transactionPrice) : null,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
  const sum = (buy: boolean) => tx.filter((t) => t.buy === buy).reduce((s, t) => s + t.shares * (t.price ?? 0), 0);
  return {
    months: INSIDER_MONTHS,
    buys: tx.filter((t) => t.buy).length,
    sells: tx.filter((t) => !t.buy).length,
    buy_value: Math.round(sum(true)),
    sell_value: Math.round(sum(false)),
    recent: tx.slice(0, 5),
  };
}

export async function fetchSignals(symbol: string): Promise<Signals> {
  const [y, insiders, chart] = await Promise.all([
    fromYahoo(symbol).catch((e) => {
      console.error("signals yahoo", symbol, e);
      return { analysts: null, target: null, earnings: [], short: null };
    }),
    fromFinnhub(symbol).catch((e) => {
      console.error("signals insider", symbol, e);
      return null;
    }),
    getChart(symbol, "1y").catch(() => null),
  ]);
  const bars = chart?.bars ?? [];
  return {
    symbol,
    ...y,
    insiders,
    technicals: technicals(bars.map((b) => b.c), bars.map((b) => b.h)),
    fetched_at: new Date().toISOString(),
  };
}

/** Signale je Symbol, 12 h in `symbol_signals` gemerkt. `admin` = Service-Role. */
export async function getSignals(admin: SupabaseClient, input: unknown[]): Promise<Signals[]> {
  const symbols = [...new Set(input.map(String))].filter((s) => SYMBOL_RE.test(s)).slice(0, 200);
  if (symbols.length === 0) return [];
  const { data: cached } = await admin.from("symbol_signals").select("symbol, data, fetched_at").in("symbol", symbols);
  const result = new Map<string, Signals>(
    (cached ?? [])
      .filter((r) => Date.now() - new Date(r.fetched_at).getTime() < TTL_MS)
      .map((r) => [r.symbol, r.data as Signals]),
  );
  // Finnhub erlaubt 60 Abrufe pro Minute; der Rest kommt beim nächsten Aufruf dran
  const missing = symbols.filter((s) => !result.has(s)).slice(0, MAX_FETCH);
  const fetched = await Promise.all(missing.map(fetchSignals));
  if (fetched.length) {
    const { error } = await admin
      .from("symbol_signals")
      .upsert(fetched.map((s) => ({ symbol: s.symbol, data: s, fetched_at: s.fetched_at })));
    if (error) console.error("signals upsert", error);
  }
  for (const s of fetched) result.set(s.symbol, s);
  return symbols.map((s) => result.get(s)).filter((s): s is Signals => Boolean(s));
}
