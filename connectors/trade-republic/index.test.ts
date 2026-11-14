// All data in this file is made up. It mimics the shape of `pytr export_transactions --export-format json`.
import { describe, expect, it } from 'vitest'
import { normalize } from '../core/normalize.ts'
import { parseExport, parseHoldings } from './index.ts'

const line = (o: Record<string, unknown>) => JSON.stringify(o)
const base = { Note: 'Erika Mustermann DE00123456780000000000', ISIN2: null, Shares2: null }

const EXPORT = [
  line({ ...base, Date: '2026-01-10T09:00:00', Type: 'Deposit', Value: 1000, ISIN: null, Shares: null, Fees: null, Taxes: null }),
  line({ ...base, Date: '2026-01-11T10:00:00', Type: 'Buy', Value: -201, ISIN: 'US0000000001', Shares: 2, Fees: -1, Taxes: null }),
  line({ ...base, Date: '2026-02-11T10:00:00', Type: 'Sell', Value: 118.5, ISIN: 'US0000000001', Shares: 1, Fees: -1, Taxes: 0.5 }),
  line({ ...base, Date: '2026-03-01T10:00:00', Type: 'Dividend', Value: 2.25, ISIN: 'US0000000001', Shares: 1, Fees: null, Taxes: 0.75 }),
  line({ ...base, Date: '2026-03-02T10:00:00', Type: 'Interest', Value: 3.1, ISIN: null, Shares: null, Fees: null, Taxes: null }),
  line({ ...base, Date: '2026-03-03T10:00:00', Type: 'Buy', Value: -500, ISIN: 'DE0000000002', Shares: null, Fees: null, Taxes: null }),
  line({ ...base, Date: '2026-03-04T10:00:00', Type: 'Swap', Value: 0, ISIN: 'DE0000000002', Shares: 1, Fees: null, Taxes: null }),
  line({ ...base, Date: '2026-03-04T11:00:00', Type: 'Sell', Value: 0, ISIN: 'DE0000000002', Shares: 1, Fees: null, Taxes: null }),
  line({ ...base, Date: '2026-03-05T10:00:00', Type: 'Something new', Value: 1, ISIN: null, Shares: null, Fees: null, Taxes: null }),
  // German labels, as written by pytr with the system language
  line({ Datum: '2026-03-06T10:00:00', Typ: 'Kauf', Wert: -101, Notiz: 'Musterstadt', ISIN: 'US0000000001', Stück: 1, Gebühren: -1, Steuern: null }),
].join('\n')

describe('Trade Republic connector', () => {
  const parsed = parseExport(EXPORT)

  it('maps pytr types and computes gross amounts', () => {
    expect(parsed.rows).toHaveLength(6)
    const [deposit, buy, sell, dividend, interest, buyDe] = normalize('trade-republic', parsed.rows).rows
    expect(deposit).toMatchObject({ type: 'deposit', isin: null, amount: 1000 })
    expect(buy).toMatchObject({ type: 'buy', isin: 'US0000000001', quantity: 2, amount: 200, fees: 1, currency: 'EUR' })
    // Sells have a positive share count; the direction comes from the type
    expect(sell).toMatchObject({ type: 'sell', quantity: 1, amount: 120, fees: 1, taxes: 0.5 })
    expect(dividend).toMatchObject({ type: 'dividend', amount: 3, taxes: 0.75 })
    expect(interest).toMatchObject({ type: 'interest', amount: 3.1 })
    expect(buyDe).toMatchObject({ type: 'buy', date: '2026-03-06', quantity: 1, amount: 100, fees: 1 })
  })

  it('skips pending orders and unknown types without aborting', () => {
    expect(parsed.skipped.map((s) => s.reason)).toEqual(['pending order without shares', 'type not supported yet', 'corporate action without cash value', 'unknown type'])
  })

  it('never carries the note or any other column', () => {
    const out = JSON.stringify(normalize('trade-republic', parsed.rows).rows)
    expect(out).not.toContain('Mustermann')
    expect(out).not.toContain('Musterstadt')
    expect(out).not.toContain('DE00123456780000000000')
  })

  it('reads only ISIN and quantity from the holdings file', () => {
    const h = parseHoldings('Name;ISIN;quantity;price;avgCost;netValue\nDemo Corp;US0000000001;1.5;10;9;15\n')
    expect([...h]).toEqual([['US0000000001', 1.5]])
  })
})
