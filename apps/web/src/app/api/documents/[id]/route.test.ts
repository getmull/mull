/** @jest-environment node */
import { NextRequest } from 'next/server'
import { PATCH } from './route'
import { createClient } from '@/lib/supabase/server'
import { chainable, mockSupabaseClient } from '@/test-utils/supabase'

jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))
const mockCreateClient = createClient as jest.Mock
const ctx = () => ({ params: Promise.resolve({ id: 'doc-1' }) })
const request = (body: unknown) => new NextRequest('http://localhost/api/documents/doc-1', {
  method: 'PATCH', body: JSON.stringify(body),
})
const validBody = { last_page: 5, progress_pct: 50 }

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-key'
})

afterEach(() => jest.restoreAllMocks())

test('returns a disabled state when Supabase is not configured', async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
  try { expect((await PATCH(request(validBody), ctx())).status).toBe(503) }
  finally { process.env.NEXT_PUBLIC_SUPABASE_URL = url }
})

test('rejects unauthenticated writes', async () => {
  mockCreateClient.mockResolvedValue(mockSupabaseClient({ user: null }))
  expect((await PATCH(request(validBody), ctx())).status).toBe(401)
})

test.each([null, [], {}, { ...validBody, last_page: 0 }, { ...validBody, last_page: 1.2 },
  { ...validBody, progress_pct: -1 }, { ...validBody, progress_pct: 101 }, { ...validBody, progress_pct: '50' },
])('rejects invalid input %j', async (body) => {
  mockCreateClient.mockResolvedValue(mockSupabaseClient())
  expect((await PATCH(request(body), ctx())).status).toBe(400)
})

test('rejects malformed JSON', async () => {
  mockCreateClient.mockResolvedValue(mockSupabaseClient())
  const req = new NextRequest('http://localhost/api/documents/doc-1', { method: 'PATCH', body: '{' })
  expect((await PATCH(req, ctx())).status).toBe(400)
})

test('does not report success for a missing or unowned document', async () => {
  mockCreateClient.mockResolvedValue(mockSupabaseClient({ fromResults: [{ data: null, error: null }] }))
  expect((await PATCH(request(validBody), ctx())).status).toBe(404)
})

test('rejects pages beyond the document', async () => {
  mockCreateClient.mockResolvedValue(mockSupabaseClient({ fromResults: [{ data: { id: 'doc-1', page_count: 3 }, error: null }] }))
  expect((await PATCH(request(validBody), ctx())).status).toBe(400)
})

test('derives progress and scopes every query to the authenticated owner', async () => {
  const read = chainable({ data: { id: 'doc-1', page_count: 20 }, error: null })
  const write = chainable({ data: { id: 'doc-1' }, error: null })
  const client = mockSupabaseClient()
  client.from.mockReturnValueOnce(read).mockReturnValueOnce(write)
  mockCreateClient.mockResolvedValue(client)
  const res = await PATCH(request(validBody), ctx())
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ last_page: 5, progress_pct: 25 })
  expect(write.update).toHaveBeenCalledWith({ last_page: 5, progress_pct: 25, last_read_at: expect.any(String) })
  for (const query of [read, write]) {
    expect(query.eq).toHaveBeenCalledWith('id', 'doc-1')
    expect(query.eq).toHaveBeenCalledWith('user_id', 'user-1')
  }
})

test('surfaces a failed save', async () => {
  mockCreateClient.mockResolvedValue(mockSupabaseClient({ fromResults: [
    { data: { id: 'doc-1', page_count: 10 }, error: null },
    { data: null, error: { message: 'db down' } },
  ] }))
  expect((await PATCH(request(validBody), ctx())).status).toBe(500)
})
