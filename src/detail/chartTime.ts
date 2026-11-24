import type { Bar } from '../lib/supabase'

/**
 * Zeitpunkte für die Chart-Achse. Der Chart rechnet in UTC, deshalb wird jede Kerze um einen
 * Versatz verschoben: Intraday um die Zeitzone des Browsers (Ortszeit des Nutzers, mit Sommerzeit),
 * Tageskerzen um die Zeitzone der Börse, damit das Handelsdatum nicht auf den Vortag rutscht.
 * Die Zeiten bleiben streng aufsteigend (Zeitumstellung im Herbst bei 24-Stunden-Märkten).
 */
export function chartTimes(bars: Bar[], exchangeOffset: number, intraday: boolean): number[] {
  let prev = -Infinity
  return bars.map((b) => {
    const off = intraday ? -new Date(b.t * 1000).getTimezoneOffset() * 60 : exchangeOffset
    const s = Math.max(b.t + off, prev + 1)
    prev = s
    return s
  })
}

/** Index der Kerze zum verschobenen Zeitpunkt `t` (binäre Suche), sonst -1. */
export function indexAt(times: number[], t: number): number {
  let lo = 0
  let hi = times.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (times[mid] === t) return mid
    if (times[mid] < t) lo = mid + 1
    else hi = mid - 1
  }
  return -1
}
