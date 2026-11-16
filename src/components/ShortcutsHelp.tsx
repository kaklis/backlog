import { useEffect, useRef } from 'react'
import { XIcon } from './Icons'

const GROUPS: { title: string; rows: [string, string][] }[] = [
  {
    title: 'Anywhere',
    rows: [
      ['/  or  Ctrl K', 'Search'],
      ['n', 'New card (in the focused card’s column, else the first)'],
      ['Ctrl Z', 'Undo'],
      ['Ctrl Shift Z  or  Ctrl Y', 'Redo'],
      ['?', 'This list'],
    ],
  },
  {
    title: 'With a card focused (Tab to a card, or press n then Esc)',
    rows: [
      ['↑ ↓', 'Previous / next card'],
      ['← →', 'Card in the previous / next column'],
      ['Shift ↑ ↓', 'Move the card up / down (manual sort only)'],
      ['Shift ← →', 'Move the card to the previous / next column'],
      ['Enter  or  e', 'Open details'],
      ['1  2  3  0', 'Priority high / medium / low / none'],
      ['a', 'Archive'],
      ['x  or  Delete', 'Delete (undoable)'],
    ],
  },
]

export function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    ref.current?.showModal()
  }, [])

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-label="Keyboard shortcuts"
      onClose={onClose}
      onMouseDown={(e) => e.target === ref.current && ref.current?.close()}
    >
      <div className="dialog-head">
        <h2 className="dialog-heading">Keyboard shortcuts</h2>
        <span className="spacer" />
        <button className="icon square" aria-label="Close" onClick={() => ref.current?.close()}><XIcon /></button>
      </div>
      <div className="dialog-body">
        {GROUPS.map((g) => (
          <section key={g.title}>
            <h3 className="shortcut-group">{g.title}</h3>
            <dl className="shortcuts">
              {g.rows.map(([keys, what]) => (
                <div key={keys}>
                  <dt>{keys.split('  or  ').map((k, i) => (
                    <span key={k}>{i > 0 && <em>or</em>}<kbd>{k}</kbd></span>
                  ))}</dt>
                  <dd>{what}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </dialog>
  )
}
