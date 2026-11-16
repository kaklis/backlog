import { useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { Card, Column as ColumnT, Dispatch } from '../store'
import { CardView } from './Card'
import { ArchiveIcon, XIcon } from './Icons'

export function ColumnView({
  column,
  cards,
  totalCount,
  dispatch,
  onOpen,
}: {
  column: ColumnT
  cards: Card[] // the cards currently shown (after search / filters)
  totalCount: number // every card in the column, including hidden and archived ones
  dispatch: Dispatch
  onOpen: (id: string) => void
}) {
  const [draft, setDraft] = useState('')
  const { setNodeRef, isOver } = useDroppable({ id: column.id })

  const add = () => {
    const t = draft.trim()
    if (!t) return
    dispatch({ type: 'addCard', columnId: column.id, title: t })
    setDraft('')
  }

  const remove = () => {
    if (totalCount === 0 || confirm(`Delete "${column.name}" and its ${totalCount} cards (including any archived)?`)) {
      dispatch({ type: 'deleteColumn', id: column.id })
    }
  }

  return (
    <section className={`column${isOver ? ' over' : ''}`} aria-label={column.name} data-column-id={column.id}>
      <header>
        <input
          className="col-name"
          defaultValue={column.name}
          aria-label="Column name"
          onBlur={(e) => dispatch({ type: 'renameColumn', id: column.id, name: e.target.value.trim() || column.name })}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        <span className="count">{cards.length}</span>
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
