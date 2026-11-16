import { useCallback, useEffect, useReducer } from 'react'
import { uid } from './store'
import { forgetBackup } from './backup'

export interface BoardMeta {
  id: string
  name: string
}
export interface BoardIndex {
  activeId: string
  boards: BoardMeta[]
}

const INDEX_KEY = 'backlog.boards'
export const MAIN_ID = 'main'
export const DEFAULT_BOARD_NAME = 'My backlog'

/** The first board keeps the original storage key, so boards saved before multi-board support just carry on. */
export const storageKeyFor = (id: string) => (id === MAIN_ID ? 'backlog.v1' : `backlog.board.${id}`)

export const defaultIndex = (): BoardIndex => ({
  activeId: MAIN_ID,
  boards: [{ id: MAIN_ID, name: DEFAULT_BOARD_NAME }],
})

/** Reads and repairs the stored board list: junk entries are dropped, and a missing/invalid active board falls back. */
export function parseIndex(raw: string | null): BoardIndex {
  if (!raw) return defaultIndex()
  try {
    const data = JSON.parse(raw) as { activeId?: unknown; boards?: unknown }
    const seen = new Set<string>()
    const boards = (Array.isArray(data.boards) ? data.boards : []).flatMap((b): BoardMeta[] => {
      if (typeof b !== 'object' || b === null) return []
      const { id, name } = b as Record<string, unknown>
      if (typeof id !== 'string' || !id || seen.has(id) || typeof name !== 'string' || !name.trim()) return []
      seen.add(id)
      return [{ id, name: name.trim() }]
    })
    if (!boards.length) return defaultIndex()
    const activeId = typeof data.activeId === 'string' && seen.has(data.activeId) ? data.activeId : boards[0].id
    return { activeId, boards }
  } catch {
    return defaultIndex()
  }
}

function loadIndex(): BoardIndex {
  try {
    return parseIndex(localStorage.getItem(INDEX_KEY))
  } catch {
    return defaultIndex()
  }
}

type IndexAction =
  | { type: 'select'; id: string }
  | { type: 'create'; id: string; name: string }
  | { type: 'rename'; id: string; name: string }
  | { type: 'remove'; id: string }

export function indexReducer(s: BoardIndex, a: IndexAction): BoardIndex {
  switch (a.type) {
    case 'select':
      return s.boards.some((b) => b.id === a.id) && a.id !== s.activeId ? { ...s, activeId: a.id } : s
    case 'create': {
      const name = a.name.trim()
      if (!name || s.boards.some((b) => b.id === a.id)) return s
      return { activeId: a.id, boards: [...s.boards, { id: a.id, name }] }
    }
    case 'rename': {
      const name = a.name.trim()
      if (!name || s.boards.find((b) => b.id === a.id)?.name === name) return s
      return { ...s, boards: s.boards.map((b) => (b.id === a.id ? { ...b, name } : b)) }
    }
    case 'remove': {
      if (s.boards.length <= 1 || !s.boards.some((b) => b.id === a.id)) return s // there is always at least one board
      const boards = s.boards.filter((b) => b.id !== a.id)
      return { activeId: s.activeId === a.id ? boards[0].id : s.activeId, boards }
    }
  }
}

export function useBoards() {
  const [index, dispatch] = useReducer(indexReducer, undefined, loadIndex)

  useEffect(() => {
    try {
      localStorage.setItem(INDEX_KEY, JSON.stringify(index))
    } catch {
      /* ignore */
    }
  }, [index])

  const active = index.boards.find((b) => b.id === index.activeId) ?? index.boards[0]

  const select = useCallback((id: string) => dispatch({ type: 'select', id }), [])
  const create = useCallback((name: string) => {
    const id = uid()
    dispatch({ type: 'create', id, name })
    return id
  }, [])
  const rename = useCallback((id: string, name: string) => dispatch({ type: 'rename', id, name }), [])
  const remove = useCallback(
    (id: string) => {
      if (index.boards.length <= 1) return
      dispatch({ type: 'remove', id })
      try {
        localStorage.removeItem(storageKeyFor(id)) // the board's cards go with it
      } catch {
        /* ignore */
      }
      void forgetBackup(id)
    },
    [index.boards.length],
  )

  return { boards: index.boards, active, select, create, rename, remove }
}

export type Boards = ReturnType<typeof useBoards>
