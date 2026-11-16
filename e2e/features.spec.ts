import { readFile } from 'node:fs/promises'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

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

test('works offline once installed (service worker + manifest)', async ({ page, context }) => {
  await addCard(page, 'Backlog', 'Offline card')
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await page.reload() // now controlled by the service worker
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)

  const manifest = await page.evaluate(async () => {
    const href = document.querySelector<HTMLLinkElement>('link[rel=manifest]')!.href
    return (await fetch(href)).json()
  })
  expect(manifest.display).toBe('standalone')
  expect(manifest.icons.some((i: { sizes: string }) => i.sizes === '512x512')).toBe(true)

  await context.setOffline(true)
  await page.reload()
  await expect(page.locator('.card-title', { hasText: 'Offline card' })).toBeVisible()
  await addCard(page, 'Backlog', 'Added offline')
  expect(await titles(page, 'Backlog')).toEqual(['Offline card', 'Added offline'])
  await context.setOffline(false)
})

test('keyboard drag: Space lifts, arrows move between columns, Space drops, and it is announced', async ({ page }) => {
  await addCard(page, 'Backlog', 'Movable')
  const card = page.locator('.card', { hasText: 'Movable' })
  await card.focus()
  await page.keyboard.press('Space')
  await expect(page.locator('.card.overlay')).toHaveCount(1) // lifted (the pick-up message is replaced at once by the "over" message)
  await page.waitForTimeout(300) // dnd-kit starts listening for the arrow keys a tick after the pick-up
  // the first press lands on the card's own column, the second on the next one
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(150)
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('[aria-live]').filter({ hasText: /over column In progress/ })).toHaveCount(1)
  await page.keyboard.press('Space')
  await expect(page.locator('[aria-live]').filter({ hasText: /Dropped "Movable"/ })).toHaveCount(1)
  expect(await titles(page, 'In progress')).toEqual(['Movable'])
  expect(await titles(page, 'Backlog')).toEqual([])
  // one Ctrl+Z puts it back
  await page.locator('body').click({ position: { x: 5, y: 700 } })
  await page.keyboard.press('Control+z')
  expect(await titles(page, 'Backlog')).toEqual(['Movable'])
})

test('keyboard drag can be cancelled with Escape', async ({ page }) => {
  await addCard(page, 'Backlog', 'Stay')
  await page.locator('.card', { hasText: 'Stay' }).focus()
  await page.keyboard.press('Space')
  await page.waitForTimeout(300)
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(150)
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('[aria-live]').filter({ hasText: /over column In progress/ })).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(page.locator('[aria-live]').filter({ hasText: /Move cancelled/ })).toHaveCount(1)
  expect(await titles(page, 'Backlog')).toEqual(['Stay'])
  expect(await titles(page, 'In progress')).toEqual([])
})

test('the card dialog scrolls with a very long checklist and keeps its buttons reachable', async ({ page }) => {
  await addCard(page, 'Backlog', 'Long list')
  await page.locator('.card', { hasText: 'Long list' }).click()
  const dialog = page.getByRole('dialog', { name: 'Card details' })
  const input = dialog.getByPlaceholder(/add an item/i)
  for (let i = 1; i <= 60; i++) {
    await input.fill(`Step ${i}`)
    await input.press('Enter')
  }
  const box = (await dialog.boundingBox())!
  const viewport = page.viewportSize()!
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height) // dialog never outgrows the window
  const body = dialog.locator('.dialog-body')
  expect(await body.evaluate((e) => e.scrollHeight > e.clientHeight)).toBe(true)
  await body.evaluate((e) => (e.scrollTop = e.scrollHeight))
  await expect(dialog.locator('.checklist li').last()).toBeInViewport()
  await expect(dialog.getByRole('button', { name: 'Save', exact: true })).toBeInViewport()
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.locator('.card', { hasText: 'Long list' }).getByText('0/60')).toBeVisible()
})

test('boards: create, switch, and reload keeps both', async ({ page }) => {
  await addCard(page, 'Backlog', 'Home')
  await page.getByTitle('Switch board').click()
  await page.getByLabel('New board name').fill('Work')
  await page.getByLabel('New board name').press('Enter')
  await addCard(page, 'Backlog', 'Office')
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Work')
  expect(await titles(page, 'Backlog')).toEqual(['Office'])
  await page.getByTitle('Switch board').click()
  await page.getByRole('button', { name: 'My backlog', exact: true }).click()
  expect(await titles(page, 'Backlog')).toEqual(['Home'])
})

test('CSV export and re-import', async ({ page }) => {
  await addCard(page, 'Backlog', 'Round, trip')
  await page.getByTitle('Export or import this board').click()
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'Export CSV' }).click()])
  expect(download.suggestedFilename()).toMatch(/\.csv$/)
  const csv = await readFile((await download.path())!, 'utf8')
  expect(csv).toContain('"Round, trip"')

  page.once('dialog', (d) => d.accept())
  await page.locator('input[type=file]').setInputFiles({
    name: 'issues.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Summary,Status,Priority\nImported,Backlog,High\n'),
  })
  await expect(page.locator('.card-title', { hasText: 'Imported' })).toBeVisible()
  expect(await titles(page, 'Backlog')).toEqual(['Round, trip', 'Imported'])
})

test.describe('accessibility (axe)', () => {
  const scan = (page: Page) => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  const summary = (r: Awaited<ReturnType<typeof scan>>) =>
    r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`)

  async function populate(page: Page) {
    await addCard(page, 'Backlog', 'Styled card')
    await page.locator('.card', { hasText: 'Styled card' }).click()
    const dialog = page.getByRole('dialog', { name: 'Card details' })
    await dialog.getByLabel('Priority').selectOption('high')
    await dialog.getByLabel('Due date').fill('2020-01-01')
    await dialog.getByLabel('Repeat').selectOption('weekly')
    const tag = dialog.getByPlaceholder(/tag/i).first()
    await tag.fill('design')
    await tag.press('Enter')
    await dialog.getByRole('button', { name: 'Save', exact: true }).click()
    await addCard(page, 'In progress', 'Another')
  }

  for (const scheme of ['light', 'dark'] as const) {
    test(`board has no violations in ${scheme} mode`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme })
      await populate(page)
      expect(summary(await scan(page))).toEqual([])
    })

    test(`card dialog has no violations in ${scheme} mode`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme })
      await populate(page)
      await page.locator('.card', { hasText: 'Styled card' }).click()
      expect(summary(await scan(page))).toEqual([])
    })
  }
})
