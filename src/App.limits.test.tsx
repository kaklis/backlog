import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { toDateString } from './dates'
import type { BoardState } from './store'

// Pin "today" to Wednesday 2031-01-15 so due-date filters are deterministic.
const NOW = new Date(2031, 0, 15, 12)
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW })
})
afterEach(() => vi.useRealTimers())

const offset = (days: number) => toDateString(new Date(2031, 0, 15 + days))

const board = (over: Partial<BoardState> = {}): BoardState => ({
  columns: [
    { id: 'todo', name: 'Todo' },
    { id: 'done', name: 'Done' },
  ],
  cards: [
    { id: '1', title: 'Late', due: offset(-2), columnId: 'todo', createdAt: 1 },
    { id: '2', title: 'Today', due: offset(0), columnId: 'todo', createdAt: 2 },
    { id: '3', title: 'Friday', due: offset(2), columnId: 'todo', createdAt: 3 },
    { id: '4', title: 'Next Monday', due: offset(5), columnId: 'done', createdAt: 4 },
    { id: '5', title: 'Someday', columnId: 'done', createdAt: 5 },
  ],
  ...over,
})

function setup(b: BoardState = board()) {
  localStorage.setItem('backlog.v1', JSON.stringify(b))
  return { user: userEvent.setup({ advanceTimers: () => {} }), ...render(<App />) }
}

const column = (name: string) => within(screen.getByRole('region', { name }))
const titles = (name: string) => column(name).queryAllByText(/./, { selector: '.card-title' }).map((e) => e.textContent)
const stored = (): BoardState => JSON.parse(localStorage.getItem('backlog.v1')!)

describe('due date filter', () => {
  const shown = () => [...titles('Todo'), ...titles('Done')]
  const pick = (user: ReturnType<typeof userEvent.setup>, value: string) =>
    user.selectOptions(screen.getByLabelText('Filter by due date'), value)

  it('shows everything by default', () => {
    setup()
    expect(shown()).toEqual(['Late', 'Today', 'Friday', 'Next Monday', 'Someday'])
  })

  it('filters overdue cards', async () => {
    const { user } = setup()
    await pick(user, 'overdue')
    expect(shown()).toEqual(['Late'])
  })

  it('filters cards due today', async () => {
    const { user } = setup()
    await pick(user, 'today')
    expect(shown()).toEqual(['Today'])
  })

  it('filters cards due this week (today through Sunday)', async () => {
    const { user } = setup()
    await pick(user, 'week')
    expect(shown()).toEqual(['Today', 'Friday'])
  })

  it('filters cards without a due date', async () => {
    const { user } = setup()
    await pick(user, 'none')
    expect(shown()).toEqual(['Someday'])
  })

  it('combines with the priority filter and search', async () => {
    const { user } = setup({
      ...board(),
      cards: board().cards.map((c) => (c.id === '2' ? { ...c, priority: 'high' as const } : c)),
    })
    await pick(user, 'week')
    await user.selectOptions(screen.getByLabelText('Filter by priority'), 'high')
    expect(shown()).toEqual(['Today'])
    await user.type(screen.getByLabelText(/search cards/i), 'zzz')
    expect(shown()).toEqual([])
  })

  it('remembers the choice across reloads and ignores an unknown stored value', async () => {
    const { user, unmount } = setup()
    await pick(user, 'week')
    unmount()
    const second = render(<App />)
    expect(screen.getByLabelText('Filter by due date')).toHaveValue('week')
    second.unmount()
    localStorage.setItem('backlog.due', 'bogus')
    render(<App />)
    expect(screen.getByLabelText('Filter by due date')).toHaveValue('any')
  })

  it('does not touch archived cards or stored data', async () => {
    const { user } = setup()
    await pick(user, 'overdue')
    expect(stored().cards).toHaveLength(5)
  })
})

