import { useTranslation } from 'react-i18next'
import type { Signal } from '../lib/signals'

/** Sonnenaufgang = vorbörslich, Mond = nachbörslich (statt Text, spart Platz). */
export function ExtIcon({ session }: { session: 'pre' | 'post' }) {
  const { t } = useTranslation()
  const label = session === 'pre' ? t('detail.preMarket') : t('detail.afterHours')
  return (
    <svg className="exticon" viewBox="0 0 24 24" width="12" height="12" role="img" aria-label={label}>
      <title>{label}</title>
      {session === 'pre' ? (
        <>
          <path d="M5 17a7 7 0 0 1 14 0" />
          <path d="M3 20h18M12 4v3M4.9 9.9l1.4 1.4M19.1 9.9l-1.4 1.4" />
        </>
      ) : (
        <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
      )}
    </svg>
  )
}

/** Kompaktes Analysten-Badge, z. B. „Kaufen +6 %“ (Kursziel-Abstand). */
export function SignalBadge({ signal }: { signal: Signal }) {
  return (
    <span className={`abadge ${signal.tone}`} title={signal.title}>
      {signal.text}
    </span>
  )
}
