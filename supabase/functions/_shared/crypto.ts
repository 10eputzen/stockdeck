// Kryptowerte (BTC-EUR, ETH-USD …): Kurse und Charts kommen wie bei Nicht-US-Werten von Yahoo,
// Namen und Logos von CoinGecko (öffentliche API ohne Schlüssel), News aus Finnhubs Krypto-Kategorie.
import { yahooQuote, type YahooHit } from "./yahoo.ts";
import { cryptoBase, cryptoName, isCryptoSymbol, pairsFor, type PairCurrency } from "./cryptoPairs.ts";

export { cryptoBase, cryptoName, cryptoQuery, isCryptoSymbol } from "./cryptoPairs.ts";

/**
 * Krypto-Treffer der Yahoo-Suche: je Coin das Euro- und das Dollar-Paar (BTC-EUR, BTC-USD),
 * die Wunschwährung zuerst. Das Depot rechnet Dollar-Kurse wie bei US-Aktien in Euro um.
 * Gibt es keins von beiden, bleibt Yahoos Treffer (z. B. BTC-CAD).
 */
export async function cryptoHits(
  hits: YahooHit[],
  prefer: PairCurrency = "EUR",
  max = 3,
): Promise<{ symbol: string; name: string }[]> {
  const known = new Set(hits.map((h) => h.symbol));
  const coins = new Map<string, YahooHit>();
  for (const h of hits) {
    if (h.type !== "CRYPTOCURRENCY" || !isCryptoSymbol(h.symbol)) continue;
    const base = cryptoBase(h.symbol);
    if (!coins.has(base)) coins.set(base, h);
  }
  const perCoin = await Promise.all(
    [...coins].slice(0, max).map(async ([base, h]) => {
      const name = cryptoName(h.name);
      const pairs = await Promise.all(
        pairsFor(base, prefer).map(async (symbol) =>
          known.has(symbol) || (await yahooQuote(symbol).catch(() => null)) != null ? symbol : null,
        ),
      );
      const found = pairs.filter((s): s is string => s != null);
      return (found.length ? found : [h.symbol]).map((symbol) => ({ symbol, name }));
    }),
  );
  return perCoin.flat();
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
