import { LOCALE, t } from './i18n'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Fragment, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { type Columns, type OrderKey } from './lib/columns'
import type { Quote, WatchItem } from './lib/supabase'
import type { Signal } from './lib/signals'
import { dirOf, money, moneySigned, pct, time } from './lib/format'

/** Tagesspanne ohne Währungszeichen (steht schon beim Kurs), damit sie in die Spalte passt. */
const spanNum = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const Sk = ({ w }: { w: number | string }) => <span className="sk sk-text" style={{ width: w }} />

/** Zellen einer Zeile; dieselbe Funktion für echte Zeilen und Platzhalter, damit nichts springt. */
function Cells({
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
}: {
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
}) {
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
function MobileCells({
  cols,
  item,
  q,
  logoUrl,
  name,
  badge,
  signal,
  by,
  action,
}: {
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
}) {
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

export function SkeletonRow({ cols, style, narrow }: { cols: Columns; style: CSSProperties; narrow?: boolean }) {
  return (
    <div className={`row ${narrow ? 'm' : ''}`} style={style} aria-hidden="true">
      {narrow ? <MobileCells cols={cols} /> : <Cells cols={cols} />}
    </div>
  )
}

/** Zeile ohne Drag-Logik, für das Drag-Overlay. */
export function PlainRow({ item, cols, q, logoUrl, name, badge, signal, earn, earnTitle, narrow }: Parameters<typeof StockRow>[0]) {
  const C = narrow ? MobileCells : Cells
  return (
    <div className={`row stock lifted ${narrow ? 'm' : ''}`}>
      <C cols={cols} item={item} q={q} logoUrl={logoUrl} name={name} badge={badge} signal={signal} earn={earn} earnTitle={earnTitle} />
    </div>
  )
}

export function StockRow({
  item,
  container,
  cols,
  style,
  q,
  logoUrl,
  name,
  badge,
  signal,
  earn,
  earnTitle,
  onRemove,
  onOpen,
  narrow,
  editMode,
}: {
  item: WatchItem
  onOpen?: () => void
  container: string
  cols: Columns
  style: CSSProperties
  q?: Quote
  logoUrl?: string | null
  name?: string | null
  badge?: string | null
  signal?: Signal | null
  earn?: string | null
  earnTitle?: string
  onRemove: () => void
  narrow?: boolean
  editMode?: boolean
}) {
  const { t } = useTranslation()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    data: { type: 'item', container },
  })
  // Tastatur-Drag nur, wenn die Zeile selbst den Fokus hat (nicht der Entfernen-Knopf)
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) listeners?.onKeyDown?.(e)
  }
  return (
    <div
      ref={setNodeRef}
      className={`row stock ${narrow ? 'm' : ''} ${isDragging ? 'dragging' : ''}`}
      style={{ ...style, transform: CSS.Translate.toString(transform), transition }}
      data-testid={`row-${item.symbol}`}
      {...attributes}
      aria-roledescription={t('detail.draggableItem')}
      aria-label={`${item.symbol}${name ? `, ${name}` : ''}`}
      {...listeners}
      onKeyDown={onKeyDown}
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest('button')) onOpen?.()
      }}
    >
      {narrow ? (
        <MobileCells
          cols={cols}
          item={item}
          q={q}
          logoUrl={logoUrl}
          name={name}
          badge={badge}
          signal={signal}
          action={editMode && <RemoveButton symbol={item.symbol} onRemove={onRemove} big />}
        />
      ) : (
        <Cells
          cols={cols}
          item={item}
          q={q}
          logoUrl={logoUrl}
          name={name}
          badge={badge}
          signal={signal}
          earn={earn}
          earnTitle={earnTitle}
          action={<RemoveButton symbol={item.symbol} onRemove={onRemove} />}
        />
      )}
    </div>
  )
}

const byTitle = (name?: string | null, by?: string | null) =>
  by ? `${name ?? ''} · ${t('detail.addedByUser', { user: by })}` : (name ?? undefined)

/** Zeile ohne Ziehen, für geteilte Listen; Entfernen wie bei StockRow. */
export function StaticRow({
  item,
  cols,
  q,
  logoUrl,
  name,
  badge,
  signal,
  earn,
  earnTitle,
  by,
  onRemove,
  onOpen,
  narrow,
  editMode,
}: {
  item: { id: string; symbol: string }
  cols: Columns
  q?: Quote
  logoUrl?: string | null
  name?: string | null
  badge?: string | null
  signal?: Signal | null
  earn?: string | null
  earnTitle?: string
  by?: string | null
  onRemove: () => void
  onOpen: () => void
  narrow?: boolean
  editMode?: boolean
}) {
  const props = { cols, item, q, logoUrl, name, badge, signal, by }
  return (
    <div
      className={`row stock static ${narrow ? 'm' : ''}`}
      data-testid={`row-${item.symbol}`}
      role="button"
      tabIndex={0}
      aria-label={`${item.symbol}${name ? `, ${name}` : ''}`}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onOpen()
        }
      }}
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest('button')) onOpen()
      }}
    >
      {narrow ? (
        <MobileCells {...props} action={editMode && <RemoveButton symbol={item.symbol} onRemove={onRemove} big />} />
      ) : (
        <Cells {...props} earn={earn} earnTitle={earnTitle} action={<RemoveButton symbol={item.symbol} onRemove={onRemove} />} />
      )}
    </div>
  )
}

function RemoveButton({ symbol, onRemove, big }: { symbol: string; onRemove: () => void; big?: boolean }) {
  const { t } = useTranslation()
  return (
    <button
      className={`ghost icon ${big ? 'remove-lg' : ''}`}
      title={t('detail.removeSymbol', { symbol })}
      aria-label={t('detail.removeSymbol', { symbol })}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        onRemove()
      }}
    >
      ×
    </button>
  )
}

const LOGO_KEY = 'stockdeck:logos'
let seen: Set<string> | null = null
function loadSeen() {
  if (!seen) {
    try {
      seen = new Set(JSON.parse(localStorage.getItem(LOGO_KEY) ?? '[]') as string[])
    } catch {
      seen = new Set()
    }
  }
  return seen
}
const seenLogo = (url: string) => loadSeen().has(url)
function markLogo(url: string) {
  const s = loadSeen()
  if (s.has(url) || s.size > 500) return
  s.add(url)
  try {
    localStorage.setItem(LOGO_KEY, JSON.stringify([...s]))
  } catch {
    // ohne Speicher blendet das Logo eben jedes Mal ein
  }
}

/** Logo mit fester Größe: Der Buchstabe steht sofort da, das Bild blendet darüber ein. */
export function Logo({ symbol, url, size = 28 }: { symbol: string; url?: string | null; size?: number }) {
  // Schon einmal geladene Logos erscheinen sofort, ohne Buchstabe und Einblenden (kein Aufblitzen beim Neuladen)
  const known = !!url && seenLogo(url)
  const [state, setState] = useState<'loading' | 'ok' | 'broken'>(known ? 'ok' : 'loading')
  return (
    <span className={`logo fallback ${size > 28 ? 'lg' : ''} ${known ? 'known' : ''}`} aria-hidden="true">
      {state !== 'ok' && symbol.slice(0, 1)}
      {url && state !== 'broken' && (
        <img
          key={url}
          src={url}
          alt=""
          width={size}
          height={size}
          decoding="async"
          draggable={false}
          className={state === 'ok' ? 'shown' : ''}
          onLoad={() => {
            if (url) markLogo(url)
            setState('ok')
          }}
          onError={() => setState('broken')}
        />
      )}
    </span>
  )
}

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
