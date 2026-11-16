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
import { parseBoard, useBoard, type Card, type Dispatch, type Priority } from './store'
import { ColumnView } from './components/Column'
import { BoardIcon, DownloadIcon, MoonIcon, PlusIcon, SearchIcon, SunIcon, UploadIcon } from './components/Icons'
import { CardView } from './components/Card'

type Filter = Priority | 'none' | 'all'
type Sort = 'manual' | 'priority' | 'due'

const RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 }
// cards without a value sort last
const byPriority = (a: Card, b: Card) => (a.priority ? RANK[a.priority] : 3) - (b.priority ? RANK[b.priority] : 3)
const byDue = (a: Card, b: Card) => (a.due ?? '9999').localeCompare(b.due ?? '9999')

const FILTERS: Filter[] = ['all', 'high', 'medium', 'low', 'none']
const SORTS: Sort[] = ['manual', 'priority', 'due']

// useState backed by localStorage; falls back to `initial` if storage is unavailable or the value is unknown
function usePersisted<T extends string>(key: string, initial: T, allowed: T[]) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key) as T | null
      return raw && allowed.includes(raw) ? raw : initial
    } catch {
      return initial
    }
  })
  const set = (v: T) => {
    setValue(v)
    try {
      localStorage.setItem(key, v)
    } catch {
      /* ignore */
    }
  }
  return [value, set] as const
}

type Theme = 'light' | 'dark'

const systemTheme = (): Theme => (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')

// explicit choice is stored; until then the OS preference applies (see styles.css)
function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem('backlog.theme')
      if (saved === 'light' || saved === 'dark') return saved
    } catch {
      /* ignore */
    }
    return systemTheme()
  })
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.dataset.theme = next
    try {
      localStorage.setItem('backlog.theme', next)
    } catch {
      /* ignore */
    }
  }
  // apply a previously saved choice on load
  useEffect(() => {
    try {
      const saved = localStorage.getItem('backlog.theme')
      if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved
    } catch {
      /* ignore */
    }
  }, [])
  return [theme, toggle] as const
}

export default function App() {
  const { state, dispatch: rawDispatch } = useBoard()
  const [theme, toggleTheme] = useTheme()
  // deleted cards, newest last, kept for undo; the toast shows briefly after each delete
  const [trash, setTrash] = useState<{ card: Card; index: number }[]>([])
  const [toast, setToast] = useState(false)
  const toastTimer = useRef<number>()

  const dispatch: Dispatch = (action) => {
    if (action.type === 'deleteCard') {
      const index = state.cards.findIndex((c) => c.id === action.id)
      if (index >= 0) {
        setTrash((t) => [...t.slice(-19), { card: state.cards[index], index }])
        setToast(true)
        window.clearTimeout(toastTimer.current)
        toastTimer.current = window.setTimeout(() => setToast(false), 6000)
      }
    }
    rawDispatch(action)
  }

  const undo = () => {
    const last = trash[trash.length - 1]
    if (!last) return
    rawDispatch({ type: 'restoreCard', ...last })
    setTrash(trash.slice(0, -1))
    if (trash.length <= 1) setToast(false)
  }
  const [activeId, setActiveId] = useState<string | null>(null)
  const [filter, setFilter] = usePersisted<Filter>('backlog.filter', 'all', FILTERS)
  const [sort, setSort] = usePersisted<Sort>('backlog.sort', 'manual', SORTS)
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const importRef = useRef<HTMLInputElement>(null)

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

  // "/" or Ctrl/Cmd+K focuses search; "/" is ignored while typing in a field.
  // Ctrl/Cmd+Z undoes a card delete, except in a text field where it undoes typing.
  const undoRef = useRef(undo)
  undoRef.current = undo
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      const typing = el.matches('input, textarea, select') || el.isContentEditable
      if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey && !typing) {
        e.preventDefault()
        undoRef.current()
        return
      }
      if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !typing)) {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const visibleCards = (columnId: string) => {
    const q = query.trim().toLowerCase()
    const cards = state.cards
      .filter((c) => c.columnId === columnId)
      .filter((c) => !q || c.title.toLowerCase().includes(q))
      .filter((c) => filter === 'all' || (filter === 'none' ? !c.priority : c.priority === filter))
    if (sort === 'priority') cards.sort(byPriority)
    if (sort === 'due') cards.sort(byDue)
    return cards
  }
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const active = state.cards.find((c) => c.id === activeId)

  const columnOf = (id: string) =>
    state.columns.find((c) => c.id === id)?.id ?? state.cards.find((c) => c.id === id)?.columnId

  const move = (activeId: string, overId: string) => {
    const columnId = columnOf(overId)
    if (!columnId) return
    const over = state.cards.some((c) => c.id === overId) ? overId : undefined
    dispatch({ type: 'moveCard', id: activeId, columnId, overId: over })
  }

  const onOver = ({ active, over }: DragOverEvent) => {
    if (!over) return
    const from = state.cards.find((c) => c.id === active.id)?.columnId
    if (columnOf(String(over.id)) !== from) move(String(active.id), String(over.id))
  }

  const onEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null)
    if (over && active.id !== over.id) move(String(active.id), String(over.id))
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
              aria-label="Search cards by title"
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
          <select className="field" aria-label="Sort cards" value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="manual">Sort: Manual</option>
            <option value="priority">Sort: Priority</option>
            <option value="due">Sort: Due date</option>
          </select>
          <span className="divider" />
          <button className="ghost" onClick={exportBoard}><DownloadIcon />Export</button>
          <button className="ghost" onClick={() => importRef.current?.click()}><UploadIcon />Import</button>
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
          <button className="icon square" onClick={toggleTheme} aria-label="Toggle dark mode"
            title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}>
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={(e) => setActiveId(String(e.active.id))}
        onDragOver={onOver}
        onDragEnd={onEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <main className="board">
          {state.columns.map((col) => (
            <ColumnView
              key={col.id}
              column={col}
              dispatch={dispatch}
              cards={visibleCards(col.id)}
            />
          ))}
          <button className="add-col" onClick={() => dispatch({ type: 'addColumn', name: 'New column' })}>
            <PlusIcon />Add column
          </button>
        </main>
        <DragOverlay>{active && <CardView card={active} overlay />}</DragOverlay>
      </DndContext>
      {toast && trash.length > 0 && (
        <div className="toast" role="status">
          Card deleted
          <button onClick={undo}>Undo</button>
        </div>
      )}
    </div>
  )
}
