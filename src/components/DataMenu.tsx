import { useRef } from 'react'
import { useDismiss } from '../hooks'
import { DownloadIcon, UploadIcon } from './Icons'

interface Props {
  onExportJson: () => void
  onExportCsv: () => void
  onImport: () => void
}

export function DataMenu({ onExportJson, onExportCsv, onImport }: Props) {
  const ref = useRef<HTMLDetailsElement>(null)
  useDismiss(ref)
  const run = (fn: () => void) => () => {
    if (ref.current) ref.current.open = false
    fn()
  }

  return (
    <details className="menu data" ref={ref}>
      <summary className="menu-button ghost" title="Export or import this board" aria-label="Data: export and import">
        <DownloadIcon />
        <span className="label">Data</span>
      </summary>
      <div className="menu-panel menu-list" role="menu" aria-label="Data">
        <button role="menuitem" className="ghost" onClick={run(onExportJson)}>
          <DownloadIcon />Export JSON
        </button>
        <button role="menuitem" className="ghost" onClick={run(onExportCsv)}>
          <DownloadIcon />Export CSV
        </button>
        <button role="menuitem" className="ghost" onClick={run(onImport)}>
          <UploadIcon />Import JSON or CSV…
        </button>
        <p className="muted small">
          JSON replaces this board and keeps everything. CSV adds cards to it and understands Jira, Linear, GitHub and Trello-style exports.
        </p>
      </div>
    </details>
  )
}
