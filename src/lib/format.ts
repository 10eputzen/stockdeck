export const usd = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'USD' })
export const usdSigned = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'USD',
  signDisplay: 'exceptZero',
})
export const pct = new Intl.NumberFormat('de-DE', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: 'exceptZero',
})
export const time = new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' })


const fmts = new Map<string, Intl.NumberFormat>()
function cached(key: string, make: () => Intl.NumberFormat) {
  let f = fmts.get(key)
  if (!f) fmts.set(key, (f = make()))
  return f
}
/** Betrag in der Währung des Kurses (US-Werte USD, Xetra EUR …). */
export const money = (cur?: string | null) =>
  cached(`m${cur}`, () => new Intl.NumberFormat('de-DE', { style: 'currency', currency: cur || 'USD' }))
export const moneySigned = (cur?: string | null) =>
  cached(`s${cur}`, () => new Intl.NumberFormat('de-DE', { style: 'currency', currency: cur || 'USD', signDisplay: 'exceptZero' }))
export const eur = money('EUR')
export const eurSigned = moneySigned('EUR')

/** CSS-Klasse für die Richtung einer Veränderung; Werte unter `eps` gelten als unverändert. */
export const dirOf = (n?: number | null, eps = 0) =>
  n == null || n === 0 || Math.abs(n) < eps ? '' : n > 0 ? 'up' : 'down'
