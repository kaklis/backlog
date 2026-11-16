import { useCallback, useEffect, useRef, useState } from 'react'
import { parseBoard, type BoardState, type Dispatch } from './store'

// File System Access API (Chromium browsers). Not in the TypeScript DOM lib, so typed minimally here.
type Handle = FileSystemFileHandle & {
  queryPermission(o: { mode: 'readwrite' }): Promise<PermissionState>
  requestPermission(o: { mode: 'readwrite' }): Promise<PermissionState>
}
type SavePicker = (o: {
  suggestedName: string
  types: { description: string; accept: Record<string, string[]> }[]
}) => Promise<Handle>

export const backupSupported = typeof window !== 'undefined' && 'showSaveFilePicker' in window

export type BackupStatus = 'off' | 'needs-permission' | 'on' | 'error'

// The chosen file handle is kept in IndexedDB so the link survives reloads.
const DB = 'backlog'
const STORE = 'kv'
const KEY = 'backupHandle'

function idb<T>(run: (s: IDBObjectStore) => IDBRequest<T>, mode: IDBTransactionMode): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB, 1)
    open.onupgradeneeded = () => open.result.createObjectStore(STORE)
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const req = run(open.result.transaction(STORE, mode).objectStore(STORE))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    }
  })
}
const loadHandle = () => idb<Handle | undefined>((s) => s.get(KEY), 'readonly').catch(() => undefined)
const storeHandle = (h: Handle) => idb((s) => s.put(h, KEY), 'readwrite').catch(() => undefined)
const clearHandle = () => idb((s) => s.delete(KEY), 'readwrite').catch(() => undefined)

export function useFileBackup(state: BoardState, dispatch: Dispatch) {
  const [handle, setHandle] = useState<Handle | null>(null)
  const [status, setStatus] = useState<BackupStatus>('off')
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [message, setMessage] = useState('')
  const stateRef = useRef(state)
  stateRef.current = state
  const queue = useRef<Promise<unknown>>(Promise.resolve())

  const write = useCallback((h: Handle) => {
    // serialize writes so two saves never interleave on the same file
    queue.current = queue.current.then(async () => {
      try {
        const w = await h.createWritable()
        await w.write(JSON.stringify(stateRef.current, null, 2))
        await w.close()
        setSavedAt(new Date())
        setStatus('on')
        setMessage('')
      } catch (err) {
        setStatus('error')
        setMessage(err instanceof Error ? err.message : 'Could not write the backup file')
      }
    })
    return queue.current
  }, [])

  // Before the first write, compare with the file so an empty board (e.g. cleared site data) never overwrites a good backup.
  const reconcile = useCallback(
    async (h: Handle) => {
      const text = await (await h.getFile()).text()
      if (text.trim()) {
        let saved: BoardState | null = null
        try {
          saved = parseBoard(JSON.parse(text))
        } catch {
          setStatus('error')
          setMessage('That file is not a Backlog backup, so it was left untouched.')
          return
        }
        if (stateRef.current.cards.length === 0 && saved.cards.length > 0) {
          if (confirm(`The backup file has ${saved.cards.length} cards and this board is empty. Restore them?`)) {
            dispatch({ type: 'replace', state: saved })
            setStatus('on')
            return // the state change triggers the next save
          }
        }
      }
      await write(h)
    },
    [dispatch, write],
  )

  // restore the link after a reload
  useEffect(() => {
    if (!backupSupported) return
    let cancelled = false
    ;(async () => {
      const h = await loadHandle()
      if (!h || cancelled) return
      setHandle(h)
      if ((await h.queryPermission({ mode: 'readwrite' })) === 'granted') {
        setStatus('on')
        await reconcile(h)
      } else setStatus('needs-permission')
    })()
    return () => {
      cancelled = true
    }
  }, [reconcile])

  // autosave shortly after each change
  useEffect(() => {
    if (!handle || status !== 'on') return
    const t = window.setTimeout(() => write(handle), 800)
    return () => window.clearTimeout(t)
  }, [state, handle, status, write])

  const connect = async () => {
    try {
      const h = await (window as unknown as { showSaveFilePicker: SavePicker }).showSaveFilePicker({
        suggestedName: 'backlog-backup.json',
        types: [{ description: 'Backlog backup', accept: { 'application/json': ['.json'] } }],
      })
      await storeHandle(h)
      setHandle(h)
      setStatus('on')
      await reconcile(h)
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setStatus('error')
        setMessage((err as Error).message)
      }
    }
  }

  const reconnect = async () => {
    if (!handle) return
    if ((await handle.requestPermission({ mode: 'readwrite' })) === 'granted') {
      setStatus('on')
      await reconcile(handle)
    }
  }

  const disconnect = async () => {
    await clearHandle()
    setHandle(null)
    setStatus('off')
    setSavedAt(null)
    setMessage('')
  }

  return {
    status,
    fileName: handle?.name,
    savedAt,
    message,
    connect,
    reconnect,
    disconnect,
    saveNow: () => (handle ? write(handle) : Promise.resolve()),
  }
}
