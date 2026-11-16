import { useRef, useState } from 'react'
import { useDismiss, type SavedView } from '../hooks'
import { XIcon } from './Icons'

type Settings = Omit<SavedView, 'id' | 'name'>

interface Props {
  views: SavedView[]
  current: Settings
  isDefault: boolean // no search / filter / sort is active
  onApply: (v: SavedView) => void
  onReset: () => void
  onSave: (name: string) => void
  onRemove: (id: string) => void
}

const same = (a: Settings, b: Settings) =>
  a.query.trim() === b.query.trim() && a.priority === b.priority && a.tag === b.tag && a.due === b.due && a.sort === b.sort

export function ViewsMenu({ views, current, isDefault, onApply, onReset, onSave, onRemove }: Props) {
  const ref = useRef<HTMLDetailsElement>(null)
  const [name, setName] = useState('')
  useDismiss(ref)

  const activeView = views.find((v) => same(v, current))
  const close = () => ref.current && (ref.current.open = false)

  const save = () => {
    if (!name.trim()) return
    onSave(name)
    setName('')
  }

  return (
    <details className="menu views" ref={ref}>
      <summary className="menu-button ghost" title="Saved views">
        <span className={`dot ${activeView ? 'on' : isDefault ? 'off' : 'needs-permission'}`} />
        {activeView ? activeView.name : isDefault ? 'Views' : 'Custom view'}
      </summary>
      <div className="menu-panel" role="group" aria-label="Saved views">
        {views.length > 0 && (
          <ul className="view-list">
            {views.map((v) => (
              <li key={v.id}>
                <button
                  className={`ghost view-pick${activeView?.id === v.id ? ' on' : ''}`}
                  aria-pressed={activeView?.id === v.id}
                  onClick={() => {
                    onApply(v)
                    close()
                  }}
                >
                  {v.name}
                </button>
                <button className="icon danger" aria-label={`Delete view ${v.name}`} title="Delete view" onClick={() => onRemove(v.id)}>
                  <XIcon />
                </button>
              </li>
            ))}
          </ul>
        )}
        {views.length === 0 && <p className="muted">Set up the search, filters and sort you want, then save them here.</p>}
        <button
          className="secondary"
          disabled={isDefault}
          onClick={() => {
            onReset()
            close()
          }}
        >
          Clear all filters
        </button>
        <div className="view-save">
          <input
            aria-label="View name"
            placeholder="Name this view"
            value={name}
            disabled={isDefault}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
          />
          <button className="primary" onClick={save} disabled={isDefault || !name.trim()}>
            Save
          </button>
        </div>
      </div>
    </details>
  )
}
