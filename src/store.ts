import { useEffect, useReducer } from 'react'

export interface Card {
  id: string
  title: string
  notes?: string
  priority?: Priority
  due?: string // YYYY-MM-DD
  columnId: string
  createdAt: number
}
export type Priority = 'low' | 'medium' | 'high'
export interface Column {
  id: string
  name: string
}
export interface BoardState {
  columns: Column[]
  cards: Card[]
}

type Action =
  | { type: 'addCard'; columnId: string; title: string }
  | { type: 'updateCard'; id: string; title: string; notes?: string; priority?: Priority; due?: string }
  | { type: 'deleteCard'; id: string }
  | { type: 'moveCard'; id: string; columnId: string; overId?: string }
  | { type: 'addColumn'; name: string }
  | { type: 'renameColumn'; id: string; name: string }
  | { type: 'deleteColumn'; id: string }
  | { type: 'replace'; state: BoardState }
  | { type: 'restoreCard'; card: Card; index: number }

const KEY = 'backlog.v1'
const uid = () => Math.random().toString(36).slice(2, 10)

const initial: BoardState = {
  columns: [
    { id: 'backlog', name: 'Backlog' },
    { id: 'doing', name: 'In progress' },
    { id: 'done', name: 'Done' },
  ],
  cards: [],
}

function load(): BoardState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as BoardState
  } catch {
    /* storage unavailable or corrupt */
  }
  return initial
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const PRIORITIES = ['low', 'medium', 'high']

/** Returns a cleaned BoardState from imported JSON, or throws an Error describing what is wrong. */
export function parseBoard(data: unknown): BoardState {
  if (!isObj(data) || !Array.isArray(data.columns) || !Array.isArray(data.cards)) {
    throw new Error('Not a backlog export (expected "columns" and "cards").')
  }
  const columns = data.columns.map((c): Column => {
    if (!isObj(c) || typeof c.id !== 'string' || typeof c.name !== 'string') throw new Error('Invalid column entry.')
    return { id: c.id, name: c.name }
  })
  const ids = new Set(columns.map((c) => c.id))
  if (ids.size !== columns.length) throw new Error('Duplicate column ids.')
  const cards = data.cards.map((c): Card => {
    if (!isObj(c) || typeof c.id !== 'string' || typeof c.title !== 'string' || typeof c.columnId !== 'string') {
      throw new Error('Invalid card entry.')
    }
    if (!ids.has(c.columnId)) throw new Error(`Card "${c.title}" points to a missing column.`)
    return {
      id: c.id,
      title: c.title,
      columnId: c.columnId,
      createdAt: typeof c.createdAt === 'number' ? c.createdAt : Date.now(),
      notes: typeof c.notes === 'string' ? c.notes : undefined,
      priority: PRIORITIES.includes(c.priority as string) ? (c.priority as Priority) : undefined,
      due: typeof c.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(c.due) ? c.due : undefined,
    }
  })
  return { columns, cards }
}

function reducer(s: BoardState, a: Action): BoardState {
  switch (a.type) {
    case 'replace':
      return a.state
    case 'restoreCard': {
      // skip if its column was deleted or the card is already back
      if (!s.columns.some((c) => c.id === a.card.columnId) || s.cards.some((c) => c.id === a.card.id)) return s
      const at = Math.min(a.index, s.cards.length)
      return { ...s, cards: [...s.cards.slice(0, at), a.card, ...s.cards.slice(at)] }
    }
    case 'addCard':
      return {
        ...s,
        cards: [...s.cards, { id: uid(), title: a.title, columnId: a.columnId, createdAt: Date.now() }],
      }
    case 'updateCard':
      return {
        ...s,
        cards: s.cards.map((c) => (c.id === a.id ? { ...c, title: a.title, notes: a.notes, priority: a.priority, due: a.due } : c)),
      }
    case 'deleteCard':
      return { ...s, cards: s.cards.filter((c) => c.id !== a.id) }
    case 'moveCard': {
      const card = s.cards.find((c) => c.id === a.id)
      if (!card) return s
      const rest = s.cards.filter((c) => c.id !== a.id)
      const moved = { ...card, columnId: a.columnId }
      const overIdx = a.overId ? rest.findIndex((c) => c.id === a.overId) : -1
      if (overIdx >= 0) {
        // dragging down within a column lands after the target, otherwise before
        const origIdx = s.cards.findIndex((c) => c.id === a.id)
        const origOver = s.cards.findIndex((c) => c.id === a.overId)
        const at = card.columnId === a.columnId && origIdx < origOver ? overIdx + 1 : overIdx
        return { ...s, cards: [...rest.slice(0, at), moved, ...rest.slice(at)] }
      }
      return { ...s, cards: [...rest, moved] }
    }
    case 'addColumn':
      return { ...s, columns: [...s.columns, { id: uid(), name: a.name }] }
    case 'renameColumn':
      return { ...s, columns: s.columns.map((c) => (c.id === a.id ? { ...c, name: a.name } : c)) }
    case 'deleteColumn':
      return {
        columns: s.columns.filter((c) => c.id !== a.id),
        cards: s.cards.filter((c) => c.columnId !== a.id),
      }
  }
}

export function useBoard() {
  const [state, dispatch] = useReducer(reducer, undefined, load)
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state))
    } catch {
      /* ignore */
    }
  }, [state])
  return { state, dispatch }
}

export type Dispatch = ReturnType<typeof useBoard>['dispatch']
