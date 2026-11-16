import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Card as CardT, Dispatch, Priority } from '../store'
import { CalendarIcon, XIcon } from './Icons'

const today = () => new Date().toLocaleDateString('sv') // YYYY-MM-DD in local time

function formatDue(due: string) {
  const [y, m, d] = due.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function CardView({ card, dispatch, overlay }: { card: CardT; dispatch?: Dispatch; overlay?: boolean }) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(card.title)
  const [notes, setNotes] = useState(card.notes ?? '')
  const [priority, setPriority] = useState<Priority | ''>(card.priority ?? '')
  const [due, setDue] = useState(card.due ?? '')
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: card.id,
    disabled: overlay || editing,
  })

  const save = () => {
    const t = title.trim()
    if (t && dispatch) {
      dispatch({
        type: 'updateCard',
        id: card.id,
        title: t,
        notes: notes.trim() || undefined,
        priority: priority || undefined,
        due: due || undefined,
      })
    } else setTitle(card.title)
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="card editing">
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
            if (e.key === 'Escape') setEditing(false)
          }}
        />
        <textarea placeholder="Notes" value={notes} rows={3} onChange={(e) => setNotes(e.target.value)} />
        <div className="row">
          <select className="field" value={priority} aria-label="Priority" onChange={(e) => setPriority(e.target.value as Priority | '')}>
            <option value="">No priority</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
          <input className="field" type="date" value={due} aria-label="Due date" onChange={(e) => setDue(e.target.value)} />
        </div>
        <div className="row">
          <button className="ghost" onClick={() => setEditing(false)}>Cancel</button>
          <button className="primary" onClick={save}>Save</button>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={setNodeRef}
      className={`card${isDragging ? ' dragging' : ''}${overlay ? ' overlay' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onClick={() => !overlay && setEditing(true)}
    >
      <div className="card-title">{card.title}</div>
      {card.notes && <div className="card-notes">{card.notes}</div>}
      {(card.priority || card.due) && (
        <div className="card-meta">
          {card.priority && <span className={`badge ${card.priority}`}>{card.priority}</span>}
          {card.due && (
            <span className={`due${card.due < today() ? ' overdue' : ''}`}>
              <CalendarIcon />
              {formatDue(card.due)}
            </span>
          )}
        </div>
      )}
      {dispatch && (
        <button
          className="icon delete"
          aria-label="Delete card"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            dispatch({ type: 'deleteCard', id: card.id })
          }}
        >
          <XIcon />
        </button>
      )}
    </div>
  )
}
