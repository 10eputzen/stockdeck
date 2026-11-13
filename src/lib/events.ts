import { LOCALE, t } from '../i18n'
import type { EarningsEvent } from './supabase'

/** Tage bis zum Termin (Kalendertage, lokale Zeit); negativ = vorbei. */
export function daysUntil(isoDate: string, now = new Date()): number {
  const [y, m, d] = isoDate.split('-').map(Number)
  const target = new Date(y, m - 1, d).getTime()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  return Math.round((target - today) / 86400000)
}

const short = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'numeric' })
const long = new Intl.DateTimeFormat(LOCALE, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })
const toDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

const colDate = new Intl.DateTimeFormat(LOCALE, { weekday: 'short', day: '2-digit', month: '2-digit' })

export const HOUR_LABEL: Record<string, string> = {
  bmo: t('common.earningsBmo'),
  amc: t('common.earningsAmc'),
  dmh: t('common.earningsDmh'),
}

/** Kurztext für die Listenzeile, nur wenn die Zahlen in höchstens 14 Tagen kommen. */
export function earningsBadge(ev: EarningsEvent | undefined, now = new Date()): string | null {
  if (!ev?.next_date) return null
  const days = daysUntil(ev.next_date, now)
  if (days < 0 || days > 14) return null
  if (days === 0) return t('common.earningsToday')
  if (days === 1) return t('common.earningsTomorrow')
  return t('common.earningsOnDate', { date: short.format(toDate(ev.next_date)) })
}

/** Nächster Termin für die Spalte, z. B. „Di. 17.11.“; vergangene Termine zählen nicht. */
export function earningsShort(ev: EarningsEvent | undefined, now = new Date()): string | null {
  if (!ev?.next_date || daysUntil(ev.next_date, now) < 0) return null
  return colDate.format(toDate(ev.next_date)).replace(',', '')
}

/** Langtext für die Detailseite, z. B. „Di., 17. November 2026, nach Börsenschluss“. */
export function earningsLong(ev: EarningsEvent): string {
  const when = long.format(toDate(ev.next_date!))
  return ev.hour ? `${when}, ${HOUR_LABEL[ev.hour]}` : when
}

const compact = new Intl.NumberFormat(LOCALE, { notation: 'compact', maximumFractionDigits: 1 })

/** Große Beträge kurz: 111,4 Mrd. */
export const compactNum = (n: number) => compact.format(n)
