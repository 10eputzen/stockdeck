import { describe, expect, it } from 'vitest'
import type { Tx } from '../../supabase/functions/_shared/positions.ts'
import { buildHistory, closeAt, mergeCloses, neededRanges, rangeStart, slice, thin, tradingDays } from './history'

const tx = (p: Partial<Tx>): Tx => ({ portfolio_id: 'p', symbol: 'AAA', type: 'buy', date: '2026-01-02', quantity: 1, price: 10, currency: 'EUR', fees: 0, taxes: 0, ...p })
const eur = () => 'EUR'

describe('closeAt', () => {
  const c = [
    { date: '2026-01-02', close: 1 },
    { date: '2026-01-05', close: 2 },
  ]
  it('nimmt den letzten Kurs am oder vor dem Tag', () => {
    expect(closeAt(c, '2026-01-01')).toBeNull()
    expect(closeAt(c, '2026-01-02')).toBe(1)
    expect(closeAt(c, '2026-01-04')).toBe(1)
    expect(closeAt(c, '2026-02-01')).toBe(2)
  })
})

describe('buildHistory', () => {
  const closes = {
    AAA: [
      { date: '2026-01-02', close: 10 },
      { date: '2026-01-05', close: 12 },
      { date: '2026-01-06', close: 15 },
    ],
  }
  it('rechnet Wert und Einstand je Tag, auch nach Käufen und Verkäufen', () => {
    const txs = [tx({ quantity: 10 }), tx({ date: '2026-01-05', quantity: 5, price: 12 }), tx({ type: 'sell', date: '2026-01-06', quantity: 15, price: 15 })]
    const pts = buildHistory(txs, closes, { EUR: 1 }, eur, ['2026-01-02', '2026-01-05', '2026-01-06'])
    expect(pts).toEqual([
      { date: '2026-01-02', value: 100, invested: 100 },
      { date: '2026-01-05', value: 180, invested: 160 },
      { date: '2026-01-06', value: 0, invested: 0 },
    ])
  })
  it('beginnt erst mit der ersten Transaktion und nutzt am letzten Tag den Live-Kurs', () => {
    const pts = buildHistory([tx({ date: '2026-01-05', quantity: 2 })], closes, { EUR: 1 }, eur, ['2026-01-02', '2026-01-05', '2026-01-07'], { AAA: { price: 20, currency: 'EUR' } })
    expect(pts.map((p) => [p.date, p.value])).toEqual([
      ['2026-01-05', 24],
      ['2026-01-07', 40],
    ])
  })
  it('rechnet in Euro und setzt ohne Kurs den Einstand an', () => {
    const txs = [tx({ symbol: 'USD1', currency: 'USD', quantity: 2, price: 50, fx_rate: 1.25 })]
    const pts = buildHistory(txs, { USD1: [{ date: '2026-01-05', close: 60 }] }, { EUR: 1, USD: 1.2 }, () => 'USD', ['2026-01-02', '2026-01-05'])
    expect(pts[0]).toEqual({ date: '2026-01-02', value: 80, invested: 80 })
    expect(pts[1].value).toBeCloseTo(100)
  })
  it('nutzt Splits aus den Kursdaten auch nach einem Verkauf', () => {
    // 1 Stück zu 100 gekauft, am 03.01. verkauft; Split 1:10 erst am 05.01. (nicht gebucht)
    const txs = [tx({ quantity: 1, price: 100 }), tx({ type: 'sell', date: '2026-01-03', quantity: 1, price: 100 })]
    const c = { AAA: [{ date: '2026-01-02', close: 10 }] }
    const pts = buildHistory(txs, c, { EUR: 1 }, eur, ['2026-01-02', '2026-01-03'], undefined, { AAA: [{ date: '2026-01-05', factor: 10 }] })
    expect(pts[0].value).toBe(100)
  })
  it('lässt am letzten Tag Positionen ohne Live-Kurs weg, wie die Übersicht', () => {
    const txs = [tx({ quantity: 1 }), tx({ symbol: 'BBB', quantity: 1 })]
    const pts = buildHistory(txs, { AAA: [{ date: '2026-01-02', close: 10 }] }, { EUR: 1, USD: 2 }, eur, ['2026-01-02', '2026-01-03'], { AAA: { price: 20 } })
    expect(pts[1]).toEqual({ date: '2026-01-03', value: 10, invested: 10 })
  })
  it('rechnet split-bereinigte Kurse vor dem Split zurück', () => {
    // 1 Stück zu 100, am 05.01. Split 1:4; Yahoo liefert vorher bereinigt 25
    const txs = [tx({ quantity: 1, price: 100 }), tx({ type: 'split', date: '2026-01-05', quantity: 4, price: 0 }), tx({ portfolio_id: 'q', type: 'split', date: '2026-01-05', quantity: 4, price: 0 })]
    const c = { AAA: [{ date: '2026-01-02', close: 25 }, { date: '2026-01-05', close: 26 }] }
    const pts = buildHistory(txs, c, { EUR: 1 }, eur, ['2026-01-02', '2026-01-05'])
    expect(pts.map((p) => p.value)).toEqual([100, 104])
  })
})

