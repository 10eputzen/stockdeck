// Finnhub-Zugriff für alle Edge Functions: Kurse mit 60-s-Cache in `quotes`, Symbolsuche.
// Der API-Key bleibt serverseitig (Supabase-Secret FINNHUB_API_KEY).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { isUsSymbol, yahooFetch, yahooQuote, yahooSearch, yahooSymbol } from "./yahoo.ts";
import { coinProfile, cryptoHits, cryptoName, cryptoQuery, isCryptoSymbol } from "./crypto.ts";

const FINNHUB = "https://finnhub.io/api/v1";
const CACHE_SECONDS = 60;
export const MAX_SYMBOLS = 50;
export const SYMBOL_RE = /^[A-Z0-9.\-:]{1,20}$/;

export type Quote = {
  symbol: string;
  price: number;
  change: number;
  change_pct: number;
  prev_close: number;
  day_high: number;
  day_low: number;
  quote_time: string | null;
  fetched_at: string;
  ext_session: "pre" | "post" | null;
  ext_price: number | null;
  ext_change_pct: number | null;
  ext_time: string | null;
  currency: string;
};

export type Profile = { symbol: string; name: string | null; logo_url: string | null; fetched_at: string };

const PROFILE_DAYS = 30;

export type SearchResult = { symbol: string; name: string };

async function finnhub(path: string, params: Record<string, string>) {
  const url = new URL(FINNHUB + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { "X-Finnhub-Token": Deno.env.get("FINNHUB_API_KEY") ?? "" } });
  if (!res.ok) throw new Error(`Finnhub ${path} ${res.status}`);
  return res.json();
}

export async function searchSymbols(query: string): Promise<SearchResult[]> {
  const q = query.trim().slice(0, 40);
  if (!q) return [];
  // „btc-usdt“, „BTCUSDT“: Yahoo kennt nur „btc“, das Dollar-Paar kommt dann zuerst
  const pair = cryptoQuery(q);
  const [us, yahoo] = await Promise.all([
    pair ? Promise.resolve([] as SearchResult[]) : finnhub("/search", { q, exchange: "US" })
      .then((data) =>
        (data.result ?? [])
          .filter((r: { type: string }) => r.type === "Common Stock" || r.type === "ADR")
          .map((r: { symbol: string; description: string }) => ({ symbol: r.symbol, name: r.description }))
      )
      .catch(() => [] as SearchResult[]),
    yahooSearch(pair?.base ?? q, 10).catch(() => []),
  ]);
  // Yahoo liefert US-Werte ohne Endung; die kommen schon von Finnhub
  const extra = yahoo
    .filter((y) => y.type !== "CRYPTOCURRENCY" && !isUsSymbol(y.symbol) && SYMBOL_RE.test(y.symbol))
    .map((y) => ({ symbol: y.symbol, name: y.exchange ? `${y.name} · ${y.exchange}` : y.name }));
  const crypto = (await cryptoHits(yahoo, pair?.currency)).filter((c) => SYMBOL_RE.test(c.symbol));
  // Sucht jemand nach einem Coin („btc“, „solana“), stehen die Kryptopaare oben, sonst unter den Aktien
  const coinFirst = !!pair || yahoo[0]?.type === "CRYPTOCURRENCY";
  const seen = new Set<string>();
  return (coinFirst ? [...crypto, ...us.slice(0, 7), ...extra] : [...us.slice(0, 7), ...crypto, ...extra])
    .filter((r) => !seen.has(r.symbol) && seen.add(r.symbol))
    .slice(0, 12);
}

type Ext = Pick<Quote, "ext_session" | "ext_price" | "ext_change_pct" | "ext_time">;
const NO_EXT: Ext = { ext_session: null, ext_price: null, ext_change_pct: null, ext_time: null };

/**
 * Letzter vor- oder nachbörslicher Kurs aus Yahoos Chartdaten (inoffiziell, nur privat).
 * Fehler werden geschluckt: ohne Yahoo gibt es eben keine Zeile „Nachbörslich“.
 */
