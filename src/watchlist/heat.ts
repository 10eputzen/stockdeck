// Heatmap der Watchlist: Farbe je Tagesveränderung und kurze Marktbreite.

/** Ab dieser Veränderung (in %) ist die Kachel voll eingefärbt. */
export const FULL_AT = 3

/** Deckkraft der Farbe 0…1 aus der Tagesveränderung in Prozent; null = ohne Kurs. */
export function heatLevel(pct: number | null | undefined): number | null {
  if (pct == null || !Number.isFinite(pct)) return null
  return Math.min(1, Math.abs(pct) / FULL_AT)
}

/** Steigende, fallende und unveränderte Werte sowie durchschnittliche Veränderung (nur mit Kurs). */
export function breadth(pcts: (number | null | undefined)[]) {
  const valid = pcts.filter((p): p is number => p != null && Number.isFinite(p))
  return {
    up: valid.filter((p) => p > 0).length,
    down: valid.filter((p) => p < 0).length,
    flat: valid.filter((p) => p === 0).length,
    avg: valid.length ? valid.reduce((s, p) => s + p, 0) / valid.length : null,
  }
}