describe('Zeiträume', () => {
  it('rangeStart kappt beim ersten Kauf', () => {
    expect(rangeStart('1mo', '2026-03-31', '2025-01-01')).toBe('2026-03-03')
    expect(rangeStart('1y', '2026-03-31', '2026-01-10')).toBe('2026-01-10')
    expect(rangeStart('max', '2026-03-31', '2020-05-05')).toBe('2020-05-05')
  })
  it('slice zieht neu investiertes Geld vom Gewinn ab', () => {
    const pts = [
      { date: '2026-01-01', value: 100, invested: 100 },
      { date: '2026-01-02', value: 110, invested: 100 },
      { date: '2026-01-03', value: 220, invested: 200 },
    ]
    const s = slice(pts, '2026-01-02')
    expect(s.points).toHaveLength(3)
    expect(s.gain).toBe(20)
    expect(s.gainPct).toBeCloseTo(20 / 200)
    expect(slice(pts, '2027-01-01')).toEqual({ points: [], gain: null, gainPct: null })
  })
  it('neededRanges lädt nur so weit zurück wie nötig', () => {
    expect(neededRanges('2026-01-01', '2026-06-01')).toEqual(['1y'])
    expect(neededRanges('2023-01-01', '2026-06-01')).toEqual(['1y', '5y'])
    expect(neededRanges('2015-01-01', '2026-06-01')).toEqual(['1y', '5y', 'max'])
  })
  it('tradingDays enthält Start und heute', () => {
    const d = tradingDays({ A: [{ date: '2026-01-02', close: 1 }, { date: '2026-01-09', close: 1 }] }, '2026-01-05', '2026-01-10')
    expect(d).toEqual(['2026-01-05', '2026-01-09', '2026-01-10'])
  })
})

describe('mergeCloses', () => {
  it('füllt mit groben Daten nur die Zeit vor den feinen auf', () => {
    const day = (s: string) => Date.parse(`${s}T00:00:00Z`) / 1000
    const fine = { gmtoffset: 0, bars: [{ t: day('2026-01-05'), c: 3 }, { t: day('2026-01-06'), c: 4 }] }
    const coarse = { gmtoffset: 0, bars: [{ t: day('2025-12-01'), c: 1 }, { t: day('2026-01-05'), c: 99 }] }
    expect(mergeCloses([fine, coarse])).toEqual([
      { date: '2026-01-04', close: 1 },
      { date: '2026-01-05', close: 3 },
      { date: '2026-01-06', close: 4 },
    ])
  })
})

describe('thin', () => {
  const days = (n: number, from = '2024-01-01') =>
    Array.from({ length: n }, (_, i) => ({ date: new Date(Date.parse(`${from}T00:00:00Z`) + i * 864e5).toISOString().slice(0, 10), value: i, invested: 0 }))
  it('lässt kurze Zeiträume unverändert', () => {
    expect(thin(days(300))).toHaveLength(300)
  })
  it('dünnt lange Zeiträume auf Wochen bzw. Monate aus und behält Anfang und Ende', () => {
    const w = thin(days(800))
    expect(w.length).toBeGreaterThan(110)
    expect(w.length).toBeLessThan(120)
    expect(w[0].value).toBe(0)
    expect(w[w.length - 1].value).toBe(799)
    const m = thin(days(2200))
    expect(m.length).toBeGreaterThan(70)
    expect(m.length).toBeLessThan(76)
  })
})
