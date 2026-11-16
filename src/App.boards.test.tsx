import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { indexReducer, parseIndex, storageKeyFor, defaultIndex } from './boards'

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

const colTitles = (name: string) =>
  within(screen.getByRole('region', { name })).queryAllByText(/./, { selector: '.card-title' }).map((e) => e.textContent)

async function addCard(user: ReturnType<typeof userEvent.setup>, column: string, title: string) {
  const region = within(screen.getByRole('region', { name: column }))
  await user.type(region.getByPlaceholderText(/add card/i), `${title}{Enter}`)
}

describe('board index', () => {
  it('starts with one board that uses the original storage key', () => {
    const i = defaultIndex()
    expect(i.boards).toHaveLength(1)
    expect(storageKeyFor(i.activeId)).toBe('backlog.v1')
  })

  it('repairs junk: bad entries dropped, duplicate ids ignored, unknown active falls back', () => {
    const i = parseIndex(JSON.stringify({ activeId: 'zzz', boards: [{ id: 'a', name: ' A ' }, { id: 'a', name: 'dup' }, { id: 1 }, null, { id: 'b', name: '' }] }))
    expect(i).toEqual({ activeId: 'a', boards: [{ id: 'a', name: 'A' }] })
    expect(parseIndex('not json')).toEqual(defaultIndex())
    expect(parseIndex(JSON.stringify({ boards: [] }))).toEqual(defaultIndex())
  })

  it('creates (and activates), renames, selects and removes, but never removes the last board', () => {
    let s = indexReducer(defaultIndex(), { type: 'create', id: 'x', name: ' Work ' })
    expect(s.activeId).toBe('x')
    expect(s.boards.map((b) => b.name)).toEqual(['My backlog', 'Work'])
    s = indexReducer(s, { type: 'rename', id: 'x', name: 'Job' })
    expect(s.boards[1].name).toBe('Job')
    expect(indexReducer(s, { type: 'rename', id: 'x', name: '  ' })).toBe(s)
    expect(indexReducer(s, { type: 'create', id: 'y', name: '' })).toBe(s)
    s = indexReducer(s, { type: 'select', id: 'main' })
    expect(s.activeId).toBe('main')
    s = indexReducer(s, { type: 'remove', id: 'main' })
    expect(s.boards.map((b) => b.id)).toEqual(['x'])
    expect(s.activeId).toBe('x')
    expect(indexReducer(s, { type: 'remove', id: 'x' })).toBe(s)
  })
})

describe('multiple boards in the app', () => {
  it('keeps each board separate and remembers them after a reload', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<App />)
    await addCard(user, 'Backlog', 'Home task')

    await user.click(screen.getByTitle('Switch board'))
    await user.type(screen.getByLabelText('New board name'), 'Work{Enter}')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Work')
    expect(colTitles('Backlog')).toEqual([]) // new board starts with defaults, empty
    await addCard(user, 'Backlog', 'Work task')

    await user.click(screen.getByTitle('Switch board'))
    await user.click(screen.getByRole('button', { name: 'My backlog' }))
    expect(colTitles('Backlog')).toEqual(['Home task'])

    unmount()
    render(<App />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('My backlog')
    expect(colTitles('Backlog')).toEqual(['Home task'])
    await user.click(screen.getByTitle('Switch board'))
    await user.click(screen.getByRole('button', { name: 'Work' }))
    expect(colTitles('Backlog')).toEqual(['Work task'])
  })

  it('undo history belongs to the board you are on', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addCard(user, 'Backlog', 'Keep')
    await user.click(screen.getByTitle('Switch board'))
    await user.type(screen.getByLabelText('New board name'), 'Other{Enter}')
    await user.click(document.body)
    await user.keyboard('{Control>}z{/Control}') // nothing to undo on the fresh board
    await user.click(screen.getByTitle('Switch board'))
    await user.click(screen.getByRole('button', { name: 'My backlog' }))
    expect(colTitles('Backlog')).toEqual(['Keep'])
  })

  it('renames a board', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByTitle('Switch board'))
    await user.click(screen.getByRole('button', { name: 'Rename board My backlog' }))
    await user.keyboard('{Control>}a{/Control}Personal{Enter}')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Personal')
  })

  it('deletes a board after confirmation, including its cards', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByTitle('Switch board'))
    expect(screen.queryByRole('button', { name: /delete board/i })).not.toBeInTheDocument() // last board is protected
    await user.type(screen.getByLabelText('New board name'), 'Temp{Enter}')
    await addCard(user, 'Backlog', 'Gone')
    const key = Object.keys(localStorage).find((k) => k.startsWith('backlog.board.'))!
    expect(key).toBeTruthy()

    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    await user.click(screen.getByTitle('Switch board'))
    await user.click(screen.getByRole('button', { name: 'Delete board Temp' }))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Temp') // declined
    await user.click(screen.getByRole('button', { name: 'Delete board Temp' }))
    expect(confirm).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('My backlog')
    expect(localStorage.getItem(key)).toBeNull()
  })

  it('an existing single-board save shows up as the first board', () => {
    localStorage.setItem('backlog.v1', JSON.stringify({ columns: [{ id: 'c', name: 'Legacy' }], cards: [{ id: '1', title: 'Old card', columnId: 'c', createdAt: 1 }] }))
    render(<App />)
    expect(colTitles('Legacy')).toEqual(['Old card'])
  })
})

