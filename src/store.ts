import { useCallback, useEffect, useReducer } from 'react'
import { nextDue, RECURRENCES, type Recurrence } from './dates'

export type { Recurrence }

export interface Card {
  id: string
  title: string
  notes?: string
  priority?: Priority
  due?: string // YYYY-MM-DD
  tags?: string[]
  checklist?: ChecklistItem[]
  recurrence?: Recurrence // archiving the card adds the next occurrence
  archivedAt?: number // set when the card is archived; hidden from the board
  columnId: string
  createdAt: number
}
export interface ChecklistItem {
  id: string
  text: string
  done: boolean
}
export type Priority = 'low' | 'medium' | 'high'
export interface Column {
  id: string
  name: string
  wipLimit?: number // soft limit on active (non-archived) cards; exceeding it only warns
}
export interface Template {
  id: string
  name: string
  notes?: string
  priority?: Priority
  tags?: string[]
  checklist?: string[] // item texts; copies start unchecked
  recurrence?: Recurrence
}
export interface BoardState {
  columns: Column[]
  cards: Card[]
  templates?: Template[]
}

export type Action =
  | { type: 'addCard'; columnId: string; title: string }
  | { type: 'updateCard'; id: string; patch: Partial<Omit<Card, 'id' | 'columnId' | 'createdAt'>> }
  | { type: 'deleteCard'; id: string }
  | { type: 'archiveCard'; id: string }
  | { type: 'unarchiveCard'; id: string }
  | { type: 'archiveCards'; ids: string[] }
  // transient moves (during a drag) are not recorded in undo history; the drag as a whole is one step (beginDrag/endDrag)
  | { type: 'moveCard'; id: string; columnId: string; overId?: string; transient?: boolean }
  | { type: 'addColumn'; name: string }
  | { type: 'renameColumn'; id: string; name: string }
  | { type: 'setWipLimit'; id: string; limit?: number }
  | { type: 'deleteColumn'; id: string }
  | { type: 'replace'; state: BoardState }
  | { type: 'saveTemplate'; template: Template }
  | { type: 'deleteTemplate'; id: string }
  | { type: 'addCardFromTemplate'; id: string; templateId: string; columnId: string }
  | { type: 'importCards'; columns: Column[]; cards: Card[] } // appended to the board (new columns first)

export const DEFAULT_STORAGE_KEY = 'backlog.v1'
export const uid = () => Math.random().toString(36).slice(2, 10)

const initial: BoardState = {
  columns: [
    { id: 'backlog', name: 'Backlog' },
    { id: 'doing', name: 'In progress' },
    { id: 'done', name: 'Done' },
  ],
  cards: [],
}

function load(key: string): BoardState {
  try {
    const raw = localStorage.getItem(key)
    if (raw) return JSON.parse(raw) as BoardState
  } catch {
    /* storage unavailable or corrupt */
  }
  return initial
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const PRIORITIES = ['low', 'medium', 'high']

function parseTags(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined
  const tags = [...new Set(v.filter((t): t is string => typeof t === 'string').map((t) => t.trim()).filter(Boolean))]
  return tags.length ? tags : undefined
}

function parseChecklist(v: unknown): ChecklistItem[] | undefined {
  if (!Array.isArray(v)) return undefined
  const items = v
    .filter((i) => isObj(i) && typeof i.text === 'string' && i.text.trim())
    .map((i) => {
      const o = i as Record<string, unknown>
      return { id: typeof o.id === 'string' ? o.id : uid(), text: (o.text as string).trim(), done: o.done === true }
    })
  return items.length ? items : undefined
}

function parseTemplates(v: unknown): Template[] | undefined {
  if (!Array.isArray(v)) return undefined
  const out = v
    .filter((t) => isObj(t) && typeof t.id === 'string' && typeof t.name === 'string' && t.name.trim())
    .map((t): Template => {
      const o = t as Record<string, unknown>
      const items = Array.isArray(o.checklist)
        ? o.checklist.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim())
        : []
      return {
        id: o.id as string,
        name: (o.name as string).trim(),
        notes: typeof o.notes === 'string' && o.notes ? o.notes : undefined,
        priority: PRIORITIES.includes(o.priority as string) ? (o.priority as Priority) : undefined,
        tags: parseTags(o.tags),
        checklist: items.length ? items : undefined,
        recurrence: RECURRENCES.includes(o.recurrence as Recurrence) ? (o.recurrence as Recurrence) : undefined,
      }
    })
  return out.length ? out : undefined
}

