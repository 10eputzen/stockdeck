import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { CSSProperties, KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { Columns } from '../lib/columns'
import type { Quote, WatchItem } from '../lib/supabase'
import type { Signal } from '../lib/signals'
import { Cells, MobileCells } from './Cells'

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
