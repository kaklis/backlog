import { useEffect, useState } from 'react'

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
