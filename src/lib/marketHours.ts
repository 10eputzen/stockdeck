// Wann lohnt sich das minütliche Kurs-Update? Werktags von 3:00 bis 20:00 Uhr New Yorker Zeit:
// deckt US-Vor- und Nachbörse (4–20 Uhr) und den europäischen Handel ab 9 Uhr MEZ ab.
// Feiertage bleiben unberücksichtigt, dort wird eben häufiger als nötig gefragt.

const fmt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  weekday: 'short',
  hour: 'numeric',
  hourCycle: 'h23',
})

export function marketActive(now: Date = new Date()): boolean {
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]))
  if (parts.weekday === 'Sat' || parts.weekday === 'Sun') return false
  const hour = Number(parts.hour)
  return hour >= 3 && hour < 20
}

/** Abstand der Kurs-Updates: im Handel 30 s (Server erneuert im Hintergrund), sonst 15 min. */
export const quoteInterval = (now: Date = new Date()) => (marketActive(now) ? 30_000 : 15 * 60_000)
