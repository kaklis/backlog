import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Card as CardT, Dispatch } from '../store'
import { dueStatus, formatDue } from '../dates'
import { Markdown } from '../markdown'
import { tagHue } from '../tags'
import { CalendarIcon, ChecklistIcon, RepeatIcon, XIcon } from './Icons'


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
  const hasMeta = card.priority || card.due || card.recurrence || checklist.length > 0

  return (
    <div
      ref={setNodeRef}
      data-card-id={card.id}
      className={`card${isDragging ? ' dragging' : ''}${overlay ? ' overlay' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      // a card contains a delete button, so it cannot be role=button (nested interactive); aria-pressed only applies to buttons
      role="group"
      aria-pressed={undefined}
      aria-label={card.title}
      {...listeners}
      onClick={() => onOpen?.(card.id)}
      onKeyDown={(e) => {
        // while this card is being dragged, Space/Escape belong to the active drag (drop / cancel), not a new activation
        if (!isDragging) listeners?.onKeyDown?.(e)
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
      {card.notes && <Markdown className="card-notes" text={card.notes} />}
      {hasMeta && (
        <div className="card-meta">
          {card.priority && <span className={`badge ${card.priority}`}>{card.priority}</span>}
          {card.due && (
            <span className={`due ${dueStatus(card.due)}`}>
              <CalendarIcon />
              {formatDue(card.due)}
            </span>
          )}
          {card.recurrence && (
            <span className="repeat" title={`Repeats ${card.recurrence}`}>
              <RepeatIcon />
              <span className="sr-only">Repeats {card.recurrence}</span>
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
