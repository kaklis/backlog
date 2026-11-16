import { describe, expect, it } from 'vitest'
import { boardToCsv, importCsv, mapHeaders, parseCsv, parseDate, parsePriority, toCsv } from './csv'
import type { BoardState } from './store'

const board: BoardState = {
  columns: [
    { id: 'todo', name: 'Todo' },
    { id: 'done', name: 'Done' },
  ],
  cards: [],
}

describe('parseCsv', () => {
  it('splits rows and cells', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']])
  })
  it('handles quotes, escaped quotes, commas and newlines inside fields', () => {
    expect(parseCsv('t,n\n"Hello, ""world""","line1\nline2"')).toEqual([
      ['t', 'n'],
      ['Hello, "world"', 'line1\nline2'],
    ])
  })
  it('handles CRLF, a BOM, a missing final newline and blank lines', () => {
    expect(parseCsv('﻿a,b\r\n1,2\r\n\r\n3,4')).toEqual([['a', 'b'], ['1', '2'], ['3', '4']])
  })
  it('keeps empty cells', () => {
    expect(parseCsv('a,,c\n,,')).toEqual([['a', '', 'c']])
  })
})

describe('toCsv', () => {
  it('quotes only when needed and doubles quotes', () => {
    expect(toCsv([['plain', 'a,b', 'say "hi"', 'two\nlines']])).toBe('plain,"a,b","say ""hi""","two\nlines"\r\n')
  })
  it('defuses spreadsheet formulas', () => {
    expect(toCsv([['=SUM(A1)', '+1', '-2', '@x', 'safe']])).toBe("'=SUM(A1),'+1,'-2,'@x,safe\r\n")
  })
  it('round-trips through parseCsv', () => {
    const rows = [['a', 'b,c', 'd"e', 'f\ng'], ['', 'x', '', 'y']]
    expect(parseCsv(toCsv(rows))).toEqual(rows)
  })
})

describe('field parsing', () => {
  it('maps tracker priorities onto high / medium / low', () => {
    for (const v of ['Urgent', 'Highest', 'High', 'P1', 'Critical', 'Blocker']) expect(parsePriority(v)).toBe('high')
    for (const v of ['Medium', 'Normal', 'P2']) expect(parsePriority(v)).toBe('medium')
    for (const v of ['Low', 'Lowest', 'Minor', 'P3']) expect(parsePriority(v)).toBe('low')
    for (const v of ['', 'No priority', 'whatever']) expect(parsePriority(v)).toBeUndefined()
  })

  it('parses ISO, Jira and free-form dates', () => {
    expect(parseDate('2031-02-03')).toBe('2031-02-03')
    expect(parseDate('2031-02-03T10:00:00.000Z')).toBe('2031-02-03')
    expect(parseDate('15/Jan/31 3:00 PM')).toBe('2031-01-15')
    expect(parseDate('3/Feb/2031')).toBe('2031-02-03')
    expect(parseDate('January 5, 2031')).toBe('2031-01-05')
    expect(parseDate('')).toBeUndefined()
    expect(parseDate('not a date')).toBeUndefined()
  })

  it('recognises headers from this app, Jira, Linear and GitHub-style exports', () => {
    expect(mapHeaders(['Title', 'Status', 'Priority', 'Due date', 'Tags', 'Notes'])).toMatchObject({ title: 0, status: 1, priority: 2, due: 3, tags: 4, notes: 5 })
    expect(mapHeaders(['Issue key', 'Summary', 'Status', 'Priority', 'Labels', 'Description', 'Due Date'])).toMatchObject({ title: 1, status: 2, priority: 3, tags: 4, notes: 5, due: 6 })
    expect(mapHeaders(['ID', 'Title', 'Status', 'Priority', 'Labels', 'Due Date', 'Description'])).toMatchObject({ title: 1, status: 2, tags: 4, due: 5 })
    expect(mapHeaders(['Title', 'State', 'Labels', 'Assignees', 'Body'])).toMatchObject({ title: 0, status: 1, tags: 2, notes: 4 })
  })
})

