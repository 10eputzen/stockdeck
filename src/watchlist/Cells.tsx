import { Fragment, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { LOCALE, t } from '../i18n'
import { type Columns, type OrderKey } from '../lib/columns'
import type { Quote } from '../lib/supabase'
import type { Signal } from '../lib/signals'
import { dirOf, money, moneySigned, pct, time } from '../lib/format'
import { ExtIcon, SignalBadge } from '../ui/Badges'
import { Logo } from '../ui/Logo'
import { Sk } from '../ui/Skeleton'

/** Tagesspanne ohne Währungszeichen (steht schon beim Kurs), damit sie in die Spalte passt. */
const spanNum = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const byTitle = (name?: string | null, by?: string | null) =>
  by ? `${name ?? ''} · ${t('detail.addedByUser', { user: by })}` : (name ?? undefined)

export type CellProps = {
  cols: Columns
  item?: { symbol: string }
  q?: Quote
  logoUrl?: string | null
  name?: string | null
  /** Hinweis auf anstehende Quartalszahlen */
  badge?: string | null
  /** Analysten-Konsens mit Kursziel-Abstand */
  signal?: Signal | null
  /** Nächster Zahlentermin (Spalte) */
  earn?: string | null
  earnTitle?: string
  /** Wer den Wert in eine geteilte Liste gelegt hat */
  by?: string | null
  action?: ReactNode
}

/** Zellen einer Zeile; dieselbe Funktion für echte Zeilen und Platzhalter, damit nichts springt. */
export function Cells({
  cols,
  item,
  q,
  logoUrl,
  name,
  badge,
  signal,
  earn,
  earnTitle,
  by,
  action,
}: CellProps) {
  const { t } = useTranslation()
  const sym = item?.symbol
  const cell: Record<OrderKey, ReactNode> = {
    symbol: cols.symbol && <span className="cell sym">{sym ?? <Sk w={44} />}</span>,
    name: cols.name && (
      <span className={`cell muted ellipsis ${cols.symbol ? 'hide-sm' : ''}`} title={byTitle(name, by)}>
        {badge && !cols.earnings && <span className="ebadge">{badge}</span>}
        {item ? name : <Sk w="60%" />}
        {by && <span className="by"> · {t('detail.byUser', { user: by })}</span>}
      </span>
    ),
    price: cols.price && (
      <span className="cell num" data-testid="price">
        {q ? money(q.currency).format(q.price) : <Sk w={72} />}
        {cols.ext && q?.ext_session && q.ext_price != null && (
          <span
            className={`ext ${dirOf(q.ext_change_pct)}`}
            data-testid="ext"
            title={q.ext_time ? time.format(new Date(q.ext_time)) : undefined}
          >
            <ExtIcon session={q.ext_session} />{money(q.currency).format(q.ext_price)}
            {q.ext_change_pct != null && ` ${pct.format(q.ext_change_pct / 100)}`}
          </span>
        )}
      </span>
    ),
    chg_abs: cols.chg_abs && (
      <span className={`cell num hide-sm ${dirOf(q?.change)}`}>
        {q ? moneySigned(q.currency).format(q.change) : <Sk w={56} />}
      </span>
    ),
    chg_pct: cols.chg_pct && (
      <span className={`cell num ${dirOf(q?.change)}`}>{q ? pct.format(q.change_pct / 100) : <Sk w={52} />}</span>
    ),
    range: cols.range && (
      <span className="cell num muted hide-sm ellipsis" title={q ? `${spanNum.format(q.day_low)} – ${spanNum.format(q.day_high)}` : undefined}>
        {q ? `${spanNum.format(q.day_low)} – ${spanNum.format(q.day_high)}` : <Sk w={120} />}
      </span>
    ),
    analyst: cols.analyst && (
      <span className="cell hide-sm">{item ? signal ? <SignalBadge signal={signal} /> : <span className="muted">–</span> : <Sk w={80} />}</span>
    ),
    earnings: cols.earnings && (
      <span className={`cell hide-sm ${badge ? 'soon' : 'muted'}`} title={earnTitle}>
        {item ? (earn ?? '–') : <Sk w={64} />}
      </span>
    ),
  }
  return (
    <>
      {cols.logo && (sym ? <Logo symbol={sym} url={logoUrl} /> : <span className="logo sk" />)}
      {!cols.name && !cols.symbol && <span />}
      {cols.order.map((k) => (
        <Fragment key={k}>{cell[k]}</Fragment>
      ))}
      <span className="cell num">{action}</span>
    </>
  )
}

/** Handy-Zeile wie in Broker-Apps: links Logo, Kürzel und Name, rechts Kurs und Tagesänderung als Pille. */
export function MobileCells({
  cols,
  item,
  q,
  logoUrl,
  name,
  badge,
  signal,
  by,
  action,
}: CellProps) {
  const { t } = useTranslation()
  const sym = item?.symbol
  const showPill = cols.chg_pct || cols.chg_abs
  return (
    <>
      {cols.logo && (sym ? <Logo symbol={sym} url={logoUrl} size={36} /> : <span className="logo lg sk" />)}
      <span className="mstack">
        <span className="symline">
          <span className="sym ellipsis">{sym ?? <Sk w={48} />}</span>
          {signal && <SignalBadge signal={signal} />}
          {badge && <span className="ebadge">{badge}</span>}
        </span>
        <span className="muted small ellipsis" title={byTitle(name, by)}>
          {item ? name : <Sk w="70%" />}
          {by && <span className="by"> · {t('detail.byUser', { user: by })}</span>}
        </span>
      </span>
      <span className="mright num">
        {cols.price && <span className="mprice">{q ? money(q.currency).format(q.price) : <Sk w={64} />}</span>}
        {showPill &&
          (q ? (
            <span className={`pill ${dirOf(q.change)}`}>
              {cols.chg_abs && moneySigned(q.currency).format(q.change)}
              {cols.chg_abs && cols.chg_pct && ' · '}
              {cols.chg_pct && pct.format(q.change_pct / 100)}
            </span>
          ) : (
            <Sk w={72} />
          ))}
        {cols.ext && q?.ext_session && q.ext_price != null && (
          <span className={`ext ${dirOf(q.ext_change_pct)}`}>
            <ExtIcon session={q.ext_session} />{money(q.currency).format(q.ext_price)}
          </span>
        )}
      </span>
      {action}
    </>
  )
}
