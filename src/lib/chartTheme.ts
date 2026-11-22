/** Hex-Farbe mit Deckkraft; der Chart versteht kein color-mix(). */
export function alpha(hex: string, a: number) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return hex
  const n = parseInt(m[1], 16)
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

/** Farben des aktuellen Themes aus den CSS-Variablen. */
export function themeColors() {
  const css = getComputedStyle(document.documentElement)
  const v = (n: string) => css.getPropertyValue(n).trim()
  return { bg: v('--surface'), text: v('--text'), muted: v('--muted'), border: v('--border'), up: v('--up'), down: v('--down'), accent: v('--accent') }
}
