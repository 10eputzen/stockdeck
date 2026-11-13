import { describe, expect, it } from 'vitest'
import { rsi, technicals } from '../../supabase/functions/_shared/technicals.ts'
import { signalBadge } from './signals'
import type { Quote, Signals } from './supabase'

describe('Technik', () => {
  it('RSI: nur steigende Kurse = 100, nur fallende = 0', () => {
    const upTrend = Array.from({ length: 30 }, (_, i) => 100 + i)
    expect(rsi(upTrend)).toBe(100)
    expect(rsi([...upTrend].reverse())).toBe(0)
    expect(rsi([1, 2, 3])).toBeNull()
  })

  it('Abstand zum Hoch und zum 200-Tage-Schnitt', () => {
    const closes = Array.from({ length: 250 }, () => 100)
    closes[249] = 90
    const highs = closes.map(() => 120)
    const t = technicals(closes, highs)!
    expect(t.high52).toBe(120)
    expect(t.from_high_pct).toBe(-25)
    expect(t.vs_sma200_pct).toBe(-10)
  })
})

describe('Analysten-Badge', () => {
  const base: Signals = {
    symbol: 'TSLA',
    analysts: { strong_buy: 6, buy: 15, hold: 21, sell: 2, strong_sell: 0, score: 2.43, label: 'Kaufen' },
    target: { mean: 412.48, high: 600, low: 128, count: 40, currency: 'USD' },
    earnings: [],
    insiders: null,
    short: null,
    technicals: null,
    fetched_at: '2026-11-12T00:00:00Z',
  }
  const q = { price: 390.84, currency: 'USD' } as Quote

  it('zeigt Konsens und Kursziel-Abstand', () => {
    expect(signalBadge(base, q)).toMatchObject({ text: 'Kaufen +6 %', tone: 'up' })
  })

  it('ohne Abstand bei anderer Währung', () => {
    expect(signalBadge(base, { ...q, currency: 'EUR' })?.text).toBe('Kaufen')
  })

  it('kein Badge ohne Analysten', () => {
    expect(signalBadge({ ...base, analysts: null }, q)).toBeNull()
  })
})
