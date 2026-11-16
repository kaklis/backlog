# Backlog

A minimalist Kanban board for tracking work. Runs entirely in your browser: no server, no account. Data is saved in `localStorage`.

Built with Vite, React, TypeScript and [dnd-kit](https://dndkit.com/).

## Setup

Requires Node.js 18 or newer.

```bash
npm install
npm run dev      # start the dev server, then open the printed URL (default http://localhost:5173)
```

Other scripts:

```bash
npm run build    # type-check and build to dist/
npm run preview  # serve the production build locally
```

## Testing

```bash
npm test             # unit + component tests (Vitest, Testing Library, jsdom) - fast, no browser
npm run test:e2e     # end-to-end tests (Playwright) - builds the app, serves it on :4173, drives a real browser
```

The e2e tests use the Edge/Chrome already installed on your machine. To use Playwright's own browser instead, run `npx playwright install chromium` and set `PW_CHANNEL=` (empty) before `npm run test:e2e`. File backup tests replace the OS file picker with an in-browser stand-in.

## Usage

**Cards**
- Type in a column's "+ Add card" box and press Enter.
- Click a card (or focus it and press Enter) to open its detail dialog: title, notes, status (column), priority, due date, tags and a checklist. Save applies the changes; Esc, Cancel or clicking outside discards them. Delete is also available there.
- **Tags:** type a tag and press Enter or comma; Backspace removes the last one. Tags get a color from their name and appear on the card.
- **Checklists:** add items, tick them off, edit or remove them. Cards show progress such as 2/5.
- Drag cards within a column or between columns.
- Hover a card and click × to delete it.
- **Archive** a card from its dialog (or press `a`), or archive every card shown in a column with the archive icon in its header. Archived cards leave the board but are kept; open **Archive** in the top bar to restore or permanently delete them.
- **Undo / redo** (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z or Ctrl+Y) covers every change: adds, edits, moves, a whole drag, archive, deleting cards or columns, and imports. Deletes and archives also show an **Undo** toast. History lasts for the session (up to 100 steps).

**Columns**
- Click a column name to rename it. × deletes the column and its cards (asks first if it has cards).
- **WIP limits:** click the count next to a column name to set a limit (leave it empty to remove it). The count then reads `used/limit`, turns amber when the column is full and red, with a red outline, when it is over. The limit is a warning only: you can still add or drop cards. It counts every active card in the column, whatever search or filters are hiding, and ignores archived cards.
- "+ Column" adds a new one.

**Finding things**
- Search by title or tag with the search box. Esc clears it.
- Filter by tag with the tag dropdown (appears once any card has tags).
- Filter by priority (All, High, Medium, Low, No priority).
- Filter by due date: Overdue, Due today, Due this week (today through Sunday; earlier days of the week count as overdue), or No due date. The week runs Monday to Sunday.
- Sort by Manual (your drag order), Priority, or Due date. Sorting and filtering only change what you see, not the stored order.
- Overdue due dates are shown in red.

**Other**
- ☾ / ☀ toggles dark mode. Until you choose, it follows your OS setting.
- **Backup** (Chrome, Edge and other Chromium browsers) keeps a JSON file on your computer in sync automatically. Choose a file once; it is rewritten shortly after every change. After a browser restart it may ask you to click **Reconnect** to re-grant access. If the board is empty but the file has cards (e.g. site data was cleared), it offers to restore instead of overwriting. A file that isn't a Backlog backup is never overwritten. Firefox and Safari don't support this, so use Export there.
- **Data menu:** **Export JSON** downloads the whole board (`backlog-YYYY-MM-DD.json`); **Export CSV** gives one row per card. **Import** takes either: a JSON export *replaces* the board (after confirmation; invalid files are rejected without changes), a CSV *adds* cards. The CSV importer recognises this app's own headers and common tracker ones: Jira (`Summary`, `Status`, `Priority`, `Labels`, `Description`, `Due Date`), Linear and GitHub / Trello style (`Title`, `State`, `Labels`, `Body`, `List`...). Statuses are matched to your columns by name and unknown ones become new columns; priorities such as Highest, Urgent or P1 map to high, and so on. Imports are undoable.

**Notes, repeats and templates**
- **Markdown in notes:** `**bold**`, `*italic*`, `` `code` ``, `- ` and `1.` lists, `[links](https://...)` and bare URLs. Use the Write / Preview tabs in the card dialog. Only plain formatting is supported; raw HTML is never rendered.
- **Repeat:** set Daily / Weekly / Monthly in the card dialog. Archiving a repeating card creates the next one with the following due date (monthly keeps the day of the month, so Jan 31 gives Feb 28 and then Mar 31) and an unticked checklist. One undo removes both.
- **Templates:** *Make template* in the card dialog saves its notes, priority, tags, checklist and repeat rule. The template icon next to a column's add box starts a new card from one.
- Due dates read **Today** / **Tomorrow** in amber, and overdue ones in red.

**Boards and views**
- The board name in the top left opens the **board switcher**: add, rename, delete (with confirmation) and switch between boards, e.g. one per project. Each board has its own cards, undo history and backup file; the first one is your original board.
- **Views** saves the current search, filters and sort under a name, so "High priority this week" is one click. Saving under an existing name replaces it. Views are shared by all boards.

**Install and offline**
- In a production build (`npm run build && npm run preview`, or hosted anywhere) the app registers a service worker, so it loads without a network and can be installed from the browser's install button (Chrome/Edge) or "Add to Home Screen". Data was always local, so everything works offline.

**Accessibility**
- Everything is reachable by keyboard. To move a card without shortcuts: focus it, press `Space`, use the arrows (to the next column too), then `Space` to drop or `Escape` to cancel; screen readers announce each step with card titles and column names. The e2e suite runs axe (WCAG 2.1 AA) on the board and the dialog in light and dark mode.

## Keyboard shortcuts

Press `?` in the app for this list.

| Key | Action |
| --- | --- |
| `/` or Ctrl/Cmd + K | Focus search |
| `n` | New card (in the focused card's column, else the first) |
| Ctrl/Cmd + Z | Undo |
| Ctrl/Cmd + Shift + Z, or Ctrl + Y | Redo |
| `?` | Show shortcuts |
| Esc | Clear search / close a dialog without saving |

With a card focused (Tab to one):

| Key | Action |
| --- | --- |
| ↑ ↓ / ← → | Move focus between cards / columns |
| Shift + ↑ ↓ | Reorder within the column (manual sort only) |
| Shift + ← → | Move to the previous / next column |
| Enter or `e` | Open details |
| `1` `2` `3` `0` | Priority high / medium / low / none |
| `a` | Archive |
| `x` or Delete | Delete (undoable) |

## Data and storage

Everything is stored in this browser under these `localStorage` keys: `backlog.boards` (list of boards), `backlog.v1` (the first board) and `backlog.board.<id>` (others), `backlog.views`, `backlog.filter`, `backlog.sort`, `backlog.due`, `backlog.theme`. Clearing site data erases the board, so turn on file backup (or use Export). Data is not shared between browsers or devices; use Export / Import to move it. Deleting a board removes its data from this browser.

## Project layout

```
src/
  main.tsx              entry point
  App.tsx               board shell, top bar, filter/sort/search, drag and drop, undo, import/export
  boards.ts             list of boards (switcher state)
  csv.ts                CSV parse/export and Jira/Linear/GitHub import mapping
  markdown.tsx          small safe Markdown renderer for notes
  store.ts              board state, reducer, localStorage persistence, import validation
  components/Column.tsx column with card list and add box
  components/Card.tsx   sortable card
  components/CardDialog.tsx  card detail dialog (notes, tags, checklist)
  backup.ts             file backup (File System Access API + IndexedDB handle)
  components/BackupMenu.tsx  backup status and controls
  components/BoardSwitcher.tsx, ViewsMenu.tsx, DataMenu.tsx  top-bar menus
  components/ArchivePanel.tsx  archived cards: restore / delete
  components/ShortcutsHelp.tsx keyboard shortcut list
  dates.ts              due-date helpers (today, week range, due filters)
  hooks.ts              usePersisted, useTheme
  tags.ts               tag color + normalization helpers
  test/setup.ts         Vitest setup (jsdom polyfills)
  *.test.ts(x)          unit and component tests
  styles.css            theme variables (light/dark) and layout
public/                 manifest, icons and service worker (offline)
e2e/                    Playwright end-to-end tests
```
