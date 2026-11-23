// Befehlspalette: Treffer-Bewertung ohne Netz (Werte der Watchlist, Bereiche, Aktionen).

export type Entry = { id: string; label: string; detail?: string; keywords?: string }

/**
 * Wie gut passt `q` zu einem Eintrag? 0 = gar nicht. Kürzel/Label am Anfang schlägt Wortanfang,
 * Wortanfang schlägt Teilstring; alle Wörter der Suche müssen vorkommen.
 */
export function score(e: Entry, q: string): number {
  const query = q.trim().toLowerCase()
  if (!query) return 1
  const label = e.label.toLowerCase()
  const hay = `${label} ${(e.detail ?? '').toLowerCase()} ${(e.keywords ?? '').toLowerCase()}`
  if (label === query) return 100
  let total = 0
  for (const w of query.split(/\s+/)) {
    if (label.startsWith(w)) total += 30
    else if (new RegExp(`(^|[\\s.\\-/(])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(hay)) total += 15
    else if (hay.includes(w)) total += 5
    else return 0
  }
  return total
}

/** Einträge nach Treffer sortiert (stabil bei Gleichstand), höchstens `limit`. */
export function rank<T extends Entry>(entries: T[], q: string, limit = 8): T[] {
  return entries
    .map((e, i) => ({ e, i, s: score(e, q) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.e)
}

/** Strg+K / Cmd+K öffnet überall; „/“ nur, wenn gerade kein Eingabefeld den Fokus hat. */
export function isPaletteKey(e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey'>, target: EventTarget | null): boolean {
  if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') return true
  if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return false
  const el = target as HTMLElement | null
  const tag = el?.tagName
  return !(tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable)
}
