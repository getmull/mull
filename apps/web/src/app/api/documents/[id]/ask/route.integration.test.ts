/** @jest-environment node */
import { NextRequest } from 'next/server'
import { MockLanguageModelV3 } from 'ai/test'
import { POST } from './route'
import { createClient } from '@/lib/supabase/server'
import { getAIModel } from '@/lib/ai/provider'
import { mockSupabaseClient } from '@/test-utils/supabase'

jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/lib/ai/provider', () => ({ getAIModel: jest.fn(), logAIError: jest.fn() }))
// Context selection, prompts, SDK generation, and citation validation are real.
const originalEnv = process.env
beforeEach(() => {
  process.env = { ...originalEnv, NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-key' }
})
afterEach(() => { process.env = originalEnv })

const mockCreateClient = createClient as jest.Mock
const mockGetAIModel = getAIModel as jest.Mock
let client: ReturnType<typeof mockSupabaseClient>

const request = () => new NextRequest('http://localhost/api/documents/doc-1/ask', {
  method: 'POST', body: JSON.stringify({ question: 'What did the zirconium catalyst achieve?' }),
})
const ctx = () => ({ params: Promise.resolve({ id: 'doc-1' }) })

function modelFor(citations: { page: number; quote: string }[]) {
  return new MockLanguageModelV3({
    doGenerate: async (options) => {
      const prompt = JSON.stringify(options.prompt)
      expect(prompt).toContain('zirconium catalyst reduced reaction time by forty percent')
      expect(prompt).toContain('--- Page 76 ---')
      return {
        content: [{ type: 'text', text: JSON.stringify({ result: 'grounded', answer: 'It reduced reaction time by forty percent.', citations }) }],
        finishReason: { unified: 'stop', raw: undefined },
        usage: {
          inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 20, text: 20, reasoning: undefined },
        },
        warnings: [],
      }
    },
  })
}

beforeEach(() => {
  const pages = Array.from({ length: 80 }, (_, i) => ({ page_number: i + 1, raw_text: 'General background about the experiment. '.repeat(90) }))
  pages[75].raw_text += ' The zirconium catalyst reduced reaction time by forty percent.'
  client = mockSupabaseClient({ fromResults: [
    { data: { id: 'doc-1' }, error: null },
    { data: null, error: null },
    { data: pages, error: null },
    { data: [], error: null },
    // Persistence: re-read the conversation (none yet), then insert it.
    { data: null, error: null },
    { data: null, error: null },
  ] })
  mockCreateClient.mockResolvedValue(client)
})

test('retrieves a late passage, passes it through the real SDK, and persists its exact page citation', async () => {
  const model = modelFor([{ page: 76, quote: 'reduced reaction time by forty percent' }])
  mockGetAIModel.mockReturnValue(model)
  const response = await POST(request(), ctx())
  expect(response.status).toBe(201)
  expect(await response.json()).toEqual({ message: {
    role: 'assistant', content: 'It reduced reaction time by forty percent.',
    citations: [{ page: 76, quote: 'reduced reaction time by forty percent' }],
  } })
  expect(model.doGenerateCalls).toHaveLength(1)
  expect(client.from).toHaveBeenCalledTimes(6)
  expect(client.from.mock.results[5].value.insert).toHaveBeenCalledWith(expect.objectContaining({
    document_id: 'doc-1', user_id: 'user-1',
    messages: expect.arrayContaining([expect.objectContaining({ role: 'assistant', citations: [{ page: 76, quote: 'reduced reaction time by forty percent' }] })]),
  }))
})

test('rejects and does not persist a model citation to a page outside the retrieved source set', async () => {
  mockGetAIModel.mockReturnValue(modelFor([{ page: 9999, quote: 'unverified page' }]))
  const response = await POST(request(), ctx())
  expect(response.status).toBe(502)
  expect(client.from).toHaveBeenCalledTimes(4)
})

test('rejects a source-grounded response without citations through the real SDK validation', async () => {
  mockGetAIModel.mockReturnValue(modelFor([]))
  expect((await POST(request(), ctx())).status).toBe(502)
  expect(client.from).toHaveBeenCalledTimes(4)
})
