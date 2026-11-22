import { describe, expect, it } from 'vitest'
import type { Tx } from '../../supabase/functions/_shared/positions.ts'
import { allocation, dividendsByYear, trailingDividends } from './analysis'

const pos = (symbol: string, value: number | null, portfolio_id = 'p1', currency = 'USD') => ({ symbol, value, portfolio_id, currency })
const div = (p: Partial<Tx>): Tx => ({ portfolio_id: 'p', symbol: 'KO', type: 'dividend', date: '2026-03-01', quantity: 10, price: 0.5, currency: 'EUR', fees: 0, taxes: 1, ...p })

describe('allocation', () => {
  it('summiert nach Position, Depot und Währung, größte zuerst', () => {
    const ps = [pos('A', 100), pos('B', 300, 'p2', 'EUR'), pos('C', 100, 'p2'), pos('D', null)]
    expect(allocation(ps, 'position', (k) => k).map((s) => [s.key, s.share])).toEqual([
      ['B', 0.6],
      ['A', 0.2],
      ['C', 0.2],
    ])
    expect(allocation(ps, 'depot', (k) => k.toUpperCase()).map((s) => [s.label, s.value])).toEqual([
      ['P2', 400],
      ['P1', 100],
    ])
    expect(allocation(ps, 'currency', (k) => k).map((s) => s.key)).toEqual(['EUR', 'USD'])
  })
  it('fasst kleine Reste unter „Weitere“ zusammen', () => {
    const ps = Array.from({ length: 10 }, (_, i) => pos(`S${i}`, 10 - i))
    const s = allocation(ps, 'position', (k) => k)
    expect(s).toHaveLength(7)
    expect(s[6]).toMatchObject({ key: 'other', value: 4 + 3 + 2 + 1 })
    expect(s.reduce((a, x) => a + x.share, 0)).toBeCloseTo(1)
  })
  it('liefert ohne Wert nichts', () => {
    expect(allocation([pos('A', null)], 'position', (k) => k)).toEqual([])
  })
})

describe('Dividenden', () => {
  it('summiert netto je Jahr in EUR und füllt Lücken', () => {
    const txs = [
      div({ date: '2023-05-01' }),
      div({ date: '2025-05-01', currency: 'USD', quantity: 0, price: 12, taxes: 0, fx_rate: 1.2 }),
      div({ date: '2025-08-01' }),
      div({ type: 'buy', date: '2024-01-01' }),
    ]
    expect(dividendsByYear(txs, { EUR: 1, USD: 1.1 })).toEqual([
      { year: 2023, amount: 4, count: 1 },
      { year: 2024, amount: 0, count: 0 },
      { year: 2025, amount: 14, count: 2 },
    ])
  })
  it('zählt die letzten 12 Monate', () => {
    const txs = [div({ date: '2025-11-22' }), div({ date: '2025-11-23' }), div({ date: '2026-11-22' })]
    expect(trailingDividends(txs, { EUR: 1 }, '2026-11-22')).toBe(8)
  })
})
