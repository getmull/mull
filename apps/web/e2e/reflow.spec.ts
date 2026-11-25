import { test, expect } from '@playwright/test'
import { readingPdf } from './fixtures/pdf'
import { loginFixture } from './fixtures/login'
import { selectReflowText } from './fixtures/selection'

const quote = 'A small document for testing'

test('reflow supports reading, highlighting, notes, page changes, and original fallback', async ({ page, context, request }, testInfo) => {
  await request.post('http://127.0.0.1:54329/reset')
  await loginFixture(context)
  await page.goto('/library')
  await expect(page.getByRole('button', { name: 'Upload a PDF' })).toBeEnabled()
  await page.locator('input[type=file]').setInputFiles({ name: 'Reflow document.pdf', mimeType: 'application/pdf', buffer: readingPdf(3, () => [
    `A long source URL: https://example.test/${'long-path-'.repeat(30)}`,
    'A small document for testing bookmarks and saved reading position.',
  ]) })
  await page.getByRole('link', { name: /Reflow document/ }).click()
  await expect(page.getByText('1 / 3', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Reflow', exact: true }).click()
  const article = page.getByRole('article', { name: 'Reflow page 1' })
  await expect(article).toBeVisible()
  await page.getByLabel('Text size', { exact: true }).selectOption('24')
  const paragraph = article.locator('p').filter({ hasText: 'A small document for testing' })
  await selectReflowText(paragraph, quote)
  const saved = page.waitForRequest((req) => req.url().endsWith('/api/highlights') && req.method() === 'POST')
  await page.getByRole('button', { name: 'Yellow highlight', exact: true }).click()
  expect((await saved).postDataJSON()).toMatchObject({ text: quote, page_ref: 1, position: null })
  const list = page.getByRole('region', { name: 'Highlights on page 1' })
  await list.getByRole('button', { name: quote, exact: true }).click()
  await list.getByRole('button', { name: '+ Note', exact: true }).click()
  await page.getByPlaceholder('Add a note…').fill('A note made while reading in Reflow.')
  const noteSaved = page.waitForResponse((response) => response.url().endsWith('/notes') && response.request().method() === 'POST')
  await list.getByRole('button', { name: 'Add note', exact: true }).click()
  expect((await noteSaved).status()).toBe(201)
  await expect(list.getByText('A note made while reading in Reflow.')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('reflow-highlight.png'), fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'Original', exact: true }).click()
  await expect(page.getByRole('img', { name: /Original PDF page/ })).toBeVisible()
  await expect(list.getByRole('button', { name: quote, exact: true })).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'Reflow', exact: true }).click()
  await expect(article).toBeVisible()
  await list.getByRole('button', { name: quote, exact: true }).click()
  await expect(list.getByText('A note made while reading in Reflow.')).toBeVisible()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page.getByRole('article', { name: 'Reflow page 2' })).toBeVisible()
  await expect(page.getByText('2 / 3', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Original', exact: true }).click()
  await expect(page.getByRole('img', { name: /Original PDF page/ })).toBeVisible()
  await page.route('**/api/documents/*/pages/*', (route) => route.fulfill({ status: 500, json: { error: 'Unavailable' } }))
  await page.getByRole('button', { name: 'Reflow', exact: true }).click()
  await expect(page.getByText('Reflow could not load text for this page. Showing Original instead.', { exact: true })).toBeVisible()
  await expect(page.getByRole('img', { name: /Original PDF page/ })).toBeVisible()
  await expect(page.getByText('2 / 3', { exact: true })).toBeVisible()
})

test('scanned PDFs retain the original layout with a clear reflow disabled state', async ({ page, context, request }) => {
  await request.post('http://127.0.0.1:54329/reset')
  await loginFixture(context)
  await page.goto('/library')
  await expect(page.getByRole('button', { name: 'Upload a PDF' })).toBeEnabled()
  await page.locator('input[type=file]').setInputFiles({ name: 'Sparse scan.pdf', mimeType: 'application/pdf', buffer: readingPdf(3, () => ['.']) })
  await page.getByRole('link', { name: /Sparse scan/ }).click()
  await expect(page.getByRole('button', { name: 'Reflow', exact: true })).toBeDisabled()
  await expect(page.getByRole('img', { name: /Original PDF page/ })).toBeVisible()
  await expect(page.getByText(/appears to be scanned/)).toBeVisible()
})
