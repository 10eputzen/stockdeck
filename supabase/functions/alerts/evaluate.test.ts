import { describe, expect, it } from 'vitest'
import { holdings, type Tx } from '../_shared/positions.ts'
import { berlinNow, evaluateRules, nextTradingDay, type Quote, type Rule, type UserHoldings } from './evaluate.ts'

const today = '2026-11-20'
const rule = (r: Partial<Rule>): Rule => ({ id: 'r1', user_id: 'u1', kind: 'price_above', symbol: 'AAPL', threshold: 100, params: {}, ...r })
const quote = (price: number, change_pct = 0, currency = 'USD'): Quote => ({ price, change: 0, change_pct, currency })
const run = (rules: Rule[], quotes: Record<string, Quote>, userHoldings: UserHoldings = new Map(), fx = {}) =>
  evaluateRules({ rules, quotes, userHoldings, fx, today, langOf: new Map() })

const buy = (symbol: string, date: string, price: number, quantity = 10): Tx & { isin: string | null } => ({
  portfolio_id: 'p1', symbol, name: symbol, type: 'buy', date, quantity, price, currency: 'EUR', fees: 0, taxes: 0, isin: `ISIN-${symbol}`,
})
const holdingsOf = (txs: (Tx & { isin: string | null })[]): UserHoldings => new Map([['u1', { hs: holdings(txs, {}), txs }]])

describe('price rules', () => {
  it('fires above the threshold once per day and switches the rule off', () => {
    const { events, oneShot } = run([rule({})], { AAPL: quote(101) })
    expect(events).toHaveLength(1)
    expect(events[0].dedupe_key).toBe(`rule:r1:${today}`)
    expect(oneShot).toEqual(['r1'])
  })

  it('fires exactly at the threshold', () => {
    expect(run([rule({})], { AAPL: quote(100) }).events).toHaveLength(1)
    expect(run([rule({ kind: 'price_below' })], { AAPL: quote(100) }).events).toHaveLength(1)
  })

  it('stays quiet on the wrong side of the threshold', () => {
    expect(run([rule({})], { AAPL: quote(99.99) }).events).toHaveLength(0)
    expect(run([rule({ kind: 'price_below' })], { AAPL: quote(100.01) }).events).toHaveLength(0)
  })

  it('ignores missing or zero quotes', () => {
    expect(run([rule({ kind: 'price_below' })], {}).events).toHaveLength(0)
    expect(run([rule({ kind: 'price_below' })], { AAPL: quote(0) }).events).toHaveLength(0)
  })

  it('uses the same dedupe key on a second run the same day', () => {
    const a = run([rule({})], { AAPL: quote(101) }).events[0].dedupe_key
    const b = run([rule({})], { AAPL: quote(105) }).events[0].dedupe_key
    expect(a).toBe(b)
  })
})

describe('daily move rule', () => {
  const day = rule({ kind: 'change_pct_day', threshold: 5 })
  it('fires on moves in both directions and stays active', () => {
    const up = run([day], { AAPL: quote(10, 5) })
    expect(up.events).toHaveLength(1)
    expect(up.oneShot).toEqual([])
    expect(run([day], { AAPL: quote(10, -6) }).events).toHaveLength(1)
  })
  it('stays quiet below the threshold', () => {
    expect(run([day], { AAPL: quote(10, 4.9) }).events).toHaveLength(0)
  })
})

describe('take-profit and stop rules', () => {
  const gain = rule({ id: 'g', kind: 'finanzplan_gain', symbol: null, threshold: 10, params: { weeks: 4 } })
  const stop = rule({ id: 's', kind: 'finanzplan_stop', symbol: null, threshold: 8 })

  it('fires take-profit for recent buys above the gain threshold', () => {
    const { events } = run([gain], { SAP: quote(111, 0, 'EUR') }, holdingsOf([buy('SAP', '2026-11-10', 100)]))
    expect(events).toHaveLength(1)
    expect(events[0].dedupe_key).toBe('finanzplan_gain:p1:SAP:2026-11-10')
  })

  it('ignores take-profit for buys older than the window', () => {
    expect(run([gain], { SAP: quote(150, 0, 'EUR') }, holdingsOf([buy('SAP', '2026-09-01', 100)])).events).toHaveLength(0)
  })

  it('fires the stop below the loss threshold, whatever the age', () => {
    const { events } = run([stop], { SAP: quote(92, 0, 'EUR') }, holdingsOf([buy('SAP', '2025-01-01', 100)]))
    expect(events).toHaveLength(1)
    expect(run([stop], { SAP: quote(92.5, 0, 'EUR') }, holdingsOf([buy('SAP', '2025-01-01', 100)])).events).toHaveLength(0)
  })

  it('skips positions opened before the rule started', () => {
    const late = { ...stop, params: { since: '2026-01-01' } }
    expect(run([late], { SAP: quote(50, 0, 'EUR') }, holdingsOf([buy('SAP', '2025-06-01', 100)])).events).toHaveLength(0)
  })

  it('skips excluded symbols and ISINs', () => {
    const h = holdingsOf([buy('SAP', '2025-01-01', 100), buy('BAS', '2025-01-01', 100)])
    const quotes = { SAP: quote(50, 0, 'EUR'), BAS: quote(50, 0, 'EUR') }
    expect(run([{ ...stop, params: { exclude: ['SAP'] } }], quotes, h).events.map((e) => e.symbol)).toEqual(['BAS'])
    expect(run([{ ...stop, params: { exclude: ['ISIN-BAS'] } }], quotes, h).events.map((e) => e.symbol)).toEqual(['SAP'])
  })

  it('only looks at the rule owner’s positions', () => {
    const other = { ...stop, user_id: 'u2' }
    expect(run([other], { SAP: quote(50, 0, 'EUR') }, holdingsOf([buy('SAP', '2025-01-01', 100)])).events).toHaveLength(0)
  })

  it('keys a re-opened position separately (new buy date)', () => {
    const txs = [buy('SAP', '2025-01-01', 100), { ...buy('SAP', '2025-03-01', 100), type: 'sell' as const }, buy('SAP', '2025-05-01', 100)]
    expect(run([stop], { SAP: quote(50, 0, 'EUR') }, holdingsOf(txs)).events[0].dedupe_key).toBe('finanzplan_stop:p1:SAP:2025-05-01')
  })
})

