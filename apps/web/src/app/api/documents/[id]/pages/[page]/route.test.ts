/** @jest-environment node */
import type { NextRequest } from 'next/server'
import { GET } from './route'
import { createClient } from '@/lib/supabase/server'
import { mockSupabaseClient } from '@/test-utils/supabase'

jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))
const mockCreateClient = createClient as jest.Mock
const request = {} as NextRequest
const ctx = (page = '2') => ({ params: Promise.resolve({ id: 'doc-1', page }) })
const originalEnv = process.env
beforeEach(() => {
  process.env = { ...originalEnv, NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-key' }
})
afterEach(() => { process.env = originalEnv })

test('returns a clear disabled state without Supabase configuration', async () => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
  expect((await GET(request, ctx())).status).toBe(503)
})

test('requires an authenticated reader', async () => {
  mockCreateClient.mockResolvedValue(mockSupabaseClient({ user: null }))
  expect((await GET(request, ctx())).status).toBe(401)
})

test.each(['0', '-1', '1.5', '01', '1e3', 'Infinity', '9007199254740993'])('rejects invalid page %s', async (page) => {
  expect((await GET(request, ctx(page))).status).toBe(400)
})

test('does not query text for a missing or unowned document', async () => {
  const client = mockSupabaseClient({ fromResults: [{ data: null, error: null }] })
  mockCreateClient.mockResolvedValue(client)
  expect((await GET(request, ctx())).status).toBe(404)
  expect(client.from).toHaveBeenCalledTimes(1)
  expect(client.from.mock.results[0].value.eq).toHaveBeenCalledWith('user_id', 'user-1')
})

test('rejects a page beyond the document count', async () => {
  mockCreateClient.mockResolvedValue(mockSupabaseClient({ fromResults: [{ data: { id: 'doc-1', page_count: 1 }, error: null }] }))
  expect((await GET(request, ctx())).status).toBe(404)
})

test('disables reflow for scanned documents', async () => {
  mockCreateClient.mockResolvedValue(mockSupabaseClient({ fromResults: [{ data: { id: 'doc-1', is_scanned: true }, error: null }] }))
  expect((await GET(request, ctx())).status).toBe(422)
})

test.each([null, { raw_text: '' }, { raw_text: '   ' }])('returns an unavailable state for missing extracted text %j', async (data) => {
  mockCreateClient.mockResolvedValue(mockSupabaseClient({ fromResults: [
    { data: { id: 'doc-1' }, error: null }, { data, error: null },
  ] }))
  expect((await GET(request, ctx())).status).toBe(422)
})

test('returns only the requested page and prevents shared caching of private text', async () => {
  const source = { page_number: 2, raw_text: 'Private source text' }
  const client = mockSupabaseClient({ fromResults: [
    { data: { id: 'doc-1', page_count: 4 }, error: null }, { data: source, error: null },
  ] })
  mockCreateClient.mockResolvedValue(client)
  const response = await GET(request, ctx())
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual(source)
  expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  expect(client.from.mock.results[1].value.eq).toHaveBeenCalledWith('document_id', 'doc-1')
  expect(client.from.mock.results[1].value.eq).toHaveBeenCalledWith('page_number', 2)
})

test('does not disguise text query failures as empty pages', async () => {
  mockCreateClient.mockResolvedValue(mockSupabaseClient({ fromResults: [
    { data: { id: 'doc-1' }, error: null }, { data: null, error: { message: 'db failed' } },
  ] }))
  expect((await GET(request, ctx())).status).toBe(500)
})
