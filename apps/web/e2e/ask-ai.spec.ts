import { randomUUID } from 'node:crypto'
import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { readingPdf } from './fixtures/pdf'

test('Ask AI retrieves a late page, persists the citation, jumps to it, and rejects an invented page', async ({ page }) => {
  const client = createClient(process.env.MULL_TEST_SUPABASE_URL!, process.env.MULL_TEST_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
  const email = `mull-ai-${randomUUID()}@example.com`
  const password = `Mull-${randomUUID()}!a1`
  const signup = await client.auth.signUp({ email, password })
  expect(signup.error).toBeNull()
  let documentId: string | undefined
  let storagePath: string | undefined
  try {
    await page.goto('/login')
    await page.getByLabel('Email', { exact: true }).fill(email)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page).toHaveURL(/\/library$/)
    await expect(page.getByRole('button', { name: 'Upload a PDF' })).toBeEnabled()
    const upload = page.waitForResponse((response) => response.url().endsWith('/api/documents/upload') && response.request().method() === 'POST')
    const pdf = readingPdf(80, (number) => [
      ...Array.from({ length: 8 }, () => 'General background about experimental procedures and results.'),
      ...(number === 76 ? ['The zirconium catalyst reduced reaction time by forty percent.'] : []),
    ])
    await page.locator('input[type=file]').setInputFiles({ name: 'Long document.pdf', mimeType: 'application/pdf', buffer: pdf })
    const uploaded = await upload
    expect(uploaded.ok()).toBe(true)
    const data = await uploaded.json()
    documentId = data.document.id
    storagePath = data.document.storage_path
    expect(data.document.page_count).toBe(80)
    await page.getByRole('link', { name: /Long document/ }).click()
    await expect(page.getByText('1 / 80', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Reflow', exact: true }).click()
    await expect(page.getByRole('article', { name: 'Reflow page 1' })).toBeVisible()
    await page.getByRole('button', { name: 'Ask AI', exact: true }).click()
    await page.getByPlaceholder('Ask a question…').fill('What did the zirconium catalyst achieve?')
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await expect(page.getByText('It reduced reaction time by forty percent.', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'p.76', exact: true }).click()
    await expect(page.getByText('76 / 80', { exact: true })).toBeVisible()
    await expect(page.getByRole('article', { name: 'Reflow page 76' })).toBeVisible()
    const conversation = await client.from('ai_conversations').select('messages').eq('document_id', documentId).single()
    expect(conversation.error).toBeNull()
    expect(conversation.data!.messages).toHaveLength(2)
    expect(conversation.data!.messages[1].citations).toEqual([{ page: 76, quote: 'The zirconium catalyst reduced reaction time by forty percent.' }])

    const invalid = page.waitForResponse((response) => response.url().endsWith('/ask') && response.request().method() === 'POST')
    await page.getByPlaceholder('Ask a question…').fill('Return an invalid citation.')
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    expect((await invalid).status()).toBe(502)
    await expect(page.getByText('AI request failed', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'p.9999', exact: true })).toHaveCount(0)
    const unchanged = await client.from('ai_conversations').select('messages').eq('document_id', documentId).single()
    expect(unchanged.error).toBeNull()
    expect(unchanged.data!.messages).toHaveLength(2)
  } finally {
    // Dispose the reader first so pending page-position writes finish before cleanup.
    await page.goto('/library')
    if (storagePath) await client.storage.from('documents').remove([storagePath])
    if (documentId) await client.from('documents').delete().eq('id', documentId)
  }
})
