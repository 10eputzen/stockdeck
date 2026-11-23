// Serverseite des Portfolios: EZB-Kurse, ISIN-Auflösung mit Cache, Bewertung für MCP.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { getQuotes } from "./finnhub.ts";
import { holdings, sum, valuate, type FxRates, type Tx } from "./positions.ts";
import { figiBatch, resolveIsin } from "./yahoo.ts";
import { cryptoFromIsin } from "./crypto.ts";

export const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

let fxCache: { until: number; date: string; rates: FxRates } | null = null;

/** Tageskurse der EZB über frankfurter.app (Einheiten je 1 EUR), 6 h gemerkt. */
export async function getFx(): Promise<{ date: string; rates: FxRates }> {
  if (fxCache && fxCache.until > Date.now()) return fxCache;
  const res = await fetch("https://api.frankfurter.app/latest?from=EUR");
  if (!res.ok) {
    if (fxCache) return fxCache;
    throw new Error(`frankfurter ${res.status}`);
  }
  const d = await res.json();
  fxCache = { until: Date.now() + 6 * 3600_000, date: String(d.date), rates: { EUR: 1, ...(d.rates ?? {}) } };
  return fxCache;
}

const HIT_DAYS = 30;
const MISS_DAYS = 1;

/** ISINs → Kurssymbole, gemerkt in `isin_symbols`. `admin` = Service-Role. */
export async function resolveIsins(admin: SupabaseClient, input: unknown[]) {
  const isins = [...new Set(input.map((s) => String(s).trim().toUpperCase()))].filter((s) => ISIN_RE.test(s)).slice(0, 50);
  if (isins.length === 0) return [];
  const { data: cached } = await admin.from("isin_symbols").select("*").in("isin", isins);
  const out = new Map<string, { isin: string; symbol: string | null; name: string | null }>();
  for (const c of cached ?? []) {
    const age = Date.now() - new Date(c.fetched_at).getTime();
    if (age < (c.symbol ? HIT_DAYS : MISS_DAYS) * 86400_000) out.set(c.isin, c);
  }
  const missing = isins.filter((i) => !out.has(i));
  // OpenFIGI: je Abfrage bis 10 ISINs; bei erreichtem Limit nicht als „nicht gefunden“ merken
  const rows: { isin: string; symbol: string | null; name: string | null; fetched_at: string }[] = [];
  const transient: { isin: string; symbol: string | null; name: string | null }[] = [];
  for (let i = 0; i < missing.length; i += 10) {
    const chunk = missing.slice(i, i + 10);
    const figi = await figiBatch(chunk).catch(() => null);
    const found = await Promise.all(chunk.map(async (isin) => (await cryptoFromIsin(isin)) ?? (await resolveIsin(isin, figi?.get(isin) ?? []).catch(() => null))));
    chunk.forEach((isin, j) => {
      const r = { isin, symbol: found[j]?.symbol ?? null, name: found[j]?.name ?? null };
      if (r.symbol || figi) rows.push({ ...r, fetched_at: new Date().toISOString() });
      else transient.push(r);
    });
  }
  for (const r of transient) out.set(r.isin, r);
  if (rows.length) await admin.from("isin_symbols").upsert(rows);
  for (const r of rows) out.set(r.isin, r);
  return isins.map((i) => out.get(i)!);
}

const TX_COLS = "id, portfolio_id, symbol, isin, name, type, date, quantity, price, currency, fees, taxes, fx_rate, note, source, external_id, created_at";

/** Depots mit bewerteten Positionen; `filter` = Depot-Name oder -ID (optional).
 *  `db` liest die Nutzerdaten (mit RLS, wenn es ein Nutzer-Client ist), `admin` den Kurs-Cache. */
export async function portfolioOverview(db: SupabaseClient, admin: SupabaseClient, userId: string, filter?: string) {
  const { data: pfs, error } = await db
    .from("portfolios")
    .select("id, name, currency, position")
    .eq("user_id", userId)
    .order("position");
  if (error) throw error;
  const chosen = (pfs ?? []).filter((p) => !filter || p.id === filter || p.name.toLowerCase() === filter.toLowerCase());
  if (chosen.length === 0) return { currency: "EUR", portfolios: [], totals: sum([]), fx_date: null };
  const { data: txs, error: e2 } = await db
    .from("transactions")
    .select(TX_COLS)
    .eq("user_id", userId)
    .in("portfolio_id", chosen.map((p) => p.id))
    .limit(20000);
  if (e2) throw e2;
  const fx = await getFx();
  const hs = holdings((txs ?? []) as Tx[], fx.rates);
  const symbols = [...new Set(hs.filter((h) => h.quantity > 0).map((h) => h.symbol))];
  const quotes: Record<string, { price: number; change: number; currency: string }> = {};
  for (const q of await getQuotes(admin, symbols)) quotes[q.symbol] = q;
  const all = valuate(hs, quotes, fx.rates);
  const round = (n: number | null) => (n == null ? null : Math.round(n * 100) / 100);
  const pct = (n: number | null) => (n == null ? null : Math.round(n * 10000) / 100);
  const portfolios = chosen.map((p) => {
    const rows = all.positions.filter((r) => r.portfolio_id === p.id);
    const t = sum(rows);
    return {
      id: p.id,
      name: p.name,
      totals: { value: round(t.value), cost: round(t.cost), gain: round(t.gain), gain_pct: pct(t.gain_pct), day: round(t.day), day_pct: pct(t.day_pct) },
      positions: rows.map((r) => ({
        symbol: r.symbol,
        name: r.name,
        quantity: r.quantity,
        avg_cost_eur: r.quantity > 0 ? round(r.cost / r.quantity) : null,
        cost_eur: round(r.cost),
        price: r.price,
        currency: r.currency,
        value_eur: round(r.value),
        gain_eur: round(r.gain),
        gain_pct: pct(r.gain_pct),
        day_eur: round(r.day),
        share_pct: pct(r.share),
        opened: r.opened,
        dividends_eur: round(r.dividends),
        realized_eur: round(r.realized),
      })),
    };
  });
  const t = all.totals;
  return {
    currency: "EUR",
    fx_date: fx.date,
    totals: { value: round(t.value), cost: round(t.cost), gain: round(t.gain), gain_pct: pct(t.gain_pct), day: round(t.day), day_pct: pct(t.day_pct) },
    portfolios,
  };
}

export { TX_COLS };
