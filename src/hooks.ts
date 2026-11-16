import { useEffect, useState, type RefObject } from 'react'

// useState backed by localStorage; falls back to `initial` if storage is unavailable or the value is unknown
export function usePersisted<T extends string>(key: string, initial: T, allowed: T[]) {
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
export function useTheme() {
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

/** Closes a <details> popover when the user clicks outside it or presses Escape inside it. */
export function useDismiss(ref: RefObject<HTMLDetailsElement>) {
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) ref.current.open = false
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && ref.current?.open) {
        ref.current.open = false
        ref.current.querySelector('summary')?.focus()
        e.stopPropagation()
      }
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [ref])
}

/** A named combination of the toolbar's search / filter / sort settings. */
export interface SavedView {
  id: string
  name: string
  query: string
  priority: string
  tag: string
  due: string
  sort: string
}

const VIEWS_KEY = 'backlog.views'

function loadViews(): SavedView[] {
  try {
    const data = JSON.parse(localStorage.getItem(VIEWS_KEY) ?? '[]')
    if (!Array.isArray(data)) return []
    const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback)
    return data
      .filter((v) => typeof v === 'object' && v !== null && typeof v.id === 'string' && typeof v.name === 'string' && v.name.trim())
      .map((v) => ({
        id: v.id, name: v.name.trim(), query: str(v.query), priority: str(v.priority, 'all'),
        tag: str(v.tag), due: str(v.due, 'any'), sort: str(v.sort, 'manual'),
      }))
  } catch {
    return []
  }
}

/** Saved filter views, kept in localStorage and shared by all boards. */
export function useViews() {
  const [views, setViews] = useState<SavedView[]>(loadViews)
  const persist = (next: SavedView[]) => {
    setViews(next)
    try {
      localStorage.setItem(VIEWS_KEY, JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }
  return {
    views,
    // saving under an existing name replaces that view
    save: (name: string, settings: Omit<SavedView, 'id' | 'name'>) => {
      const n = name.trim()
      if (!n) return
      const existing = views.find((v) => v.name.toLowerCase() === n.toLowerCase())
      const view = { id: existing?.id ?? Math.random().toString(36).slice(2, 10), name: n, ...settings }
      persist(existing ? views.map((v) => (v.id === existing.id ? view : v)) : [...views, view])
    },
    remove: (id: string) => persist(views.filter((v) => v.id !== id)),
  }
}
