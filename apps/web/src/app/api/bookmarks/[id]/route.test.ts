/**
 * @jest-environment node
 */
import type { NextRequest } from 'next/server'
import { DELETE } from './route'
import { createClient } from '@/lib/supabase/server'
import { mockSupabaseClient } from '@/test-utils/supabase'

jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))

const mockCreateClient = createClient as jest.Mock

function ctx(id = 'b1') {
  return { params: Promise.resolve({ id }) }
}

describe('DELETE /api/bookmarks/[id]', () => {
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

    const res = await DELETE({} as NextRequest, ctx('b1'))

    expect(res.status).toBe(204)
    expect(from).toHaveBeenCalledWith('bookmarks')
    expect(eq1).toHaveBeenCalledWith('id', 'b1')
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

    const res = await DELETE({} as NextRequest, ctx('b1'))

    expect(res.status).toBe(500)
  })
})


const originalEnv = process.env
beforeEach(() => {
  process.env = { ...originalEnv, NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-key' }
})
afterEach(() => { process.env = originalEnv })

test('returns a disabled state without Supabase configuration', async () => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
  expect((await DELETE({} as NextRequest, ctx())).status).toBe(503)
})
