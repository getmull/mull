/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import { POST } from './route'
import { createClient } from '@/lib/supabase/server'
import { getAIModel } from '@/lib/ai/provider'
import { generateText } from 'ai'
import { mockSupabaseClient } from '@/test-utils/supabase'

jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/lib/ai/provider', () => ({ getAIModel: jest.fn() }))
jest.mock('ai', () => ({ generateText: jest.fn() }))

const mockCreateClient = createClient as jest.Mock
const mockGetAIModel = getAIModel as jest.Mock
const mockGenerateText = generateText as jest.Mock

function ctx(id = 'h1') {
  return { params: Promise.resolve({ id }) }
}

function postRequest(body: unknown) {
  return new NextRequest('http://localhost/api/highlights/h1/actions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/highlights/[id]/actions', () => {
  beforeEach(() => {
    mockGetAIModel.mockReset()
    mockGenerateText.mockReset()
  })

  it('returns 401 when unauthenticated', async () => {
    mockCreateClient.mockResolvedValue(mockSupabaseClient({ user: null }))

    const res = await POST(postRequest({ action: 'explain' }), ctx())

    expect(res.status).toBe(401)
  })

  it('returns 400 for an invalid action', async () => {
    mockCreateClient.mockResolvedValue(mockSupabaseClient())

    const res = await POST(postRequest({ action: 'summarize' }), ctx())

    expect(res.status).toBe(400)
  })

  it('returns 404 when the highlight does not belong to the user', async () => {
    mockCreateClient.mockResolvedValue(mockSupabaseClient({ fromResults: [{ data: null, error: null }] }))

    const res = await POST(postRequest({ action: 'explain' }), ctx())

    expect(res.status).toBe(404)
  })

  it('returns 503 when no AI provider is configured', async () => {
    mockCreateClient.mockResolvedValue(
      mockSupabaseClient({ fromResults: [{ data: { id: 'h1', text: 'sample passage' }, error: null }] })
    )
    mockGetAIModel.mockReturnValue(null)

    const res = await POST(postRequest({ action: 'explain' }), ctx())

    expect(res.status).toBe(503)
    expect(mockGenerateText).not.toHaveBeenCalled()
  })

  it('returns 502 when the AI call fails', async () => {
    mockCreateClient.mockResolvedValue(
      mockSupabaseClient({ fromResults: [{ data: { id: 'h1', text: 'sample passage' }, error: null }] })
    )
    mockGetAIModel.mockReturnValue({ modelId: 'mock' })
    mockGenerateText.mockRejectedValue(new Error('network error'))

    const res = await POST(postRequest({ action: 'explain' }), ctx())

    expect(res.status).toBe(502)
  })

  it('generates a response and persists it as a note on success', async () => {
    const from = jest.fn()
    from.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { id: 'h1', text: 'sample passage' }, error: null }),
    })
    const insertedNote = { id: 'note-1', highlight_id: 'h1', user_id: 'user-1', content: 'This means...' }
    from.mockReturnValueOnce({
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: insertedNote, error: null }),
    })
    mockCreateClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
      from,
    })
    mockGetAIModel.mockReturnValue({ modelId: 'mock' })
    mockGenerateText.mockResolvedValue({ text: 'This means...' })

    const res = await POST(postRequest({ action: 'explain' }), ctx('h1'))
    const json = await res.json()

    expect(res.status).toBe(201)
    expect(json.note).toEqual(insertedNote)
    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: expect.stringContaining('sample passage') })
    )
  })

  it('returns 500 when the note insert fails', async () => {
    const from = jest.fn()
    from.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { id: 'h1', text: 'sample passage' }, error: null }),
    })
    from.mockReturnValueOnce({
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: { message: 'db down' } }),
    })
    mockCreateClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
      from,
    })
    mockGetAIModel.mockReturnValue({ modelId: 'mock' })
    mockGenerateText.mockResolvedValue({ text: 'This means...' })

    const res = await POST(postRequest({ action: 'explain' }), ctx('h1'))

    expect(res.status).toBe(500)
  })
})
