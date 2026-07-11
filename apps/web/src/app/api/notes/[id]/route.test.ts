/**
 * @jest-environment node
 */
import type { NextRequest } from 'next/server'
import { DELETE } from './route'
import { createClient } from '@/lib/supabase/server'
import { mockSupabaseClient } from '@/test-utils/supabase'

jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))

const mockCreateClient = createClient as jest.Mock

function ctx(id = 'note-1') {
  return { params: Promise.resolve({ id }) }
}

describe('DELETE /api/notes/[id]', () => {
  it('returns 401 when unauthenticated', async () => {
    mockCreateClient.mockResolvedValue(mockSupabaseClient({ user: null }))

    const res = await DELETE({} as NextRequest, ctx())

    expect(res.status).toBe(401)
  })

  it('scopes the delete to the id and the authenticated user, returning 204', async () => {
    const eq2 = jest.fn().mockResolvedValue({ data: null, error: null })
    const eq1 = jest.fn(() => ({ eq: eq2 }))
    const from = jest.fn().mockReturnValue({ delete: jest.fn(() => ({ eq: eq1 })) })
    mockCreateClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
      from,
    })

    const res = await DELETE({} as NextRequest, ctx('note-1'))

    expect(res.status).toBe(204)
    expect(from).toHaveBeenCalledWith('notes')
    expect(eq1).toHaveBeenCalledWith('id', 'note-1')
    expect(eq2).toHaveBeenCalledWith('user_id', 'user-1')
  })

  it('returns 500 when the delete errors', async () => {
    const eq2 = jest.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    const eq1 = jest.fn(() => ({ eq: eq2 }))
    const from = jest.fn().mockReturnValue({ delete: jest.fn(() => ({ eq: eq1 })) })
    mockCreateClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
      from,
    })

    const res = await DELETE({} as NextRequest, ctx('note-1'))

    expect(res.status).toBe(500)
  })
})
