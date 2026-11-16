import { readFile } from 'node:fs/promises'
import { expect, test, type Locator, type Page } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
})

const column = (page: Page, name: string) => page.getByRole('region', { name, exact: true })
const titles = (page: Page, name: string) => column(page, name).locator('.card-title').allTextContents()

async function addCard(page: Page, columnName: string, title: string) {
  const input = column(page, columnName).getByPlaceholder('+ Add card')
  await input.fill(title)
  await input.press('Enter')
}

// real pointer drag: press, nudge past the activation distance, then move in steps so dnd-kit sees the hover
async function drag(page: Page, from: Locator, to: Locator) {
  const a = (await from.boundingBox())!
  const t = (await to.boundingBox())!
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 2 + 10, { steps: 3 })
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2, { steps: 15 })
  await page.mouse.up()
}

test('drags cards between columns and survives a reload', async ({ page }) => {
  await addCard(page, 'Backlog', 'A')
  await addCard(page, 'Backlog', 'B')

  await drag(page, page.locator('.card:not(.overlay)', { hasText: 'A' }), column(page, 'Done').locator('.cards'))
  expect(await titles(page, 'Backlog')).toEqual(['B'])
  expect(await titles(page, 'Done')).toEqual(['A'])
  await expect(page.getByRole('dialog')).toHaveCount(0) // a drop must not open the card

  await drag(page, page.locator('.card:not(.overlay)', { hasText: 'B' }), page.locator('.card:not(.overlay)', { hasText: 'A' }))
  expect(await titles(page, 'Done')).toEqual(['B', 'A'])

  await page.reload()
  expect(await titles(page, 'Done')).toEqual(['B', 'A'])
})

test('edits a card in the dialog and sorts by priority', async ({ page }) => {
  await addCard(page, 'Backlog', 'Low task')
  await addCard(page, 'Backlog', 'High task')

  await page.getByText('High task').click()
  const dialog = page.getByRole('dialog', { name: 'Card details' })
  await dialog.getByLabel('Priority').selectOption('high')
  await dialog.getByLabel('Due date').fill('2020-01-15')
  await dialog.getByLabel('Add tag').fill('bug')
  await dialog.getByLabel('Add tag').press('Enter')
  await dialog.getByLabel('Add checklist item').fill('step')
  await dialog.getByLabel('Add checklist item').press('Enter')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog).toBeHidden()

  const card = page.locator('.card', { hasText: 'High task' })
  await expect(card.locator('.badge')).toHaveText('high')
  await expect(card.locator('.due.overdue')).toBeVisible()
  await expect(card.locator('.tag')).toHaveText('bug')
  await expect(card.locator('.progress')).toHaveText('0/1')

  await page.getByLabel('Sort cards').selectOption('priority')
  expect(await titles(page, 'Backlog')).toEqual(['High task', 'Low task'])
})

test('shortcuts: "/" focuses search, Ctrl+Z restores a deleted card', async ({ page }) => {
  await addCard(page, 'Backlog', 'Keep me')
  await page.locator('body').click({ position: { x: 5, y: 400 } })
  await page.keyboard.press('/')
  await expect(page.getByLabel(/search cards/i)).toBeFocused()
  await page.keyboard.press('Escape')
  await page.locator('body').click({ position: { x: 5, y: 400 } })

  const card = page.locator('.card', { hasText: 'Keep me' })
  await card.hover()
  await card.getByLabel('Delete card').click()
  await expect(card).toHaveCount(0)
  await page.keyboard.press('Control+z')
  await expect(card).toHaveCount(1)
})

test('exports the board as JSON', async ({ page }) => {
  await addCard(page, 'Backlog', 'Exported')
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export', exact: true }).click()])
  expect(download.suggestedFilename()).toMatch(/^backlog-\d{4}-\d{2}-\d{2}\.json$/)
  const body = JSON.parse(await readFile((await download.path())!, 'utf8'))
  expect(body.cards.map((c: { title: string }) => c.title)).toEqual(['Exported'])
})

