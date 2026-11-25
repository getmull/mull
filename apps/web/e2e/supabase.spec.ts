import { randomUUID } from 'node:crypto'
import { test, expect } from '@playwright/test'
import { createClient, type Session } from '@supabase/supabase-js'
import { readingPdf } from './fixtures/pdf'
import { selectReflowText } from './fixtures/selection'

// Deliberately uses only anon-key clients signed in as normal users.
const url = process.env.MULL_TEST_SUPABASE_URL!
const anonKey = process.env.MULL_TEST_SUPABASE_ANON_KEY!
async function reader() {
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const email = `mull-${randomUUID()}@example.com`
  const password = `Mull-${randomUUID()}!a1`
  const { data, error } = await client.auth.signUp({ email, password })
  expect(error, 'Local signup must succeed with confirmations disabled').toBeNull()
  expect(data.session).not.toBeNull()
  return { client, email, password, user: data.user!, session: data.session! }
}

function sessionCookie(session: Session) {
  const project = new URL(url).hostname.split('.')[0]
  return {
    name: `sb-${project}-auth-token`,
    value: `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`,
    domain: 'localhost', path: '/',
  }
}

test('RLS enforces document ownership for bookmarks and reading position', async ({ browser }) => {
  const owner = await reader()
  const stranger = await reader()
  const owned = await owner.client.from('documents').insert({ user_id: owner.user.id, type: 'pdf', title: 'Owner-only test', page_count: 3 }).select().single()
  expect(owned.error).toBeNull()
  const foreignId = owned.data!.id as string
  const other = await stranger.client.from('documents').insert({ user_id: stranger.user.id, type: 'pdf', title: 'Other test', page_count: 3 }).select().single()
  expect(other.error).toBeNull()
  const otherId = other.data!.id as string
  const context = await browser.newContext()
  try {
    const bookmark = await owner.client.from('bookmarks').insert({ document_id: foreignId, user_id: owner.user.id, page_number: 2, label: 'Private marker' }).select().single()
    expect(bookmark.error).toBeNull()
    const hiddenDoc = await stranger.client.from('documents').select('id').eq('id', foreignId)
    expect(hiddenDoc.error).toBeNull()
    expect(hiddenDoc.data).toEqual([])
    const hidden = await stranger.client.from('bookmarks').select('id').eq('id', bookmark.data!.id)
    expect(hidden.error).toBeNull()
    expect(hidden.data).toEqual([])

    // The parent-document check must also hold for direct Supabase access,
    // not only requests through Mull's API.
    const injected = await stranger.client.from('bookmarks').insert({ document_id: foreignId, user_id: stranger.user.id, page_number: 1 })
    expect(injected.error, 'RLS must reject a bookmark linked to another user’s document').not.toBeNull()

    const ownBookmark = await stranger.client.from('bookmarks').insert({ document_id: otherId, user_id: stranger.user.id, page_number: 1 }).select().single()
    expect(ownBookmark.error).toBeNull()
    const reparented = await stranger.client.from('bookmarks').update({ document_id: foreignId }).eq('id', ownBookmark.data!.id)
    expect(reparented.error).not.toBeNull()
    const reassigned = await stranger.client.from('bookmarks').update({ user_id: owner.user.id }).eq('id', ownBookmark.data!.id)
    expect(reassigned.error).not.toBeNull()
    const changed = await stranger.client.from('documents').update({ last_page: 3, progress_pct: 100 }).eq('id', foreignId).select('id')
    expect(changed.error).toBeNull()
    expect(changed.data).toEqual([])
    const removed = await stranger.client.from('bookmarks').delete().eq('id', bookmark.data!.id).select('id')
    expect(removed.error).toBeNull()
    expect(removed.data).toEqual([])

    await context.addCookies([sessionCookie(stranger.session)])
    const api = await context.request.patch(`http://localhost:3117/api/documents/${foreignId}`, { data: { last_page: 2, progress_pct: 67 } })
    expect(api.status()).toBe(404)
    const apiBookmark = await context.request.post('http://localhost:3117/api/bookmarks', { data: { document_id: foreignId, page_number: 1 } })
    expect(apiBookmark.status()).toBe(404)
    const privateText = await context.request.get(`http://localhost:3117/api/documents/${foreignId}/pages/1`)
    expect(privateText.status()).toBe(404)
    const unchanged = await owner.client.from('documents').select('last_page, progress_pct').eq('id', foreignId).single()
    expect(unchanged.error).toBeNull()
    expect(unchanged.data).toEqual({ last_page: null, progress_pct: 0 })
    expect((await owner.client.from('bookmarks').select('id').eq('id', bookmark.data!.id)).data).toHaveLength(1)
  } finally {
    await context.close()
    await owner.client.from('documents').delete().eq('id', foreignId)
    // Delete own bookmarks explicitly too, so pre-fix failed runs leave no orphans.
    await stranger.client.from('bookmarks').delete().eq('user_id', stranger.user.id)
    await stranger.client.from('documents').delete().eq('id', otherId)
  }
})

