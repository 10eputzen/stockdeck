import { LOCALE, t } from '../i18n'
import type { Quote, Signals } from './supabase'

export type Signal = { text: string; tone: 'up' | 'down' | ''; title: string }

const pct0 = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0, signDisplay: 'exceptZero' })
const SHORT: Record<string, string> = {
  'Stark kaufen': t('common.signalStrongBuyShort'),
  Kaufen: t('common.signalBuy'),
  Halten: t('common.signalHold'),
  Verkaufen: t('common.signalSell'),
  'Stark verkaufen': t('common.signalStrongSellShort'),
}
const LABEL: Record<string, string> = {
  'Stark kaufen': t('common.signalStrongBuy'),
  Kaufen: t('common.signalBuy'),
  Halten: t('common.signalHold'),
  Verkaufen: t('common.signalSell'),
  'Stark verkaufen': t('common.signalStrongSell'),
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
  const label = LABEL[a.label] ?? a.label
  return {
    text: up == null ? SHORT[a.label] : `${SHORT[a.label]} ${pct0.format(up)} %`,
    tone,
    title:
      up == null
        ? t('common.signalTitle', { count: n, label })
        : t('common.signalTitleWithTarget', { count: n, label, upside: `${pct0.format(up)} %` }),
  }
}
