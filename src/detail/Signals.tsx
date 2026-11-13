import { LOCALE } from '../i18n'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { compactNum } from '../lib/events'
import { money, usd } from '../lib/format'
import {
  fetchSignals,
  type Quote,
  type Signals,
} from '../lib/supabase'
import { upside } from '../lib/signals'
import { num2 } from './shared'

/* ---------- Signale ---------- */

const pct1 = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1, signDisplay: 'exceptZero' })
const int = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 })
const eps2 = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const shortDate = new Intl.DateTimeFormat(LOCALE, { day: '2-digit', month: '2-digit', year: '2-digit' })
const fmtDate = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? shortDate.format(new Date(`${d}T12:00:00`)) : d)
const quarterOf = (d: string) => {
  const m = /^(\d{4})-(\d{2})/.exec(d)
  return m ? `Q${Math.ceil(Number(m[2]) / 3)} ${m[1]}` : d
}
const sign = (v: number | null | undefined) => (v == null ? '' : v > 0 ? 'up' : v < 0 ? 'down' : '')

export function SignalsView({ symbol, quote }: { symbol: string; quote?: Quote }) {
  const { t } = useTranslation()
  const [s, setS] = useState<Signals | null>()
  useEffect(() => {
    let live = true
    fetchSignals([symbol]).then(
      (r) => live && setS(r[0] ?? null),
      () => live && setS(null),
    )
    return () => {
      live = false
    }
  }, [symbol])

  if (s === undefined)
    return (
      <div className="signals" aria-busy="true">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="sigcard sk" style={{ height: 96 }} />
        ))}
      </div>
    )
  if (s === null) return <p className="muted">{t('detail.signalsUnavailable')}</p>

  const cur = s.target?.currency ?? quote?.currency ?? 'USD'
  const m = (v: number) => money(cur).format(v)
  const a = s.analysts
  const votes = a ? [a.strong_buy, a.buy, a.hold, a.sell, a.strong_sell] : []
  const total = votes.reduce((x, y) => x + y, 0)
  const up = upside(s, quote)
  const tech = s.technicals
  const rsiText =
    tech?.rsi14 == null ? null : tech.rsi14 >= 70 ? t('detail.rsiOverbought') : tech.rsi14 <= 30 ? t('detail.rsiOversold') : t('detail.rsiNeutral')
  const ins = s.insiders
  const analystLabel = (label: string | null) => {
    switch (label) {
      case 'Stark kaufen':
        return t('detail.strongBuy')
      case 'Kaufen':
        return t('detail.buy')
      case 'Halten':
        return t('detail.hold')
      case 'Verkaufen':
        return t('detail.sell')
      case 'Stark verkaufen':
        return t('detail.strongSell')
      default:
        return label
    }
  }

  return (
    <div className="signals" data-testid="signals">
      {a && (
        <div className="sigcard">
          <h3>
            {t('detail.analysts')}:{' '}
            <span className={a.score != null && a.score < 2.5 ? 'up' : a.score != null && a.score >= 3.5 ? 'down' : ''}>{analystLabel(a.label)}</span>
            <span className="muted"> · {t('detail.analystRatings', { count: total })}</span>
          </h3>
          <div
            className="votes"
            role="img"
            aria-label={`${t('detail.strongBuy')} ${votes[0]}, ${t('detail.buy')} ${votes[1]}, ${t('detail.hold')} ${votes[2]}, ${t('detail.sell')} ${votes[3]}, ${t('detail.strongSell')} ${votes[4]}`}
          >
            {votes.map((v, i) => (v > 0 ? <span key={i} className={`v${i + 1}`} style={{ width: `${(v / total) * 100}%` }} /> : null))}
          </div>
          <div className="voteleg">
            <span>{t('detail.strongBuy')} {votes[0]}</span>
            <span>{t('detail.buy')} {votes[1]}</span>
            <span>{t('detail.hold')} {votes[2]}</span>
            <span>{t('detail.sell')} {votes[3]}</span>
            <span>{t('detail.strongSell')} {votes[4]}</span>
          </div>
          {s.target && (
            <div className="sigrows">
              <div>
                <span>{t('detail.priceTargetAvg')}{s.target.count ? ` (${s.target.count})` : ''}</span>
                <span className="num">
                  {m(s.target.mean)}
                  {up != null && <span className={sign(up)}> ({pct1.format(up)} %)</span>}
                </span>
              </div>
              {s.target.low != null && s.target.high != null && (
                <div>
                  <span className="muted">{t('detail.range')}</span>
                  <span className="num muted">
                    {m(s.target.low)} – {m(s.target.high)}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tech && (
        <div className="sigcard">
          <h3>{t('detail.technicals')}</h3>
          <div className="sigrows">
            {tech.from_high_pct != null && tech.high52 != null && (
              <div>
                <span>{t('detail.distanceFrom52wHigh', { high: m(tech.high52) })}</span>
                <span className={`num ${sign(tech.from_high_pct)}`}>{pct1.format(tech.from_high_pct)} %</span>
              </div>
            )}
            {tech.vs_sma200_pct != null && tech.sma200 != null && (
              <div>
                <span>
                  {tech.vs_sma200_pct >= 0
                    ? t('detail.aboveSma200', { sma: m(tech.sma200) })
                    : t('detail.belowSma200', { sma: m(tech.sma200) })}
                </span>
                <span className={`num ${sign(tech.vs_sma200_pct)}`}>{pct1.format(tech.vs_sma200_pct)} %</span>
              </div>
            )}
            {tech.rsi14 != null && (
              <div>
                <span>{t('detail.rsi14')}</span>
                <span className={`num ${tech.rsi14 >= 70 ? 'down' : tech.rsi14 <= 30 ? 'up' : ''}`}>
                  {int.format(tech.rsi14)} · {rsiText}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {s.earnings.length > 0 && (
        <div className="sigcard">
          <h3>{t('detail.earningsEpsVsEstimate')}</h3>
          <div className="sigrows">
            {[...s.earnings].reverse().map((e) => (
              <div key={e.quarter}>
                <span>{quarterOf(e.quarter)}</span>
                <span className="num">
                  {e.actual != null && e.estimate != null
                    ? `${t('detail.actualVsEstimate', { actual: eps2.format(e.actual), estimate: eps2.format(e.estimate) })} `
                    : ''}
                  {e.surprise_pct != null && <span className={sign(e.surprise_pct)}>({pct1.format(e.surprise_pct)} %)</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {ins && (
        <div className="sigcard">
          <h3>{t('detail.insiderTradingTitle', { months: ins.months })}</h3>
          {ins.buys + ins.sells === 0 ? (
            <p className="muted small">{t('detail.noInsiderTrades')}</p>
          ) : (
            <>
              <p className="small">
                <span className="up">{t('detail.insiderBuys', { count: ins.buys, value: compactNum(ins.buy_value) })}</span>
                {' · '}
                <span className="down">{t('detail.insiderSells', { count: ins.sells, value: compactNum(ins.sell_value) })}</span>
              </p>
              <div className="sigrows">
                {ins.recent.map((r, i) => (
                  <div key={i}>
                    <span className="ellipsis">
                      {fmtDate(r.date).slice(0, 6)} {r.name}
                    </span>
                    <span className={`num ${r.buy ? 'up' : 'down'}`}>
                      {r.buy ? '+' : '−'}
                      {int.format(r.shares)}{r.price != null ? ` ${t('detail.atPrice', { price: usd.format(r.price) })}` : ` ${t('detail.sharesUnit')}`}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {s.short && (s.short.pct_float != null || s.short.days_to_cover != null) && (
        <div className="sigcard">
          <h3>{s.short.date ? t('detail.shortInterestAsOf', { date: fmtDate(s.short.date) }) : t('detail.shortInterest')}</h3>
          <div className="sigrows">
            {s.short.pct_float != null && (
              <div>
                <span>{t('detail.shortPctFloat')}</span>
                <span className="num">{num2.format(s.short.pct_float)} %</span>
              </div>
            )}
            {s.short.days_to_cover != null && (
              <div>
                <span>{t('detail.daysToCover')}</span>
                <span className="num">{num2.format(s.short.days_to_cover)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      <p className="muted small">
        {t('detail.signalsFootnote')}
      </p>
    </div>
  )
}
