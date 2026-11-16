import { useEffect, useRef, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type Announcements,
  type DragOverEvent,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { parseBoard, useBoard, type Action, type Card, type Dispatch, type Priority } from './store'
import { usePersisted, useTheme, useViews, type SavedView } from './hooks'
import { matchesDue, type DueFilter } from './dates'
import { ColumnView } from './components/Column'
import {
  ArchiveIcon, KeyboardIcon, MoonIcon, PlusIcon, SearchIcon, SunIcon,
} from './components/Icons'
import { CardView } from './components/Card'
import { CardDialog } from './components/CardDialog'
import { ArchivePanel } from './components/ArchivePanel'
import { ShortcutsHelp } from './components/ShortcutsHelp'
import { BackupMenu } from './components/BackupMenu'
import { backupSupported, useFileBackup } from './backup'
import { useBoards, storageKeyFor, type Boards } from './boards'
import { boardToCsv, importCsv } from './csv'
import { BoardSwitcher } from './components/BoardSwitcher'
import { DataMenu } from './components/DataMenu'
import { ViewsMenu } from './components/ViewsMenu'

type Filter = Priority | 'none' | 'all'
type Sort = 'manual' | 'priority' | 'due'

const RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 }
// cards without a value sort last
const byPriority = (a: Card, b: Card) => (a.priority ? RANK[a.priority] : 3) - (b.priority ? RANK[b.priority] : 3)
const byDue = (a: Card, b: Card) => (a.due ?? '9999').localeCompare(b.due ?? '9999')

const FILTERS: Filter[] = ['all', 'high', 'medium', 'low', 'none']
const SORTS: Sort[] = ['manual', 'priority', 'due']
const DUE_FILTERS: DueFilter[] = ['any', 'overdue', 'today', 'week', 'none']
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
  const boards = useBoards()
  // keyed by board id: switching boards remounts the view, so history, search and backup all start fresh per board
  return <BoardView key={boards.active.id} boards={boards} />
}

