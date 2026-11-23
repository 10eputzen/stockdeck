import { describe, expect, it } from 'vitest'
import { marketActive, quoteInterval } from './marketHours'

describe('marketActive', () => {
  it('ist werktags während US-Vor-, Haupt- und Nachbörse aktiv', () => {
    expect(marketActive(new Date('2026-11-16T09:00:00Z'))).toBe(true) // Mo 4:00 ET
    expect(marketActive(new Date('2026-11-16T15:00:00Z'))).toBe(true) // Mo 10:00 ET
    expect(marketActive(new Date('2026-11-17T00:30:00Z'))).toBe(true) // Mo 19:30 ET
  })
  it('deckt den europäischen Handel ab 9 Uhr MEZ ab', () => {
    expect(marketActive(new Date('2026-11-16T08:00:00Z'))).toBe(true) // 9:00 MEZ = 3:00 ET
  })
  it('ist nachts und am Wochenende inaktiv', () => {
    expect(marketActive(new Date('2026-11-17T02:00:00Z'))).toBe(false) // Mo 21:00 ET
    expect(marketActive(new Date('2026-11-16T07:00:00Z'))).toBe(false) // Mo 2:00 ET
    expect(marketActive(new Date('2026-11-14T15:00:00Z'))).toBe(false) // Sa
    expect(marketActive(new Date('2026-11-15T15:00:00Z'))).toBe(false) // So
  })
  it('passt das Intervall an', () => {
    expect(quoteInterval(new Date('2026-11-16T15:00:00Z'))).toBe(30_000)
    expect(quoteInterval(new Date('2026-11-14T15:00:00Z'))).toBe(900_000)
  })
  it('fragt mit Kryptowerten auch am Wochenende jede Minute', () => {
    expect(quoteInterval(new Date('2026-11-14T15:00:00Z'), true)).toBe(60_000)
    expect(quoteInterval(new Date('2026-11-16T15:00:00Z'), true)).toBe(30_000)
  })
})
