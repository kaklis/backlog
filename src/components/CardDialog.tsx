import { useEffect, useRef, useState } from 'react'
import { uid, type Card, type ChecklistItem, type Column, type Dispatch, type Priority, type Recurrence } from '../store'
import { Markdown } from '../markdown'
import { cleanTag, tagHue } from '../tags'
import { ArchiveIcon, PlusIcon, TemplateIcon, TrashIcon, XIcon } from './Icons'

interface Props {
  card: Card
  columns: Column[]
  allTags: string[]
  dispatch: Dispatch
  onClose: () => void
}

export function CardDialog({ card, columns, allTags, dispatch, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const [title, setTitle] = useState(card.title)
  const [notes, setNotes] = useState(card.notes ?? '')
  const [priority, setPriority] = useState<Priority | ''>(card.priority ?? '')
  const [due, setDue] = useState(card.due ?? '')
  const [recurrence, setRecurrence] = useState<Recurrence | ''>(card.recurrence ?? '')
  const [preview, setPreview] = useState(false)
  const [templateName, setTemplateName] = useState<string | null>(null) // non-null while naming a template
  const [columnId, setColumnId] = useState(card.columnId)
  const [tags, setTags] = useState<string[]>(card.tags ?? [])
  const [tagDraft, setTagDraft] = useState('')
  const [items, setItems] = useState<ChecklistItem[]>(card.checklist ?? [])
  const [itemDraft, setItemDraft] = useState('')

  useEffect(() => {
    ref.current?.showModal()
  }, [])

  const addTag = (raw: string) => {
    const t = cleanTag(raw)
    if (t && !tags.some((x) => x.toLowerCase() === t.toLowerCase())) setTags([...tags, t])
    setTagDraft('')
  }

  const addItem = () => {
    const text = itemDraft.trim()
    if (!text) return
    setItems([...items, { id: uid(), text, done: false }])
    setItemDraft('')
  }

  const save = () => {
    const t = title.trim()
    if (!t) return
    // commit text still sitting in the tag / checklist inputs so it is not silently lost
    const finalTags = cleanTag(tagDraft) && !tags.includes(cleanTag(tagDraft)) ? [...tags, cleanTag(tagDraft)] : tags
    const finalItems = itemDraft.trim() ? [...items, { id: uid(), text: itemDraft.trim(), done: false }] : items
    dispatch({
      type: 'updateCard',
      id: card.id,
      patch: {
        title: t,
        notes: notes.trim() || undefined,
        priority: priority || undefined,
        due: due || undefined,
        recurrence: recurrence || undefined,
        tags: finalTags.length ? finalTags : undefined,
        checklist: finalItems.length ? finalItems : undefined,
      },
    })
    if (columnId !== card.columnId) dispatch({ type: 'moveCard', id: card.id, columnId })
    ref.current?.close()
  }

  const saveAsTemplate = () => {
    const name = (templateName ?? '').trim()
    if (!name) return
    dispatch({
      type: 'saveTemplate',
      template: {
        id: uid(),
        name,
        notes: notes.trim() || undefined,
        priority: priority || undefined,
        tags: tags.length ? tags : undefined,
        checklist: items.length ? items.map((i) => i.text) : undefined,
        recurrence: recurrence || undefined,
      },
    })
    setTemplateName(null)
  }

  const archive = () => {
    dispatch({ type: 'archiveCard', id: card.id })
    ref.current?.close()
  }

  const remove = () => {
    dispatch({ type: 'deleteCard', id: card.id })
    ref.current?.close()
  }

  const done = items.filter((i) => i.done).length
  const suggestions = allTags.filter(
    (t) => !tags.includes(t) && (!tagDraft || t.toLowerCase().includes(tagDraft.trim().toLowerCase())),
  )

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-label="Card details"
      onClose={onClose}
      onMouseDown={(e) => e.target === ref.current && ref.current?.close()} // click on the backdrop
    >
      <div className="dialog-head">
        <input
          className="dialog-title"
          value={title}
          aria-label="Title"
          placeholder="Title"
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
        />
        <button className="icon square" aria-label="Close" onClick={() => ref.current?.close()}><XIcon /></button>
      </div>

      <div className="dialog-body">
        <div className="field-label">
          <span className="notes-head">
            Notes
            <span className="seg" role="tablist" aria-label="Notes view">
              <button role="tab" aria-selected={!preview} className={!preview ? 'on' : ''} onClick={() => setPreview(false)}>Write</button>
              <button role="tab" aria-selected={preview} className={preview ? 'on' : ''} onClick={() => setPreview(true)}>Preview</button>
            </span>
          </span>
          {preview ? (
            <div className="notes-preview">
              {notes.trim() ? <Markdown text={notes} /> : <span className="muted">Nothing to preview. Markdown works: **bold**, *italic*, - lists, [links](https://…).</span>}
            </div>
          ) : (
            <textarea
              value={notes}
              rows={4}
              aria-label="Notes"
              placeholder="Add details… (Markdown supported)"
              onChange={(e) => setNotes(e.target.value)}
            />
          )}
        </div>

        <div className="grid3">
          <label className="field-label">
            Status
            <select className="field" value={columnId} onChange={(e) => setColumnId(e.target.value)}>
              {columns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="field-label">
            Priority
            <select className="field" value={priority} onChange={(e) => setPriority(e.target.value as Priority | '')}>
              <option value="">None</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
          <label className="field-label">
            Due date
            <input className="field" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </label>
          <label className="field-label">
            Repeat
            <select className="field" value={recurrence} onChange={(e) => setRecurrence(e.target.value as Recurrence | '')}>
              <option value="">Never</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
        </div>

        <div className="field-label">
          Tags
          <div className="tag-input">
            {tags.map((t) => (
              <span key={t} className="tag removable" style={{ '--h': tagHue(t) } as React.CSSProperties}>
                {t}
                <button aria-label={`Remove tag ${t}`} onClick={() => setTags(tags.filter((x) => x !== t))}><XIcon width={10} height={10} /></button>
              </span>
            ))}
            <input
              value={tagDraft}
              placeholder={tags.length ? '' : 'Add a tag, press Enter'}
              aria-label="Add tag"
              list="known-tags"
              onChange={(e) => {
                const v = e.target.value
                if (v.endsWith(',')) addTag(v.slice(0, -1))
                else setTagDraft(v)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); addTag(tagDraft) }
                if (e.key === 'Backspace' && !tagDraft && tags.length) setTags(tags.slice(0, -1))
              }}
            />
            <datalist id="known-tags">{suggestions.map((t) => <option key={t} value={t} />)}</datalist>
          </div>
        </div>

        <div className="field-label">
          <span className="checklist-head">
            Checklist
            {items.length > 0 && <span className="muted">{done}/{items.length}</span>}
          </span>
          {items.length > 0 && (
            <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={done}>
              <span style={{ width: `${(done / items.length) * 100}%` }} />
            </div>
          )}
          <ul className="checklist">
            {items.map((i) => (
              <li key={i.id} className={i.done ? 'done' : ''}>
                <input
                  type="checkbox"
                  checked={i.done}
                  aria-label={i.text}
                  onChange={() => setItems(items.map((x) => (x.id === i.id ? { ...x, done: !x.done } : x)))}
                />
                <input
                  className="item-text"
                  value={i.text}
                  aria-label="Checklist item"
                  onChange={(e) => setItems(items.map((x) => (x.id === i.id ? { ...x, text: e.target.value } : x)))}
                />
                <button className="icon" aria-label="Remove item" onClick={() => setItems(items.filter((x) => x.id !== i.id))}>
                  <XIcon />
                </button>
              </li>
            ))}
          </ul>
          <div className="add-item">
            <PlusIcon />
            <input
              value={itemDraft}
              placeholder="Add an item"
              aria-label="Add checklist item"
              onChange={(e) => setItemDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addItem() } }}
            />
          </div>
        </div>
      </div>

      {templateName !== null && (
        <div className="template-save">
          <input
            autoFocus
            aria-label="Template name"
            placeholder="Template name"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveAsTemplate()
              if (e.key === 'Escape') {
                e.stopPropagation()
                setTemplateName(null)
              }
            }}
          />
          <button className="primary" onClick={saveAsTemplate} disabled={!templateName.trim()}>Save template</button>
          <button className="ghost" onClick={() => setTemplateName(null)}>Cancel</button>
        </div>
      )}
      <div className="dialog-foot">
        <button className="ghost danger" onClick={remove}><TrashIcon />Delete</button>
        <button className="ghost" onClick={archive}><ArchiveIcon />Archive</button>
        <button className="ghost" onClick={() => setTemplateName(title.trim())}><TemplateIcon />Make template</button>
        <span className="spacer" />
        <button className="ghost" onClick={() => ref.current?.close()}>Cancel</button>
        <button className="primary" onClick={save} disabled={!title.trim()}>Save</button>
      </div>
    </dialog>
  )
}
