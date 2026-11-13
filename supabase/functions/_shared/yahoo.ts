// Yahoo-Zugriff (inoffiziell, nur privat) für alles außerhalb des Finnhub-Free-Plans:
// Kurse nicht-amerikanischer Werte, Suche nach deutschen Werten, ISIN-Auflösung.

/** Finnhub Free kennt nur US-Ticker; Symbole mit Börsenkürzel (SAP.DE, BTC-EUR) laufen über Yahoo. */
export const isUsSymbol = (s: string) => /^[A-Z]{1,6}(\.[AB])?$/.test(s);

/** Yahoo schreibt Aktienklassen mit Bindestrich (BRK-B), Börsenkürzel aber mit Punkt (SAP.DE). */
export const yahooSymbol = (s: string) => (isUsSymbol(s) ? s.replace(".", "-") : s);

// Yahoo schickt riesige Header, an denen HTTP/2 in Deno scheitert
// deno-lint-ignore no-explicit-any
const http1 = (Deno as any).createHttpClient?.({ http1: true, http2: false });
const UA = { "User-Agent": "Mozilla/5.0 (stockdeck)" };

export function yahooFetch(url: string | URL) {
  // deno-lint-ignore no-explicit-any
  return fetch(url, { headers: UA, ...(http1 ? { client: http1 } : {}) } as any);
}

export type YahooQuote = {
  price: number;
  prev_close: number;
  day_high: number;
  day_low: number;
  quote_time: string | null;
  currency: string;
  name: string | null;
  week52_high: number | null;
  week52_low: number | null;
};

