import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import type { BoardState } from './store'

const seed: BoardState = {
  columns: [
    { id: 'todo', name: 'Todo' },
    { id: 'done', name: 'Done' },
  ],
  cards: [
    { id: '1', title: 'Plain card', columnId: 'todo', createdAt: 1 },
    { id: '2', title: 'Low one', priority: 'low', due: '2031-03-01', columnId: 'todo', createdAt: 2 },
    { id: '3', title: 'High one', priority: 'high', due: '2031-05-01', tags: ['bug'], columnId: 'todo', createdAt: 3 },
    { id: '4', title: 'Medium one', priority: 'medium', due: '2031-01-01', tags: ['frontend'], columnId: 'done', createdAt: 4 },
  ],
}

function setup(board: BoardState = seed) {
  localStorage.setItem('backlog.v1', JSON.stringify(board))
  return { user: userEvent.setup(), ...render(<App />) }
}

const column = (name: string) => within(screen.getByRole('region', { name }))
const titles = (name: string) => column(name).queryAllByText(/./, { selector: '.card-title' }).map((e) => e.textContent)
const stored = (): BoardState => JSON.parse(localStorage.getItem('backlog.v1')!)

afterEach(() => vi.restoreAllMocks())

describe('adding and persisting', () => {
  it('adds a card with Enter and saves it to localStorage', async () => {
    const { user } = setup()
    await user.type(screen.getAllByPlaceholderText('+ Add card')[1], 'Ship it{Enter}')
    expect(titles('Done')).toContain('Ship it')
    expect(stored().cards.some((c) => c.title === 'Ship it' && c.columnId === 'done')).toBe(true)
  })

  it('ignores blank titles', async () => {
    const { user } = setup()
    await user.type(screen.getAllByPlaceholderText('+ Add card')[0], '   {Enter}')
    expect(stored().cards).toHaveLength(4)
  })

  it('starts with three default columns when nothing is stored', () => {
    render(<App />)
    expect(screen.getAllByLabelText('Column name').map((i) => (i as HTMLInputElement).value)).toEqual([
      'Backlog',
      'In progress',
      'Done',
    ])
  })
})

describe('filter, sort and search', () => {
  it('filters by priority and by "no priority"', async () => {
    const { user } = setup()
    await user.selectOptions(screen.getByLabelText('Filter by priority'), 'high')
    expect(titles('Todo')).toEqual(['High one'])
    expect(titles('Done')).toEqual([])
    await user.selectOptions(screen.getByLabelText('Filter by priority'), 'none')
    expect(titles('Todo')).toEqual(['Plain card'])
  })

  it('sorts by priority, with unprioritised cards last', async () => {
    const { user } = setup()
    await user.selectOptions(screen.getByLabelText('Sort cards'), 'priority')
    expect(titles('Todo')).toEqual(['High one', 'Low one', 'Plain card'])
  })

  it('sorts by due date, with undated cards last', async () => {
    const { user } = setup()
    await user.selectOptions(screen.getByLabelText('Sort cards'), 'due')
    expect(titles('Todo')).toEqual(['Low one', 'High one', 'Plain card'])
  })

  it('searches titles case-insensitively and clears with Escape', async () => {
    const { user } = setup()
    const search = screen.getByLabelText(/search cards/i)
    await user.type(search, 'HIGH')
    expect(titles('Todo')).toEqual(['High one'])
    await user.keyboard('{Escape}')
    expect(search).toHaveValue('')
    expect(titles('Todo')).toHaveLength(3)
  })

  it('searches tags too', async () => {
    const { user } = setup()
    await user.type(screen.getByLabelText(/search cards/i), 'front')
    expect(titles('Done')).toEqual(['Medium one'])
    expect(titles('Todo')).toEqual([])
  })

  it('filters by tag, and only offers the tag filter when tags exist', async () => {
    const { user } = setup()
    await user.selectOptions(screen.getByLabelText('Filter by tag'), 'bug')
    expect(titles('Todo')).toEqual(['High one'])
    expect(titles('Done')).toEqual([])
  })

  it('hides the tag filter when no card has tags', () => {
    setup({ ...seed, cards: seed.cards.map((c) => ({ ...c, tags: undefined })) })
    expect(screen.queryByLabelText('Filter by tag')).not.toBeInTheDocument()
  })

  it('remembers filter and sort across reloads', async () => {
    const { user, unmount } = setup()
    await user.selectOptions(screen.getByLabelText('Filter by priority'), 'low')
    await user.selectOptions(screen.getByLabelText('Sort cards'), 'due')
    unmount()
    render(<App />)
    expect(screen.getByLabelText('Filter by priority')).toHaveValue('low')
    expect(screen.getByLabelText('Sort cards')).toHaveValue('due')
  })

  it('ignores an unknown stored filter value', () => {
    localStorage.setItem('backlog.filter', 'bogus')
    setup()
    expect(screen.getByLabelText('Filter by priority')).toHaveValue('all')
  })

  it('does not change stored card order when sorting', async () => {
    const { user } = setup()
    await user.selectOptions(screen.getByLabelText('Sort cards'), 'priority')
    expect(stored().cards.map((c) => c.id)).toEqual(['1', '2', '3', '4'])
  })
})

