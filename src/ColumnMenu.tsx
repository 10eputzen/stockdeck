import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { COLUMNS, toggleColumn, type ColumnKey, type Columns, type OrderKey } from './lib/columns'

export function ColumnMenu({ cols, onChange }: { cols: Columns; onChange: (c: Columns) => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | globalThis.KeyboardEvent) => {
      if (e instanceof globalThis.KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node))
        setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  return (
    <div className="menu" ref={box}>
      <button className="ghost" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((o) => !o)}>
        {t('common.columns')}
      </button>
      {open && (
        <div className="popover" role="group" aria-label={t('common.showColumns')}>
          <ColumnList cols={cols} onChange={onChange} />
        </div>
      )}
    </div>
  )
}

function Item({ c, cols, mobile, onToggle }: { c: (typeof COLUMNS)[number]; cols: Columns; mobile?: boolean; onToggle: () => void }) {
  const { t } = useTranslation()
  const sortable = useSortable({ id: c.key, disabled: mobile })
  const locked = (c.key === 'symbol' && !cols.name) || (c.key === 'name' && !cols.symbol)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = sortable
  return (
    <label
      ref={setNodeRef}
      className={`${locked ? 'locked' : ''} ${isDragging ? 'dragging' : ''}`}
      style={{ transform: CSS.Translate.toString(transform && { ...transform, x: 0 }), transition }}
    >
      {!mobile && (
        <button
          type="button"
          className="grip"
          aria-label={t('common.moveColumn', { label: c.label })}
          {...attributes}
          {...listeners}
          onClick={(e) => e.preventDefault()}
        >
          ⋮⋮
        </button>
      )}
      <input type="checkbox" checked={cols[c.key]} disabled={locked} onChange={onToggle} />
      <span>{c.label}</span>
      {!mobile && c.hint && <span className="muted hint">{c.hint}</span>}
    </label>
  )
}

/** Checkbox-Liste der Spalten; im Desktop-Popover per Ziehen umsortierbar, auf der Handy-Kontoseite nur ein- und ausblenden. */
export function ColumnList({ cols, onChange, mobile }: { cols: Columns; onChange: (c: Columns) => void; mobile?: boolean }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const byKey = Object.fromEntries(COLUMNS.map((c) => [c.key, c])) as Record<ColumnKey, (typeof COLUMNS)[number]>
  const ordered = cols.order.filter((k) => !mobile || k !== 'range' && k !== 'earnings')
  const extras = (['logo', 'ext'] as const).map((k) => byKey[k])
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = cols.order.indexOf(active.id as OrderKey)
    const to = cols.order.indexOf(over.id as OrderKey)
    if (from < 0 || to < 0) return
    onChange({ ...cols, order: arrayMove(cols.order, from, to) })
  }
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ordered} strategy={verticalListSortingStrategy}>
        {ordered.map((k) => (
          <Item key={k} c={byKey[k]} cols={cols} mobile={mobile} onToggle={() => onChange(toggleColumn(cols, k))} />
        ))}
      </SortableContext>
      {extras.map((c) => (
        <label key={c.key}>
          {!mobile && <span className="grip off" aria-hidden="true" />}
          <input type="checkbox" checked={cols[c.key]} onChange={() => onChange(toggleColumn(cols, c.key))} />
          <span>{c.label}</span>
          {!mobile && c.hint && <span className="muted hint">{c.hint}</span>}
        </label>
      ))}
    </DndContext>
  )
}
