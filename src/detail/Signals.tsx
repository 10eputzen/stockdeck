import { LOCALE } from '../i18n'
import { useEffect, useState } from 'react'
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
  if (s === null) return <p className="muted">Signale gerade nicht abrufbar.</p>

  const cur = s.target?.currency ?? quote?.currency ?? 'USD'
  const m = (v: number) => money(cur).format(v)
  const a = s.analysts
  const votes = a ? [a.strong_buy, a.buy, a.hold, a.sell, a.strong_sell] : []
  const total = votes.reduce((x, y) => x + y, 0)
  const up = upside(s, quote)
  const t = s.technicals
  const rsiText = t?.rsi14 == null ? null : t.rsi14 >= 70 ? 'überkauft' : t.rsi14 <= 30 ? 'überverkauft' : 'neutral'
  const ins = s.insiders

  return (
    <div className="signals" data-testid="signals">
      {a && (
        <div className="sigcard">
          <h3>
            Analysten: <span className={a.score != null && a.score < 2.5 ? 'up' : a.score != null && a.score >= 3.5 ? 'down' : ''}>{a.label}</span>
            <span className="muted"> · {total} Einschätzungen</span>
          </h3>
          <div className="votes" role="img" aria-label={`Stark kaufen ${votes[0]}, Kaufen ${votes[1]}, Halten ${votes[2]}, Verkaufen ${votes[3]}, Stark verkaufen ${votes[4]}`}>
            {votes.map((v, i) => (v > 0 ? <span key={i} className={`v${i + 1}`} style={{ width: `${(v / total) * 100}%` }} /> : null))}
          </div>
          <div className="voteleg">
            <span>Stark kaufen {votes[0]}</span>
            <span>Kaufen {votes[1]}</span>
            <span>Halten {votes[2]}</span>
            <span>Verkaufen {votes[3]}</span>
            <span>Stark verkaufen {votes[4]}</span>
          </div>
          {s.target && (
            <div className="sigrows">
              <div>
                <span>Kursziel Ø{s.target.count ? ` (${s.target.count})` : ''}</span>
                <span className="num">
                  {m(s.target.mean)}
                  {up != null && <span className={sign(up)}> ({pct1.format(up)} %)</span>}
                </span>
              </div>
              {s.target.low != null && s.target.high != null && (
                <div>
                  <span className="muted">Spanne</span>
                  <span className="num muted">
                    {m(s.target.low)} – {m(s.target.high)}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {t && (
        <div className="sigcard">
          <h3>Technik</h3>
          <div className="sigrows">
            {t.from_high_pct != null && t.high52 != null && (
              <div>
                <span>Abstand zum 52-Wochen-Hoch ({m(t.high52)})</span>
                <span className={`num ${sign(t.from_high_pct)}`}>{pct1.format(t.from_high_pct)} %</span>
              </div>
            )}
            {t.vs_sma200_pct != null && t.sma200 != null && (
              <div>
                <span>
                  {t.vs_sma200_pct >= 0 ? 'Über' : 'Unter'} 200-Tage-Schnitt ({m(t.sma200)})
                </span>
                <span className={`num ${sign(t.vs_sma200_pct)}`}>{pct1.format(t.vs_sma200_pct)} %</span>
              </div>
            )}
            {t.rsi14 != null && (
              <div>
                <span>RSI (14 Tage)</span>
                <span className={`num ${t.rsi14 >= 70 ? 'down' : t.rsi14 <= 30 ? 'up' : ''}`}>
                  {int.format(t.rsi14)} · {rsiText}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {s.earnings.length > 0 && (
        <div className="sigcard">
          <h3>Quartalszahlen: Gewinn je Aktie gegen Erwartung</h3>
          <div className="sigrows">
            {[...s.earnings].reverse().map((e) => (
              <div key={e.quarter}>
                <span>{quarterOf(e.quarter)}</span>
                <span className="num">
                  {e.actual != null && e.estimate != null ? `${eps2.format(e.actual)} statt ${eps2.format(e.estimate)} ` : ''}
                  {e.surprise_pct != null && <span className={sign(e.surprise_pct)}>({pct1.format(e.surprise_pct)} %)</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {ins && (
        <div className="sigcard">
          <h3>Insider-Handel (letzte {ins.months} Monate, Aktien an der Börse)</h3>
          {ins.buys + ins.sells === 0 ? (
            <p className="muted small">Keine Käufe oder Verkäufe gemeldet.</p>
          ) : (
            <>
              <p className="small">
                <span className="up">{ins.buys} Käufe ({compactNum(ins.buy_value)} $)</span>
                {' · '}
                <span className="down">{ins.sells} Verkäufe ({compactNum(ins.sell_value)} $)</span>
              </p>
              <div className="sigrows">
                {ins.recent.map((r, i) => (
                  <div key={i}>
                    <span className="ellipsis">
                      {fmtDate(r.date).slice(0, 6)} {r.name}
                    </span>
                    <span className={`num ${r.buy ? 'up' : 'down'}`}>
                      {r.buy ? '+' : '−'}
                      {int.format(r.shares)}{r.price != null ? ` à ${usd.format(r.price)}` : ' Stk'}
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
          <h3>Leerverkäufe{s.short.date ? ` (Stand ${fmtDate(s.short.date)})` : ''}</h3>
          <div className="sigrows">
            {s.short.pct_float != null && (
              <div>
                <span>Anteil am Streubesitz</span>
                <span className="num">{num2.format(s.short.pct_float)} %</span>
              </div>
            )}
            {s.short.days_to_cover != null && (
              <div>
                <span>Tage zum Eindecken</span>
                <span className="num">{num2.format(s.short.days_to_cover)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      <p className="muted small">
        Daten von Yahoo Finance (Analysten, Kursziel, Quartalszahlen, Leerverkäufe) und Finnhub (Insider, nur US-Werte), Technik aus den
        Tageskursen. Information, keine Anlageempfehlung.
      </p>
    </div>
  )
}