export async function extendedHours(symbol: string): Promise<Ext> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol(symbol))}` +
      "?interval=5m&range=1d&includePrePost=true";
    const res = await yahooFetch(url);
    if (!res.ok) return NO_EXT;
    const r = (await res.json())?.chart?.result?.[0];
    const period = r?.meta?.currentTradingPeriod;
    const ts: number[] = r?.timestamp ?? [];
    const close: (number | null)[] = r?.indicators?.quote?.[0]?.close ?? [];
    if (!period || ts.length === 0) return NO_EXT;

    let i = ts.length - 1;
    while (i >= 0 && close[i] == null) i--;
    if (i < 0) return NO_EXT;
    const t = ts[i];
    const price = close[i] as number;

    let session: "pre" | "post" | null = null;
    let base: number | undefined;
    if (t >= period.regular.end) {
      session = "post";
      base = r.meta.regularMarketPrice;
    } else if (t < period.regular.start) {
      session = "pre";
      // Vor Börsenstart ist regularMarketPrice der letzte Schlusskurs (der angezeigte Kurs);
      // chartPreviousClose wäre der Schluss davor und liefert die falsche Richtung
      base = r.meta.regularMarketPrice ?? r.meta.chartPreviousClose ?? r.meta.previousClose;
    }
    if (!session || !base) return NO_EXT;
    return {
      ext_session: session,
      ext_price: Math.round(price * 100) / 100,
      ext_change_pct: Math.round(((price - base) / base) * 10000) / 100,
      ext_time: new Date(t * 1000).toISOString(),
    };
  } catch (e) {
    console.error("yahoo", symbol, e);
    return NO_EXT;
  }
}

/** Firmenprofile (Logo, Name) mit 30-Tage-Cache in `symbol_profiles`; `admin` = Service-Role. */
export const getProfiles = (admin: SupabaseClient, input: unknown[]) => inChunks(input, (part) => profilesChunk(admin, part));

async function profilesChunk(admin: SupabaseClient, symbols: string[]): Promise<Profile[]> {
  if (symbols.length === 0) return [];

  const { data: cached } = await admin.from("symbol_profiles").select("*").in("symbol", symbols);
  const result = new Map<string, Profile>(
    (cached ?? [])
      .filter((p) => Date.now() - new Date(p.fetched_at).getTime() < PROFILE_DAYS * 86400_000)
      .map((p) => [p.symbol, p]),
  );
  const missing = symbols.filter((s) => !result.has(s));
  const fetched = await Promise.all(
    missing.map(async (symbol): Promise<Profile | null> => {
      try {
        if (isCryptoSymbol(symbol)) {
          const [coin, y] = await Promise.all([coinProfile(symbol).catch(() => null), yahooQuote(symbol).catch(() => null)]);
          const name = coin?.name ?? (y?.name ? cryptoName(y.name) : null);
          return { symbol, name, logo_url: coin?.logo ?? null, fetched_at: new Date().toISOString() };
        }
        if (!isUsSymbol(symbol)) {
          const y = await yahooQuote(symbol);
          return { symbol, name: y?.name ?? null, logo_url: null, fetched_at: new Date().toISOString() };
        }
        const p = await finnhub("/stock/profile2", { symbol });
        // Auch leere Antworten cachen, damit unbekannte Symbole nicht jedes Mal abgefragt werden
        return { symbol, name: p?.name || null, logo_url: p?.logo || null, fetched_at: new Date().toISOString() };
      } catch (e) {
        console.error("profile", symbol, e);
        return null;
      }
    }),
  );
  // Fremde Logo-Adressen (neu oder noch aus der Zeit vor der Kopie) einmal in den eigenen Speicher übernehmen
  const candidates = [...fetched.filter((p): p is Profile => p !== null), ...result.values()];
  const rows: Profile[] = [];
  await Promise.all(
    candidates.map(async (p) => {
      const isNew = !result.has(p.symbol);
      if (p.logo_url && /^https?:/.test(p.logo_url)) {
        const own = await mirrorLogo(admin, p.symbol, p.logo_url);
        // Vorübergehender Fehler: kein Logo ausliefern, beim nächsten Aufruf erneut versuchen
        if (own === undefined) {
          result.set(p.symbol, { ...p, logo_url: null });
          return;
        }
        p = { ...p, logo_url: own };
        rows.push(p);
      } else if (isNew) rows.push(p);
      result.set(p.symbol, p);
    }),
  );
  if (rows.length) await admin.from("symbol_profiles").upsert(rows);
  return symbols.map((s) => result.get(s)).filter((p): p is Profile => Boolean(p));
}

const LOGO_BUCKET = "logos";
const LOGO_TYPES = /^image\/(png|jpeg|svg\+xml|webp)$/;

/**
 * Logo laden und im öffentlichen Bucket ablegen (bis zu drei Versuche, Finnhubs Server wackelt).
 * Liefert den Pfad relativ zur Supabase-URL, damit er auch hinter einem Proxy (Self-Hosting) stimmt;
 * `null`, wenn es dauerhaft kein Logo gibt, `undefined` bei vorübergehenden Fehlern.
 */
async function mirrorLogo(admin: SupabaseClient, symbol: string, url: string): Promise<string | null | undefined> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      const type = (res.headers.get("content-type") ?? "").split(";")[0].trim();
      if (!res.ok || !LOGO_TYPES.test(type)) {
        await res.body?.cancel();
        if (res.status === 404 || (res.ok && !LOGO_TYPES.test(type))) return null;
        continue;
      }
      const file = `${symbol}.${type === "image/svg+xml" ? "svg" : type.split("/")[1]}`;
      const { error } = await admin.storage
        .from(LOGO_BUCKET)
        .upload(file, await res.arrayBuffer(), { contentType: type, upsert: true, cacheControl: "2592000" });
      if (error) throw error;
      return `/storage/v1/object/public/${LOGO_BUCKET}/${encodeURIComponent(file)}`;
    } catch (e) {
      console.error("logo", symbol, e);
    }
  }
  return undefined;
}

/**
 * Kurse beliebig vieler Symbole, intern in Blöcken zu MAX_SYMBOLS; `admin` = Service-Role (Cache-Schreibzugriff).
 * `swr`: Kurse bis SWR_SECONDS Alter sofort aus dem Cache liefern und im Hintergrund erneuern
 * (für das Polling der App, das so nicht auf Finnhub warten muss). Ohne `swr` immer frisch (Alarme, MCP).
 */
export const getQuotes = (admin: SupabaseClient, input: unknown[], opts: { swr?: boolean } = {}) =>
  inChunks(input, (part) => quotesChunk(admin, part, opts.swr === true));

const SWR_SECONDS = 15 * 60;

/** Gültige, eindeutige Symbole in Blöcken zu MAX_SYMBOLS nacheinander abarbeiten (schont das Finnhub-Kontingent). */
async function inChunks<T>(input: unknown[], fn: (part: string[]) => Promise<T[]>): Promise<T[]> {
  const symbols = [...new Set(input.map(String))].filter((s) => SYMBOL_RE.test(s));
  const out: T[] = [];
  for (let i = 0; i < symbols.length; i += MAX_SYMBOLS) out.push(...(await fn(symbols.slice(i, i + MAX_SYMBOLS))));
  return out;
}

/** Einen Kurs frisch holen: US über Finnhub (plus Vor-/Nachbörse von Yahoo), sonst Yahoo. */
async function fetchQuote(symbol: string): Promise<Quote | null> {
  try {
    if (!isUsSymbol(symbol)) {
      const y = await yahooQuote(symbol);
      if (!y) return null;
      return {
        ext_session: null,
        ext_price: null,
        ext_change_pct: null,
        ext_time: null,
        symbol,
        price: y.price,
        change: Math.round((y.price - y.prev_close) * 10000) / 10000,
        change_pct: y.prev_close ? Math.round(((y.price - y.prev_close) / y.prev_close) * 10000) / 100 : 0,
        prev_close: y.prev_close,
        day_high: y.day_high,
        day_low: y.day_low,
        quote_time: y.quote_time,
        currency: y.currency,
        fetched_at: new Date().toISOString(),
      };
    }
    const [q, ext] = await Promise.all([finnhub("/quote", { symbol }), extendedHours(symbol)]);
    // Finnhub liefert für unbekannte Symbole lauter Nullen
    if (!q || (q.c === 0 && q.pc === 0)) return null;
    return {
      ...ext,
      symbol,
      price: q.c,
      change: q.d,
      change_pct: q.dp,
      prev_close: q.pc,
      day_high: q.h,
      day_low: q.l,
      quote_time: q.t ? new Date(q.t * 1000).toISOString() : null,
      currency: "USD",
      fetched_at: new Date().toISOString(),
    };
  } catch (e) {
    console.error(symbol, e);
    return null;
  }
}

/** Kurse frisch holen und in `quotes` ablegen. */
async function refreshQuotes(admin: SupabaseClient, symbols: string[]): Promise<Quote[]> {
  const rows = (await Promise.all(symbols.map(fetchQuote))).filter((r): r is Quote => r !== null);
  if (rows.length) await admin.from("quotes").upsert(rows);
  return rows;
}

/** Symbole, deren Erneuerung in dieser Instanz gerade im Hintergrund läuft (keine doppelten Abrufe). */
const refreshing = new Set<string>();

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

/** Erneuerung nach der Antwort weiterlaufen lassen (Supabase Edge Runtime), sonst im selben Aufruf abwarten. */
function inBackground(admin: SupabaseClient, symbols: string[]): void {
  const todo = symbols.filter((s) => !refreshing.has(s));
  if (todo.length === 0) return;
  for (const s of todo) refreshing.add(s);
  const job = refreshQuotes(admin, todo)
    .catch((e) => console.error("quotes refresh", e))
    .finally(() => todo.forEach((s) => refreshing.delete(s)));
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(job);
}

async function quotesChunk(admin: SupabaseClient, symbols: string[], swr: boolean): Promise<Quote[]> {
  if (symbols.length === 0) return [];

  const { data: cached } = await admin.from("quotes").select("*").in("symbol", symbols);
  const age = (q: Quote) => Date.now() - new Date(q.fetched_at).getTime();
  const fresh = new Map<string, Quote>(
    (cached ?? []).filter((q) => age(q) < CACHE_SECONDS * 1000).map((q) => [q.symbol, q]),
  );

  if (swr) {
    // Nicht zu alte Kurse sofort liefern, im Hintergrund erneuern; nur ganz alte oder fehlende abwarten
    const usable = (cached ?? []).filter((q) => !fresh.has(q.symbol) && age(q) < SWR_SECONDS * 1000);
    inBackground(admin, usable.map((q) => q.symbol));
    for (const q of usable) fresh.set(q.symbol, q);
  }

  const stale = symbols.filter((s) => !fresh.has(s));
  for (const r of await refreshQuotes(admin, stale)) fresh.set(r.symbol, r);

  // Fehlt ein frischer Kurs, lieber den alten zeigen als nichts
  return symbols
    .map((s) => fresh.get(s) ?? (cached ?? []).find((q) => q.symbol === s))
    .filter((q): q is Quote => Boolean(q));
}