/** Returns a cleaned BoardState from imported JSON, or throws an Error describing what is wrong. */
export function parseBoard(data: unknown): BoardState {
  if (!isObj(data) || !Array.isArray(data.columns) || !Array.isArray(data.cards)) {
    throw new Error('Not a backlog export (expected "columns" and "cards").')
  }
  const columns = data.columns.map((c): Column => {
    if (!isObj(c) || typeof c.id !== 'string' || typeof c.name !== 'string') throw new Error('Invalid column entry.')
    const limit = typeof c.wipLimit === 'number' && Number.isInteger(c.wipLimit) && c.wipLimit > 0 ? c.wipLimit : undefined
    return { id: c.id, name: c.name, wipLimit: limit }
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
      tags: parseTags(c.tags),
      checklist: parseChecklist(c.checklist),
      recurrence: RECURRENCES.includes(c.recurrence as Recurrence) ? (c.recurrence as Recurrence) : undefined,
      archivedAt: typeof c.archivedAt === 'number' ? c.archivedAt : undefined,
      due: typeof c.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(c.due) ? c.due : undefined,
    }
  })
  const templates = parseTemplates(data.templates)
  return templates ? { columns, cards, templates } : { columns, cards }
}

/** Archives the given cards; archiving a recurring card also adds its next occurrence to the same column. */
function archive(s: BoardState, ids: Set<string>): BoardState {
  const now = Date.now()
  const next: Card[] = []
  const cards = s.cards.map((c) => {
    if (!ids.has(c.id) || c.archivedAt) return c
    if (c.recurrence) {
      next.push({
        ...c,
        id: uid(),
        createdAt: now,
        archivedAt: undefined,
        due: nextDue(c.due, c.recurrence, new Date(now)),
        checklist: c.checklist?.map((i) => ({ ...i, id: uid(), done: false })),
      })
    }
    return { ...c, archivedAt: now }
  })
  const changed = cards.some((c, i) => c !== s.cards[i])
  return changed ? { ...s, cards: [...cards, ...next] } : s
}

export function reducer(s: BoardState, a: Action): BoardState {
  switch (a.type) {
    case 'replace':
      return a.state
    case 'addCard':
      return {
        ...s,
        cards: [...s.cards, { id: uid(), title: a.title, columnId: a.columnId, createdAt: Date.now() }],
      }
    case 'updateCard':
      return {
        ...s,
        cards: s.cards.map((c) => (c.id === a.id ? { ...c, ...a.patch } : c)),
      }
    case 'deleteCard':
      return s.cards.some((c) => c.id === a.id) ? { ...s, cards: s.cards.filter((c) => c.id !== a.id) } : s
    case 'archiveCard':
      return archive(s, new Set([a.id]))
    case 'unarchiveCard':
      return { ...s, cards: s.cards.map((c) => (c.id === a.id ? { ...c, archivedAt: undefined } : c)) }
    case 'archiveCards':
      return archive(s, new Set(a.ids))
    case 'saveTemplate': {
      const rest = (s.templates ?? []).filter((t) => t.id !== a.template.id)
      return { ...s, templates: [...rest, a.template] }
    }
    case 'deleteTemplate': {
      const templates = (s.templates ?? []).filter((t) => t.id !== a.id)
      return { ...s, templates: templates.length ? templates : undefined }
    }
    case 'addCardFromTemplate': {
      const t = s.templates?.find((x) => x.id === a.templateId)
      if (!t || !s.columns.some((c) => c.id === a.columnId)) return s
      const card: Card = {
        id: a.id,
        title: t.name,
        columnId: a.columnId,
        createdAt: Date.now(),
        notes: t.notes,
        priority: t.priority,
        tags: t.tags,
        checklist: t.checklist?.map((text) => ({ id: uid(), text, done: false })),
        recurrence: t.recurrence,
      }
      return { ...s, cards: [...s.cards, card] }
    }
    case 'importCards': {
      if (!a.cards.length && !a.columns.length) return s
      return { ...s, columns: [...s.columns, ...a.columns], cards: [...s.cards, ...a.cards] }
    }
    case 'moveCard': {
      const card = s.cards.find((c) => c.id === a.id)
      if (!card) return s
      const rest = s.cards.filter((c) => c.id !== a.id)
      const moved = { ...card, columnId: a.columnId }
      const overIdx = a.overId ? rest.findIndex((c) => c.id === a.overId) : -1
      let cards: Card[]
      if (overIdx >= 0) {
        // dragging down within a column lands after the target, otherwise before
        const origIdx = s.cards.findIndex((c) => c.id === a.id)
        const origOver = s.cards.findIndex((c) => c.id === a.overId)
        const at = card.columnId === a.columnId && origIdx < origOver ? overIdx + 1 : overIdx
        cards = [...rest.slice(0, at), moved, ...rest.slice(at)]
      } else cards = [...rest, moved]
      // a drop that changes nothing must not count as a change (keeps undo history clean)
      const same = card.columnId === a.columnId && cards.every((c, i) => c.id === s.cards[i].id)
      return same ? s : { ...s, cards }
    }
    case 'addColumn':
      return { ...s, columns: [...s.columns, { id: uid(), name: a.name }] }
    case 'renameColumn':
      return { ...s, columns: s.columns.map((c) => (c.id === a.id ? { ...c, name: a.name } : c)) }
    case 'setWipLimit':
      return s.columns.find((c) => c.id === a.id)?.wipLimit === a.limit
        ? s
        : { ...s, columns: s.columns.map((c) => (c.id === a.id ? { ...c, wipLimit: a.limit } : c)) }
    case 'deleteColumn':
      return {
        ...s,
        columns: s.columns.filter((c) => c.id !== a.id),
        cards: s.cards.filter((c) => c.columnId !== a.id),
      }
  }
}

