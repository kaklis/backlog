import { describe, expect, it } from 'vitest'
import { historyReducer, parseBoard, reducer, type BoardState, type Card } from './store'

const card = (id: string, columnId = 'a', extra: Partial<Card> = {}): Card => ({
  id,
  title: id.toUpperCase(),
  columnId,
  createdAt: 1,
  ...extra,
})
const board = (cards: Card[]): BoardState => ({
  columns: [
    { id: 'a', name: 'A' },
    { id: 'b', name: 'B' },
  ],
  cards,
})
const ids = (s: BoardState, col?: string) => s.cards.filter((c) => !col || c.columnId === col).map((c) => c.id)

describe('reducer', () => {
  it('adds a card to the end of its column', () => {
    const s = reducer(board([card('x')]), { type: 'addCard', columnId: 'b', title: 'New' })
    expect(s.cards).toHaveLength(2)
    expect(s.cards[1]).toMatchObject({ title: 'New', columnId: 'b' })
    expect(s.cards[1].id).toBeTruthy()
  })

  it('patches only the given fields', () => {
    const s = reducer(board([card('x', 'a', { notes: 'keep' })]), {
      type: 'updateCard',
      id: 'x',
      patch: { title: 'Renamed', priority: 'high' },
    })
    expect(s.cards[0]).toMatchObject({ title: 'Renamed', priority: 'high', notes: 'keep', columnId: 'a' })
  })

  it('clears a field when the patch sets it to undefined', () => {
    const s = reducer(board([card('x', 'a', { due: '2030-01-01' })]), {
      type: 'updateCard',
      id: 'x',
      patch: { due: undefined },
    })
    expect(s.cards[0].due).toBeUndefined()
  })

  it('deletes a card', () => {
    expect(ids(reducer(board([card('x'), card('y')]), { type: 'deleteCard', id: 'x' }))).toEqual(['y'])
  })

  describe('moveCard', () => {
    const base = board([card('1'), card('2'), card('3'), card('4', 'b'), card('5', 'b')])

    it('moves to another column, before the card it is dropped on', () => {
      const s = reducer(base, { type: 'moveCard', id: '1', columnId: 'b', overId: '5' })
      expect(ids(s, 'b')).toEqual(['4', '1', '5'])
      expect(ids(s, 'a')).toEqual(['2', '3'])
    })

    it('appends when dropped on a column rather than a card', () => {
      const s = reducer(base, { type: 'moveCard', id: '1', columnId: 'b' })
      expect(ids(s, 'b')).toEqual(['4', '5', '1'])
    })

    it('reorders within a column: dragging down lands after the target', () => {
      const s = reducer(base, { type: 'moveCard', id: '1', columnId: 'a', overId: '3' })
      expect(ids(s, 'a')).toEqual(['2', '3', '1'])
    })

    it('reorders within a column: dragging up lands before the target', () => {
      const s = reducer(base, { type: 'moveCard', id: '3', columnId: 'a', overId: '1' })
      expect(ids(s, 'a')).toEqual(['3', '1', '2'])
    })

    it('ignores unknown cards', () => {
      expect(reducer(base, { type: 'moveCard', id: 'nope', columnId: 'b' })).toBe(base)
    })
  })

  it('adds, renames and deletes columns (deleting removes its cards)', () => {
    let s = reducer(board([card('x'), card('y', 'b')]), { type: 'addColumn', name: 'C' })
    expect(s.columns.map((c) => c.name)).toEqual(['A', 'B', 'C'])
    s = reducer(s, { type: 'renameColumn', id: 'a', name: 'Todo' })
    expect(s.columns[0].name).toBe('Todo')
    s = reducer(s, { type: 'deleteColumn', id: 'a' })
    expect(s.columns.map((c) => c.id)).not.toContain('a')
    expect(ids(s)).toEqual(['y'])
  })

  it('replaces the whole board', () => {
    const next = board([card('z')])
    expect(reducer(board([card('x')]), { type: 'replace', state: next })).toBe(next)
  })
})

