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

## Usage

**Cards**
- Type in a column's "+ Add card" box and press Enter.
- Click a card to edit its title, notes, priority (low / medium / high) and due date. Enter or Save confirms, Esc cancels.
- Drag cards within a column or between columns.
- Hover a card and click × to delete it. A toast offers **Undo**, or press Ctrl/Cmd+Z (last 20 deletes this session).

**Columns**
- Click a column name to rename it. × deletes the column and its cards (asks first if it has cards).
- "+ Column" adds a new one.

**Finding things**
- Search by title with the search box. Esc clears it.
- Filter by priority (All, High, Medium, Low, No priority).
- Sort by Manual (your drag order), Priority, or Due date. Sorting and filtering only change what you see, not the stored order.
- Overdue due dates are shown in red.

**Other**
- ☾ / ☀ toggles dark mode. Until you choose, it follows your OS setting.
- **Export** downloads the board as `backlog-YYYY-MM-DD.json`. **Import** replaces the current board with an exported file (after confirmation; invalid files are rejected without changes).

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `/` | Focus search (when not typing in a field) |
| Ctrl/Cmd + K | Focus search |
| Ctrl/Cmd + Z | Undo last card delete (when not typing in a field) |
| Esc | Clear search / cancel card edit |

## Data and storage

Everything is stored in this browser under these `localStorage` keys: `backlog.v1` (board), `backlog.filter`, `backlog.sort`, `backlog.theme`. Clearing site data erases the board, so use Export for backups. Data is not shared between browsers or devices; use Export / Import to move it.

## Project layout

```
src/
  main.tsx              entry point
  App.tsx               top bar, filter/sort/search, drag and drop, undo, import/export
  store.ts              board state, reducer, localStorage persistence, import validation
  components/Column.tsx column with card list and add box
  components/Card.tsx   sortable card and inline editor
  styles.css            theme variables (light/dark) and layout
```
