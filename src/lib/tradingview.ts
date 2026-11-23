import { t } from '../i18n'

// Parser für TradingView-Watchlist-Exporte (.txt).
// Format: kommagetrennt (teils auch zeilenweise), Einträge wie "NASDAQ:NVDA",
// Abschnitte beginnen mit "###Gruppenname".

/** Börsen, die Finnhub als US-Markt abdeckt. */
const US_EXCHANGES = new Set([
  'NASDAQ',
  'NYSE',
  'AMEX',
  'NYSEARCA',
  'NYSEMKT',
  'BATS',
  'CBOE',
  'OTC',
])

/** Krypto-Börsen bei TradingView; deren Paare (BTCUSDT, ETHEUR) werden zu Yahoo-Paaren (BTC-USD, ETH-EUR). */
const CRYPTO_EXCHANGES = new Set([
  'BINANCE',
  'COINBASE',
  'KRAKEN',
  'BITSTAMP',
  'BITFINEX',
  'BYBIT',
  'OKX',
  'KUCOIN',
  'GEMINI',
  'BITPANDA',
  'CRYPTO',
])

/** BTCUSDT → BTC-USD, ETHEUR → ETH-EUR; Paare gegen andere Coins (ETHBTC) gibt es nicht. */
function cryptoPair(pair: string): string | null {
  const m = /^([A-Z0-9]{2,10}?)(USDT|USDC|USD|EUR)$/.exec(pair)
  return m ? `${m[1]}-${m[2] === 'EUR' ? 'EUR' : 'USD'}` : null
}

const SYMBOL_RE = /^[A-Z0-9.-]{1,20}$/

export type ParsedGroup = { name: string | null; symbols: string[] }
export type Unsupported = { raw: string; reason: string }
export type ParsedWatchlist = { groups: ParsedGroup[]; unsupported: Unsupported[] }

export function parseTradingView(text: string): ParsedWatchlist {
  const groups: ParsedGroup[] = []
  const unsupported: Unsupported[] = []
  const seen = new Set<string>()
  let current: ParsedGroup = { name: null, symbols: [] }
  groups.push(current)

  const tokens = text
    .replace(/^﻿/, '')
    .split(/[,\n\r]+/)
    .map((t) => t.trim())
    .filter(Boolean)

  for (const token of tokens) {
    if (token.startsWith('###')) {
      const name = token.slice(3).trim().slice(0, 60)
      if (!name) continue
      const existing = groups.find((g) => g.name?.toLowerCase() === name.toLowerCase())
      current = existing ?? { name, symbols: [] }
      if (!existing) groups.push(current)
      continue
    }

    const [prefix, rest] = token.includes(':') ? token.split(':', 2) : [null, token]
    const exchange = prefix?.toUpperCase() ?? null
    const symbol = (rest ?? '').trim().toUpperCase()

    const coin = exchange && CRYPTO_EXCHANGES.has(exchange) ? cryptoPair(symbol) : null
    if (coin) {
      if (!seen.has(coin)) {
        seen.add(coin)
        current.symbols.push(coin)
      }
      continue
    }
    if (exchange && !US_EXCHANGES.has(exchange)) {
      unsupported.push({ raw: token, reason: t('common.tvUnsupportedExchange', { exchange }) })
      continue
    }
    if (!SYMBOL_RE.test(symbol)) {
      unsupported.push({ raw: token, reason: t('common.tvInvalidSymbol') })
      continue
    }
    if (seen.has(symbol)) continue
    seen.add(symbol)
    current.symbols.push(symbol)
  }

  return { groups: groups.filter((g) => g.symbols.length > 0), unsupported }
}
