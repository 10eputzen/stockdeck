import type React from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { eur, eurSigned, money, pct } from '../lib/format'
import type { Position, Totals } from '../lib/supabase'
import { Logo } from '../ui/Logo'
import { Sk } from '../ui/Skeleton'
import { pfDir as dirOf, qty, share } from './format'

export function PfMenu({ onRename, onDelete }: { onRename: () => void; onDelete: () => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <span className="pf-menu">
      <button className="ghost icon" aria-label={t('portfolio.depotMenu')} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        ⋮
      </button>
      {open && (
        <span className="pf-pop" role="menu" onMouseLeave={() => setOpen(false)}>
          <button role="menuitem" onClick={() => (setOpen(false), onRename())}>
            {t('portfolio.rename')}
          </button>
          <button role="menuitem" className="danger-text" onClick={() => (setOpen(false), onDelete())}>
            {t('portfolio.deleteConfirm')}
          </button>
        </span>
      )}
    </span>
  )
}

export function TotalsCard({ t: tot }: { t?: Totals }) {
  const { t } = useTranslation()
  return (
    <div className="pf-totals mcard" aria-busy={!tot}>
      <div>
        <span className="lbl">{t('portfolio.totalValue')}</span>
        <span className="big num">{tot ? eur.format(tot.value) : <Sk w={140} />}</span>
      </div>
      <div>
        <span className="lbl">{t('portfolio.today')}</span>
        <span className={`num ${dirOf(tot?.day)}`}>
          {tot ? (
            <>
              {eurSigned.format(tot.day)} {tot.day_pct != null && <span className="small">({pct.format(tot.day_pct)})</span>}
            </>
          ) : (
            <Sk w={90} />
          )}
        </span>
      </div>
      <div>
        <span className="lbl">{t('portfolio.gainLoss')}</span>
        <span className={`num ${dirOf(tot?.gain)}`}>
          {tot ? (
            <>
              {eurSigned.format(tot.gain)} {tot.gain_pct != null && <span className="small">({pct.format(tot.gain_pct)})</span>}
            </>
          ) : (
            <Sk w={90} />
          )}
        </span>
      </div>
      <div>
        <span className="lbl">{t('portfolio.costBasis')}</span>
        <span className="num">{tot ? eur.format(tot.cost) : <Sk w={90} />}</span>
      </div>
    </div>
  )
}

/** Tagesänderung in Prozent vom gestrigen Wert der Position. */
const dayPct = (r: Position) => (r.day != null && r.value != null && r.value - r.day > 0 ? r.day / (r.value - r.day) : null)

export function PosHead({ mode }: { mode: Mode }) {
  const { t } = useTranslation()
  return (
    <div className="row head pf-row" aria-hidden="true">
      <span />
      <span>{t('portfolio.colSecurity')}</span>
      <span className="num">{t('portfolio.colShares')}</span>
      <span className="num">{t('portfolio.avgCost')}</span>
      <span className="num">{t('portfolio.colPrice')}</span>
      <span className="num">{t('portfolio.colValueEur')}</span>
      <span className="num">{mode === 'day' ? t('portfolio.today') : t('portfolio.colGainLossShort')}</span>
      <span className="num">{t('portfolio.colWeight')}</span>
    </div>
  )
}

export type Mode = 'day' | 'total'

/** Änderung je nach Ansicht: heute oder seit Kauf. */
const change = (r: Position, mode: Mode) =>
  mode === 'day' ? { abs: r.day, pc: dayPct(r) } : { abs: r.gain, pc: r.gain_pct }

export function PosRow({
  r,
  mode,
  narrow,
  logo,
  name,
  onOpen,
}: {
  r?: Position
  mode: Mode
  narrow: boolean
  logo?: string | null
  name?: string | null
  onOpen?: () => void
}) {
  const { t } = useTranslation()
  const label = name ?? r?.name ?? r?.symbol
  const avg = r && r.quantity > 0 ? r.cost / r.quantity : null
  const open = (e: { key?: string } | React.MouseEvent) => {
    if (!('key' in e) || !e.key || e.key === 'Enter') onOpen?.()
  }
  if (narrow)
    return (
      <div className="row m stock pf-mrow" role={r ? 'button' : undefined} tabIndex={r ? 0 : -1} onClick={open} onKeyDown={open} aria-label={label ?? undefined}>
        {r ? <Logo symbol={r.symbol} url={logo} size={36} /> : <span className="logo lg sk" />}
        <span className="mstack">
          <span className="sym ellipsis">{r ? label : <Sk w={90} />}</span>
          <span className="muted small ellipsis">{r ? t('portfolio.mobileQtyAvg', { qty: qty.format(r.quantity), avg: eur.format(avg ?? 0) }) : <Sk w="70%" />}</span>
        </span>
        <span className="mright num">
          <span className="mprice">{r ? (r.value == null ? '–' : eur.format(r.value)) : <Sk w={64} />}</span>
          {r ? (
            <span className={`pill ${dirOf(change(r, mode).abs)}`}>
              {change(r, mode).abs == null ? t('portfolio.noQuote') : `${eurSigned.format(change(r, mode).abs!)} · ${change(r, mode).pc == null ? '' : pct.format(change(r, mode).pc!)}`}
            </span>
          ) : (
            <Sk w={72} />
          )}
        </span>
      </div>
    )
  return (
    <div className="row stock pf-row" role={r ? 'button' : undefined} tabIndex={r ? 0 : -1} onClick={open} onKeyDown={open} aria-label={label ?? undefined}>
      {r ? <Logo symbol={r.symbol} url={logo} /> : <span className="logo sk" />}
      <span className="cell ellipsis">
        {r ? (
          <>
            <span className="sym">{r.symbol}</span> <span className="muted">{label !== r.symbol ? label : ''}</span>
          </>
        ) : (
          <Sk w="70%" />
        )}
      </span>
      <span className="cell num">{r ? qty.format(r.quantity) : <Sk w={40} />}</span>
      <span className="cell num">{r ? eur.format(avg ?? 0) : <Sk w={60} />}</span>
      <span className="cell num">{r ? (r.price == null ? '–' : money(r.currency).format(r.price)) : <Sk w={60} />}</span>
      <span className="cell num">{r ? (r.value == null ? '–' : eur.format(r.value)) : <Sk w={70} />}</span>
      <span className={`cell num ${dirOf(r && change(r, mode).abs)}`}>
        {r ? (
          change(r, mode).abs == null ? (
            '–'
          ) : (
            <>
              {eurSigned.format(change(r, mode).abs!)}
              <span className="small"> {change(r, mode).pc == null ? '' : pct.format(change(r, mode).pc!)}</span>
            </>
          )
        ) : (
          <Sk w={80} />
        )}
      </span>
      <span className="cell num muted">{r ? (r.share == null ? '–' : share.format(r.share)) : <Sk w={36} />}</span>
    </div>
  )
}
