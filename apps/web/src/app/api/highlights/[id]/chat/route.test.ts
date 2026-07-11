/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import { GET, POST } from './route'
import { createClient } from '@/lib/supabase/server'
import { getAIModel } from '@/lib/ai/provider'
import { buildHighlightPageContext } from '@/lib/ai/context'
import { chatAboutHighlight } from '@/lib/ai/highlightChat'
import { mockSupabaseClient } from '@/test-utils/supabase'

jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/lib/ai/provider', () => ({ getAIModel: jest.fn() }))
jest.mock('@/lib/ai/context', () => ({ buildHighlightPageContext: jest.fn() }))
jest.mock('@/lib/ai/highlightChat', () => ({ chatAboutHighlight: jest.fn() }))

const mockCreateClient = createClient as jest.Mock
const mockGetAIModel = getAIModel as jest.Mock
const mockBuildPageContext = buildHighlightPageContext as jest.Mock
const mockChatAboutHighlight = chatAboutHighlight as jest.Mock

function ctx(id = 'h1') {
  return { params: Promise.resolve({ id }) }
}

function postRequest(body: unknown) {
  return new NextRequest('http://localhost/api/highlights/h1/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('GET /api/highlights/[id]/chat', () => {
  it('returns 401 when unauthenticated', async () => {
    mockCreateClient.mockResolvedValue(mockSupabaseClient({ user: null }))

    const res = await GET({} as NextRequest, ctx())

    expect(res.status).toBe(401)
  })

  it('returns an empty array when there is no conversation yet', async () => {
    mockCreateClient.mockResolvedValue(mockSupabaseClient({ fromResults: [{ data: null, error: null }] }))

    const res = await GET({} as NextRequest, ctx())
    const json = await res.json()

    expect(json).toEqual({ messages: [] })
  })

  it('returns the stored conversation history', async () => {
    const messages = [{ role: 'user', content: 'Explain this passage.' }, { role: 'assistant', content: 'It means...' }]
    mockCreateClient.mockResolvedValue(mockSupabaseClient({ fromResults: [{ data: { messages }, error: null }] }))

    const res = await GET({} as NextRequest, ctx())
    const json = await res.json()

    expect(json).toEqual({ messages })
  })
})

