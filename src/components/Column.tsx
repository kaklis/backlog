import { useRef, useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useDismiss } from '../hooks'
import { uid, type Card, type Column as ColumnT, type Dispatch, type Template } from '../store'
import { CardView } from './Card'
import { ArchiveIcon, PencilIcon, TemplateIcon, XIcon } from './Icons'

export function ColumnView({
  column,
  cards,
  totalCount,
  activeCount,
  templates,
  dispatch,
  onOpen,
}: {
  column: ColumnT
  cards: Card[] // the cards currently shown (after search / filters)
  totalCount: number // every card in the column, including hidden and archived ones
  activeCount: number // non-archived cards, whatever the filters hide: what the WIP limit measures
  templates: Template[]
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

  const menuRef = useRef<HTMLDetailsElement>(null)
  useDismiss(menuRef)
  const fromTemplate = (t: Template) => {
    const id = uid()
    dispatch({ type: 'addCardFromTemplate', id, templateId: t.id, columnId: column.id })
    if (menuRef.current) menuRef.current.open = false
    onOpen(id) // let the user name the new card straight away
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
            <PencilIcon className="edit-hint" />
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
      <div className="add-row">
        <input
          className="add"
          placeholder="+ Add card"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        {templates.length > 0 && (
          <details className="menu templates" ref={menuRef}>
            <summary className="icon-summary" title="New card from a template" aria-label="New card from a template">
              <TemplateIcon />
            </summary>
            <div className="menu-panel template-list" role="menu">
              {templates.map((t) => (
                <div key={t.id} className="template-item">
                  <button role="menuitem" className="ghost" onClick={() => fromTemplate(t)}>
                    {t.name}
                    <span className="muted small">
                      {[t.priority, t.tags?.join(', '), t.checklist && `${t.checklist.length} items`].filter(Boolean).join(' · ')}
                    </span>
                  </button>
                  <button
                    className="icon danger"
                    aria-label={`Delete template ${t.name}`}
                    title="Delete template"
                    onClick={() => dispatch({ type: 'deleteTemplate', id: t.id })}
                  >
                    <XIcon />
                  </button>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </section>
  )
}