describe('WIP limits', () => {
  const pill = (column_: string) => column(column_).getByTitle(/wip limit/i)
  const withLimit = (limit: number): BoardState => ({
    ...board(),
    columns: [
      { id: 'todo', name: 'Todo', wipLimit: limit },
      { id: 'done', name: 'Done' },
    ],
  })

  it('shows a plain count when no limit is set', () => {
    setup()
    expect(pill('Todo')).toHaveTextContent('3')
    expect(pill('Todo')).not.toHaveClass('over')
  })

  it('shows used/limit and flags a full column', () => {
    setup(withLimit(3))
    expect(pill('Todo')).toHaveTextContent('3/3')
    expect(pill('Todo')).toHaveClass('full')
    expect(screen.getByRole('region', { name: 'Todo' })).not.toHaveClass('over-limit')
  })

  it('warns when a column is over its limit', () => {
    setup(withLimit(2))
    expect(pill('Todo')).toHaveTextContent('3/2')
    expect(pill('Todo')).toHaveClass('over')
    expect(screen.getByRole('region', { name: 'Todo' })).toHaveClass('over-limit')
    expect(pill('Todo')).toHaveAttribute('title', expect.stringMatching(/over the wip limit of 2/i))
  })

  it('is under the limit with room to spare', () => {
    setup(withLimit(10))
    expect(pill('Todo')).toHaveTextContent('3/10')
    expect(pill('Todo')).not.toHaveClass('over')
    expect(pill('Todo')).not.toHaveClass('full')
  })

  it('sets a limit from the count pill', async () => {
    const { user } = setup()
    await user.click(pill('Todo'))
    await user.type(screen.getByLabelText('WIP limit'), '2{Enter}')
    expect(stored().columns[0].wipLimit).toBe(2)
    expect(pill('Todo')).toHaveTextContent('3/2')
  })

  it('clears the limit with an empty value, and ignores zero or negative input', async () => {
    const { user } = setup(withLimit(5))
    await user.click(pill('Todo'))
    await user.clear(screen.getByLabelText('WIP limit'))
    await user.keyboard('{Enter}')
    expect(stored().columns[0].wipLimit).toBeUndefined()

    await user.click(pill('Todo'))
    await user.type(screen.getByLabelText('WIP limit'), '0{Enter}')
    expect(stored().columns[0].wipLimit).toBeUndefined()
  })

  it('Escape cancels without saving', async () => {
    const { user } = setup(withLimit(5))
    await user.click(pill('Todo'))
    await user.type(screen.getByLabelText('WIP limit'), '9{Escape}')
    expect(stored().columns[0].wipLimit).toBe(5)
    expect(screen.queryByLabelText('WIP limit')).not.toBeInTheDocument()
  })

  it('is based on active cards: archived ones do not count, hidden-by-filter ones do', async () => {
    const { user } = setup({
      ...withLimit(2),
      cards: [
        ...board().cards,
        { id: '9', title: 'Old', columnId: 'todo', createdAt: 9, archivedAt: 1 },
      ],
    })
    expect(pill('Todo')).toHaveTextContent('3/2') // the archived card is ignored
    await user.selectOptions(screen.getByLabelText('Filter by due date'), 'overdue')
    expect(titles('Todo')).toEqual(['Late'])
    expect(pill('Todo')).toHaveTextContent('3/2') // still measures the whole column
  })

  it('does not block adding cards over the limit', async () => {
    const { user } = setup(withLimit(3))
    await user.type(screen.getAllByPlaceholderText('+ Add card')[0], 'One more{Enter}')
    expect(titles('Todo')).toContain('One more')
    expect(pill('Todo')).toHaveTextContent('4/3')
    expect(pill('Todo')).toHaveClass('over')
  })

  it('setting a limit can be undone', async () => {
    const { user } = setup()
    await user.click(pill('Todo'))
    await user.type(screen.getByLabelText('WIP limit'), '2{Enter}')
    await user.click(document.body)
    await user.keyboard('{Control>}z{/Control}')
    expect(stored().columns[0].wipLimit).toBeUndefined()
  })
})