describe('texts', () => {
  it('builds the push in the device language', () => {
    const { events } = run([rule({})], { AAPL: quote(101) })
    expect(events[0].push.text('de').title).toContain('über')
    expect(events[0].push.text('en').title).not.toContain('über')
  })
})

describe('berlinNow', () => {
  it('uses the Berlin date and trading window', () => {
    expect(berlinNow(new Date('2026-11-20T23:30:00Z'))).toEqual({ date: '2026-11-21', open: false })
    expect(berlinNow(new Date('2026-11-20T08:00:00Z'))).toEqual({ date: '2026-11-20', open: true })
    expect(berlinNow(new Date('2026-11-21T12:00:00Z')).open).toBe(false)
    expect(berlinNow(new Date('2026-11-20T21:15:00Z')).open).toBe(true)
    expect(berlinNow(new Date('2026-11-20T21:16:00Z')).open).toBe(false)
  })
})

describe('earnings reminder', () => {
  const one = rule({ id: 'e1', kind: 'earnings_tomorrow', symbol: 'AAPL', threshold: 1 })
  const all = rule({ id: 'e2', kind: 'earnings_tomorrow', symbol: null, threshold: 1 })
  const watchlists = new Map([['u1', ['AAPL', 'MSFT']]])
  const runE = (rules: Rule[], earnings: Record<string, { next_date: string | null; hour: 'bmo' | 'amc' | 'dmh' | null }>, day = today) =>
    evaluateRules({ rules, quotes: {}, userHoldings: new Map(), fx: {}, today: day, langOf: new Map(), earnings, watchlists })

  it('finds the next trading day', () => {
    expect(nextTradingDay('2026-11-19')).toBe('2026-11-20') // Thu → Fri
    expect(nextTradingDay('2026-11-20')).toBe('2026-11-23') // Fri → Mon
    expect(nextTradingDay('2026-11-22')).toBe('2026-11-23') // Sun → Mon
  })

  it('reminds the trading day before, once per stock and date', () => {
    const { events, oneShot } = runE([one], { AAPL: { next_date: '2026-11-23', hour: 'amc' } })
    expect(events).toHaveLength(1)
    expect(events[0].dedupe_key).toBe('earnings:AAPL:2026-11-23')
    expect(events[0].push.text('en').title).toBe('AAPL reports earnings on Monday')
    expect(events[0].push.text('en').body).toBe('After the US market closes.')
    expect(oneShot).toEqual([])
  })

  it('says tomorrow on a normal weekday', () => {
    const { events } = runE([one], { AAPL: { next_date: '2026-11-20', hour: 'bmo' } }, '2026-11-19')
    expect(events[0].push.text('de').title).toBe('AAPL meldet morgen Quartalszahlen')
  })

  it('stays quiet for other dates or without a date', () => {
    expect(runE([one], { AAPL: { next_date: '2026-11-24', hour: null } }).events).toHaveLength(0)
    expect(runE([one], { AAPL: { next_date: null, hour: null } }).events).toHaveLength(0)
    expect(runE([one], {}).events).toHaveLength(0)
  })

  it('covers the whole watchlist and sends one push when both rules match', () => {
    const earnings = { AAPL: { next_date: '2026-11-23', hour: null }, MSFT: { next_date: '2026-11-23', hour: 'bmo' as const } }
    const { events } = runE([one, all], earnings)
    expect(events.map((e) => e.symbol).sort()).toEqual(['AAPL', 'MSFT'])
  })

  it('does not fetch quotes for earnings rules', async () => {
    const src = (await import('node:fs')).readFileSync(new URL('./index.ts', import.meta.url), 'utf8')
    expect(src).toContain('r.kind !== "earnings_tomorrow") symbols.add')
  })
})
