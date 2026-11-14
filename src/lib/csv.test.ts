import { describe, expect, it } from 'vitest'
import { holdings, valuate } from '../../supabase/functions/_shared/positions.ts'
import { normalize, toCsv } from '../../connectors/core/normalize.ts'
import { importable } from '../../connectors/core/upload.ts'
import { parseCsv, parseNum } from './csv'

describe('parseNum', () => {
  it('liest deutsche und englische Schreibweise', () => {
    expect(parseNum('1.234,56')).toBe(1234.56)
    expect(parseNum('1234.56')).toBe(1234.56)
    expect(parseNum('')).toBe(0)
    expect(parseNum('-2,5 €')).toBe(-2.5)
  })
})

describe('parseCsv', () => {
  it('erkennt den Parqet-Export und überspringt Bargeld', () => {
    const csv = [
      'datetime;date;time;price;shares;amount;tax;fee;realizedgains;type;broker;assettype;identifier;wkn;originalcurrency;currency;fxrate;holding;holdingname',
      '2024-03-01T10:00:00.000Z;01.03.2024;10:00;105,20;10;1.052,00;0;1,00;0;Buy;dkb;Security;US0378331005;865985;EUR;EUR;1;h1;Apple Inc.',
      '2024-04-01T10:00:00.000Z;01.04.2024;10:00;0;0;12,34;3,10;0;0;Dividend;dkb;Security;US0378331005;865985;EUR;EUR;1;h1;Apple Inc.',
      '2024-04-02T10:00:00.000Z;02.04.2024;10:00;0;0;500,00;0;0;0;Deposit;dkb;Cash;;;EUR;EUR;1;h2;Konto',
    ].join('\n')
    const r = parseCsv(csv)
    expect(r.format).toBe('parqet')
    expect(r.rows).toHaveLength(2)
    expect(r.rows[0]).toMatchObject({ type: 'buy', date: '2024-03-01', isin: 'US0378331005', quantity: 10, price: 105.2, fees: 1 })
    expect(r.rows[1]).toMatchObject({ type: 'dividend', quantity: 0, price: 12.34, taxes: 3.1 })
    expect(r.skipped[0].reason).toContain('Bargeld')
  })

  it('liest das einfache Format und vergibt stabile IDs', () => {
    const csv = 'Datum;Typ;Symbol;Stück;Kurs;Währung;Gebühren\n15.01.2026;Kauf;SAP.DE;5;200,50;EUR;1\n15.01.2026;Kauf;SAP.DE;5;200,50;EUR;1'
    const a = parseCsv(csv)
    const b = parseCsv(csv)
    expect(a.format).toBe('einfach')
    expect(a.rows.map((r) => r.symbol)).toEqual(['SAP.DE', 'SAP.DE'])
    // Zwei gleiche Käufe am selben Tag bleiben zwei Transaktionen, ein zweiter Import erkennt beide wieder
    expect(a.rows[0].external_id).not.toBe(a.rows[1].external_id)
    expect(b.rows.map((r) => r.external_id)).toEqual(a.rows.map((r) => r.external_id))
  })
})

describe('Bank-Konnektor-Datei (erfundene Daten)', () => {
  const { rows } = normalize('demo-bank', [
    { date: '2026-01-11', type: 'buy', isin: 'US0000000001', quantity: 2, amount: 200, fees: 1 },
    { date: '2026-03-01', type: 'dividend', isin: 'US0000000001', amount: 3, taxes: 0.75 },
    { date: '2026-01-10', type: 'deposit', amount: 1000 },
  ])

  it('liest stockdeck-v1 wie der Direkt-Upload, Bargeld wird übersprungen', () => {
    const r = parseCsv(toCsv(rows))
    expect(r.format).toBe('connector')
    expect(r.rows.map(({ line: _line, symbol: _symbol, name: _name, ...tx }) => tx)).toEqual(importable(rows))
    expect(r.rows[0]).toMatchObject({ type: 'buy', quantity: 2, price: 100, fees: 1 })
    expect(r.skipped).toHaveLength(1)
    // Wiederholter Import ergibt dieselben IDs → Dubletten werden erkannt
    expect(parseCsv(toCsv(rows)).rows.map((x) => x.external_id)).toEqual(r.rows.map((x) => x.external_id))
  })
})

describe('Positionen', () => {
  const base = { portfolio_id: 'p', symbol: 'X', currency: 'EUR', fees: 0, taxes: 0 }
  it('rechnet mit Durchschnittskosten und Umbuchungen', () => {
    const hs = holdings(
      [
        { ...base, type: 'buy', date: '2026-01-01', quantity: 10, price: 100, fees: 10 },
        { ...base, type: 'buy', date: '2026-02-01', quantity: 10, price: 120 },
        { ...base, type: 'sell', date: '2026-03-01', quantity: 5, price: 150 },
        { ...base, type: 'transfer_out', date: '2026-04-01', quantity: 5, price: 0 },
        { ...base, type: 'split', date: '2026-05-01', quantity: 2, price: 0 },
      ],
      { EUR: 1 },
    )
    const h = hs[0]
    // Einstand 2210 für 20 Stück → 110,50 je Stück
    expect(h.realized).toBeCloseTo(5 * 150 - 5 * 110.5)
    expect(h.quantity).toBe(20)
    expect(h.cost).toBeCloseTo(10 * 110.5)
    const { totals } = valuate(hs, { X: { price: 60, change: 1, currency: 'EUR' } }, { EUR: 1 })
    expect(totals.value).toBe(1200)
    expect(totals.gain).toBeCloseTo(1200 - 1105)
  })

  it('rechnet Fremdwährung mit EZB-Kurs um', () => {
    const hs = holdings([{ ...base, symbol: 'AAPL', currency: 'USD', type: 'buy', date: '2026-01-01', quantity: 1, price: 110, fx_rate: 1.1 }], { USD: 1.25 })
    expect(hs[0].cost).toBeCloseTo(100)
    const { positions } = valuate(hs, { AAPL: { price: 125, change: 0, currency: 'USD' } }, { EUR: 1, USD: 1.25 })
    expect(positions[0].value).toBeCloseTo(100)
  })

  it('rechnet Pence (GBX) über den GBP-Kurs um', () => {
    const hs = holdings([{ ...base, symbol: 'VOD.L', currency: 'GBX', type: 'buy', date: '2026-01-01', quantity: 100, price: 80 }], { EUR: 1, GBP: 0.8 })
    expect(hs[0].cost).toBeCloseTo(100)
  })
})
