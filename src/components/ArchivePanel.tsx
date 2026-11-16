import { useEffect, useRef } from 'react'
import type { Card, Column, Dispatch } from '../store'
import { RestoreIcon, TrashIcon, XIcon } from './Icons'

interface Props {
  cards: Card[] // archived cards only
  columns: Column[]
  dispatch: Dispatch
  onClose: () => void
}

export function ArchivePanel({ cards, columns, dispatch, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    ref.current?.showModal()
  }, [])

  const columnName = (id: string) => columns.find((c) => c.id === id)?.name ?? ''
  const sorted = [...cards].sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0))

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-label="Archive"
      onClose={onClose}
      onMouseDown={(e) => e.target === ref.current && ref.current?.close()}
    >
      <div className="dialog-head">
        <h2 className="dialog-heading">Archive</h2>
        <span className="muted">{cards.length}</span>
        <span className="spacer" />
        <button className="icon square" aria-label="Close" onClick={() => ref.current?.close()}><XIcon /></button>
      </div>
      <div className="dialog-body">
        {sorted.length === 0 ? (
          <p className="empty">Nothing archived. Archived cards leave the board but are kept here.</p>
        ) : (
          <ul className="archive-list">
            {sorted.map((c) => (
              <li key={c.id}>
                <div className="archive-text">
                  <div className="card-title">{c.title}</div>
                  <div className="muted small">
                    {columnName(c.columnId)}
                    {c.archivedAt && ` · archived ${new Date(c.archivedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`}
                  </div>
                </div>
                <button className="ghost" onClick={() => dispatch({ type: 'unarchiveCard', id: c.id })}>
                  <RestoreIcon />Restore
                </button>
                <button
                  className="icon danger"
                  aria-label={`Delete ${c.title} permanently`}
                  title="Delete permanently"
                  onClick={() => dispatch({ type: 'deleteCard', id: c.id })}
                >
                  <TrashIcon />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </dialog>
  )
}
