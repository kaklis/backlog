import { uid, type BoardState, type Card, type Column, type Priority } from './store'
import { toDateString } from './dates'

// ---------- RFC 4180 CSV ----------

/** Parses CSV text into rows of cells. Handles quoted fields, escaped quotes, embedded commas/newlines, CRLF and a BOM. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const src = text.replace(/^﻿/, '')
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else cell += ch
    } else if (ch === '"' && cell === '') quoted = true
    else if (ch === ',') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(cell)
      cell = ''
      rows.push(row)
      row = []
    } else cell += ch
  }
  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

const needsQuotes = /[",\r\n]/
const escapeCell = (v: string) => {
  // a leading = + - @ would be executed as a formula by Excel / Sheets; prefix it so imported text stays text
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v
  return needsQuotes.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map(escapeCell).join(',')).join('\r\n') + '\r\n'
}

// ---------- board <-> CSV ----------

export const CSV_HEADERS = ['Title', 'Status', 'Priority', 'Due date', 'Tags', 'Notes', 'Checklist', 'Repeat', 'Archived', 'Created']

export function boardToCsv(board: BoardState): string {
  const colName = (id: string) => board.columns.find((c) => c.id === id)?.name ?? ''
  const rows = board.cards.map((c) => [
    c.title,
    colName(c.columnId),
    c.priority ?? '',
    c.due ?? '',
    (c.tags ?? []).join('; '),
    c.notes ?? '',
    (c.checklist ?? []).map((i) => `${i.done ? '[x]' : '[ ]'} ${i.text}`).join('\n'),
    c.recurrence ?? '',
    c.archivedAt ? toDateString(new Date(c.archivedAt)) : '',
    toDateString(new Date(c.createdAt)),
  ])
  return toCsv([CSV_HEADERS, ...rows])
}

// Header names used by this app's own export and by common trackers (Jira, Linear, GitHub / Trello style exports).
const ALIASES: Record<string, string[]> = {
  title: ['title', 'summary', 'name', 'task', 'card name', 'issue'],
  status: ['status', 'state', 'column', 'list', 'list name', 'stage'],
  priority: ['priority', 'severity'],
  due: ['due date', 'due', 'due on', 'duedate', 'target date', 'deadline'],
  tags: ['tags', 'labels', 'label', 'components'],
  notes: ['notes', 'description', 'body', 'details', 'card description'],
  checklist: ['checklist'],
  recurrence: ['repeat', 'recurrence'],
  archived: ['archived'],
  created: ['created', 'created date', 'created at'],
}

const norm = (h: string) => h.trim().toLowerCase().replace(/\s+/g, ' ')

export function mapHeaders(header: string[]): Partial<Record<keyof typeof ALIASES, number>> {
  const out: Partial<Record<keyof typeof ALIASES, number>> = {}
  const names = header.map(norm)
  for (const [field, aliases] of Object.entries(ALIASES)) {
    // earlier aliases win, so "Title" beats "Name" when both exist
    for (const a of aliases) {
      const i = names.indexOf(a)
      if (i >= 0) {
        out[field] = i
        break
      }
    }
  }
  return out
}

/** Maps tracker priority words (Jira Highest/Lowest, Linear Urgent, P0-P3, ...) onto high / medium / low. */
export function parsePriority(raw: string): Priority | undefined {
  const v = raw.trim().toLowerCase()
  if (!v) return undefined
  if (/^(urgent|highest|critical|blocker|p0|p1|1|high|major)$/.test(v)) return 'high'
  if (/^(medium|normal|moderate|p2|2|med)$/.test(v)) return 'medium'
  if (/^(low|lowest|minor|trivial|p3|p4|3|4)$/.test(v)) return 'low'
  return undefined
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** Understands ISO dates, Jira's "15/Jan/31 3:00 PM", "Jan 15, 2031" and other things Date can parse; returns YYYY-MM-DD. */
export function parseDate(raw: string): string | undefined {
  const v = raw.trim()
  if (!v) return undefined
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(v)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const jira = /^(\d{1,2})\/([A-Za-z]{3})\/(\d{2,4})/.exec(v)
  if (jira) {
    const m = MONTHS.indexOf(jira[2].toLowerCase())
    if (m >= 0) {
      const y = jira[3].length === 2 ? 2000 + Number(jira[3]) : Number(jira[3])
      return toDateString(new Date(y, m, Number(jira[1])))
    }
  }
  const t = new Date(v)
  return Number.isNaN(t.getTime()) ? undefined : toDateString(t)
}

function parseChecklist(raw: string): Card['checklist'] {
  const items = raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = /^\[( |x|X)\]\s*(.*)$/.exec(l)
      return { id: uid(), text: (m ? m[2] : l).trim(), done: !!m && m[1] !== ' ' }
    })
    .filter((i) => i.text)
  return items.length ? items : undefined
}

export interface CsvImport {
  columns: Column[] // columns that did not exist yet
  cards: Card[]
  skipped: number // rows without a title
}

/**
 * Turns CSV text into cards for an existing board. Statuses are matched to existing columns by name (ignoring case);
 * unknown statuses create new columns, and rows without a status land in the first column.
 */
export function importCsv(text: string, board: BoardState): CsvImport {
  const rows = parseCsv(text)
  if (rows.length < 2) throw new Error('The CSV needs a header row and at least one card.')
  const h = mapHeaders(rows[0])
  if (h.title === undefined) throw new Error('No title column found. Expected a header such as "Title" or "Summary".')

  const columns: Column[] = []
  const all = () => [...board.columns, ...columns]
  const columnFor = (status: string): string => {
    const name = status.trim()
    if (!name) return board.columns[0]?.id ?? ensure('Backlog')
    return ensure(name)
  }
  function ensure(name: string): string {
    const found = all().find((c) => c.name.toLowerCase() === name.toLowerCase())
    if (found) return found.id
    const created = { id: uid(), name }
    columns.push(created)
    return created.id
  }

  const get = (row: string[], field: string) => {
    const i = h[field]
    const v = i === undefined ? '' : (row[i] ?? '').trim()
    return v.replace(/^'(?=[=+\-@])/, '') // undo the formula-injection guard added on export
  }
  const cards: Card[] = []
  let skipped = 0
  for (const row of rows.slice(1)) {
    const title = get(row, 'title')
    if (!title) {
      skipped++
      continue
    }
    const tags = get(row, 'tags')
      .split(/[;,]/)
      .map((t) => t.trim())
      .filter(Boolean)
    const recurrence = get(row, 'recurrence').toLowerCase()
    const created = parseDate(get(row, 'created'))
    const archived = get(row, 'archived')
    cards.push({
      id: uid(),
      title,
      columnId: columnFor(get(row, 'status')),
      createdAt: created ? new Date(`${created}T12:00:00`).getTime() : Date.now(),
      priority: parsePriority(get(row, 'priority')),
      due: parseDate(get(row, 'due')),
      tags: tags.length ? [...new Set(tags)] : undefined,
      notes: get(row, 'notes') || undefined,
      checklist: parseChecklist(get(row, 'checklist')),
      recurrence: recurrence === 'daily' || recurrence === 'weekly' || recurrence === 'monthly' ? recurrence : undefined,
      archivedAt: archived ? (parseDate(archived) ? new Date(`${parseDate(archived)}T12:00:00`).getTime() : Date.now()) : undefined,
    })
  }
  return { columns, cards, skipped }
}