describe('parseBoard', () => {
  const valid = {
    columns: [{ id: 'a', name: 'A' }],
    cards: [{ id: 'x', title: 'X', columnId: 'a' }],
  }

  it('accepts a minimal board and fills in defaults', () => {
    const s = parseBoard(valid)
    expect(s.columns).toEqual([{ id: 'a', name: 'A' }])
    expect(s.cards[0]).toMatchObject({ id: 'x', title: 'X', columnId: 'a' })
    expect(typeof s.cards[0].createdAt).toBe('number')
  })

  it('round-trips a board through JSON', () => {
    const original = board([
      card('x', 'a', {
        notes: 'n',
        priority: 'high',
        due: '2030-02-03',
        tags: ['bug'],
        checklist: [{ id: 'i', text: 'step', done: true }],
      }),
    ])
    expect(parseBoard(JSON.parse(JSON.stringify(original)))).toEqual(original)
  })

  it.each([
    ['null', null],
    ['no columns', { cards: [] }],
    ['no cards', { columns: [] }],
    ['a column without a name', { columns: [{ id: 'a' }], cards: [] }],
    ['duplicate column ids', { columns: [{ id: 'a', name: 'A' }, { id: 'a', name: 'B' }], cards: [] }],
    ['a card without a title', { columns: [{ id: 'a', name: 'A' }], cards: [{ id: 'x', columnId: 'a' }] }],
    [
      'a card in a missing column',
      { columns: [{ id: 'a', name: 'A' }], cards: [{ id: 'x', title: 'X', columnId: 'zzz' }] },
    ],
  ])('rejects %s', (_name, data) => {
    expect(() => parseBoard(data)).toThrow()
  })

  it('drops invalid optional fields instead of failing', () => {
    const s = parseBoard({
      columns: [{ id: 'a', name: 'A' }],
      cards: [{ id: 'x', title: 'X', columnId: 'a', priority: 'urgent', due: 'tomorrow', notes: 5, tags: 'bug' }],
    })
    expect(s.cards[0]).toMatchObject({ priority: undefined, due: undefined, notes: undefined, tags: undefined })
  })

  it('trims, de-duplicates and filters tags and checklist items', () => {
    const s = parseBoard({
      columns: [{ id: 'a', name: 'A' }],
      cards: [
        {
          id: 'x',
          title: 'X',
          columnId: 'a',
          tags: [' bug ', 'bug', '', 3],
          checklist: [{ text: ' a ', done: true }, { text: '   ' }, 'junk', { id: 'k', text: 'b' }],
        },
      ],
    })
    expect(s.cards[0].tags).toEqual(['bug'])
    expect(s.cards[0].checklist).toHaveLength(2)
    expect(s.cards[0].checklist![0]).toMatchObject({ text: 'a', done: true })
    expect(s.cards[0].checklist![0].id).toBeTruthy()
    expect(s.cards[0].checklist![1]).toEqual({ id: 'k', text: 'b', done: false })
  })
})

describe('archive', () => {
  it('archives and restores a single card, keeping its column and position', () => {
    const start = board([card('1'), card('2'), card('3')])
    const archived = reducer(start, { type: 'archiveCard', id: '2' })
    expect(archived.cards.find((c) => c.id === '2')!.archivedAt).toBeTypeOf('number')
    expect(archived.cards.map((c) => c.id)).toEqual(['1', '2', '3'])
    const back = reducer(archived, { type: 'unarchiveCard', id: '2' })
    expect(back.cards.find((c) => c.id === '2')!.archivedAt).toBeUndefined()
    expect(back.cards.find((c) => c.id === '2')!.columnId).toBe('a')
  })

  it('archives several cards at once and leaves the rest alone', () => {
    const s = reducer(board([card('1'), card('2'), card('3', 'b')]), { type: 'archiveCards', ids: ['1', '3'] })
    expect(s.cards.map((c) => !!c.archivedAt)).toEqual([true, false, true])
  })

  it('keeps the original timestamp when archiving twice', () => {
    const once = reducer(board([card('1', 'a', { archivedAt: 123 })]), { type: 'archiveCard', id: '1' })
    expect(once.cards[0].archivedAt).toBe(123)
  })

  it('survives an import round trip', () => {
    const original = board([card('1', 'a', { archivedAt: 5 })])
    expect(parseBoard(JSON.parse(JSON.stringify(original)))).toEqual(original)
  })
})