test('dark mode toggle persists', async ({ page }) => {
  await page.getByRole('button', { name: 'Toggle dark mode' }).click()
  const theme = () => page.evaluate(() => document.documentElement.dataset.theme)
  const first = await theme()
  expect(['light', 'dark']).toContain(first)
  await page.reload()
  expect(await theme()).toBe(first)
})

test('a drag is a single undo step, and a cancelled drag changes nothing', async ({ page }) => {
  await addCard(page, 'Backlog', 'A')
  await addCard(page, 'Backlog', 'B')
  await page.locator('body').click({ position: { x: 5, y: 600 } })

  // drag A across two columns (several intermediate moves) - one Ctrl+Z must undo all of it
  await drag(page, page.locator('.card:not(.overlay)', { hasText: 'A' }), column(page, 'Done').locator('.cards'))
  expect(await titles(page, 'Done')).toEqual(['A'])
  await page.keyboard.press('Control+z')
  expect(await titles(page, 'Backlog')).toEqual(['A', 'B'])
  expect(await titles(page, 'Done')).toEqual([])

  // cancel with Escape mid-drag
  const a = (await page.locator('.card:not(.overlay)', { hasText: 'A' }).boundingBox())!
  const t = (await column(page, 'Done').locator('.cards').boundingBox())!
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 2 + 10, { steps: 3 })
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2, { steps: 15 })
  await page.keyboard.press('Escape')
  await page.mouse.up()
  expect(await titles(page, 'Backlog')).toEqual(['A', 'B'])
})

test('keyboard: focus a card, reorder it, change priority and archive it', async ({ page }) => {
  await addCard(page, 'Backlog', 'First')
  await addCard(page, 'Backlog', 'Second')
  const first = page.locator('.card', { hasText: 'First' })
  await first.focus()
  await page.keyboard.press('Shift+ArrowDown')
  expect(await titles(page, 'Backlog')).toEqual(['Second', 'First'])
  await expect(first).toBeFocused()
  await page.keyboard.press('1')
  await expect(first.locator('.badge')).toHaveText('high')
  await page.keyboard.press('a')
  await expect(first).toHaveCount(0)
  await page.getByRole('button', { name: /^archive/i }).first().click()
  await expect(page.getByRole('dialog', { name: 'Archive' })).toContainText('First')
})

test('WIP limit: set from the column header, warns when exceeded, never blocks', async ({ page }) => {
  await addCard(page, 'In progress', 'One')
  await addCard(page, 'In progress', 'Two')
  const doing = column(page, 'In progress')
  await doing.getByTitle(/wip limit/i).click()
  await page.getByRole('spinbutton', { name: 'WIP limit' }).fill('2')
  await page.getByRole('spinbutton', { name: 'WIP limit' }).press('Enter')
  await expect(doing.getByTitle(/wip limit/i)).toHaveText('2/2')
  await expect(doing).not.toHaveClass(/over-limit/)

  await addCard(page, 'In progress', 'Three') // over the limit: allowed, but flagged
  await expect(doing.getByTitle(/wip limit/i)).toHaveText('3/2')
  await expect(doing).toHaveClass(/over-limit/)

  await page.reload() // limits persist
  await expect(column(page, 'In progress').getByTitle(/wip limit/i)).toHaveText('3/2')
})

test('due date filter narrows the board to overdue cards', async ({ page }) => {
  await addCard(page, 'Backlog', 'Late')
  await addCard(page, 'Backlog', 'Later')
  await page.getByText('Late', { exact: true }).click()
  await page.getByRole('dialog').getByLabel('Due date').fill('2020-01-01')
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()

  await page.getByLabel('Filter by due date').selectOption('overdue')
  expect(await titles(page, 'Backlog')).toEqual(['Late'])
  await page.getByLabel('Filter by due date').selectOption('none')
  expect(await titles(page, 'Backlog')).toEqual(['Later'])
})
