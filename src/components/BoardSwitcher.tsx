import { useRef, useState } from 'react'
import { useDismiss } from '../hooks'
import type { Boards } from '../boards'
import { PencilIcon, PlusIcon, XIcon } from './Icons'

export function BoardSwitcher({ boards }: { boards: Boards }) {
  const ref = useRef<HTMLDetailsElement>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  useDismiss(ref)
  const close = () => ref.current && (ref.current.open = false)

  const create = () => {
    if (!newName.trim()) return
    boards.create(newName)
    setNewName('')
    close()
  }

  const remove = (id: string, name: string) => {
    if (confirm(`Delete the board "${name}" and all of its cards? This cannot be undone.`)) boards.remove(id)
  }

  return (
    <details className="menu switcher" ref={ref}>
      <summary className="board-title" title="Switch board">
        <h1>{boards.active.name}</h1>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <div className="menu-panel board-list" role="group" aria-label="Boards">
        <ul>
          {boards.boards.map((b) => (
            <li key={b.id} className={b.id === boards.active.id ? 'current' : ''}>
              {editingId === b.id ? (
                <input
                  autoFocus
                  aria-label="Board name"
                  defaultValue={b.name}
                  onFocus={(e) => e.currentTarget.select()}
                  onBlur={(e) => {
                    boards.rename(b.id, e.target.value)
                    setEditingId(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur()
                    if (e.key === 'Escape') {
                      e.stopPropagation()
                      e.currentTarget.value = b.name
                      setEditingId(null)
                    }
                  }}
                />
              ) : (
                <>
                  <button
                    className="ghost board-pick"
                    aria-current={b.id === boards.active.id ? 'true' : undefined}
                    onClick={() => {
                      boards.select(b.id)
                      close()
                    }}
                  >
                    {b.name}
                  </button>
                  <button className="icon" aria-label={`Rename board ${b.name}`} title="Rename" onClick={() => setEditingId(b.id)}>
                    <PencilIcon />
                  </button>
                  {boards.boards.length > 1 && (
                    <button className="icon danger" aria-label={`Delete board ${b.name}`} title="Delete board" onClick={() => remove(b.id, b.name)}>
                      <XIcon />
                    </button>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
        <div className="view-save">
          <PlusIcon />
          <input
            aria-label="New board name"
            placeholder="New board"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && create()}
          />
          <button className="primary" onClick={create} disabled={!newName.trim()}>
            Add
          </button>
        </div>
      </div>
    </details>
  )
}