function BoardView({ boards }: { boards: Boards }) {
  const boardId = boards.active.id
  const { state, dispatch: rawDispatch, undo, redo, beginDrag, endDrag } = useBoard(storageKeyFor(boardId))
  const [theme, toggleTheme] = useTheme()
  const backup = useFileBackup(state, rawDispatch, boardId)
  const views = useViews()
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
  const [dueFilter, setDueFilter] = usePersisted<DueFilter>('backlog.due', 'any', DUE_FILTERS)
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
      .filter((c) => matchesDue(dueFilter, c.due))
      .filter((c) => filter === 'all' || (filter === 'none' ? !c.priority : c.priority === filter))
    if (sort === 'priority') cards.sort(byPriority)
    if (sort === 'due') cards.sort(byDue)
    return cards
  }

  const download = (text: string, type: string, ext: string) => {
    const blob = new Blob([text], { type })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `backlog-${new Date().toLocaleDateString('sv')}.${ext}`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000) // revoking right away can cancel the download
  }
  const exportBoard = () => download(JSON.stringify(state, null, 2), 'application/json', 'json')
  const exportCsv = () => download(boardToCsv(state), 'text/csv', 'csv')

  const importBoard = async (file: File) => {
    try {
      const text = await file.text()
      if (/\.csv$/i.test(file.name) || file.type === 'text/csv') {
        const r = importCsv(text, state)
        const skipped = r.skipped ? ` (${r.skipped} rows without a title are skipped)` : ''
        const cols = r.columns.length ? ` and ${r.columns.length} new column${r.columns.length === 1 ? '' : 's'}` : ''
        if (confirm(`Add ${r.cards.length} cards${cols} to this board?${skipped}`)) {
          dispatch({ type: 'importCards', columns: r.columns, cards: r.cards })
        }
        return
      }
      const next = parseBoard(JSON.parse(text))
      if (confirm(`Replace the current board with ${next.cards.length} cards in ${next.columns.length} columns?`)) {
        dispatch({ type: 'replace', state: next })
      }
    } catch (err) {
      alert(`Import failed: ${err instanceof Error ? err.message : 'invalid file'}`)
    }
  }

  const currentView = { query, priority: filter, tag: tagFilter, due: dueFilter, sort }
  const isDefaultView = !query.trim() && filter === 'all' && !tagFilter && dueFilter === 'any' && sort === 'manual'
  const applyView = (v: SavedView) => {
    setQuery(v.query)
    setFilter((FILTERS as string[]).includes(v.priority) ? (v.priority as Filter) : 'all')
    setTagFilter(v.tag)
    setDueFilter((DUE_FILTERS as string[]).includes(v.due) ? (v.due as DueFilter) : 'any')
    setSort((SORTS as string[]).includes(v.sort) ? (v.sort as Sort) : 'manual')
  }
  const resetView = () => applyView({ id: '', name: '', query: '', priority: 'all', tag: '', due: 'any', sort: 'manual' })

  // ---- keyboard ----
  // The handler is registered once; it reads the latest render's values through this ref.
  const ctx = useRef({ state, visibleCards, sort, dispatch, undo, redo, open, dragging: false })
  ctx.current = { state, visibleCards, sort, dispatch, undo, redo, open, dragging: activeId !== null }

  useEffect(() => {
    const focusCard = (id: string) => document.querySelector<HTMLElement>(`[data-card-id="${id}"]`)?.focus()
    const focusAdd = (columnId: string) =>
      document.querySelector<HTMLElement>(`[data-column-id="${columnId}"] .add`)?.focus()

    const onKey = (e: KeyboardEvent) => {
      const c = ctx.current
      if (c.dragging) return // dnd-kit owns the keyboard (arrows, Space, Escape) during a drag
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
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    // Space lifts a focused card, arrows move it (also between columns), Space drops, Escape cancels.
    // Enter stays "open the card", so it is not a start key.
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates, keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] } }),
  )
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

  // spoken by screen readers during a drag: card titles and column names instead of internal ids
  const describe = (id: string | number) => {
    const card = state.cards.find((c) => c.id === id)
    if (card) return `"${card.title}"`
    return state.columns.find((c) => c.id === id)?.name ?? ''
  }
  const where = (id: string | number) => {
    const card = state.cards.find((c) => c.id === id)
    const col = card ? state.columns.find((c) => c.id === card.columnId) : state.columns.find((c) => c.id === id)
    if (!col) return ''
    const list = live.filter((c) => c.columnId === col.id)
    const pos = card ? list.findIndex((c) => c.id === card.id) + 1 : 0
    return card && pos ? `position ${pos} of ${list.length} in ${col.name}` : `column ${col.name}`
  }
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${describe(active.id)}, ${where(active.id)}.`,
    onDragOver: ({ active, over }) => (over ? `${describe(active.id)} is over ${where(over.id)}.` : `${describe(active.id)} is no longer over a column.`),
    onDragEnd: ({ active, over }) => (over ? `Dropped ${describe(active.id)}, ${where(active.id)}.` : `${describe(active.id)} was dropped.`),
    onDragCancel: ({ active }) => `Move cancelled. ${describe(active.id)} is back where it was.`,
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
          <BoardSwitcher boards={boards} />
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
          <select className="field" aria-label="Filter by due date" value={dueFilter}
            onChange={(e) => setDueFilter(e.target.value as DueFilter)}>
            <option value="any">Any due date</option>
            <option value="overdue">Overdue</option>
            <option value="today">Due today</option>
            <option value="week">Due this week</option>
            <option value="none">No due date</option>
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
          <ViewsMenu
            views={views.views}
            current={currentView}
            isDefault={isDefaultView}
            onApply={applyView}
            onReset={resetView}
            onSave={(name) => views.save(name, currentView)}
            onRemove={views.remove}
          />
          <DataMenu onExportJson={exportBoard} onExportCsv={exportCsv} onImport={() => importRef.current?.click()} />
          <input
            ref={importRef}
            type="file"
            accept="application/json,.json,text/csv,.csv"
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
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable: 'Press Space to pick up this card. Use the arrow keys to move it, Space to drop it, Escape to cancel. Press Enter to open it instead.',
          },
        }}
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
              activeCount={live.filter((c) => c.columnId === col.id).length}
              templates={state.templates ?? []}
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
