/**
 * @jest-environment node
 */
import { GET } from './route'
import { createClient } from '@/lib/supabase/server'
import { getAIStatus } from '@/lib/ai/provider'
import { mockSupabaseClient } from '@/test-utils/supabase'

jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/lib/ai/provider', () => ({ getAIStatus: jest.fn() }))

const mockCreateClient = createClient as jest.Mock
const mockGetAIStatus = getAIStatus as jest.Mock

describe('GET /api/ai/status', () => {
  it('returns 401 when unauthenticated', async () => {
    mockCreateClient.mockResolvedValue(mockSupabaseClient({ user: null }))

    const res = await GET()

    expect(res.status).toBe(401)
    expect(mockGetAIStatus).not.toHaveBeenCalled()
  })

  it('reports unconfigured', async () => {
    mockCreateClient.mockResolvedValue(mockSupabaseClient())
    mockGetAIStatus.mockReturnValue({ configured: false, provider: null })

    const res = await GET()
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toEqual({ configured: false, provider: null })
  })

  it('reports the active provider', async () => {
    mockCreateClient.mockResolvedValue(mockSupabaseClient())
    mockGetAIStatus.mockReturnValue({ configured: true, provider: 'anthropic' })

    const res = await GET()
    const json = await res.json()

    expect(json).toEqual({ configured: true, provider: 'anthropic' })
  })
})
