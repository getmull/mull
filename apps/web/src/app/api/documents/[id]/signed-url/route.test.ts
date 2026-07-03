/**
 * @jest-environment node
 */
import type { NextRequest } from 'next/server'
import { GET } from './route'
import { createClient } from '@/lib/supabase/server'
import { mockSupabaseClient } from '@/test-utils/supabase'

jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))

const mockCreateClient = createClient as jest.Mock

function ctx(id = 'doc-1') {
  return { params: Promise.resolve({ id }) }
}

describe('GET /api/documents/[id]/signed-url', () => {
  it('returns 401 when unauthenticated', async () => {
    mockCreateClient.mockResolvedValue(mockSupabaseClient({ user: null }))

    const res = await GET({} as NextRequest, ctx())

    expect(res.status).toBe(401)
  })

  it('returns 404 when the document has no storage_path', async () => {
    mockCreateClient.mockResolvedValue(
      mockSupabaseClient({ fromResults: [{ data: null, error: null }] })
    )

    const res = await GET({} as NextRequest, ctx())

    expect(res.status).toBe(404)
  })

  it('returns 500 when signed URL creation fails', async () => {
    mockCreateClient.mockResolvedValue(
      mockSupabaseClient({
        fromResults: [{ data: { storage_path: 'user-1/doc-1.pdf' }, error: null }],
        storage: { createSignedUrl: { data: null, error: { message: 'boom' } } },
      })
    )

    const res = await GET({} as NextRequest, ctx())

    expect(res.status).toBe(500)
  })

  it('returns the signed url on success', async () => {
    mockCreateClient.mockResolvedValue(
      mockSupabaseClient({
        fromResults: [{ data: { storage_path: 'user-1/doc-1.pdf' }, error: null }],
        storage: { createSignedUrl: { data: { signedUrl: 'https://signed.example/doc-1.pdf' }, error: null } },
      })
    )

    const res = await GET({} as NextRequest, ctx())
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.url).toBe('https://signed.example/doc-1.pdf')
  })
})
