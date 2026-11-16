import { useEffect, useRef, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core'
import { parseBoard, useBoard, type Action, type Card, type Dispatch, type Priority } from './store'
import { usePersisted, useTheme } from './hooks'
import { ColumnView } from './components/Column'
import {
  ArchiveIcon, BoardIcon, DownloadIcon, KeyboardIcon, MoonIcon, PlusIcon, SearchIcon, SunIcon, UploadIcon,
} from './components/Icons'
import { CardView } from './components/Card'
import { CardDialog } from './components/CardDialog'
import { ArchivePanel } from './components/ArchivePanel'
import { ShortcutsHelp } from './components/ShortcutsHelp'
import { BackupMenu } from './components/BackupMenu'
import { backupSupported, useFileBackup } from './backup'

type Filter = Priority | 'none' | 'all'
type Sort = 'manual' | 'priority' | 'due'

const RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 }
// cards without a value sort last
const byPriority = (a: Card, b: Card) => (a.priority ? RANK[a.priority] : 3) - (b.priority ? RANK[b.priority] : 3)
const byDue = (a: Card, b: Card) => (a.due ?? '9999').localeCompare(b.due ?? '9999')

const FILTERS: Filter[] = ['all', 'high', 'medium', 'low', 'none']
const SORTS: Sort[] = ['manual', 'priority', 'due']
const KEY_PRIORITY: Record<string, Priority | undefined> = { '1': 'high', '2': 'medium', '3': 'low', '0': undefined }

// what the undo toast says after an undoable change
function toastMessage(a: Action): string | null {
  switch (a.type) {
    case 'deleteCard': return 'Card deleted'
    case 'archiveCard': return 'Card archived'
    case 'archiveCards': return a.ids.length ? `${a.ids.length} card${a.ids.length === 1 ? '' : 's'} archived` : null
    case 'deleteColumn': return 'Column deleted'
    case 'replace': return 'Board replaced'
    default: return null
  }
}

