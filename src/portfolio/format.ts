import { LOCALE } from '../i18n'
import { dirOf } from '../lib/format'

/** Richtung für Euro-Beträge: Rundungsreste unter einem halben Cent zählen als unverändert. */
export const pfDir = (n?: number | null) => dirOf(n, 0.005)
// Übersicht: 2 Nachkommastellen reichen; Transaktionsliste zeigt die genaue Stückzahl
export const qty = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 })
export const qtyExact = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 6 })
export const share = new Intl.NumberFormat(LOCALE, { style: 'percent', maximumFractionDigits: 1 })
