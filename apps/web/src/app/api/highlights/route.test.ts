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
  return new NextRequest(`http://localhost/api/highlights${query}`)
}

function postRequest(body: unknown) {
  return new NextRequest('http://localhost/api/highlights', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('GET /api/highlights', () => {
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

  it('returns the highlight list scoped to the document and user', async () => {
    const rows = [{ id: 'h1', text: 'hello', color: 'yellow', page_ref: 1, position: null, created_at: 't', notes: [] }]
    mockCreateClient.mockResolvedValue(mockSupabaseClient({ fromResults: [{ data: rows, error: null }] }))

    const res = await GET(getRequest('?documentId=doc-1'))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.highlights).toEqual(rows)
  })

  it('returns 500 when the query errors', async () => {
    mockCreateClient.mockResolvedValue(
      mockSupabaseClient({ fromResults: [{ data: null, error: { message: 'db down' } }] })
    )

    const res = await GET(getRequest('?documentId=doc-1'))

    expect(res.status).toBe(500)
  })
})

describe('POST /api/highlights', () => {
  const validBody = { document_id: 'doc-1', text: 'hello world', color: 'yellow', page_ref: 1, position: [] }

  it('returns 401 when unauthenticated', async () => {
    mockCreateClient.mockResolvedValue(mockSupabaseClient({ user: null }))

    const res = await POST(postRequest(validBody))

    expect(res.status).toBe(401)
  })

  it.each([
    ['document_id', { ...validBody, document_id: undefined }],
    ['text', { ...validBody, text: undefined }],
    ['color', { ...validBody, color: undefined }],
    ['page_ref', { ...validBody, page_ref: undefined }],
  ])('returns 400 when %s is missing', async (_field, body) => {
    mockCreateClient.mockResolvedValue(mockSupabaseClient())

    const res = await POST(postRequest(body))

    expect(res.status).toBe(400)
  })

  it('returns 400 for an invalid color', async () => {
    mockCreateClient.mockResolvedValue(mockSupabaseClient())

    const res = await POST(postRequest({ ...validBody, color: 'purple' }))

    expect(res.status).toBe(400)
  })

  it('returns 404 when the document does not belong to the user', async () => {
    mockCreateClient.mockResolvedValue(mockSupabaseClient({ fromResults: [{ data: null, error: null }] }))

    const res = await POST(postRequest(validBody))

    expect(res.status).toBe(404)
  })

  it('creates the highlight when the document is owned by the user', async () => {
    mockCreateClient.mockResolvedValue(
      mockSupabaseClient({
        fromResults: [
          { data: { id: 'doc-1' }, error: null },
          { data: { id: 'h1', ...validBody }, error: null },
        ],
      })
    )

    const res = await POST(postRequest(validBody))
    const json = await res.json()

    expect(res.status).toBe(201)
    expect(json.highlight).toMatchObject({ id: 'h1', color: 'yellow' })
  })
})
