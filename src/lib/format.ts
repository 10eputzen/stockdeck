import { LOCALE } from '../i18n'
export const usd = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'USD' })
export const usdSigned = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: 'USD',
  signDisplay: 'exceptZero',
})
export const pct = new Intl.NumberFormat(LOCALE, {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: 'exceptZero',
})
export const time = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'short', timeStyle: 'short' })


const fmts = new Map<string, Intl.NumberFormat>()
function cached(key: string, make: () => Intl.NumberFormat) {
  let f = fmts.get(key)
  if (!f) fmts.set(key, (f = make()))
  return f
}
/** Betrag in der Währung des Kurses (US-Werte USD, Xetra EUR …). */
export const money = (cur?: string | null) =>
  cached(`m${cur}`, () => new Intl.NumberFormat(LOCALE, { style: 'currency', currency: cur || 'USD' }))
export const moneySigned = (cur?: string | null) =>
  cached(`s${cur}`, () => new Intl.NumberFormat(LOCALE, { style: 'currency', currency: cur || 'USD', signDisplay: 'exceptZero' }))
export const eur = money('EUR')
export const eurSigned = moneySigned('EUR')

/** CSS-Klasse für die Richtung einer Veränderung; Werte unter `eps` gelten als unverändert. */
export const dirOf = (n?: number | null, eps = 0) =>
  n == null || n === 0 || Math.abs(n) < eps ? '' : n > 0 ? 'up' : 'down'

const dayFmt = new Intl.DateTimeFormat(LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })
/** Kalenderdatum (YYYY-MM-DD) im Format der Sprache, ohne Zeitzonen-Verschiebung. */
export const isoDate = (iso: string) => dayFmt.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`))
