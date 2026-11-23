import { AlertDialog } from './Alerts'
import { PositionTab } from './portfolio/PositionTab'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { money, moneySigned, pct } from './lib/format'
import {
  fetchEvents,
  fetchProfiles,
  fetchQuotes,
  type EarningsEvent,
  type Profile,
  type Quote,
} from './lib/supabase'
import { Logo } from './ui/Logo'
import { dirOf } from './lib/format'
import { EarningsText, MetricsView } from './detail/Metrics'
import { SignalsView } from './detail/Signals'
import { PriceChart } from './detail/Chart'
import { News } from './detail/News'
import { Notes } from './detail/Notes'

const isUs = (s: string) => /^[A-Z]{1,6}(\.[AB])?$/.test(s)

/** Detailseite eines Werts: Kopf mit Kurs, darunter Chart und News als Unterreiter. */
export function Detail({
  symbol,
  quote,
  profile,
  onList,
  onBack,
  onAdd,
}: {
  symbol: string
  quote?: Quote
  profile?: Profile
  onList: boolean
  onBack: () => void
  onAdd: () => void
}) {
  const { t } = useTranslation()
  const [ownQ, setQ] = useState<Quote>()
  const [ownP, setP] = useState<Profile>()
  const q = quote ?? ownQ
  const p = profile ?? ownP
  const [tab, setTab] = useState<'chart' | 'news' | 'kennzahlen' | 'signale' | 'position' | 'notizen'>('chart')
  const [ev, setEv] = useState<EarningsEvent | null>()
  const [alertOpen, setAlertOpen] = useState(false)

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [symbol])
  // Kurs und Logo selbst holen, wenn der Wert nicht (mehr) auf der Liste steht
  useEffect(() => {
    if (quote) return
    let live = true
    fetchQuotes([symbol]).then((r) => live && setQ(r[0]), () => {})
    return () => {
      live = false
    }
  }, [symbol, quote])
  useEffect(() => {
    if (profile) return
    let live = true
    fetchProfiles([symbol]).then((r) => live && setP(r[0]), () => {})
    return () => {
      live = false
    }
  }, [symbol, profile])
  useEffect(() => {
    if (!isUs(symbol)) return
    let live = true
    fetchEvents([symbol]).then((r) => live && setEv(r[0] ?? null), () => live && setEv(null))
    return () => {
      live = false
    }
  }, [symbol])

  const name = p?.name
  return (
    <section className="detail" aria-label={t('detail.sectionLabel', { symbol })}>
      <div className="dhead">
        <button className="ghost icon back" onClick={onBack} aria-label={t('detail.backToList')} title={t('detail.back')}>
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <Logo symbol={symbol} url={p?.logo_url} size={40} />
        <div className="mstack dname">
          <h1 className="ellipsis">{name ?? symbol}</h1>
          <span className="muted">{symbol}</span>
        </div>
        <button className="ghost icon bell" onClick={() => setAlertOpen(true)} aria-label={t('detail.alerts')} title={t('detail.alerts')}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0" />
          </svg>
        </button>
        {!onList && (
          <button className="ghost addbtn" onClick={onAdd}>
            {t('detail.addToWatchlist')}
          </button>
        )}
        {alertOpen && <AlertDialog symbol={symbol} price={q?.price ?? null} currency={q?.currency ?? null} onClose={() => setAlertOpen(false)} />}
      </div>
      <div className="dprice">
        <span className="big num">{q ? money(q.currency).format(q.price) : <span className="sk sk-text" style={{ width: 120 }} />}</span>
        {q ? (
          <span className={`pill ${dirOf(q.change)}`}>
            {moneySigned(q.currency).format(q.change)} · {pct.format(q.change_pct / 100)}
          </span>
        ) : (
          <span className="sk sk-text" style={{ width: 110 }} />
        )}
        <span className="muted small ext-line">
          {q?.ext_session && q.ext_price != null && q.ext_change_pct != null ? (
            <>
              {q.ext_session === 'pre' ? t('detail.preMarket') : t('detail.afterHours')} {money(q.currency).format(q.ext_price)}{' '}
              <span className={`extchg ${dirOf(q.ext_change_pct)}`}>({pct.format(q.ext_change_pct / 100)})</span>
            </>
          ) : (
            ' '
          )}
        </span>
        {isUs(symbol) && (
          <span className="muted earn-line" data-testid="earnings">
            {ev === undefined ? (
              <span className="sk sk-text" style={{ width: 260 }} />
            ) : ev?.next_date ? (
              <EarningsText ev={ev} />
            ) : (
              ' '
            )}
          </span>
        )}
      </div>

      <div className="subtabs" role="tablist" aria-label={t('detail.viewTabs')}>
        <button role="tab" aria-selected={tab === 'chart'} className={tab === 'chart' ? 'active' : ''} onClick={() => setTab('chart')}>
          {t('detail.tabChart')}
        </button>
        <button role="tab" aria-selected={tab === 'news'} className={tab === 'news' ? 'active' : ''} onClick={() => setTab('news')}>
          {t('detail.tabNews')}
        </button>
        <button
          role="tab"
          aria-selected={tab === 'kennzahlen'}
          className={tab === 'kennzahlen' ? 'active' : ''}
          onClick={() => setTab('kennzahlen')}
        >
          {t('detail.tabMetrics')}
        </button>
        <button role="tab" aria-selected={tab === 'signale'} className={tab === 'signale' ? 'active' : ''} onClick={() => setTab('signale')}>
          {t('detail.tabSignals')}
        </button>
        <button role="tab" aria-selected={tab === 'position'} className={tab === 'position' ? 'active' : ''} onClick={() => setTab('position')}>
          {t('detail.tabPosition')}
        </button>
        <button role="tab" aria-selected={tab === 'notizen'} className={tab === 'notizen' ? 'active' : ''} onClick={() => setTab('notizen')}>
          {t('detail.tabNotes')}
        </button>
      </div>

      {tab === 'chart' && <PriceChart key={symbol} symbol={symbol} currency={q?.currency} />}
      {tab === 'news' && <News symbol={symbol} logo={p?.logo_url} />}
      {tab === 'kennzahlen' && <MetricsView symbol={symbol} price={q?.price} />}
      {tab === 'signale' && <SignalsView symbol={symbol} quote={q} />}
      {tab === 'position' && <PositionTab symbol={symbol} quote={q} />}
      {tab === 'notizen' && <Notes key={symbol} symbol={symbol} />}
    </section>
  )
}
