/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import { POST } from './route'
import { createClient } from '@/lib/supabase/server'
import { mockSupabaseClient } from '@/test-utils/supabase'

jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))

const mockCreateClient = createClient as jest.Mock

function ctx(id = 'h1') {
  return { params: Promise.resolve({ id }) }
}

function postRequest(body: unknown) {
  return new NextRequest('http://localhost/api/highlights/h1/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/highlights/[id]/notes', () => {
  it('returns 401 when unauthenticated', async () => {
    mockCreateClient.mockResolvedValue(mockSupabaseClient({ user: null }))

    const res = await POST(postRequest({ content: 'my thought' }), ctx())

    expect(res.status).toBe(401)
  })

  it.each([
    ['empty', ''],
    ['whitespace-only', '   '],
    ['too long', 'x'.repeat(2001)],
  ])('returns 400 for %s content', async (_label, content) => {
    mockCreateClient.mockResolvedValue(mockSupabaseClient())

    const res = await POST(postRequest({ content }), ctx())

    expect(res.status).toBe(400)
  })

  it('returns 404 when the highlight does not belong to the user', async () => {
    mockCreateClient.mockResolvedValue(mockSupabaseClient({ fromResults: [{ data: null, error: null }] }))

    const res = await POST(postRequest({ content: 'my thought' }), ctx())

    expect(res.status).toBe(404)
  })

  it('creates the note when the highlight is owned by the user', async () => {
    const createdNote = { id: 'note-1', highlight_id: 'h1', user_id: 'user-1', content: 'my thought' }
    mockCreateClient.mockResolvedValue(
      mockSupabaseClient({
        fromResults: [
          { data: { id: 'h1' }, error: null },
          { data: createdNote, error: null },
        ],
      })
    )

    const res = await POST(postRequest({ content: 'my thought' }), ctx('h1'))
    const json = await res.json()

    expect(res.status).toBe(201)
    expect(json.note).toEqual(createdNote)
  })

  it('returns 500 when the insert fails', async () => {
    mockCreateClient.mockResolvedValue(
      mockSupabaseClient({
        fromResults: [
          { data: { id: 'h1' }, error: null },
          { data: null, error: { message: 'db down' } },
        ],
      })
    )

    const res = await POST(postRequest({ content: 'my thought' }), ctx('h1'))

    expect(res.status).toBe(500)
  })
})
