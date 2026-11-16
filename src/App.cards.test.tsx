import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { toDateString } from './dates'
import type { BoardState } from './store'

// "today" is pinned to Wed 2031-01-15
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2031, 0, 15, 12) })
})
afterEach(() => vi.useRealTimers())

const offset = (days: number) => toDateString(new Date(2031, 0, 15 + days))

const seed = (extra: Partial<BoardState> = {}): BoardState => ({
  columns: [
    { id: 'todo', name: 'Todo' },
    { id: 'done', name: 'Done' },
  ],
  cards: [{ id: '1', title: 'Plain card', columnId: 'todo', createdAt: 1 }],
  ...extra,
})

function setup(b: BoardState = seed()) {
  localStorage.setItem('backlog.v1', JSON.stringify(b))
  return { user: userEvent.setup({ advanceTimers: () => {} }), ...render(<App />) }
}

const column = (name: string) => within(screen.getByRole('region', { name }))
const titles = (name: string) => column(name).queryAllByText(/./, { selector: '.card-title' }).map((e) => e.textContent)
const stored = (): BoardState => JSON.parse(localStorage.getItem('backlog.v1')!)
const cardEl = (title: string) => screen.getByText(title).closest('.card') as HTMLElement

describe('due date labels', () => {
  it('shows Today / Tomorrow in words and styles them, and marks overdue ones', () => {
    setup(seed({
      cards: [
        { id: 'a', title: 'A', due: offset(0), columnId: 'todo', createdAt: 1 },
        { id: 'b', title: 'B', due: offset(1), columnId: 'todo', createdAt: 2 },
        { id: 'c', title: 'C', due: offset(-1), columnId: 'todo', createdAt: 3 },
        { id: 'd', title: 'D', due: offset(9), columnId: 'todo', createdAt: 4 },
      ],
    }))
    expect(within(cardEl('A')).getByText('Today').closest('.due')).toHaveClass('today')
    expect(within(cardEl('B')).getByText('Tomorrow').closest('.due')).toHaveClass('tomorrow')
    expect(cardEl('C').querySelector('.due')).toHaveClass('overdue')
    expect(cardEl('D').querySelector('.due')).toHaveClass('later')
    expect(cardEl('D').querySelector('.due')).not.toHaveClass('overdue')
  })
})

describe('WIP hint', () => {
  it('shows an edit pencil in the count pill (revealed on hover/focus)', () => {
    setup()
    expect(column('Todo').getByTitle(/wip limit/i).querySelector('.edit-hint')).toBeInTheDocument()
  })
})

