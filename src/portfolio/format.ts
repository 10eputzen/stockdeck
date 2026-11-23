import { LOCALE } from '../i18n'
import { dirOf } from '../lib/format'

/** Richtung für Euro-Beträge: Rundungsreste unter einem halben Cent zählen als unverändert. */
export const pfDir = (n?: number | null) => dirOf(n, 0.005)
// Übersicht: 2 Nachkommastellen reichen; Transaktionsliste zeigt die genaue Stückzahl
const qty2 = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 })
const qtySmall = new Intl.NumberFormat(LOCALE, { maximumSignificantDigits: 4 })
/** Unter 1 Stück (Kryptobruchteile wie 0,0123 BTC) vier gültige Ziffern statt auf 0,01 zu runden. */
export const qty = { format: (n: number) => (Math.abs(n) > 0 && Math.abs(n) < 1 ? qtySmall : qty2).format(n) }
export const qtyExact = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 8 })
export const share = new Intl.NumberFormat(LOCALE, { style: 'percent', maximumFractionDigits: 1 })