test('login → upload → bookmark → reopen → resume persists in real Supabase', async ({ page }) => {
  const owner = await reader()
  let documentId: string | undefined
  let storagePath: string | undefined
  try {
    await page.goto('/login')
    await page.getByLabel('Email', { exact: true }).fill(owner.email)
    await page.getByLabel('Password', { exact: true }).fill(owner.password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page).toHaveURL(/\/library$/)
    await expect(page.getByRole('button', { name: 'Upload a PDF' })).toBeEnabled()
    const response = page.waitForResponse((res) => res.url().endsWith('/api/documents/upload') && res.request().method() === 'POST')
    await page.locator('input[type=file]').setInputFiles({ name: 'Database verification.pdf', mimeType: 'application/pdf', buffer: readingPdf() })
    const uploaded = await response
    expect(uploaded.ok()).toBe(true)
    const data = await uploaded.json()
    documentId = data.document.id
    storagePath = data.document.storage_path
    await page.getByRole('link', { name: /Database verification/ }).click()
    await expect(page.getByText('1 / 3', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await page.getByRole('button', { name: 'Bookmarks', exact: true }).click()
    await page.getByRole('textbox', { name: 'Label for page 2', exact: true }).fill('Persisted in Postgres')
    await page.getByRole('button', { name: '+ Bookmark page 2', exact: true }).click()
    await expect(page.getByText('Persisted in Postgres', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(page.getByText('Your place is saved')).toBeVisible()
    const saved = await owner.client.from('documents').select('last_page, progress_pct, last_read_at').eq('id', documentId).single()
    expect(saved.error).toBeNull()
    expect(saved.data!.last_page).toBe(2)
    expect(Number(saved.data!.progress_pct)).toBe(66.67)
    expect(saved.data!.last_read_at).not.toBeNull()
    const pages = await owner.client.from('document_pages').select('page_number').eq('document_id', documentId)
    expect(pages.error).toBeNull()
    expect(pages.data).toHaveLength(3)
    await page.getByRole('link', { name: '← Library' }).click()
    const continuing = page.getByRole('region', { name: 'Continue Reading' })
    await expect(continuing.getByText('Resume at page 2 of 3')).toBeVisible()
    await continuing.getByRole('link').click()
    await expect(page.getByText('2 / 3', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Bookmarks (1)', exact: true }).click()
    await expect(page.getByText('Persisted in Postgres', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Delete bookmark' }).click()
    await expect(page.getByText('No bookmarks yet.')).toBeVisible()
    const bookmarks = await owner.client.from('bookmarks').select('id').eq('document_id', documentId)
    expect(bookmarks.error).toBeNull()
    expect(bookmarks.data).toEqual([])

    await page.getByRole('button', { name: 'Close', exact: true }).click()
    await page.getByRole('button', { name: 'Reflow', exact: true }).click()
    const article = page.getByRole('article', { name: 'Reflow page 2' })
    await expect(article).toBeVisible()
    const quote = 'A small document for testing'
    await selectReflowText(article.locator('p').filter({ hasText: quote }), quote)
    const highlightSaved = page.waitForResponse((response) => response.url().endsWith('/api/highlights') && response.request().method() === 'POST')
    await page.getByRole('button', { name: 'Blue highlight', exact: true }).click()
    const savedHighlightResponse = await highlightSaved
    expect(savedHighlightResponse.status()).toBe(201)
    const { highlight } = await savedHighlightResponse.json()
    const storedHighlight = await owner.client.from('highlights').select('text, page_ref, position').eq('id', highlight.id).single()
    expect(storedHighlight.error).toBeNull()
    expect(storedHighlight.data).toEqual({ text: quote, page_ref: 2, position: null })
    const list = page.getByRole('region', { name: 'Highlights on page 2' })
    await list.getByRole('button', { name: quote, exact: true }).click()
    await list.getByRole('button', { name: '+ Note', exact: true }).click()
    await page.getByPlaceholder('Add a note…').fill('Stored reflow note')
    const noteSaved = page.waitForResponse((response) => response.url().endsWith('/notes') && response.request().method() === 'POST')
    await list.getByRole('button', { name: 'Add note', exact: true }).click()
    expect((await noteSaved).status()).toBe(201)
    const storedNotes = await owner.client.from('notes').select('content').eq('highlight_id', highlight.id)
    expect(storedNotes.error).toBeNull()
    expect(storedNotes.data).toEqual([{ content: 'Stored reflow note' }])
    await page.reload()
    await expect(page.getByText('2 / 3', { exact: true })).toBeVisible()
    await list.getByRole('button', { name: quote, exact: true }).click()
    await expect(list.getByText('Stored reflow note', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Reflow', exact: true }).click()
    await expect(page.getByRole('article', { name: 'Reflow page 2' })).toBeVisible()
    await expect(page.getByRole('button', { name: `Highlight: ${quote}`, exact: true })).toBeVisible()

  } finally {
    if (storagePath) await owner.client.storage.from('documents').remove([storagePath])
    if (documentId) await owner.client.from('documents').delete().eq('id', documentId)
  }
})
