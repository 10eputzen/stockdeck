import type { Quote, Signals } from './supabase'

export type Signal = { text: string; tone: 'up' | 'down' | ''; title: string }

const pct0 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0, signDisplay: 'exceptZero' })
const SHORT: Record<string, string> = {
  'Stark kaufen': 'Kaufen+',
  Kaufen: 'Kaufen',
  Halten: 'Halten',
  Verkaufen: 'Verkaufen',
  'Stark verkaufen': 'Verkaufen+',
}

/** Abstand Kurs → mittleres Kursziel in Prozent; nur bei gleicher Währung. */
export function upside(s: Signals | undefined, q: Quote | undefined): number | null {
  if (!s?.target || !q?.price) return null
  if (s.target.currency && q.currency && s.target.currency !== q.currency) return null
  return ((s.target.mean - q.price) / q.price) * 100
}

/** Badge für die Liste: Analysten-Konsens plus Kursziel-Abstand. Keine Anlageempfehlung. */
export function signalBadge(s: Signals | undefined, q: Quote | undefined): Signal | null {
  const a = s?.analysts
  if (!a?.label) return null
  const up = upside(s, q)
  const n = a.strong_buy + a.buy + a.hold + a.sell + a.strong_sell
  const tone = a.score == null ? '' : a.score < 2.5 ? 'up' : a.score >= 3.5 ? 'down' : ''
  return {
    text: up == null ? SHORT[a.label] : `${SHORT[a.label]} ${pct0.format(up)} %`,
    tone,
    title: `${n} Analysten: ${a.label}${up == null ? '' : `, Kursziel ${pct0.format(up)} %`}`,
  }
}
