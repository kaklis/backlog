import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  clearSession, hasPasscode, isSessionUnlocked, markSessionUnlocked, removePasscode, setPasscode, verifyPasscode,
} from '../auth'
import { LockIcon } from './Icons'

export interface Lock {
  /** True when a passcode is set. */
  enabled: boolean
  /** Lock the app now (only meaningful when enabled). */
  lock: () => void
  /** Set or change the passcode. The app stays unlocked. */
  setPasscode: (passcode: string) => Promise<void>
  /** Remove the passcode, after checking the current one. Resolves false if it was wrong. */
  removePasscode: (current: string) => Promise<boolean>
  /** Check a passcode without changing anything. */
  verify: (passcode: string) => Promise<boolean>
}

const noLock: Lock = {
  enabled: false,
  lock: () => {},
  setPasscode: async () => {},
  removePasscode: async () => true,
  verify: async () => true,
}

const LockContext = createContext<Lock>(noLock)
export const useLock = () => useContext(LockContext)

/** Shows a passcode screen instead of `children` while the app is locked. */
export function LockGate({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(hasPasscode)
  const [unlocked, setUnlocked] = useState(() => !hasPasscode() || isSessionUnlocked())

  const lock = useCallback(() => {
    clearSession()
    setUnlocked(false)
  }, [])

  const value = useMemo<Lock>(
    () => ({
      enabled,
      lock,
      verify: verifyPasscode,
      setPasscode: async (passcode) => {
        await setPasscode(passcode)
        markSessionUnlocked()
        setEnabled(true)
      },
      removePasscode: async (current) => {
        if (!(await verifyPasscode(current))) return false
        removePasscode()
        setEnabled(false)
        return true
      },
    }),
    [enabled, lock],
  )

  if (enabled && !unlocked) {
    return (
      <UnlockScreen
        onUnlock={() => {
          markSessionUnlocked()
          setUnlocked(true)
        }}
      />
    )
  }
  return <LockContext.Provider value={value}>{children}</LockContext.Provider>
}

function UnlockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => input.current?.focus(), [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy || !value) return
    setBusy(true)
    const ok = await verifyPasscode(value)
    setBusy(false)
    if (ok) return onUnlock()
    setError(true)
    setValue('')
    input.current?.focus()
  }

  return (
    <main className="lock-screen">
      <form className="lock-card" onSubmit={submit}>
        <LockIcon width={28} height={28} />
        <h1 className="dialog-heading">Backlog is locked</h1>
        <label className="field-label">
          Passcode
          <input
            ref={input}
            className="field"
            type="password"
            autoComplete="current-password"
            value={value}
            aria-invalid={error}
            aria-describedby={error ? 'lock-error' : undefined}
            onChange={(e) => {
              setValue(e.target.value)
              setError(false)
            }}
          />
        </label>
        {error && <p id="lock-error" role="alert" className="lock-error">Incorrect passcode.</p>}
        <button type="submit" className="primary" disabled={busy || !value}>Unlock</button>
      </form>
    </main>
  )
}
