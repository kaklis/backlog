import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Card as CardT, Dispatch } from '../store'
import { tagHue } from '../tags'
import { CalendarIcon, ChecklistIcon, XIcon } from './Icons'

const today = () => new Date().toLocaleDateString('sv') // YYYY-MM-DD in local time

function formatDue(due: string) {
  const [y, m, d] = due.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

interface Props {
  card: CardT
  dispatch?: Dispatch
  onOpen?: (id: string) => void
  overlay?: boolean
}

export function CardView({ card, dispatch, onOpen, overlay }: Props) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: card.id,
    disabled: overlay,
  })
  const checklist = card.checklist ?? []
  const doneCount = checklist.filter((i) => i.done).length
  const hasMeta = card.priority || card.due || checklist.length > 0

  return (
    <div
      ref={setNodeRef}
      className={`card${isDragging ? ' dragging' : ''}${overlay ? ' overlay' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onClick={() => onOpen?.(card.id)}
      onKeyDown={(e) => {
        listeners?.onKeyDown?.(e)
        if (e.key === 'Enter' && e.target === e.currentTarget) onOpen?.(card.id)
      }}
    >
      {card.tags && card.tags.length > 0 && (
        <div className="card-tags">
          {card.tags.map((t) => (
            <span key={t} className="tag" style={{ '--h': tagHue(t) } as React.CSSProperties}>{t}</span>
          ))}
        </div>
      )}
      <div className="card-title">{card.title}</div>
      {card.notes && <div className="card-notes">{card.notes}</div>}
      {hasMeta && (
        <div className="card-meta">
          {card.priority && <span className={`badge ${card.priority}`}>{card.priority}</span>}
          {card.due && (
            <span className={`due${card.due < today() ? ' overdue' : ''}`}>
              <CalendarIcon />
              {formatDue(card.due)}
            </span>
          )}
          {checklist.length > 0 && (
            <span className={`progress${doneCount === checklist.length ? ' complete' : ''}`}>
              <ChecklistIcon />
              {doneCount}/{checklist.length}
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
