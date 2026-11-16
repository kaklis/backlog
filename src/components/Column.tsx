import { useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { Card, Column as ColumnT, Dispatch } from '../store'
import { CardView } from './Card'

export function ColumnView({ column, cards, dispatch }: { column: ColumnT; cards: Card[]; dispatch: Dispatch }) {
  const [draft, setDraft] = useState('')
  const { setNodeRef, isOver } = useDroppable({ id: column.id })

  const add = () => {
    const t = draft.trim()
    if (!t) return
    dispatch({ type: 'addCard', columnId: column.id, title: t })
    setDraft('')
  }

  const remove = () => {
    if (cards.length === 0 || confirm(`Delete "${column.name}" and its ${cards.length} cards?`)) {
      dispatch({ type: 'deleteColumn', id: column.id })
    }
  }

  return (
    <section className={`column${isOver ? ' over' : ''}`}>
      <header>
        <input
          className="col-name"
          defaultValue={column.name}
          aria-label="Column name"
          onBlur={(e) => dispatch({ type: 'renameColumn', id: column.id, name: e.target.value.trim() || column.name })}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        <span className="count">{cards.length}</span>
        <button className="icon" aria-label="Delete column" onClick={remove}>×</button>
      </header>
      <div ref={setNodeRef} className="cards">
        <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {cards.map((c) => (
            <CardView key={c.id} card={c} dispatch={dispatch} />
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
