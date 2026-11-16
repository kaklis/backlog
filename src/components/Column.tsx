import { useRef, useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { Card, Column as ColumnT, Dispatch } from '../store'
import { CardView } from './Card'
import { ArchiveIcon, XIcon } from './Icons'

export function ColumnView({
  column,
  cards,
  totalCount,
  activeCount,
  dispatch,
  onOpen,
}: {
  column: ColumnT
  cards: Card[] // the cards currently shown (after search / filters)
  totalCount: number // every card in the column, including hidden and archived ones
  activeCount: number // non-archived cards, whatever the filters hide: what the WIP limit measures
  dispatch: Dispatch
  onOpen: (id: string) => void
}) {
  const [draft, setDraft] = useState('')
  const [editingLimit, setEditingLimit] = useState(false)
  const cancelledLimit = useRef(false) // Escape unmounts the input; its blur must not save
  const { setNodeRef, isOver } = useDroppable({ id: column.id })

  const add = () => {
    const t = draft.trim()
    if (!t) return
    dispatch({ type: 'addCard', columnId: column.id, title: t })
    setDraft('')
  }

  const limit = column.wipLimit
  const over = limit !== undefined && activeCount > limit
  const full = limit !== undefined && activeCount === limit

  const commitLimit = (raw: string) => {
    setEditingLimit(false)
    if (cancelledLimit.current) {
      cancelledLimit.current = false
      return
    }
    const n = Math.floor(Number(raw))
    const next = raw.trim() && Number.isFinite(n) && n > 0 ? n : undefined
    dispatch({ type: 'setWipLimit', id: column.id, limit: next })
  }

  const remove = () => {
    if (totalCount === 0 || confirm(`Delete "${column.name}" and its ${totalCount} cards (including any archived)?`)) {
      dispatch({ type: 'deleteColumn', id: column.id })
    }
  }

  return (
    <section className={`column${isOver ? ' over' : ''}${over ? ' over-limit' : ''}`} aria-label={column.name} data-column-id={column.id}>
      <header>
        <input
          className="col-name"
          defaultValue={column.name}
          aria-label="Column name"
          onBlur={(e) => dispatch({ type: 'renameColumn', id: column.id, name: e.target.value.trim() || column.name })}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        {editingLimit ? (
          <input
            className="wip-input"
            type="number"
            min={1}
            autoFocus
            aria-label="WIP limit"
            placeholder="No limit"
            defaultValue={limit ?? ''}
            onFocus={(e) => e.currentTarget.select()}
            onBlur={(e) => commitLimit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') {
                cancelledLimit.current = true
                setEditingLimit(false)
              }
            }}
          />
        ) : (
          <button
            className={`count${over ? ' over' : full ? ' full' : ''}`}
            title={limit === undefined ? 'Set a WIP limit' : over ? `Over the WIP limit of ${limit}` : `WIP limit: ${limit}`}
            aria-label={limit === undefined ? `${cards.length} cards. Set WIP limit` : `${activeCount} of ${limit} cards (WIP limit)`}
            onClick={() => setEditingLimit(true)}
          >
            {limit === undefined ? cards.length : `${activeCount}/${limit}`}
          </button>
        )}
        <button
          className="icon"
          aria-label="Archive all cards in column"
          title="Archive all cards"
          disabled={cards.length === 0}
          onClick={() => dispatch({ type: 'archiveCards', ids: cards.map((c) => c.id) })}
        >
          <ArchiveIcon />
        </button>
        <button className="icon" aria-label="Delete column" title="Delete column" onClick={remove}><XIcon /></button>
      </header>
      <div ref={setNodeRef} className="cards">
        <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {cards.map((c) => (
            <CardView key={c.id} card={c} dispatch={dispatch} onOpen={onOpen} />
          ))}
        </SortableContext>
      </div>
      <input
        className="add"
        placeholder="+ Add card"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && add()}
      />
    </section>
  )
}