describe('markdown notes', () => {
  it('renders notes as markdown on the card', () => {
    setup(seed({
      cards: [{ id: '1', title: 'Doc', notes: 'See **this** and [site](https://example.com)\n\n- one\n- two', columnId: 'todo', createdAt: 1 }],
    }))
    const card = cardEl('Doc')
    expect(within(card).getByText('this').tagName).toBe('STRONG')
    expect(within(card).getByRole('link', { name: 'site' })).toHaveAttribute('href', 'https://example.com')
    expect(within(card).getAllByRole('listitem')).toHaveLength(2)
  })

  it('clicking a link on a card does not open the card', async () => {
    const { user } = setup(seed({
      cards: [{ id: '1', title: 'Doc', notes: '[site](https://example.com)', columnId: 'todo', createdAt: 1 }],
    }))
    await user.click(within(cardEl('Doc')).getByRole('link', { name: 'site' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('previews markdown in the dialog and keeps the raw text when saving', async () => {
    const { user } = setup()
    await user.click(screen.getByText('Plain card'))
    const dialog = within(screen.getByRole('dialog', { name: 'Card details' }))
    await user.type(dialog.getByLabelText('Notes'), 'Hello **bold**')
    await user.click(dialog.getByRole('tab', { name: 'Preview' }))
    expect(dialog.getByText('bold').tagName).toBe('STRONG')
    expect(dialog.queryByLabelText('Notes')).not.toBeInTheDocument()
    await user.click(dialog.getByRole('tab', { name: 'Write' }))
    expect(dialog.getByLabelText('Notes')).toHaveValue('Hello **bold**')
    await user.click(dialog.getByRole('button', { name: 'Save' }))
    expect(stored().cards[0].notes).toBe('Hello **bold**')
  })

  it('explains the preview when there are no notes', async () => {
    const { user } = setup()
    await user.click(screen.getByText('Plain card'))
    await user.click(screen.getByRole('tab', { name: 'Preview' }))
    expect(screen.getByText(/nothing to preview/i)).toBeInTheDocument()
  })
})

describe('recurring cards', () => {
  it('sets a repeat rule in the dialog and shows it on the card', async () => {
    const { user } = setup()
    await user.click(screen.getByText('Plain card'))
    const dialog = within(screen.getByRole('dialog'))
    await user.selectOptions(dialog.getByLabelText('Repeat'), 'weekly')
    await user.click(dialog.getByRole('button', { name: 'Save' }))
    expect(stored().cards[0].recurrence).toBe('weekly')
    expect(within(cardEl('Plain card')).getByTitle('Repeats weekly')).toBeInTheDocument()
  })

  it('archiving a recurring card brings back the next occurrence', async () => {
    const { user } = setup(seed({
      cards: [{ id: '1', title: 'Weekly report', due: offset(1), recurrence: 'weekly', columnId: 'todo', createdAt: 1 }],
    }))
    await user.click(screen.getByText('Weekly report'))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /archive/i }))
    expect(titles('Todo')).toEqual(['Weekly report'])
    expect(stored().cards).toHaveLength(2)
    expect(stored().cards.find((c) => !c.archivedAt)!.due).toBe(offset(8))
    // undo removes the new occurrence along with the archive
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(stored().cards).toHaveLength(1)
    expect(stored().cards[0].archivedAt).toBeUndefined()
  })
})

describe('templates', () => {
  const saveTemplate = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
    const dialog = within(screen.getByRole('dialog', { name: 'Card details' }))
    await user.click(dialog.getByRole('button', { name: /make template/i }))
    await user.type(dialog.getByLabelText('Template name'), `{Control>}a{/Control}${name}{Enter}`)
  }

  it('saves a card as a template and starts new cards from it', async () => {
    const { user } = setup(seed({
      cards: [
        {
          id: '1', title: 'Bug', columnId: 'todo', createdAt: 1, priority: 'high', tags: ['bug'], notes: 'Steps',
          checklist: [{ id: 'i', text: 'Reproduce', done: true }],
        },
      ],
    }))
    expect(screen.queryByLabelText('New card from a template')).not.toBeInTheDocument()
    await user.click(screen.getByText('Bug'))
    await saveTemplate(user, 'Bug report')
    expect(stored().templates).toMatchObject([{ name: 'Bug report', priority: 'high', tags: ['bug'], checklist: ['Reproduce'] }])
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))

    // the menu appears on every column; use the Done column
    await user.click(column('Done').getByLabelText('New card from a template'))
    await user.click(column('Done').getByRole('menuitem', { name: /bug report/i }))

    expect(titles('Done')).toEqual(['Bug report'])
    const created = stored().cards.find((c) => c.columnId === 'done')!
    expect(created).toMatchObject({ priority: 'high', tags: ['bug'], notes: 'Steps' })
    expect(created.checklist?.map((i) => i.done)).toEqual([false]) // template items start unchecked
    // the new card opens so it can be renamed right away
    expect(within(screen.getByRole('dialog', { name: 'Card details' })).getByLabelText('Title')).toHaveValue('Bug report')
  })

  it('requires a name and can be cancelled with Escape without closing the dialog', async () => {
    const { user } = setup()
    await user.click(screen.getByText('Plain card'))
    const dialog = within(screen.getByRole('dialog'))
    await user.click(dialog.getByRole('button', { name: /make template/i }))
    await user.clear(dialog.getByLabelText('Template name'))
    expect(dialog.getByRole('button', { name: 'Save template' })).toBeDisabled()
    await user.keyboard('{Escape}')
    expect(dialog.queryByLabelText('Template name')).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Card details' })).toBeInTheDocument()
    expect(stored().templates).toBeUndefined()
  })

  it('deletes a template from the menu', async () => {
    const { user } = setup(seed({ templates: [{ id: 't', name: 'Standup' }] }))
    await user.click(column('Todo').getByLabelText('New card from a template'))
    await user.click(column('Todo').getByRole('button', { name: 'Delete template Standup' }))
    expect(stored().templates).toBeUndefined()
    expect(screen.queryByLabelText('New card from a template')).not.toBeInTheDocument()
  })

  it('creating from a template is one undo step', async () => {
    const { user } = setup(seed({ templates: [{ id: 't', name: 'Standup' }] }))
    await user.click(column('Todo').getByLabelText('New card from a template'))
    await user.click(column('Todo').getByRole('menuitem', { name: /standup/i }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))
    expect(titles('Todo')).toContain('Standup')
    await user.click(document.body)
    await user.keyboard('{Control>}z{/Control}')
    expect(titles('Todo')).not.toContain('Standup')
  })
})
