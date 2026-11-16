import { expect, test, type Page } from '@playwright/test'

// The OS file picker cannot be driven from a test, so showSaveFilePicker is replaced with a stand-in that returns a real,
// storable file handle from the browser's private file system. Everything after the picker is the real code path.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    ;(window as unknown as { showSaveFilePicker: unknown }).showSaveFilePicker = async () => {
      const root = await navigator.storage.getDirectory()
      return root.getFileHandle('backlog-backup.json', { create: true })
    }
  })
  await page.goto('/')
  await page.evaluate(async () => {
    localStorage.clear()
    indexedDB.deleteDatabase('backlog')
    const root = await navigator.storage.getDirectory()
    await root.removeEntry('backlog-backup.json').catch(() => {})
  })
  await page.reload()
})

const backupFile = (page: Page) =>
  page.evaluate(async () => {
    const root = await navigator.storage.getDirectory()
    return (await (await root.getFileHandle('backlog-backup.json', { create: true })).getFile()).text()
  })
const dot = (page: Page) => page.getByTitle('File backup').locator('.dot')

async function addCard(page: Page, title: string) {
  const input = page.getByPlaceholder('+ Add card').first()
  await input.fill(title)
  await input.press('Enter')
}

async function connect(page: Page) {
  await page.getByTitle('File backup').click()
  await page.getByRole('button', { name: /choose backup file/i }).click()
  await expect(dot(page)).toHaveClass(/\bon\b/)
}

test('connects, writes immediately, then autosaves changes', async ({ page }) => {
  await addCard(page, 'First')
  await connect(page)
  await expect.poll(async () => JSON.parse(await backupFile(page)).cards.length).toBe(1)

  await addCard(page, 'Second')
  await expect
    .poll(async () => JSON.parse(await backupFile(page)).cards.map((c: { title: string }) => c.title))
    .toEqual(['First', 'Second'])
})

test('stays linked after a reload', async ({ page }) => {
  await addCard(page, 'First')
  await connect(page)
  await page.reload()
  await expect(dot(page)).toHaveClass(/\bon\b/)
  await addCard(page, 'After reload')
  await expect.poll(async () => JSON.parse(await backupFile(page)).cards.length).toBe(2)
})

test('offers to restore instead of overwriting when the board is empty', async ({ page }) => {
  await addCard(page, 'Precious')
  await connect(page)
  await expect.poll(async () => (await backupFile(page)).includes('Precious')).toBe(true)

  // simulate cleared site data: board gone, backup link and file remain
  await page.evaluate(() => localStorage.removeItem('backlog.v1'))
  page.once('dialog', async (d) => {
    expect(d.message()).toMatch(/restore/i)
    await d.accept()
  })
  await page.reload()
  await expect(page.locator('.card-title')).toHaveText(['Precious'])
  expect(await backupFile(page)).toContain('Precious')
})

test('never overwrites a file that is not a backup', async ({ page }) => {
  await connect(page)
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory()
    const w = await (await root.getFileHandle('backlog-backup.json')).createWritable()
    await w.write('{"hello":"world"}')
    await w.close()
  })
  await page.reload()
  await expect(dot(page)).toHaveClass(/\berror\b/)
  await addCard(page, 'Should not be written')
  await page.waitForTimeout(1500)
  expect(await backupFile(page)).toBe('{"hello":"world"}')
})

test('stop backing up forgets the file', async ({ page }) => {
  await connect(page)
  await page.getByTitle('File backup').click()
  await page.getByRole('button', { name: /stop backing up/i }).click()
  await expect(dot(page)).toHaveClass(/\boff\b/)
  await page.reload()
  await expect(dot(page)).toHaveClass(/\boff\b/)
})