describe('importCsv', () => {
  it('imports cards into matching columns (case-insensitive) and creates unknown ones', () => {
    const csv = 'Title,Status,Priority,Due date,Tags,Notes\n' +
      'One,todo,High,2031-02-03,"a; b",Some notes\n' +
      'Two,In Review,Low,,,\n' +
      'Three,DONE,,,,\n'
    const r = importCsv(csv, board)
    expect(r.columns.map((c) => c.name)).toEqual(['In Review'])
    expect(r.cards.map((c) => c.title)).toEqual(['One', 'Two', 'Three'])
    expect(r.cards[0]).toMatchObject({ columnId: 'todo', priority: 'high', due: '2031-02-03', tags: ['a', 'b'], notes: 'Some notes' })
    expect(r.cards[1].columnId).toBe(r.columns[0].id)
    expect(r.cards[2].columnId).toBe('done')
    expect(new Set(r.cards.map((c) => c.id)).size).toBe(3)
  })

  it('reuses one new column for several cards and puts status-less rows in the first column', () => {
    const r = importCsv('Title,Status\nA,Waiting\nB,waiting\nC,', board)
    expect(r.columns).toHaveLength(1)
    expect(r.cards[0].columnId).toBe(r.cards[1].columnId)
    expect(r.cards[2].columnId).toBe('todo')
  })

  it('imports a Jira-style export', () => {
    const csv = 'Issue key,Summary,Status,Priority,Labels,Description,Due Date\n' +
      'PRJ-1,"Fix login, again",To Do,Highest,bug,"Steps:\n1. open",15/Jan/31 3:00 PM\n'
    const r = importCsv(csv, board)
    expect(r.cards[0]).toMatchObject({ title: 'Fix login, again', priority: 'high', due: '2031-01-15', tags: ['bug'], notes: 'Steps:\n1. open' })
    expect(r.columns.map((c) => c.name)).toEqual(['To Do'])
  })

  it('skips rows without a title and reports how many', () => {
    const r = importCsv('Title,Status\nKeep,Todo\n,Todo\n  ,Done', board)
    expect(r.cards).toHaveLength(1)
    expect(r.skipped).toBe(2)
  })

  it('rejects files without a title column or without rows', () => {
    expect(() => importCsv('Foo,Bar\n1,2', board)).toThrow(/title/i)
    expect(() => importCsv('Title', board)).toThrow(/header/i)
  })

  it('works with an empty board by creating a column', () => {
    const r = importCsv('Title\nA', { columns: [], cards: [] })
    expect(r.columns).toHaveLength(1)
    expect(r.cards[0].columnId).toBe(r.columns[0].id)
  })
})

describe('boardToCsv', () => {
  it('exports one row per card with readable column names', () => {
    const csv = boardToCsv({
      columns: board.columns,
      cards: [
        {
          id: '1', title: 'Hello, "world"', columnId: 'done', createdAt: new Date(2031, 0, 5, 12).getTime(), priority: 'high',
          due: '2031-02-03', tags: ['a', 'b'], notes: 'n', recurrence: 'weekly',
          checklist: [{ id: 'i', text: 'one', done: true }, { id: 'j', text: 'two', done: false }],
        },
      ],
    })
    const [header, row] = parseCsv(csv)
    expect(header[0]).toBe('Title')
    expect(row).toEqual(['Hello, "world"', 'Done', 'high', '2031-02-03', 'a; b', 'n', '[x] one\n[ ] two', 'weekly', '', '2031-01-05'])
  })

  it('round-trips through import', () => {
    const original: BoardState = {
      columns: board.columns,
      cards: [
        {
          id: '1', title: '=1+1', columnId: 'todo', createdAt: new Date(2031, 0, 5, 12).getTime(), priority: 'low',
          due: '2031-02-03', tags: ['x'], notes: '- item\nsecond', checklist: [{ id: 'i', text: 'one', done: true }],
        },
      ],
    }
    const back = importCsv(boardToCsv(original), board).cards[0]
    expect(back).toMatchObject({ title: '=1+1', columnId: 'todo', priority: 'low', due: '2031-02-03', tags: ['x'], notes: '- item\nsecond' })
    expect(back.checklist).toMatchObject([{ text: 'one', done: true }])
  })
})
