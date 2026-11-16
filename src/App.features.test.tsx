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
    { id: '4', title: 'Medium one', priority: 'medium', due: '2031-01-01', columnId: 'done', createdAt: 4 },
  ],
}

function setup(board: BoardState = seed) {
  localStorage.setItem('backlog.v1', JSON.stringify(board))
  return { user: userEvent.setup(), ...render(<App />) }
}

const column = (name: string) => within(screen.getByRole('region', { name }))
const titles = (name: string) => column(name).queryAllByText(/./, { selector: '.card-title' }).map((e) => e.textContent)
const stored = (): BoardState => JSON.parse(localStorage.getItem('backlog.v1')!)
const cardEl = (title: string) => screen.getByText(title).closest('.card') as HTMLElement
const cardOf = (id: string) => stored().cards.find((c) => c.id === id)!

afterEach(() => vi.restoreAllMocks())

describe('archive', () => {
  it('archives a card from its dialog, lists it in the archive and restores it', async () => {
    const { user } = setup()
    await user.click(screen.getByText('Plain card'))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /archive/i }))
    expect(screen.queryByText('Plain card')).not.toBeInTheDocument()
    expect(cardOf('1').archivedAt).toBeTypeOf('number')
    expect(titles('Todo')).toEqual(['Low one', 'High one'])

    await user.click(screen.getByRole('button', { name: /^archive\s*1$/i }))
    const panel = within(screen.getByRole('dialog', { name: 'Archive' }))
    expect(panel.getByText('Plain card')).toBeInTheDocument()
    await user.click(panel.getByRole('button', { name: /restore/i }))
    await user.click(panel.getByRole('button', { name: 'Close' }))
    expect(titles('Todo')).toContain('Plain card')
  })

  it('archives every visible card in a column and respects the active filter', async () => {
    const { user } = setup()
    await user.selectOptions(screen.getByLabelText('Filter by priority'), 'high')
    await user.click(column('Todo').getByLabelText('Archive all cards in column'))
    expect(stored().cards.filter((c) => c.archivedAt).map((c) => c.id)).toEqual(['3'])
  })

  it('shows an empty state and permanently deletes from the archive', async () => {
    const { user } = setup({ ...seed, cards: [{ ...seed.cards[0], archivedAt: 5 }] })
    await user.click(screen.getByRole('button', { name: /^archive(\s*\d+)?$/i }))
    const panel = within(screen.getByRole('dialog', { name: 'Archive' }))
    await user.click(panel.getByRole('button', { name: /delete plain card permanently/i }))
    expect(panel.getByText(/nothing archived/i)).toBeInTheDocument()
    expect(stored().cards).toHaveLength(0)
  })

  it('archived cards do not count toward tags or search', async () => {
    const { user } = setup({
      ...seed,
      cards: [{ id: 'z', title: 'Hidden', tags: ['secret'], columnId: 'todo', createdAt: 1, archivedAt: 1 }],
    })
    expect(screen.queryByLabelText('Filter by tag')).not.toBeInTheDocument()
    await user.type(screen.getByLabelText(/search cards/i), 'hidden')
    expect(titles('Todo')).toEqual([])
  })

  it('offers undo after archiving a whole column', async () => {
    const { user } = setup()
    await user.click(column('Todo').getByLabelText('Archive all cards in column'))
    expect(titles('Todo')).toEqual([])
    expect(screen.getByText('3 cards archived')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(titles('Todo')).toHaveLength(3)
  })
})

