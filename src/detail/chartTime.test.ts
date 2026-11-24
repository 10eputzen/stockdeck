import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { chartTimes, indexAt } from './chartTime'

const bar = (iso: string) => ({ t: Date.parse(iso) / 1000, o: 1, h: 1, l: 1, c: 1, v: 0 })

describe('chartTimes', () => {
  beforeAll(() => {
    vi.stubEnv('TZ', 'Europe/Berlin')
  })
  afterAll(() => {
    vi.unstubAllEnvs()
  })

  it('verschiebt Intraday-Kerzen auf die Zeitzone des Browsers, nicht der Börse', () => {
    // 9:30 New York = 15:30 Berlin (Winterzeit)
    const [t] = chartTimes([bar('2026-01-05T14:30:00Z')], -5 * 3600, true)
    expect(new Date(t * 1000).toISOString().slice(11, 16)).toBe('15:30')
  })

  it('berücksichtigt die Sommerzeit je Kerze', () => {
    const [w, s] = chartTimes([bar('2026-03-27T14:30:00Z'), bar('2026-03-30T13:30:00Z')], 0, true)
    expect(new Date(w * 1000).toISOString().slice(11, 16)).toBe('15:30')
    expect(new Date(s * 1000).toISOString().slice(11, 16)).toBe('15:30')
  })

  it('lässt Tageskerzen in der Börsenzeit, damit das Datum stimmt', () => {
    const [t] = chartTimes([bar('2026-01-05T04:00:00Z')], -5 * 3600, false)
    expect(new Date(t * 1000).toISOString().slice(0, 10)).toBe('2026-01-04')
  })

  it('bleibt bei der Zeitumstellung im Herbst streng aufsteigend', () => {
    const bars = ['00:30', '00:45', '01:00', '01:15'].map((h) => bar(`2026-10-25T${h}:00Z`))
    const times = chartTimes(bars, 0, true)
    for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThan(times[i - 1])
    expect(indexAt(times, times[2])).toBe(2)
    expect(indexAt(times, 5)).toBe(-1)
  })
})
