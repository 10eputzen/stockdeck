import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LOCALE } from '../i18n'
import { eur } from '../lib/format'
import type { FxRates, Portfolio, Position, Profile, Transaction } from '../lib/supabase'
import { allocation, dividendsByYear, trailingDividends, type AllocBy, type Slice } from './analysis'

const BY: AllocBy[] = ['position', 'depot', 'currency']
const BY_KEY = 'stockdeck.pfAllocBy'
/** Farben der Stücke über die CSS-Variablen --c1 … --c6, „Weitere“ gedämpft. */
const color = (i: number, key: string) => (key === 'other' ? 'var(--muted)' : `var(--c${(i % 6) + 1})`)
const share = new Intl.NumberFormat(LOCALE, { style: 'percent', maximumFractionDigits: 1 })
const eur0 = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const YEARS = 6

function savedBy(): AllocBy {
  try {
    const v = localStorage.getItem(BY_KEY)
    return BY.includes(v as AllocBy) ? (v as AllocBy) : 'position'
  } catch {
    return 'position'
  }
}

/** Ring aus Kreisbögen (stroke-dasharray), beginnt oben und läuft im Uhrzeigersinn. */
function Donut({ slices, label }: { slices: Slice[]; label: string }) {
  const r = 52
  const c = 2 * Math.PI * r
  // Startpunkt jedes Bogens: Summe der Anteile davor
  const starts = slices.map((_, i) => slices.slice(0, i).reduce((a, x) => a + x.share * c, 0))
  return (
    <svg className="pf-donut" viewBox="0 0 140 140" role="img" aria-label={label}>
      <circle cx="70" cy="70" r={r} className="pf-donut-track" />
      {slices.map((s, i) => {
        const len = s.share * c
        return (
          <circle
            key={s.key}
            cx="70"
            cy="70"
            r={r}
            stroke={color(i, s.key)}
            strokeDasharray={`${Math.max(0, len - (slices.length > 1 ? 1.5 : 0))} ${c}`}
            strokeDashoffset={-starts[i]}
            transform="rotate(-90 70 70)"
          >
            <title>{`${s.label}: ${share.format(s.share)}`}</title>
          </circle>
        )
      })}
    </svg>
  )
}

/** Auswertung unter der Positionsliste: Aufteilung des Depotwerts und erhaltene Dividenden je Jahr. */
export function AnalysisCard({
  positions,
  portfolios,
  profiles,
  txs,
  fx,
  onOpen,
}: {
  positions: Position[]
  portfolios: Portfolio[]
  profiles: Record<string, Profile>
  txs: Transaction[]
  fx: FxRates
  onOpen: (symbol: string) => void
}) {
  const { t } = useTranslation()
  const [by, setBy] = useState<AllocBy>(savedBy)
  const names = useMemo(() => new Map(portfolios.map((p) => [p.id, p.name])), [portfolios])
  const slices = useMemo(
    () => allocation(positions, by, (k) => (by === 'depot' ? (names.get(k) ?? '?') : k)).map((s) => (s.key === 'other' ? { ...s, label: t('portfolio.analysis.other') } : s)),
    [positions, by, names, t],
  )
  const years = useMemo(() => dividendsByYear(txs, fx).slice(-YEARS), [txs, fx])
  // Datum einmal beim Öffnen der Seite festhalten
  const [today] = useState(() => new Date().toISOString().slice(0, 10))
  const ttm = useMemo(() => trailingDividends(txs, fx, today), [txs, fx, today])
  const max = Math.max(...years.map((y) => y.amount), 0)
  const thisYear = years.find((y) => y.year === Number(today.slice(0, 4)))?.amount ?? 0

  const pick = (b: AllocBy) => {
    setBy(b)
    try {
      localStorage.setItem(BY_KEY, b)
    } catch {
      /* ohne Speicher gilt die Wahl für diese Sitzung */
    }
  }

  if (!slices.length && !years.length) return null
  return (
    <div className="pf-analysis">
      <section className="mcard pf-alloc" aria-labelledby="pf-alloc-h">
        <div className="pf-an-head">
          <h2 id="pf-alloc-h">{t('portfolio.analysis.allocation')}</h2>
          <div className="seg small-seg" role="group" aria-label={t('portfolio.analysis.groupBy')}>
            {BY.map((b) => (
              <button key={b} className={b === by ? 'on' : ''} aria-pressed={b === by} onClick={() => pick(b)}>
                {t(`portfolio.analysis.by.${b}`)}
              </button>
            ))}
          </div>
        </div>
        {slices.length ? (
          <div className="pf-alloc-body">
            <Donut slices={slices} label={t('portfolio.analysis.allocation')} />
            <ul className="pf-legend">
              {slices.map((s, i) => {
                const name = by === 'position' && s.key !== 'other' ? profiles[s.key]?.name : null
                const body = (
                  <>
                    <span className="sw" style={{ background: color(i, s.key) }} />
                    <span className="lab">
                      {s.label}
                      {name && <span className="muted"> {name}</span>}
                    </span>
                    <span className="num">{share.format(s.share)}</span>
                    <span className="num muted">{eur0.format(s.value)}</span>
                  </>
                )
                return (
                  <li key={s.key}>
                    {by === 'position' && s.key !== 'other' ? (
                      <button className="pf-legend-row" onClick={() => onOpen(s.key)}>
                        {body}
                      </button>
                    ) : (
                      <span className="pf-legend-row">{body}</span>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        ) : (
          <p className="muted small">{t('portfolio.analysis.noValue')}</p>
        )}
      </section>

      <section className="mcard pf-divs" aria-labelledby="pf-divs-h">
        <div className="pf-an-head">
          <h2 id="pf-divs-h">{t('portfolio.analysis.dividends')}</h2>
        </div>
        {years.length ? (
          <>
            <div className="pf-div-kpis">
              <div>
                <span className="lbl">{t('portfolio.analysis.last12m')}</span>
                <span className="num big">{eur.format(ttm)}</span>
              </div>
              <div>
                <span className="lbl">{t('portfolio.analysis.thisYear')}</span>
                <span className="num">{eur.format(thisYear)}</span>
              </div>
            </div>
            <div className="pf-bars" role="list" aria-label={t('portfolio.analysis.perYear')}>
              {years.map((y) => (
                <div key={y.year} className="pf-bar" role="listitem" title={t('portfolio.analysis.payments', { count: y.count })}>
                  <span className="num tiny">{y.amount > 0 ? eur0.format(y.amount) : ''}</span>
                  <span className="pf-bar-fill" style={{ height: `${max > 0 ? Math.max(2, (y.amount / max) * 100) : 2}%` }} />
                  <span className="tiny muted">{y.year}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="muted small">{t('portfolio.analysis.noDividends')}</p>
        )}
      </section>
    </div>
  )
}