describe('delete and undo', () => {
  const del = async (user: ReturnType<typeof userEvent.setup>, title: string) => {
    const card = screen.getByText(title).closest('.card') as HTMLElement
    await user.click(within(card).getByLabelText('Delete card'))
  }

  it('deletes a card and restores it with the Undo button, in place', async () => {
    const { user } = setup()
    await del(user, 'Low one')
    expect(titles('Todo')).toEqual(['Plain card', 'High one'])
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(titles('Todo')).toEqual(['Plain card', 'Low one', 'High one'])
    expect(screen.queryByText('Card deleted')).not.toBeInTheDocument()
  })

  it('undoes several deletes in reverse order with Ctrl+Z', async () => {
    const { user } = setup()
    await del(user, 'Plain card')
    await del(user, 'High one')
    await user.keyboard('{Control>}z{/Control}')
    expect(titles('Todo')).toEqual(['Low one', 'High one'])
    await user.keyboard('{Control>}z{/Control}')
    expect(titles('Todo')).toEqual(['Plain card', 'Low one', 'High one'])
  })

  it('does not hijack Ctrl+Z while typing in a field', async () => {
    const { user } = setup()
    await del(user, 'Plain card')
    await user.click(screen.getByLabelText(/search cards/i))
    await user.keyboard('{Control>}z{/Control}')
    expect(titles('Todo')).toEqual(['Low one', 'High one'])
  })
})

describe('card dialog', () => {
  it('shows tags, due date and checklist progress on the card', () => {
    setup({
      ...seed,
      cards: [
        {
          id: '9',
          title: 'Rich',
          columnId: 'todo',
          createdAt: 1,
          priority: 'high',
          tags: ['bug', 'api'],
          checklist: [
            { id: 'a', text: 'one', done: true },
            { id: 'b', text: 'two', done: false },
          ],
        },
      ],
    })
    const card = screen.getByText('Rich').closest('.card') as HTMLElement
    expect(within(card).getByText('bug')).toBeInTheDocument()
    expect(within(card).getByText('api')).toBeInTheDocument()
    expect(within(card).getByText('1/2')).toBeInTheDocument()
  })

  it('edits title, tags and checklist, then saves', async () => {
    const { user } = setup()
    await user.click(screen.getByText('Plain card'))
    const dialog = within(screen.getByRole('dialog', { name: 'Card details' }))
    await user.clear(dialog.getByLabelText('Title'))
    await user.type(dialog.getByLabelText('Title'), 'Renamed')
    await user.type(dialog.getByLabelText('Add tag'), 'urgent{Enter}')
    await user.type(dialog.getByLabelText('Add checklist item'), 'step one{Enter}step two{Enter}')
    await user.click(dialog.getByRole('checkbox', { name: 'step one' }))
    await user.click(dialog.getByRole('button', { name: 'Save' }))

    const saved = stored().cards.find((c) => c.id === '1')!
    expect(saved.title).toBe('Renamed')
    expect(saved.tags).toEqual(['urgent'])
    expect(saved.checklist?.map((i) => [i.text, i.done])).toEqual([
      ['step one', true],
      ['step two', false],
    ])
    expect(screen.getByText('1/2')).toBeInTheDocument()
  })

  it('keeps text left in the tag input when saving', async () => {
    const { user } = setup()
    await user.click(screen.getByText('Plain card'))
    const dialog = within(screen.getByRole('dialog'))
    await user.type(dialog.getByLabelText('Add tag'), 'pending')
    await user.click(dialog.getByRole('button', { name: 'Save' }))
    expect(stored().cards.find((c) => c.id === '1')!.tags).toEqual(['pending'])
  })

  it('does not add duplicate tags (case-insensitive) and removes the last tag with Backspace', async () => {
    const { user } = setup()
    await user.click(screen.getByText('Plain card'))
    const dialog = within(screen.getByRole('dialog'))
    const input = dialog.getByLabelText('Add tag')
    await user.type(input, 'Bug{Enter}bug{Enter}')
    expect(dialog.getAllByText(/^bug$/i)).toHaveLength(1)
    await user.type(input, '{Backspace}')
    expect(dialog.queryByText(/^bug$/i)).not.toBeInTheDocument()
  })

  it('moves the card to another column via Status', async () => {
    const { user } = setup()
    await user.click(screen.getByText('Plain card'))
    const dialog = within(screen.getByRole('dialog'))
    await user.selectOptions(dialog.getByLabelText('Status'), 'done')
    await user.click(dialog.getByRole('button', { name: 'Save' }))
    expect(titles('Done')).toContain('Plain card')
    expect(titles('Todo')).not.toContain('Plain card')
  })

  it('discards changes on Cancel', async () => {
    const { user } = setup()
    await user.click(screen.getByText('Plain card'))
    const dialog = within(screen.getByRole('dialog'))
    await user.type(dialog.getByLabelText('Title'), ' CHANGED')
    await user.click(dialog.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('Plain card')).toBeInTheDocument()
    expect(stored().cards.find((c) => c.id === '1')!.title).toBe('Plain card')
  })

  it('will not save an empty title', async () => {
    const { user } = setup()
    await user.click(screen.getByText('Plain card'))
    const dialog = within(screen.getByRole('dialog'))
    await user.clear(dialog.getByLabelText('Title'))
    expect(dialog.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('deletes from the dialog and offers undo', async () => {
    const { user } = setup()
    await user.click(screen.getByText('Plain card'))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /delete/i }))
    expect(screen.queryByText('Plain card')).not.toBeInTheDocument()
    expect(screen.getByText('Card deleted')).toBeInTheDocument()
  })
})