describe('undo history', () => {
  const start: ReturnType<typeof historyReducer> = { present: board([card('1'), card('2')]), past: [], future: [] }
  const run = (h: ReturnType<typeof historyReducer>, ...actions: Parameters<typeof historyReducer>[1][]) =>
    actions.reduce(historyReducer, h)

  it('undoes and redoes a change', () => {
    const changed = run(start, { type: 'deleteCard', id: '1' })
    expect(ids(changed.present)).toEqual(['2'])
    const undone = run(changed, { type: 'undo' })
    expect(ids(undone.present)).toEqual(['1', '2'])
    expect(ids(run(undone, { type: 'redo' }).present)).toEqual(['2'])
  })

  it('undoes step by step in reverse order', () => {
    const h = run(start, { type: 'deleteCard', id: '1' }, { type: 'deleteCard', id: '2' })
    expect(ids(run(h, { type: 'undo' }).present)).toEqual(['2'])
    expect(ids(run(h, { type: 'undo' }, { type: 'undo' }).present)).toEqual(['1', '2'])
  })

  it('does nothing when there is nothing to undo or redo', () => {
    expect(run(start, { type: 'undo' })).toBe(start)
    expect(run(start, { type: 'redo' })).toBe(start)
  })

  it('a new change after undo clears the redo stack', () => {
    const h = run(start, { type: 'deleteCard', id: '1' }, { type: 'undo' }, { type: 'deleteCard', id: '2' })
    expect(h.future).toEqual([])
    expect(run(h, { type: 'redo' })).toBe(h)
  })

  it('does not record actions that change nothing', () => {
    expect(run(start, { type: 'moveCard', id: '1', columnId: 'a', overId: '2' }).past.length).toBe(1) // a real move
    // card 2 is already last in column a, so appending it there changes nothing
    expect(run(start, { type: 'moveCard', id: '2', columnId: 'a' }).past.length).toBe(0)
    expect(run(start, { type: 'deleteCard', id: 'missing' }).past.length).toBe(0)
  })

  it('undoes deleting a column together with its cards', () => {
    const h = run(start, { type: 'deleteColumn', id: 'a' })
    expect(h.present.cards).toHaveLength(0)
    expect(ids(run(h, { type: 'undo' }).present)).toEqual(['1', '2'])
  })

  it('treats a whole drag as one undo step', () => {
    let h = run(start, { type: 'beginDrag' })
    h = run(h, { type: 'moveCard', id: '1', columnId: 'b', transient: true })
    h = run(h, { type: 'moveCard', id: '1', columnId: 'b', overId: '2', transient: true })
    h = run(h, { type: 'endDrag', cancelled: false })
    expect(h.present.cards.find((c) => c.id === '1')!.columnId).toBe('b')
    expect(h.past).toHaveLength(1)
    expect(run(h, { type: 'undo' }).present).toBe(start.present)
  })

  it('rolls a cancelled drag back without leaving an undo step', () => {
    let h = run(start, { type: 'beginDrag' })
    h = run(h, { type: 'moveCard', id: '1', columnId: 'b', transient: true })
    h = run(h, { type: 'endDrag', cancelled: true })
    expect(h.present).toBe(start.present)
    expect(h.past).toHaveLength(0)
  })

  it('a drag that ends where it started leaves no undo step', () => {
    const h = run(start, { type: 'beginDrag' }, { type: 'endDrag', cancelled: false })
    expect(h.past).toHaveLength(0)
  })

  it('caps the history length', () => {
    let h = start
    for (let i = 0; i < 150; i++) h = run(h, { type: 'addCard', columnId: 'a', title: `t${i}` })
    expect(h.past.length).toBe(100)
  })
})