export default function App() {
  const { state, dispatch: rawDispatch, undo, redo, beginDrag, endDrag } = useBoard()
  const [theme, toggleTheme] = useTheme()
  const backup = useFileBackup(state, rawDispatch)
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null)
  const toastTimer = useRef<number>()

  const dispatch: Dispatch = (action) => {
    rawDispatch(action)
    const message = toastMessage(action)
    if (message) {
      setToast({ id: Date.now(), message })
      window.clearTimeout(toastTimer.current)
      toastTimer.current = window.setTimeout(() => setToast(null), 6000)
    }
  }
  const undoFromToast = () => {
    undo()
    setToast(null)
  }

  const [activeId, setActiveId] = useState<string | null>(null)
  const [filter, setFilter] = usePersisted<Filter>('backlog.filter', 'all', FILTERS)
  const [sort, setSort] = usePersisted<Sort>('backlog.sort', 'manual', SORTS)
  const [query, setQuery] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [showArchive, setShowArchive] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const lastDragEnd = useRef(0)
  const searchRef = useRef<HTMLInputElement>(null)
  const importRef = useRef<HTMLInputElement>(null)
  const pendingFocus = useRef<string | null>(null)

  const live = state.cards.filter((c) => !c.archivedAt)
  const archived = state.cards.filter((c) => c.archivedAt)
  const allTags = [...new Set(live.flatMap((c) => c.tags ?? []))].sort((a, b) => a.localeCompare(b))
  const openCard = state.cards.find((c) => c.id === openId)
  // a drag that ends over its own card would otherwise also register as a click
  const open = (id: string) => {
    if (Date.now() - lastDragEnd.current > 250) setOpenId(id)
  }

  const visibleCards = (columnId: string) => {
    const q = query.trim().toLowerCase()
    const cards = live
      .filter((c) => c.columnId === columnId)
      .filter((c) => !q || c.title.toLowerCase().includes(q) || c.tags?.some((t) => t.toLowerCase().includes(q)))
      .filter((c) => !tagFilter || c.tags?.includes(tagFilter))
      .filter((c) => filter === 'all' || (filter === 'none' ? !c.priority : c.priority === filter))
    if (sort === 'priority') cards.sort(byPriority)
    if (sort === 'due') cards.sort(byDue)
    return cards
  }

  const exportBoard = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `backlog-${new Date().toLocaleDateString('sv')}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000) // revoking right away can cancel the download
  }

  const importBoard = async (file: File) => {
    try {
      const next = parseBoard(JSON.parse(await file.text()))
      if (confirm(`Replace the current board with ${next.cards.length} cards in ${next.columns.length} columns?`)) {
        dispatch({ type: 'replace', state: next })
      }
    } catch (err) {
      alert(`Import failed: ${err instanceof Error ? err.message : 'invalid file'}`)
    }
  }

  // ---- keyboard ----
  // The handler is registered once; it reads the latest render's values through this ref.
  const ctx = useRef({ state, visibleCards, sort, dispatch, undo, redo, open })
  ctx.current = { state, visibleCards, sort, dispatch, undo, redo, open }

  useEffect(() => {
    const focusCard = (id: string) => document.querySelector<HTMLElement>(`[data-card-id="${id}"]`)?.focus()
    const focusAdd = (columnId: string) =>
      document.querySelector<HTMLElement>(`[data-column-id="${columnId}"] .add`)?.focus()

    const onKey = (e: KeyboardEvent) => {
      const c = ctx.current
      const el = e.target as HTMLElement
      const typing = el.matches('input, textarea, select') || el.isContentEditable
      const mod = e.ctrlKey || e.metaKey
      const dialog = document.querySelector('dialog[open]')
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key

      if (mod && !typing && (key === 'z' || key === 'y')) {
        // the archive list may stay open while you undo; other dialogs hold unsaved edits
        if (dialog && dialog.getAttribute('aria-label') !== 'Archive') return
        e.preventDefault()
        if (key === 'y' || e.shiftKey) c.redo()
        else c.undo()
        return
      }
      if (dialog) return
      if ((key === 'k' && mod) || (key === '/' && !typing && !mod)) {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
        return
      }
      if (typing || mod || e.altKey) return

      if (key === '?') {
        e.preventDefault()
        setShowHelp(true)
        return
      }
      const cardEl = el.closest<HTMLElement>('.card[data-card-id]')
      if (key === 'n') {
        e.preventDefault()
        const col = cardEl?.closest<HTMLElement>('[data-column-id]')?.dataset.columnId ?? c.state.columns[0]?.id
        if (col) focusAdd(col)
        return
      }
      if (!cardEl || el !== cardEl) return

      const id = cardEl.dataset.cardId!
      const card = c.state.cards.find((x) => x.id === id)
      if (!card) return
      const cols = c.state.columns
      const colIdx = cols.findIndex((x) => x.id === card.columnId)
      const list = c.visibleCards(card.columnId)
      const idx = list.findIndex((x) => x.id === id)
      const neighbour = list[idx + 1] ?? list[idx - 1]
      const handled = () => e.preventDefault()

      switch (key) {
        case 'ArrowDown':
        case 'ArrowUp': {
          handled()
          const delta = key === 'ArrowDown' ? 1 : -1
          if (e.shiftKey) {
            // reorder: only meaningful when the column shows the stored (manual) order
            const target = list[idx + delta]
            if (c.sort === 'manual' && target) {
              pendingFocus.current = id
              c.dispatch({ type: 'moveCard', id, columnId: card.columnId, overId: target.id })
            }
          } else if (list[idx + delta]) focusCard(list[idx + delta].id)
          return
        }
        case 'ArrowLeft':
        case 'ArrowRight': {
          handled()
          const next = cols[colIdx + (key === 'ArrowRight' ? 1 : -1)]
          if (!next) return
          if (e.shiftKey) {
            pendingFocus.current = id
            c.dispatch({ type: 'moveCard', id, columnId: next.id })
          } else {
            const there = c.visibleCards(next.id)
            if (there.length) focusCard(there[Math.min(idx, there.length - 1)].id)
            else focusAdd(next.id)
          }
          return
        }
        case 'Enter':
        case 'e':
          handled()
          c.open(id)
          return
        case 'a':
        case 'x':
        case 'Delete':
        case 'Backspace':
          handled()
          pendingFocus.current = neighbour?.id ?? null
          c.dispatch({ type: key === 'a' ? 'archiveCard' : 'deleteCard', id })
          return
        case '1':
        case '2':
        case '3':
        case '0':
          handled()
          c.dispatch({ type: 'updateCard', id, patch: { priority: KEY_PRIORITY[key] } })
          return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // a card that was deleted or archived while its dialog was open must not leave openId behind (undo would reopen it)
  useEffect(() => {
    if (openId && (!openCard || openCard.archivedAt)) setOpenId(null)
  }, [openId, openCard])

  // after a keyboard action re-renders the board, put focus back on the card that was acted on
  useEffect(() => {
    const id = pendingFocus.current
    if (!id) return
    pendingFocus.current = null
    document.querySelector<HTMLElement>(`[data-card-id="${id}"]`)?.focus()
  }, [state])

  // ---- drag and drop ----
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const active = state.cards.find((c) => c.id === activeId)

  const columnOf = (id: string) =>
    state.columns.find((c) => c.id === id)?.id ?? state.cards.find((c) => c.id === id)?.columnId

  // moves during a drag are transient; beginDrag/endDrag make the whole drag a single undo step
  const move = (activeId: string, overId: string) => {
    const columnId = columnOf(overId)
    if (!columnId) return
    const over = state.cards.some((c) => c.id === overId) ? overId : undefined
    rawDispatch({ type: 'moveCard', id: activeId, columnId, overId: over, transient: true })
  }

  const onOver = ({ active, over }: DragOverEvent) => {
    if (!over) return
    const from = state.cards.find((c) => c.id === active.id)?.columnId
    if (columnOf(String(over.id)) !== from) move(String(active.id), String(over.id))
  }

  const onEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null)
    lastDragEnd.current = Date.now()
    if (over && active.id !== over.id) move(String(active.id), String(over.id))
    endDrag(false)
  }

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <span className="brand-mark"><BoardIcon /></span>
          <h1>Backlog</h1>
        </div>
        <div className="controls">
          <div className="search-wrap">
            <SearchIcon />
            <input
              ref={searchRef}
              className="search"
              type="search"
              placeholder="Search cards  ( / )"
              aria-label="Search cards by title or tag"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
            />
          </div>
          <select className="field" aria-label="Filter by priority" value={filter}
            onChange={(e) => setFilter(e.target.value as Filter)}>
            <option value="all">All priorities</option>
            <option value="high">High priority</option>
            <option value="medium">Medium priority</option>
            <option value="low">Low priority</option>
            <option value="none">No priority</option>
          </select>
          {allTags.length > 0 && (
            <select className="field" aria-label="Filter by tag" value={allTags.includes(tagFilter) ? tagFilter : ''}
              onChange={(e) => setTagFilter(e.target.value)}>
              <option value="">All tags</option>
              {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
          <select className="field" aria-label="Sort cards" value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="manual">Sort: Manual</option>
            <option value="priority">Sort: Priority</option>
            <option value="due">Sort: Due date</option>
          </select>
          <span className="divider" />
          <button className="ghost" onClick={() => setShowArchive(true)}>
            <ArchiveIcon />Archive{archived.length > 0 && <span className="count">{archived.length}</span>}
          </button>
          {backupSupported && <BackupMenu backup={backup} />}
          <button className="ghost" onClick={exportBoard} aria-label="Export" title="Export board as JSON">
            <DownloadIcon /><span className="label">Export</span>
          </button>
          <button className="ghost" onClick={() => importRef.current?.click()} aria-label="Import" title="Import board from JSON">
            <UploadIcon /><span className="label">Import</span>
          </button>
          <input
            ref={importRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) importBoard(file)
              e.target.value = '' // allow re-importing the same file
            }}
          />
          <button className="icon square" onClick={() => setShowHelp(true)} aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)">
            <KeyboardIcon />
          </button>
          <button className="icon square" onClick={toggleTheme} aria-label="Toggle dark mode"
            title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}>
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={(e) => {
          beginDrag()
          setActiveId(String(e.active.id))
        }}
        onDragOver={onOver}
        onDragEnd={onEnd}
        onDragCancel={() => {
          setActiveId(null)
          endDrag(true)
        }}
      >
        <main className="board">
          {state.columns.map((col) => (
            <ColumnView
              key={col.id}
              column={col}
              dispatch={dispatch}
              onOpen={open}
              cards={visibleCards(col.id)}
              totalCount={state.cards.filter((c) => c.columnId === col.id).length}
            />
          ))}
          <button className="add-col" onClick={() => dispatch({ type: 'addColumn', name: 'New column' })}>
            <PlusIcon />Add column
          </button>
        </main>
        <DragOverlay>{active && <CardView card={active} overlay />}</DragOverlay>
      </DndContext>
      {openCard && !openCard.archivedAt && (
        <CardDialog
          key={openCard.id}
          card={openCard}
          columns={state.columns}
          allTags={allTags}
          dispatch={dispatch}
          onClose={() => setOpenId(null)}
        />
      )}
      {showArchive && (
        <ArchivePanel cards={archived} columns={state.columns} dispatch={rawDispatch} onClose={() => setShowArchive(false)} />
      )}
      {showHelp && <ShortcutsHelp onClose={() => setShowHelp(false)} />}
      {toast && (
        <div className="toast" role="status" key={toast.id}>
          {toast.message}
          <button onClick={undoFromToast}>Undo</button>
        </div>
      )}
    </div>
  )
}
