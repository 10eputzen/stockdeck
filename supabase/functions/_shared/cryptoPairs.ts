// Reine Hilfen für Kryptopaare (ohne Netz), damit sie auch unter Node testbar sind.

const QUOTE_CCY = "EUR|USD|GBP|CHF|CAD|JPY";
const CRYPTO_RE = new RegExp(`^[A-Z0-9]{1,15}-(${QUOTE_CCY})$`);
const QUOTE_SUFFIX = new RegExp(`\\s+(${QUOTE_CCY})$`);

/** Yahoo-Schreibweise für Kryptopaare: Coin, Bindestrich, Währung (BTC-EUR). */
export const isCryptoSymbol = (s: string) => CRYPTO_RE.test(s);

/** Coin-Kürzel ohne Währung: BTC-EUR → BTC. */
export const cryptoBase = (s: string) => s.slice(0, s.lastIndexOf("-"));

/** „Bitcoin EUR“ → „Bitcoin“. */
export const cryptoName = (name: string) => name.replace(QUOTE_SUFFIX, "").trim();

export type PairCurrency = "EUR" | "USD";

/**
 * Suche nach einem Paar wie „btc-usdt“, „BTC/USD“, „ethusdt“ oder „sol eur“: Coin und gewünschte Währung.
 * Yahoo kennt keine Stablecoin-Paare; USDT und USDC folgen dem Dollar 1:1 und werden zum Dollar-Paar.
 * Ohne Trennzeichen nur mit USDT/USDC-Endung, damit Aktienkürzel wie „SEUR“ nicht als Paar gelten.
 */
export function cryptoQuery(q: string): { base: string; currency: PairCurrency } | null {
  const s = q.trim().toUpperCase();
  const m = /^([A-Z0-9]{2,10})[-/ ](USDT|USDC|USD|EUR)$/.exec(s) ?? /^([A-Z0-9]{2,10}?)(USDT|USDC)$/.exec(s);
  return m ? { base: m[1], currency: m[2] === "EUR" ? "EUR" : "USD" } : null;
}

/** Paare je Coin in Wunschreihenfolge: erst die gewünschte Währung, dann die andere (BTC → BTC-EUR, BTC-USD). */
export const pairsFor = (base: string, prefer: PairCurrency = "EUR") =>
  (prefer === "EUR" ? ["EUR", "USD"] : ["USD", "EUR"]).map((c) => `${base}-${c}`);