const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Kurs aus Yahoos Chart-Metadaten. Pence-Kurse (GBp) werden in Pfund umgerechnet. */
export async function yahooQuote(symbol: string): Promise<YahooQuote | null> {
  const res = await yahooFetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol(symbol))}?range=1d&interval=1d`,
  );
  if (!res.ok) return null;
  const m = (await res.json())?.chart?.result?.[0]?.meta;
  const price = n(m?.regularMarketPrice);
  if (!m || price == null) return null;
  const div = m.currency === "GBp" || m.currency === "GBX" ? 100 : 1;
  const prev = n(m.chartPreviousClose) ?? n(m.previousClose) ?? price;
  return {
    price: price / div,
    prev_close: prev / div,
    day_high: (n(m.regularMarketDayHigh) ?? price) / div,
    day_low: (n(m.regularMarketDayLow) ?? price) / div,
    quote_time: m.regularMarketTime ? new Date(m.regularMarketTime * 1000).toISOString() : null,
    currency: div === 100 ? "GBP" : String(m.currency ?? "USD").toUpperCase(),
    name: m.longName ?? m.shortName?.trim() ?? null,
    week52_high: n(m.fiftyTwoWeekHigh) == null ? null : n(m.fiftyTwoWeekHigh)! / div,
    week52_low: n(m.fiftyTwoWeekLow) == null ? null : n(m.fiftyTwoWeekLow)! / div,
  };
}

export type YahooHit = { symbol: string; name: string; exchange: string; type: string };

/** Yahoo-Suche (Aktien, ETFs, Krypto); findet auch ISINs und deutsche Börsenplätze. */
export async function yahooSearch(q: string, count = 10): Promise<YahooHit[]> {
  const url = new URL("https://query1.finance.yahoo.com/v1/finance/search");
  url.searchParams.set("q", q);
  url.searchParams.set("quotesCount", String(count));
  url.searchParams.set("newsCount", "0");
  const res = await yahooFetch(url);
  if (!res.ok) return [];
  const quotes = ((await res.json())?.quotes ?? []) as Record<string, unknown>[];
  return quotes
    .filter((x) => ["EQUITY", "ETF", "CRYPTOCURRENCY", "MUTUALFUND", "INDEX"].includes(String(x.quoteType)))
    .map((x) => ({
      symbol: String(x.symbol).toUpperCase(),
      name: String(x.longname ?? x.shortname ?? x.symbol).trim(),
      exchange: String(x.exchDisp ?? x.exchange ?? ""),
      type: String(x.quoteType),
    }))
    .filter((x) => /^[A-Z0-9.\-:^=]{1,20}$/.test(x.symbol) && !x.symbol.includes("^") && !x.symbol.includes("="));
}

// Deutsche Handelsplätze bei OpenFIGI, Xetra zuerst; Yahoo-Endung dazu
const DE_EXCH: [string, string][] = [["GY", ".DE"], ["GR", ".DE"], ["GF", ".F"], ["GD", ".DU"], ["GM", ".MU"], ["GS", ".SG"], ["GH", ".HM"]];

type Figi = { ticker?: string; exchCode?: string; name?: string };

/** OpenFIGI ohne Schlüssel: bis 10 ISINs je Abfrage, 25 Abfragen pro Minute. null = Limit erreicht. */
export async function figiBatch(isins: string[]): Promise<Map<string, Figi[]> | null> {
  const res = await fetch("https://api.openfigi.com/v3/mapping", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(isins.map((idValue) => ({ idType: "ID_ISIN", idValue }))),
  });
  if (res.status === 429) return null;
  if (!res.ok) throw new Error(`openfigi ${res.status}`);
  const data = (await res.json()) as { data?: Figi[] }[];
  return new Map(isins.map((isin, i) => [isin, data[i]?.data ?? []]));
}

/** ISIN → Kurssymbol: US-ISIN → US-Ticker, sonst bevorzugt Xetra (EUR). Fallback Yahoo-Suche. */
export async function resolveIsin(isin: string, figi?: Figi[]): Promise<{ symbol: string; name: string | null } | null> {
  try {
    const data = figi ?? (await figiBatch([isin]))?.get(isin) ?? [];
    const pick = (code: string) => data.find((d) => d.exchCode === code && d.ticker);
    // US-Ticker nur bei echter Börsennotiz; reine OTC-Werte (UV, PQ) haben bei Finnhub/Yahoo keinen Kurs
    const usListed = data.some((d) => /^U[A-Z]$/.test(d.exchCode ?? "") && d.exchCode !== "US" && d.exchCode !== "UV");
    const us = isin.startsWith("US") && usListed ? pick("US") : undefined;
    if (us) return { symbol: us.ticker!.replace("/", ".").toUpperCase(), name: us.name ?? null };
    for (const [code, suffix] of DE_EXCH) {
      const d = pick(code);
      if (!d) continue;
      const symbol = (d.ticker!.replace("/", "-") + suffix).toUpperCase();
      if (await yahooQuote(symbol).catch(() => null)) return { symbol, name: d.name ?? null };
    }
  } catch (e) {
    console.error("openfigi", isin, e);
  }
  const hits = await yahooSearch(isin, 5).catch(() => []);
  // US-Werte (auch ADRs) immer mit US-Ticker, damit Finnhub sie in USD bewertet
  const usTicker = (s: string) => s.replace("-", ".");
  const hit = isin.startsWith("US") ? hits.find((h) => isUsSymbol(usTicker(h.symbol))) : hits[0];
  if (!hit) return null;
  return { symbol: isin.startsWith("US") ? usTicker(hit.symbol) : hit.symbol, name: hit.name };
}

// quoteSummary braucht Cookie + Crumb; beides hält eine Function-Instanz eine Stunde
let session: { cookie: string; crumb: string; until: number } | null = null;

async function yahooSession(force = false) {
  if (!force && session && session.until > Date.now()) return session;
  const first = await yahooFetch("https://fc.yahoo.com/");
  await first.body?.cancel();
  const cookie = first.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  if (!cookie) throw new Error("yahoo: kein Cookie");
  // deno-lint-ignore no-explicit-any
  const res = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
    headers: { ...UA, Cookie: cookie },
    ...(http1 ? { client: http1 } : {}),
  } as any);
  const crumb = (await res.text()).trim();
  if (!res.ok || !crumb || crumb.includes("<")) throw new Error(`yahoo: kein Crumb (${res.status})`);
  session = { cookie, crumb, until: Date.now() + 3600_000 };
  return session;
}

/** Yahoo quoteSummary (inoffiziell): Analysten, Kursziel, Quartalszahlen, Leerverkauf. */
// deno-lint-ignore no-explicit-any
export async function yahooSummary(symbol: string, modules: string[]): Promise<Record<string, any> | null> {
  for (const retry of [false, true]) {
    const s = await yahooSession(retry);
    const url = new URL(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(yahooSymbol(symbol))}`);
    url.searchParams.set("modules", modules.join(","));
    url.searchParams.set("crumb", s.crumb);
    // deno-lint-ignore no-explicit-any
    const res = await fetch(url, { headers: { ...UA, Cookie: s.cookie }, ...(http1 ? { client: http1 } : {}) } as any);
    if (res.status === 401 && !retry) {
      await res.body?.cancel();
      continue;
    }
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`yahoo summary ${res.status}`);
    return (await res.json())?.quoteSummary?.result?.[0] ?? null;
  }
  return null;
}
