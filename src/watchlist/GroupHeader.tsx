import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { useSortable } from '@dnd-kit/sortable'
import type { Group } from '../lib/supabase'
import { ShareIcon } from './SharedSection'

export function GroupHeader({
  group,
  count,
  editing,
  onToggle,
  onRename,
  onStartEdit,
  onDelete,
  onShare,
  sortable,
}: {
  group: Group
  count: number
  editing: boolean
  onToggle: () => void
  onRename: (name: string) => void
  onStartEdit: () => void
  onDelete: () => void
  /** Nur für den Admin: Gruppe zur geteilten Liste machen */
  onShare?: () => void
  sortable: Pick<ReturnType<typeof useSortable>, 'setActivatorNodeRef' | 'attributes' | 'listeners'>
}) {
  const { t } = useTranslation()
  const { setActivatorNodeRef, attributes, listeners } = sortable
  return (
    <div className="grouphead">
      <button
        className="ghost icon handle gh-tool"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={t('watchlist.moveGroupAria', { name: group.name })}
        title={t('watchlist.moveGroup')}
      >
        ⠿
      </button>
      <button
        className="ghost icon chevron"
        aria-expanded={!group.collapsed}
        aria-label={group.collapsed ? t('watchlist.expandGroup', { name: group.name }) : t('watchlist.collapseGroup', { name: group.name })}
        onClick={onToggle}
      >
        <span className={group.collapsed ? 'rot' : ''}>▾</span>
      </button>
      {editing ? (
        <NameEditor initial={group.name} onDone={onRename} />
      ) : (
        <button className="groupname" onClick={onToggle} onDoubleClick={onStartEdit}>
          {group.name}
        </button>
      )}
      <span className="muted small-count">{count}</span>
      <span className="grow" />
      {onShare && (
        <button className="ghost icon gh-tool" aria-label={t('watchlist.shareGroupAria', { name: group.name })} title={t('watchlist.shareGroupTitle')} onClick={onShare}>
          <ShareIcon />
        </button>
      )}
      <button className="ghost icon gh-tool" aria-label={t('watchlist.renameItemAria', { name: group.name })} title={t('watchlist.rename')} onClick={onStartEdit}>
        ✎
      </button>
      <button className="ghost icon danger gh-tool" aria-label={t('watchlist.deleteGroupAria', { name: group.name })} title={t('watchlist.deleteGroupTitle')} onClick={onDelete}>
        ×
      </button>
    </div>
  )
}

export function NameEditor({ initial, onDone }: { initial: string; onDone: (name: string) => void }) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(initial)
  const commit = () => {
    const name = draft.trim()
    onDone(name && name !== initial ? name : '')
  }
  return (
    <input
      className="groupname-input"
      value={draft}
      maxLength={60}
      aria-label={t('watchlist.groupName')}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') onDone('')
      }}
      autoFocus
    />
  )
}