describe('undo and redo', () => {
  const ctrl = (key: string, shift = false) =>
    `{Control>}${shift ? '{Shift>}' : ''}${key}${shift ? '{/Shift}' : ''}{/Control}`

  it('undoes a deleted column together with its cards, via the toast', async () => {
    const { user } = setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await user.click(column('Todo').getByLabelText('Delete column'))
    expect(screen.queryByRole('region', { name: 'Todo' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(titles('Todo')).toHaveLength(3)
  })

  it('undoes edits and moves made in the dialog, and redoes them', async () => {
    const { user } = setup()
    await user.click(screen.getByText('Plain card'))
    const dialog = within(screen.getByRole('dialog'))
    await user.type(dialog.getByLabelText('Title'), ' v2')
    await user.selectOptions(dialog.getByLabelText('Status'), 'done')
    await user.click(dialog.getByRole('button', { name: 'Save' }))
    expect(titles('Done')).toContain('Plain card v2')

    await user.keyboard(ctrl('z'))
    expect(titles('Done')).not.toContain('Plain card v2')
    await user.keyboard(ctrl('z', true))
    expect(titles('Done')).toContain('Plain card v2')
  })

  it('undoes an added card', async () => {
    const { user } = setup()
    await user.type(screen.getAllByPlaceholderText('+ Add card')[0], 'Temp{Enter}')
    expect(titles('Todo')).toContain('Temp')
    await user.click(document.body)
    await user.keyboard(ctrl('z'))
    expect(titles('Todo')).not.toContain('Temp')
  })

  it('does not undo while a card dialog is open', async () => {
    const { user } = setup()
    await user.click(within(cardEl('Low one')).getByLabelText('Delete card'))
    await user.click(screen.getByText('Plain card'))
    await user.keyboard(ctrl('z'))
    expect(titles('Todo')).not.toContain('Low one')
  })
})

describe('keyboard', () => {
  const focus = (title: string) => cardEl(title).focus()

  it('moves focus between cards and columns with the arrow keys', async () => {
    const { user } = setup()
    focus('Plain card')
    await user.keyboard('{ArrowDown}')
    expect(cardEl('Low one')).toHaveFocus()
    await user.keyboard('{ArrowUp}{ArrowUp}')
    expect(cardEl('Plain card')).toHaveFocus() // stays at the edge
    await user.keyboard('{ArrowRight}')
    expect(cardEl('Medium one')).toHaveFocus()
    await user.keyboard('{ArrowLeft}')
    expect(cardEl('Plain card')).toHaveFocus()
  })

  it('reorders with Shift+Up/Down and keeps focus on the card', async () => {
    const { user } = setup()
    focus('Plain card')
    await user.keyboard('{Shift>}{ArrowDown}{/Shift}')
    expect(titles('Todo')).toEqual(['Low one', 'Plain card', 'High one'])
    expect(cardEl('Plain card')).toHaveFocus()
    await user.keyboard('{Shift>}{ArrowUp}{ArrowUp}{/Shift}')
    expect(titles('Todo')).toEqual(['Plain card', 'Low one', 'High one'])
  })

  it('does not reorder while the column is sorted automatically', async () => {
    const { user } = setup()
    await user.selectOptions(screen.getByLabelText('Sort cards'), 'priority')
    focus('Plain card')
    await user.keyboard('{Shift>}{ArrowUp}{/Shift}')
    expect(stored().cards.map((c) => c.id)).toEqual(['1', '2', '3', '4'])
  })

  it('moves a card to the next column with Shift+Right', async () => {
    const { user } = setup()
    focus('Plain card')
    await user.keyboard('{Shift>}{ArrowRight}{/Shift}')
    expect(titles('Done')).toContain('Plain card')
    expect(cardEl('Plain card')).toHaveFocus()
    await user.keyboard('{Shift>}{ArrowRight}{/Shift}') // no further column: stays
    expect(titles('Done')).toContain('Plain card')
  })

  it('sets and clears priority with 1 2 3 0', async () => {
    const { user } = setup()
    focus('Plain card')
    await user.keyboard('1')
    expect(cardOf('1').priority).toBe('high')
    await user.keyboard('3')
    expect(cardOf('1').priority).toBe('low')
    await user.keyboard('0')
    expect(cardOf('1').priority).toBeUndefined()
  })

  it('opens details with Enter', async () => {
    const { user } = setup()
    focus('Plain card')
    await user.keyboard('{Enter}')
    expect(screen.getByRole('dialog', { name: 'Card details' })).toBeInTheDocument()
  })

  it('archives with a and deletes with x, moving focus to a neighbour', async () => {
    const { user } = setup()
    focus('Low one')
    await user.keyboard('a')
    expect(cardOf('2').archivedAt).toBeTypeOf('number')
    expect(cardEl('High one')).toHaveFocus()
    await user.keyboard('x')
    expect(stored().cards.map((c) => c.id)).not.toContain('3')
    expect(cardEl('Plain card')).toHaveFocus()
  })

  it('n focuses the add box of the focused card column, or the first column', async () => {
    const { user } = setup()
    await user.click(document.body)
    await user.keyboard('n')
    expect(screen.getAllByPlaceholderText('+ Add card')[0]).toHaveFocus()
    focus('Medium one')
    await user.keyboard('n')
    expect(screen.getAllByPlaceholderText('+ Add card')[1]).toHaveFocus()
    await user.keyboard('n') // typing into the box must not trigger shortcuts
    expect(screen.getAllByPlaceholderText('+ Add card')[1]).toHaveValue('n')
  })

  it('? opens the shortcut list', async () => {
    const { user } = setup()
    await user.click(document.body)
    await user.keyboard('?')
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument()
  })

  it('ignores card shortcuts while typing in the search box', async () => {
    const { user } = setup()
    await user.type(screen.getByLabelText(/search cards/i), 'xa1')
    expect(stored().cards).toHaveLength(4)
    expect(stored().cards.every((c) => !c.archivedAt)).toBe(true)
  })
})