describe('saved views', () => {
  const setFilters = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.selectOptions(screen.getByLabelText('Filter by priority'), 'high')
    await user.selectOptions(screen.getByLabelText('Sort cards'), 'due')
    await user.type(screen.getByLabelText(/search cards/i), 'fix')
  }

  it('saves the current search / filter / sort and re-applies it', async () => {
    const user = userEvent.setup()
    render(<App />)
    await setFilters(user)
    await user.click(screen.getByTitle('Saved views'))
    await user.type(screen.getByLabelText('View name'), 'Urgent fixes{Enter}')
    expect(JSON.parse(localStorage.getItem('backlog.views')!)).toMatchObject([{ name: 'Urgent fixes', priority: 'high', sort: 'due', query: 'fix' }])
    expect(screen.getByTitle('Saved views')).toHaveTextContent('Urgent fixes') // the active view is named in the button

    await user.click(screen.getByRole('button', { name: 'Clear all filters' }))
    expect(screen.getByLabelText('Filter by priority')).toHaveValue('all')
    expect(screen.getByLabelText('Sort cards')).toHaveValue('manual')
    expect(screen.getByLabelText(/search cards/i)).toHaveValue('')

    await user.click(screen.getByTitle('Saved views'))
    await user.click(screen.getByRole('button', { name: 'Urgent fixes' }))
    expect(screen.getByLabelText('Filter by priority')).toHaveValue('high')
    expect(screen.getByLabelText('Sort cards')).toHaveValue('due')
    expect(screen.getByLabelText(/search cards/i)).toHaveValue('fix')
  })

  it('cannot save while nothing is filtered, replaces a view with the same name, and deletes', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByTitle('Saved views'))
    expect(screen.getByLabelText('View name')).toBeDisabled()
    await user.click(screen.getByTitle('Saved views')) // close

    await user.selectOptions(screen.getByLabelText('Filter by priority'), 'high')
    await user.click(screen.getByTitle('Saved views'))
    await user.type(screen.getByLabelText('View name'), 'Mine{Enter}')
    await user.selectOptions(screen.getByLabelText('Filter by priority'), 'low')
    await user.click(screen.getByTitle('Saved views'))
    await user.type(screen.getByLabelText('View name'), 'mine{Enter}')
    const saved = JSON.parse(localStorage.getItem('backlog.views')!)
    expect(saved).toHaveLength(1)
    expect(saved[0].priority).toBe('low')

    await user.click(screen.getByRole('button', { name: /delete view/i }))
    expect(JSON.parse(localStorage.getItem('backlog.views')!)).toEqual([])
  })

  it('ignores corrupted saved views', async () => {
    const user = userEvent.setup()
    localStorage.setItem('backlog.views', JSON.stringify([{ id: 'a', name: 'ok' }, { name: 'no id' }, 5]))
    render(<App />)
    await user.click(screen.getByTitle('Saved views'))
    expect(screen.getAllByRole('button', { name: /^Delete view/ })).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'ok' })).toBeInTheDocument()
  })
})

describe('data menu and CSV', () => {
  it('offers JSON and CSV export and one import entry', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByTitle('Export or import this board'))
    expect(screen.getByRole('menuitem', { name: /export json/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /export csv/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /import json or csv/i })).toBeInTheDocument()
  })

  it('imports a CSV into the current board after confirmation', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addCard(user, 'Backlog', 'Existing')
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const csv = 'Summary,Status,Priority\nFrom Jira,In Review,Highest\nSecond,Backlog,Low\n'
    const input = document.querySelector<HTMLInputElement>('input[type=file]')!
    await user.upload(input, new File([csv], 'issues.csv', { type: 'text/csv' }))
    await vi.waitFor(() => expect(confirm).toHaveBeenCalled())
    expect(confirm.mock.calls[0][0]).toMatch(/2 cards.*1 new column/)
    expect(colTitles('In Review')).toEqual(['From Jira'])
    expect(colTitles('Backlog')).toEqual(['Existing', 'Second'])
  })

  it('does nothing when the import is declined, and reports bad files', async () => {
    const user = userEvent.setup()
    render(<App />)
    const input = document.querySelector<HTMLInputElement>('input[type=file]')!
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    await user.upload(input, new File(['Title\nA\n'], 'a.csv', { type: 'text/csv' }))
    await vi.waitFor(() => expect(window.confirm).toHaveBeenCalled())
    expect(colTitles('Backlog')).toEqual([])

    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {})
    await user.upload(input, new File(['Foo,Bar\n1,2\n'], 'b.csv', { type: 'text/csv' }))
    await vi.waitFor(() => expect(alert).toHaveBeenCalledWith(expect.stringMatching(/title column/i)))
  })
})
