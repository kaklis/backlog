import { useEffect, useRef } from 'react'
import type { useFileBackup } from '../backup'
import { SaveIcon } from './Icons'

type Backup = ReturnType<typeof useFileBackup>

export function BackupMenu({ backup }: { backup: Backup }) {
  const ref = useRef<HTMLDetailsElement>(null)
  const { status, fileName, savedAt, message } = backup

  // close when clicking elsewhere
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) ref.current.open = false
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [])

  const close = () => ref.current && (ref.current.open = false)
  const time = savedAt?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  return (
    <details className="menu" ref={ref}>
      <summary className="menu-button ghost" title="File backup">
        <span className={`dot ${status}`} />
        <SaveIcon />
        Backup
      </summary>
      <div className="menu-panel" role="dialog" aria-label="File backup">
        {status === 'off' && (
          <>
            <p>Save your board to a file on this computer, updated automatically after every change.</p>
            <button className="primary" onClick={() => { close(); backup.connect() }}>Choose backup file…</button>
          </>
        )}
        {status === 'needs-permission' && (
          <>
            <p><b>{fileName}</b> needs your permission again after reloading.</p>
            <button className="primary" onClick={() => { close(); backup.reconnect() }}>Reconnect</button>
            <button className="ghost" onClick={() => { close(); backup.disconnect() }}>Stop backing up</button>
          </>
        )}
        {(status === 'on' || status === 'error') && (
          <>
            <p>
              {status === 'on' ? 'Backing up to ' : 'Problem with '}<b>{fileName}</b>
              {status === 'on' && <span className="muted">{time ? ` · saved ${time}` : ' · waiting for first save'}</span>}
            </p>
            {message && <p className="error-text">{message}</p>}
            <button className="secondary" onClick={() => { close(); backup.saveNow() }}>Save now</button>
            <button className="secondary" onClick={() => { close(); backup.connect() }}>Change file…</button>
            <button className="ghost danger" onClick={() => { close(); backup.disconnect() }}>Stop backing up</button>
          </>
        )}
      </div>
    </details>
  )
}