interface History {
  present: BoardState
  past: BoardState[]
  future: BoardState[]
}
type HistoryAction =
  | Action
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'beginDrag' }
  | { type: 'endDrag'; cancelled: boolean }
const MAX_HISTORY = 100

/** Wraps the board reducer with undo/redo. Every board change is one undo step, except transient moves. */
export function historyReducer(h: History, a: HistoryAction): History {
  const { present } = h
  // snapshots identical to the present (e.g. a drag that ended where it started) are skipped
  const trim = (list: BoardState[]) => {
    let i = list.length
    while (i > 0 && list[i - 1] === present) i--
    return list.slice(0, i)
  }
  switch (a.type) {
    case 'undo': {
      const past = trim(h.past)
      if (!past.length) return h
      return { present: past[past.length - 1], past: past.slice(0, -1), future: [present, ...h.future] }
    }
    case 'redo': {
      let i = 0
      while (i < h.future.length && h.future[i] === present) i++
      const future = h.future.slice(i)
      if (!future.length) return h
      return { present: future[0], past: [...h.past, present], future: future.slice(1) }
    }
    case 'beginDrag':
      return { ...h, past: [...h.past, present].slice(-MAX_HISTORY) }
    case 'endDrag': {
      const top = h.past[h.past.length - 1]
      if (!top) return h
      // cancelled: roll back whatever the drag changed; finished without change: drop the empty step
      if (a.cancelled) return { ...h, present: top, past: h.past.slice(0, -1) }
      return top === present ? { ...h, past: h.past.slice(0, -1) } : h
    }
    default: {
      const next = reducer(present, a)
      if (next === present) return h
      if (a.type === 'moveCard' && a.transient) return { ...h, present: next, future: [] }
      return { present: next, past: [...h.past, present].slice(-MAX_HISTORY), future: [] }
    }
  }
}

export function useBoard(storageKey: string = DEFAULT_STORAGE_KEY) {
  const [h, dispatchH] = useReducer(historyReducer, undefined, () => ({ present: load(storageKey), past: [], future: [] }))
  const state = h.present
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state))
    } catch {
      /* ignore */
    }
  }, [state, storageKey])
  const dispatch = useCallback((a: Action) => dispatchH(a), [])
  const undo = useCallback(() => dispatchH({ type: 'undo' }), [])
  const redo = useCallback(() => dispatchH({ type: 'redo' }), [])
  const beginDrag = useCallback(() => dispatchH({ type: 'beginDrag' }), [])
  const endDrag = useCallback((cancelled: boolean) => dispatchH({ type: 'endDrag', cancelled }), [])
  return { state, dispatch, undo, redo, beginDrag, endDrag }
}

export type Dispatch = (a: Action) => void
