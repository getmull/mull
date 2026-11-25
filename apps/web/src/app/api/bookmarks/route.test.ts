/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import { GET, POST } from './route'
import { createClient } from '@/lib/supabase/server'
import { mockSupabaseClient } from '@/test-utils/supabase'

jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))

const mockCreateClient = createClient as jest.Mock

function getRequest(query: string) {
  return new NextRequest(`http://localhost/api/bookmarks${query}`)
}

function postRequest(body: unknown) {
  return new NextRequest('http://localhost/api/bookmarks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('GET /api/bookmarks', () => {
  it('returns 401 when unauthenticated', async () => {
    mockCreateClient.mockResolvedValue(mockSupabaseClient({ user: null }))

    const res = await GET(getRequest('?documentId=doc-1'))

    expect(res.status).toBe(401)
  })

  it('returns 400 when documentId is missing', async () => {
    mockCreateClient.mockResolvedValue(mockSupabaseClient())

    const res = await GET(getRequest(''))

    expect(res.status).toBe(400)
  })

  it('returns the bookmark list scoped to the document and user', async () => {
    const rows = [{ id: 'b1', page_number: 3, label: 'Chapter 2', created_at: 't' }]
    mockCreateClient.mockResolvedValue(mockSupabaseClient({ fromResults: [{ data: rows, error: null }] }))

    const res = await GET(getRequest('?documentId=doc-1'))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.bookmarks).toEqual(rows)
  })

  it('returns 500 when the query errors', async () => {
    mockCreateClient.mockResolvedValue(
      mockSupabaseClient({ fromResults: [{ data: null, error: { message: 'db down' } }] })
    )

    const res = await GET(getRequest('?documentId=doc-1'))

    expect(res.status).toBe(500)
  })
})

describe('POST /api/bookmarks', () => {
  const validBody = { document_id: 'doc-1', page_number: 3, label: 'Chapter 2' }

  it('returns 401 when unauthenticated', async () => {
    mockCreateClient.mockResolvedValue(mockSupabaseClient({ user: null }))

    const res = await POST(postRequest(validBody))

    expect(res.status).toBe(401)
  })

  it('returns 400 when document_id is missing', async () => {
    mockCreateClient.mockResolvedValue(mockSupabaseClient())

    const res = await POST(postRequest({ ...validBody, document_id: undefined }))

    expect(res.status).toBe(400)
  })

  it.each([
    ['missing', undefined],
    ['zero', 0],
    ['negative', -1],
    ['non-integer', 1.5],
  ])('returns 400 for %s page_number', async (_desc, page_number) => {
    mockCreateClient.mockResolvedValue(mockSupabaseClient())

    const res = await POST(postRequest({ ...validBody, page_number }))

    expect(res.status).toBe(400)
  })

  it('returns 404 when the document does not belong to the user', async () => {
    mockCreateClient.mockResolvedValue(mockSupabaseClient({ fromResults: [{ data: null, error: null }] }))

    const res = await POST(postRequest(validBody))

    expect(res.status).toBe(404)
  })

  it('creates the bookmark when the document is owned by the user', async () => {
    mockCreateClient.mockResolvedValue(
      mockSupabaseClient({
        fromResults: [
          { data: { id: 'doc-1' }, error: null },
          { data: { id: 'b1', ...validBody }, error: null },
        ],
      })
    )

    const res = await POST(postRequest(validBody))
    const json = await res.json()

    expect(res.status).toBe(201)
    expect(json.bookmark).toMatchObject({ id: 'b1', page_number: 3 })
  })

  it('stores a null label when none is given', async () => {
    const single1 = jest.fn().mockResolvedValue({ data: { id: 'doc-1' }, error: null })
    const eq2 = jest.fn(() => ({ single: single1 }))
    const eq1 = jest.fn(() => ({ eq: eq2 }))
    const select = jest.fn(() => ({ eq: eq1 }))

    const single2 = jest.fn().mockResolvedValue({ data: { id: 'b1', page_number: 3, label: null }, error: null })
    const insertSelect = jest.fn(() => ({ single: single2 }))
    const insert = jest.fn(() => ({ select: insertSelect }))

    const from = jest.fn((table: string) => (table === 'documents' ? { select } : { insert }))
    mockCreateClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
      from,
    })

    await POST(postRequest({ document_id: 'doc-1', page_number: 3 }))

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ label: null }))
  })
})


test.each([null, [], { document_id: 12, page_number: 1 }, { document_id: 'doc-1', page_number: 1, label: {} }, { document_id: 'doc-1', page_number: 1, label: 'x'.repeat(201) }])('rejects malformed bookmark payload %j', async (body) => {
  mockCreateClient.mockResolvedValue(mockSupabaseClient())
  expect((await POST(postRequest(body))).status).toBe(400)
})

test('rejects bookmarks outside the document page count', async () => {
  mockCreateClient.mockResolvedValue(mockSupabaseClient({ fromResults: [{ data: { id: 'doc-1', page_count: 2 }, error: null }] }))
  expect((await POST(postRequest({ document_id: 'doc-1', page_number: 3 }))).status).toBe(400)
})


const originalEnv = process.env
beforeEach(() => {
  process.env = { ...originalEnv, NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-key' }
})
afterEach(() => { process.env = originalEnv })

test('returns a disabled state without Supabase configuration', async () => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
  expect((await GET(getRequest('?documentId=doc-1'))).status).toBe(503)
  expect((await POST(postRequest({}))).status).toBe(503)
})
