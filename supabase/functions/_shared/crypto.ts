// Kryptowerte (BTC-EUR, ETH-USD …): Kurse und Charts kommen wie bei Nicht-US-Werten von Yahoo,
// Namen und Logos von CoinGecko (öffentliche API ohne Schlüssel), News aus Finnhubs Krypto-Kategorie.
import { yahooQuote, type YahooHit } from "./yahoo.ts";

const QUOTE_CCY = "EUR|USD|GBP|CHF|CAD|JPY";
const CRYPTO_RE = new RegExp(`^[A-Z0-9]{1,15}-(${QUOTE_CCY})$`);
const QUOTE_SUFFIX = new RegExp(`\\s+(${QUOTE_CCY})$`);

/** Yahoo-Schreibweise für Kryptopaare: Coin, Bindestrich, Währung (BTC-EUR). */
export const isCryptoSymbol = (s: string) => CRYPTO_RE.test(s);

/** Coin-Kürzel ohne Währung: BTC-EUR → BTC. */
export const cryptoBase = (s: string) => s.slice(0, s.lastIndexOf("-"));

/** „Bitcoin EUR“ → „Bitcoin“. */
export const cryptoName = (name: string) => name.replace(QUOTE_SUFFIX, "").trim();

/**
 * Krypto-Treffer der Yahoo-Suche: je Coin ein Paar, bevorzugt in Euro (das Depot rechnet in EUR).
 * Gibt es kein Euro-Paar, bleibt Yahoos Treffer (meist USD).
 */
export async function cryptoHits(hits: YahooHit[], max = 4): Promise<{ symbol: string; name: string }[]> {
  const coins = new Map<string, YahooHit>();
  for (const h of hits) {
    if (h.type !== "CRYPTOCURRENCY" || !isCryptoSymbol(h.symbol)) continue;
    const base = cryptoBase(h.symbol);
    if (!coins.has(base) || h.symbol.endsWith("-EUR")) coins.set(base, h);
  }
  return Promise.all(
    [...coins].slice(0, max).map(async ([base, h]) => {
      const eur = `${base}-EUR`;
      const hasEur = h.symbol === eur || (await yahooQuote(eur).catch(() => null)) != null;
      return { symbol: hasEur ? eur : h.symbol, name: cryptoName(h.name) };
    }),
  );
}

/**
 * Trade Republic führt Kryptowerte unter Pseudo-ISINs wie XF000BTC0017 (Bitcoin).
 * Daraus wird das Euro-Paar, sofern Yahoo dafür einen Kurs hat.
 */
export async function cryptoFromIsin(isin: string): Promise<{ symbol: string; name: string | null } | null> {
  const m = /^XF000([A-Z]{2,5})\d+$/.exec(isin);
  if (!m) return null;
  const symbol = `${m[1]}-EUR`;
  const q = await yahooQuote(symbol).catch(() => null);
  return q ? { symbol, name: q.name ? cryptoName(q.name) : null } : null;
}

type Coin = { symbol?: string; name?: string; market_cap_rank?: number | null; large?: string };

/** Name und Logo eines Coins von CoinGecko: bei mehreren Coins mit gleichem Kürzel der mit der höchsten Marktkapitalisierung. */
export async function coinProfile(symbol: string): Promise<{ name: string | null; logo: string | null } | null> {
  const base = cryptoBase(symbol);
  const res = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(base)}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`coingecko ${res.status}`);
  const coins = (((await res.json()) as { coins?: Coin[] }).coins ?? []).filter(
    (c) => c.symbol?.toUpperCase() === base,
  );
  coins.sort((a, b) => (a.market_cap_rank ?? 1e9) - (b.market_cap_rank ?? 1e9));
  const c = coins[0];
  if (!c) return null;
  const logo = c.large && c.large.startsWith("https://") && !c.large.includes("missing") ? c.large : null;
  return { name: c.name ?? null, logo };
}
