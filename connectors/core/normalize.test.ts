// All data in this file is made up.
import { describe, expect, it } from 'vitest'
import { COLUMNS, normalize, quantities, toCsv } from './normalize.ts'

const FAKE_IBAN = 'DE00123456780000000000'
const FAKE_NAME = 'Erika Mustermann'
const FAKE_PURPOSE = 'Miete Musterstrasse 1'

describe('whitelist', () => {
  const candidates = [
    {
      date: '2026-03-02T10:15:00',
      type: 'buy',
      isin: 'us0000000001',
      quantity: '2,5',
      amount: 250,
      currency: 'eur',
      fees: -1,
      taxes: 0,
      // everything below must never come out
      iban: FAKE_IBAN,
      accountHolder: FAKE_NAME,
      counterparty: FAKE_NAME,
      counterpartyIban: FAKE_IBAN,
      address: 'Musterstrasse 1, 12345 Musterstadt',
      note: `${FAKE_PURPOSE} ${FAKE_IBAN}`,
      name: FAKE_NAME,
    },
    { date: '2026-03-05', type: 'deposit', amount: 500, note: FAKE_PURPOSE, iban: FAKE_IBAN },
  ]

  it('keeps only whitelisted fields and drops IBANs, names and payment references', () => {
    const { rows, rejected } = normalize('demo-bank', candidates)
    expect(rejected).toEqual([])
    expect(rows).toHaveLength(2)
    for (const r of rows) {
      expect(Object.keys(r).sort()).toEqual(['amount', 'bank', 'currency', 'date', 'fees', 'id', 'isin', 'quantity', 'taxes', 'type'])
    }
    expect(rows[0]).toMatchObject({ date: '2026-03-02', type: 'buy', isin: 'US0000000001', quantity: 2.5, amount: 250, currency: 'EUR', fees: 1 })

    const out = JSON.stringify(rows) + toCsv(rows)
    expect(out).not.toMatch(/[A-Z]{2}\d{2}[A-Z0-9]{12,30}/) // no IBAN-shaped value
    for (const secret of [FAKE_IBAN, FAKE_NAME, FAKE_PURPOSE, 'Muster']) expect(out).not.toContain(secret)
  })

  it('writes exactly the whitelisted columns', () => {
    const csv = toCsv(normalize('demo-bank', candidates).rows)
    const [head, ...lines] = csv.trim().split('\n')
    expect(head.split(';')).toEqual([...COLUMNS])
    for (const l of lines) expect(l.split(';')).toHaveLength(COLUMNS.length)
  })

  it('rejects values that do not fit a field, without echoing them', () => {
    const { rows, rejected } = normalize('demo-bank', [
      { date: '2026-03-02', type: 'buy', isin: FAKE_IBAN, quantity: 1, amount: 10 }, // IBAN in the ISIN field
      { date: '2026-03-02', type: 'buy', isin: 'US0000000001', quantity: 1, amount: 10, currency: FAKE_NAME },
      { date: FAKE_NAME, type: 'buy', isin: 'US0000000001', quantity: 1, amount: 10 },
      { date: '2026-03-02', type: FAKE_PURPOSE },
    ])
    expect(rows).toEqual([])
    expect(rejected.map((r) => r.reason)).toEqual(['invalid ISIN', 'invalid currency', 'invalid date', 'unknown type'])
    expect(JSON.stringify(rejected)).not.toContain('Muster')
  })

  it('gives stable ids that tell identical rows apart', () => {
    const same = { date: '2026-03-02', type: 'buy', isin: 'US0000000001', quantity: 1, amount: 10 }
    const a = normalize('demo-bank', [same, same]).rows
    const b = normalize('demo-bank', [same, same]).rows
    expect(a[0].id).not.toBe(a[1].id)
    expect(b.map((r) => r.id)).toEqual(a.map((r) => r.id))
    expect(a[0].id.startsWith('demo-bank:')).toBe(true)
  })

  it('sums quantities per ISIN for the holdings check', () => {
    const { rows } = normalize('demo-bank', [
      { date: '2026-01-01', type: 'buy', isin: 'US0000000001', quantity: 3, amount: 30 },
      { date: '2026-02-01', type: 'sell', isin: 'US0000000001', quantity: 1, amount: 12 },
      { date: '2026-02-01', type: 'dividend', isin: 'US0000000001', amount: 1 },
    ])
    expect(quantities(rows).get('US0000000001')).toBe(2)
  })
})
