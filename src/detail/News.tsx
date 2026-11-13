import { LOCALE } from '../i18n'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  fetchNews,
  type NewsItem,
} from '../lib/supabase'
import { Logo } from '../parts'

/* ---------- News ---------- */

const rel = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' })
function ago(iso: string) {
  const s = (new Date(iso).getTime() - Date.now()) / 1000
  const a = Math.abs(s)
  if (a < 3600) return rel.format(Math.round(s / 60), 'minute')
  if (a < 86400) return rel.format(Math.round(s / 3600), 'hour')
  return rel.format(Math.round(s / 86400), 'day')
}

export function News({ symbol, logo }: { symbol: string; logo?: string | null }) {
  const { t } = useTranslation()
  const [news, setNews] = useState<NewsItem[] | null>(null)
  const [total, setTotal] = useState(0)
  const [more, setMore] = useState<'idle' | 'busy' | 'error'>('idle')
  const [error, setError] = useState(false)
  useEffect(() => {
    let live = true
    setNews(null)
    setError(false)
    fetchNews(symbol).then(
      (r) => {
        if (!live) return
        setNews(r.news)
        setTotal(r.total)
      },
      () => live && setError(true),
    )
    return () => {
      live = false
    }
  }, [symbol])

  if (error) return <p className="muted">{t('detail.newsUnavailable')}</p>
  if (!news)
    return (
      <ul className="news" aria-busy="true">
        {Array.from({ length: 5 }, (_, i) => (
          <li key={i} className="newsitem">
            <span className="thumb sk" />
            <span className="ntext">
              <span className="sk sk-text" style={{ width: '40%' }} />
              <span className="sk sk-text" style={{ width: '90%' }} />
              <span className="sk sk-text" style={{ width: '70%' }} />
            </span>
          </li>
        ))}
      </ul>
    )
  const loadMore = () => {
    setMore('busy')
    fetchNews(symbol, news.length).then(
      (r) => {
        const known = new Set(news.map((n) => n.url))
        setNews([...news, ...r.news.filter((n) => !known.has(n.url))])
        setTotal(r.total)
        setMore('idle')
      },
      () => setMore('error'),
    )
  }
  if (news.length === 0) return <p className="muted">{t('detail.newsEmpty')}</p>
  return (
    <>
    <ul className="news">
      {news.map((n) => (
        <li key={n.url}>
          <a className="newsitem" href={n.url} target="_blank" rel="noopener noreferrer">
            <NewsImage src={n.image} symbol={symbol} logo={logo} />
            <span className="ntext">
              <span className="muted tiny">
                {n.source} · {ago(n.time)}
              </span>
              <span className="nhead">{n.headline}</span>
              {n.summary && <span className="muted nsum">{n.summary}</span>}
            </span>
          </a>
        </li>
      ))}
    </ul>
    {news.length < total && (
      <button className="ghost more" onClick={loadMore} disabled={more === 'busy'}>
        {more === 'busy' ? t('detail.loading') : more === 'error' ? t('detail.retry') : t('detail.moreNews', { count: total - news.length })}
      </button>
    )}
    </>
  )
}

/** Vorschaubild der Meldung; fehlt es oder lädt es nicht, steht das Firmenlogo auf einer Kachel. */
function NewsImage({ src, symbol, logo }: { src: string | null; symbol: string; logo?: string | null }) {
  const [state, setState] = useState<'loading' | 'ok' | 'broken'>('loading')
  // Feste Kachel: Platzhalter mit Logo liegt immer darunter, das Bild blendet darüber ein
  return (
    <span className="thumb tile" aria-hidden="true">
      {state !== 'ok' && <Logo symbol={symbol} url={logo} size={40} />}
      {src && state !== 'broken' && (
        <img
          src={src}
          alt=""
          width={72}
          height={72}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className={state === 'ok' ? 'shown' : ''}
          onLoad={(e) => setState(e.currentTarget.naturalWidth > 1 ? 'ok' : 'broken')}
          onError={() => setState('broken')}
        />
      )}
    </span>
  )
}
