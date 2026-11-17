// All data in this file is made up.
import { describe, expect, it } from 'vitest'
import { parsePositions } from './index.ts'

const out = (positions: unknown[]) => JSON.stringify({ format: 'dkb-holdings-v1', positions })

describe('DKB holdings', () => {
  it('keeps only whitelisted position fields', () => {
    const { positions, skipped } = parsePositions(
      out([
        {
          isin: 'us0000000001',
          quantity: 12.5,
          price: 101.2,
          currency: 'eur',
          date: '2026-03-02',
          acquisition_price: 80,
          name: 'Erika Mustermann',
          depot: '1234567890',
          iban: 'DE00123456780000000000',
        },
      ]),
    )
    expect(skipped).toEqual([])
    expect(positions).toEqual([{ isin: 'US0000000001', quantity: 12.5, price: 101.2, currency: 'EUR', date: '2026-03-02', acquisitionPrice: 80 }])
    expect(JSON.stringify(positions)).not.toMatch(/Mustermann|1234567890|DE0012345678/)
  })

  it('skips invalid positions with fixed reasons that never echo values', () => {
    const { positions, skipped } = parsePositions(
      out([
        { isin: 'NOT-AN-ISIN', quantity: 1, price: 1, currency: 'EUR', date: '2026-03-02' },
        { isin: 'US0000000002', quantity: 0, price: 1, currency: 'EUR', date: '2026-03-02' },
        { isin: 'US0000000003', quantity: 1, price: null, currency: 'EUR', date: '2026-03-02' },
        { isin: 'US0000000004', quantity: 2, price: 5, currency: 'USD', date: '2026-03-02', acquisition_price: null },
      ]),
    )
    expect(skipped.map((s) => s.reason)).toEqual(['position without valid ISIN', 'position without quantity', 'position without price'])
    expect(JSON.stringify(skipped)).not.toContain('NOT-AN-ISIN')
    expect(positions).toEqual([{ isin: 'US0000000004', quantity: 2, price: 5, currency: 'USD', date: '2026-03-02', acquisitionPrice: null }])
  })

  it('rejects output in an unknown format', () => {
    expect(() => parsePositions(JSON.stringify({ rows: [] }))).toThrow('unexpected output')
  })
})