describe('POST /api/highlights/[id]/chat', () => {
  beforeEach(() => {
    mockGetAIModel.mockReset()
    mockBuildPageContext.mockReset()
    mockChatAboutHighlight.mockReset()
  })

  it('returns 401 when unauthenticated', async () => {
    mockCreateClient.mockResolvedValue(mockSupabaseClient({ user: null }))

    const res = await POST(postRequest({ action: 'explain' }), ctx())

    expect(res.status).toBe(401)
  })

  it('returns 400 when neither action nor message is provided', async () => {
    mockCreateClient.mockResolvedValue(mockSupabaseClient())

    const res = await POST(postRequest({}), ctx())

    expect(res.status).toBe(400)
  })

  it('returns 400 when both action and message are provided', async () => {
    mockCreateClient.mockResolvedValue(mockSupabaseClient())

    const res = await POST(postRequest({ action: 'explain', message: 'hi' }), ctx())

    expect(res.status).toBe(400)
  })

  it('returns 400 for an invalid action', async () => {
    mockCreateClient.mockResolvedValue(mockSupabaseClient())

    const res = await POST(postRequest({ action: 'summarize' }), ctx())

    expect(res.status).toBe(400)
  })

  it('returns 400 for an over-length message', async () => {
    mockCreateClient.mockResolvedValue(mockSupabaseClient())

    const res = await POST(postRequest({ message: 'x'.repeat(2001) }), ctx())

    expect(res.status).toBe(400)
  })

  it('returns 404 when the highlight does not belong to the user', async () => {
    mockCreateClient.mockResolvedValue(mockSupabaseClient({ fromResults: [{ data: null, error: null }] }))

    const res = await POST(postRequest({ action: 'explain' }), ctx())

    expect(res.status).toBe(404)
  })

  it('returns 503 when no AI provider is configured', async () => {
    mockCreateClient.mockResolvedValue(
      mockSupabaseClient({ fromResults: [{ data: { id: 'h1', document_id: 'doc-1', text: 'passage', page_ref: 2 }, error: null }] })
    )
    mockGetAIModel.mockReturnValue(null)

    const res = await POST(postRequest({ action: 'explain' }), ctx())

    expect(res.status).toBe(503)
    expect(mockChatAboutHighlight).not.toHaveBeenCalled()
  })

  it('returns 502 when chatAboutHighlight fails', async () => {
    mockCreateClient.mockResolvedValue(
      mockSupabaseClient({
        fromResults: [
          { data: { id: 'h1', document_id: 'doc-1', text: 'passage', page_ref: 2 }, error: null },
          { data: null, error: null },
        ],
      })
    )
    mockGetAIModel.mockReturnValue({ modelId: 'mock' })
    mockBuildPageContext.mockResolvedValue('')
    mockChatAboutHighlight.mockRejectedValue(new Error('boom'))

    const res = await POST(postRequest({ action: 'explain' }), ctx())

    expect(res.status).toBe(502)
  })

  it('generates a seed turn, upserts, and returns both messages on success', async () => {
    const upsert = jest.fn().mockResolvedValue({ data: null, error: null })
    const from = jest.fn()
    from.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { id: 'h1', document_id: 'doc-1', text: 'sample passage', page_ref: 2 }, error: null }),
    })
    from.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
    })
    from.mockReturnValueOnce({ upsert })

    mockCreateClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
      from,
    })
    mockGetAIModel.mockReturnValue({ modelId: 'mock' })
    mockBuildPageContext.mockResolvedValue('page text')
    const assistantMessage = { role: 'assistant', content: 'This means...' }
    mockChatAboutHighlight.mockResolvedValue(assistantMessage)

    const res = await POST(postRequest({ action: 'explain' }), ctx('h1'))
    const json = await res.json()

    expect(res.status).toBe(201)
    expect(json.userMessage).toEqual({ role: 'user', content: 'Explain this passage.' })
    expect(json.message).toEqual(assistantMessage)
    expect(mockChatAboutHighlight).toHaveBeenCalledWith(
      expect.objectContaining({ highlightText: 'sample passage', pageRef: 2, action: 'explain', message: undefined })
    )
    expect(upsert).toHaveBeenCalledWith(
      {
        highlight_id: 'h1',
        user_id: 'user-1',
        messages: [{ role: 'user', content: 'Explain this passage.' }, assistantMessage],
      },
      { onConflict: 'highlight_id,user_id' }
    )
  })

  it('generates a freeform turn using the message field, not an action', async () => {
    const upsert = jest.fn().mockResolvedValue({ data: null, error: null })
    const from = jest.fn()
    from.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { id: 'h1', document_id: 'doc-1', text: 'sample passage', page_ref: 2 }, error: null }),
    })
    from.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
    })
    from.mockReturnValueOnce({ upsert })

    mockCreateClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
      from,
    })
    mockGetAIModel.mockReturnValue({ modelId: 'mock' })
    mockBuildPageContext.mockResolvedValue('')
    mockChatAboutHighlight.mockResolvedValue({ role: 'assistant', content: 'answer' })

    const res = await POST(postRequest({ message: 'what does this mean?' }), ctx('h1'))
    const json = await res.json()

    expect(res.status).toBe(201)
    expect(json.userMessage).toEqual({ role: 'user', content: 'what does this mean?' })
    expect(mockChatAboutHighlight).toHaveBeenCalledWith(
      expect.objectContaining({ action: undefined, message: 'what does this mean?' })
    )
  })

  it('trims stored messages to the most recent 40', async () => {
    const existingMessages = Array.from({ length: 40 }, (_, i) => ({ role: 'user', content: `turn-${i}` }))
    const upsert = jest.fn().mockResolvedValue({ data: null, error: null })
    const from = jest.fn()
    from.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { id: 'h1', document_id: 'doc-1', text: 'passage', page_ref: 1 }, error: null }),
    })
    from.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { messages: existingMessages }, error: null }),
    })
    from.mockReturnValueOnce({ upsert })

    mockCreateClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
      from,
    })
    mockGetAIModel.mockReturnValue({ modelId: 'mock' })
    mockBuildPageContext.mockResolvedValue('')
    mockChatAboutHighlight.mockResolvedValue({ role: 'assistant', content: 'answer' })

    await POST(postRequest({ message: 'new question' }), ctx('h1'))

    const [payload] = upsert.mock.calls[0]
    expect(payload.messages).toHaveLength(40)
    expect(payload.messages[0]).toEqual({ role: 'user', content: 'turn-2' })
    expect(payload.messages.at(-1)).toEqual({ role: 'assistant', content: 'answer' })
  })

  it('returns 500 when the upsert fails', async () => {
    const from = jest.fn()
    from.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { id: 'h1', document_id: 'doc-1', text: 'passage', page_ref: 1 }, error: null }),
    })
    from.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
    })
    from.mockReturnValueOnce({ upsert: jest.fn().mockResolvedValue({ data: null, error: { message: 'db down' } }) })

    mockCreateClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
      from,
    })
    mockGetAIModel.mockReturnValue({ modelId: 'mock' })
    mockBuildPageContext.mockResolvedValue('')
    mockChatAboutHighlight.mockResolvedValue({ role: 'assistant', content: 'answer' })

    const res = await POST(postRequest({ action: 'explain' }), ctx('h1'))

    expect(res.status).toBe(500)
  })
})
