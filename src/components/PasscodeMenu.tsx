import { useRef, useState, type FormEvent } from 'react'
import { MIN_LENGTH } from '../auth'
import { useDismiss } from '../hooks'
import { LockIcon } from './Icons'
import { useLock } from './LockGate'

/** Top-bar menu: set / change / remove the passcode, or lock the app right now. */
export function PasscodeMenu() {
  const lock = useLock()
  const ref = useRef<HTMLDetailsElement>(null)
  useDismiss(ref)
  const [mode, setMode] = useState<'idle' | 'set' | 'remove'>('idle')
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')

  const reset = () => {
    setMode('idle')
    setCurrent('')
    setNext('')
    setConfirm('')
    setError('')
  }

  const submitSet = async (e: FormEvent) => {
    e.preventDefault()
    if (next.length < MIN_LENGTH) return setError(`Use at least ${MIN_LENGTH} characters.`)
    if (next !== confirm) return setError('Passcodes do not match.')
    if (lock.enabled && !(await lock.verify(current))) return setError('Current passcode is incorrect.')
    await lock.setPasscode(next)
    reset()
    if (ref.current) ref.current.open = false
  }

  const submitRemove = async (e: FormEvent) => {
    e.preventDefault()
    if (!(await lock.removePasscode(current))) return setError('Incorrect passcode.')
    reset()
    if (ref.current) ref.current.open = false
  }

  const err = error && <p role="alert" className="error-text">{error}</p>

  return (
    <details className="menu passcode" ref={ref} onToggle={(e) => !e.currentTarget.open && reset()}>
      <summary className="menu-button ghost" title="Passcode lock" aria-label="Passcode lock">
        <LockIcon />
        <span className="label">Lock</span>
      </summary>
      <div className="menu-panel" role="group" aria-label="Passcode lock">
        {mode === 'idle' && (
          <>
            <p className="muted small">
              {lock.enabled
                ? 'A passcode is required to open Backlog in a new tab or browser session.'
                : 'Set a passcode to ask for it when Backlog is opened. It only gates this browser and does not encrypt your data.'}
            </p>
            {lock.enabled && (
              <button className="primary" onClick={() => { if (ref.current) ref.current.open = false; lock.lock() }}>
                <LockIcon />Lock now
              </button>
            )}
            <button className="secondary" onClick={() => setMode('set')}>{lock.enabled ? 'Change passcode' : 'Set passcode'}</button>
            {lock.enabled && <button className="ghost" onClick={() => setMode('remove')}>Remove passcode</button>}
          </>
        )}
        {mode === 'set' && (
          <form onSubmit={submitSet}>
            {lock.enabled && (
              <input className="field" type="password" aria-label="Current passcode" placeholder="Current passcode"
                autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
            )}
            <input className="field" type="password" aria-label="New passcode" placeholder="New passcode"
              autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} autoFocus />
            <input className="field" type="password" aria-label="Confirm passcode" placeholder="Confirm passcode"
              autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            {err}
            <button type="submit" className="primary">Save passcode</button>
            <button type="button" className="ghost" onClick={reset}>Cancel</button>
          </form>
        )}
        {mode === 'remove' && (
          <form onSubmit={submitRemove}>
            <input className="field" type="password" aria-label="Current passcode" placeholder="Current passcode"
              autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} autoFocus />
            {err}
            <button type="submit" className="primary">Remove passcode</button>
            <button type="button" className="ghost" onClick={reset}>Cancel</button>
          </form>
        )}
      </div>
    </details>
  )
}