describe('columns', () => {
  it('adds and renames a column', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: /add column/i }))
    const names = screen.getAllByLabelText('Column name')
    expect(names).toHaveLength(3)
    await user.clear(names[2])
    await user.type(names[2], 'Review{Enter}')
    expect(stored().columns.map((c) => c.name)).toEqual(['Todo', 'Done', 'Review'])
  })

  it('asks before deleting a column that has cards', async () => {
    const { user } = setup()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await user.click(within(screen.getByRole('region', { name: 'Todo' })).getByLabelText('Delete column'))
    expect(confirmSpy).toHaveBeenCalled()
    expect(stored().columns).toHaveLength(2)
    confirmSpy.mockReturnValue(true)
    await user.click(within(screen.getByRole('region', { name: 'Todo' })).getByLabelText('Delete column'))
    expect(stored().columns.map((c) => c.id)).toEqual(['done'])
    expect(stored().cards.every((c) => c.columnId === 'done')).toBe(true)
  })
})

describe('import', () => {
  const file = (data: unknown) => new File([JSON.stringify(data)], 'board.json', { type: 'application/json' })
  const upload = (user: ReturnType<typeof userEvent.setup>, f: File) =>
    user.upload(document.querySelector('input[type="file"]') as HTMLInputElement, f)

  it('replaces the board after confirmation', async () => {
    const { user } = setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await upload(user, file({ columns: [{ id: 'x', name: 'Only' }], cards: [{ id: 'c', title: 'Imported', columnId: 'x' }] }))
    expect(await screen.findByText('Imported')).toBeInTheDocument()
    expect(stored().columns).toEqual([{ id: 'x', name: 'Only' }])
  })

  it('keeps the board when the user declines', async () => {
    const { user } = setup()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    await upload(user, file({ columns: [{ id: 'x', name: 'Only' }], cards: [] }))
    expect(stored().columns).toHaveLength(2)
  })

  it('rejects invalid files with an alert and leaves the board alone', async () => {
    const { user } = setup()
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    await upload(user, file({ nope: true }))
    await vi.waitFor(() => expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('Import failed')))
    expect(stored().cards).toHaveLength(4)
  })
})

describe('theme', () => {
  it('toggles and remembers the theme', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Toggle dark mode' }))
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(localStorage.getItem('backlog.theme')).toBe('dark')
    await user.click(screen.getByRole('button', { name: 'Toggle dark mode' }))
    expect(document.documentElement.dataset.theme).toBe('light')
  })
})
