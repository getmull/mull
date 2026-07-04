/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import { GET, POST } from './route'
import { createClient } from '@/lib/supabase/server'
import { getAIModel } from '@/lib/ai/provider'
import { buildDocumentContext } from '@/lib/ai/context'
import { askAI } from '@/lib/ai/askAI'
import { mockSupabaseClient } from '@/test-utils/supabase'

jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/lib/ai/provider', () => ({ getAIModel: jest.fn() }))
jest.mock('@/lib/ai/context', () => ({ buildDocumentContext: jest.fn() }))
jest.mock('@/lib/ai/askAI', () => ({ askAI: jest.fn() }))

const mockCreateClient = createClient as jest.Mock
const mockGetAIModel = getAIModel as jest.Mock
const mockBuildContext = buildDocumentContext as jest.Mock
const mockAskAI = askAI as jest.Mock

function ctx(id = 'doc-1') {
  return { params: Promise.resolve({ id }) }
}

function postRequest(body: unknown) {
  return new NextRequest('http://localhost/api/documents/doc-1/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('GET /api/documents/[id]/ask', () => {
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
    const messages = [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello', citations: [{ page: 1, quote: 'q' }] }]
    mockCreateClient.mockResolvedValue(mockSupabaseClient({ fromResults: [{ data: { messages }, error: null }] }))

    const res = await GET({} as NextRequest, ctx())
    const json = await res.json()

    expect(json).toEqual({ messages })
  })
})

describe('POST /api/documents/[id]/ask', () => {
  beforeEach(() => {
    mockGetAIModel.mockReset()
    mockBuildContext.mockReset()
    mockAskAI.mockReset()
  })

  it('returns 401 when unauthenticated', async () => {
    mockCreateClient.mockResolvedValue(mockSupabaseClient({ user: null }))

    const res = await POST(postRequest({ question: 'What is this about?' }), ctx())

    expect(res.status).toBe(401)
  })

  it.each([
    ['empty', ''],
    ['whitespace-only', '   '],
    ['too long', 'x'.repeat(2001)],
  ])('returns 400 for a %s question', async (_label, question) => {
    mockCreateClient.mockResolvedValue(mockSupabaseClient())

    const res = await POST(postRequest({ question }), ctx())

    expect(res.status).toBe(400)
  })

  it('returns 404 when the document does not belong to the user', async () => {
    mockCreateClient.mockResolvedValue(mockSupabaseClient({ fromResults: [{ data: null, error: null }] }))

    const res = await POST(postRequest({ question: 'What is this about?' }), ctx())

    expect(res.status).toBe(404)
  })

  it('returns 503 when no AI provider is configured', async () => {
    mockCreateClient.mockResolvedValue(mockSupabaseClient({ fromResults: [{ data: { id: 'doc-1' }, error: null }] }))
    mockGetAIModel.mockReturnValue(null)

    const res = await POST(postRequest({ question: 'What is this about?' }), ctx())

    expect(res.status).toBe(503)
    expect(mockAskAI).not.toHaveBeenCalled()
  })

  it('returns 502 when askAI fails', async () => {
    mockCreateClient.mockResolvedValue(
      mockSupabaseClient({
        fromResults: [
          { data: { id: 'doc-1' }, error: null },
          { data: null, error: null },
        ],
      })
    )
    mockGetAIModel.mockReturnValue({ modelId: 'mock' })
    mockBuildContext.mockResolvedValue({ pagesText: 'text', highlightsText: '', pageNumbers: [1] })
    mockAskAI.mockRejectedValue(new Error('boom'))

    const res = await POST(postRequest({ question: 'What is this about?' }), ctx())

    expect(res.status).toBe(502)
  })

  it('appends the new turn, upserts, and returns the assistant message on success', async () => {
    const existingMessages = [{ role: 'user', content: 'earlier' }, { role: 'assistant', content: 'earlier answer' }]
    const upsert = jest.fn().mockResolvedValue({ data: null, error: null })
    const from = jest.fn()
    from.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { id: 'doc-1' }, error: null }),
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
    mockBuildContext.mockResolvedValue({ pagesText: 'doc text', highlightsText: '', pageNumbers: [1, 2] })
    const assistantMessage = { role: 'assistant', content: 'The answer', citations: [{ page: 2, quote: 'q' }] }
    mockAskAI.mockResolvedValue(assistantMessage)

    const res = await POST(postRequest({ question: 'What is this about?' }), ctx('doc-1'))
    const json = await res.json()

    expect(res.status).toBe(201)
    expect(json.message).toEqual(assistantMessage)
    expect(mockAskAI).toHaveBeenCalledWith(
      expect.objectContaining({ question: 'What is this about?', history: existingMessages, validPageNumbers: [1, 2] })
    )
    expect(upsert).toHaveBeenCalledWith(
      {
        document_id: 'doc-1',
        user_id: 'user-1',
        messages: [...existingMessages, { role: 'user', content: 'What is this about?' }, assistantMessage],
      },
      { onConflict: 'document_id,user_id' }
    )
  })

  it('trims stored messages to the most recent 40', async () => {
    const existingMessages = Array.from({ length: 40 }, (_, i) => ({ role: 'user', content: `turn-${i}` }))
    const upsert = jest.fn().mockResolvedValue({ data: null, error: null })
    const from = jest.fn()
    from.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { id: 'doc-1' }, error: null }),
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
    mockBuildContext.mockResolvedValue({ pagesText: 'doc text', highlightsText: '', pageNumbers: [1] })
    mockAskAI.mockResolvedValue({ role: 'assistant', content: 'answer', citations: [{ page: 1, quote: 'q' }] })

    await POST(postRequest({ question: 'new question' }), ctx('doc-1'))

    const [payload] = upsert.mock.calls[0]
    expect(payload.messages).toHaveLength(40)
    expect(payload.messages[0]).toEqual({ role: 'user', content: 'turn-2' })
    expect(payload.messages.at(-1)).toEqual({ role: 'assistant', content: 'answer', citations: [{ page: 1, quote: 'q' }] })
  })

  it('returns 500 when the upsert fails', async () => {
    const from = jest.fn()
    from.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { id: 'doc-1' }, error: null }),
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
    mockBuildContext.mockResolvedValue({ pagesText: 'text', highlightsText: '', pageNumbers: [1] })
    mockAskAI.mockResolvedValue({ role: 'assistant', content: 'answer', citations: [{ page: 1, quote: 'q' }] })

    const res = await POST(postRequest({ question: 'What is this about?' }), ctx('doc-1'))

    expect(res.status).toBe(500)
  })
})
