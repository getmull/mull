/**
 * @jest-environment node
 */
import { askAI } from './askAI'
import { generateObject } from 'ai'
import { z } from 'zod'

jest.mock('ai', () => ({ generateObject: jest.fn() }))

const mockGenerateObject = generateObject as jest.Mock

describe('askAI', () => {
  beforeEach(() => {
    mockGenerateObject.mockReset()
  })

  it('returns an assistant message with the model-provided citations', async () => {
    mockGenerateObject.mockResolvedValue({
      object: {
        result: 'grounded',
        answer: 'The mitochondria is the powerhouse of the cell.',
        citations: [{ page: 3, quote: 'powerhouse of the cell' }],
      },
    })

    const result = await askAI({
      model: { modelId: 'mock' } as never,
      question: 'What is the mitochondria?',
      pagesText: '--- Page 3 ---\nThe mitochondria is the powerhouse of the cell.',
      highlightsText: '',
      history: [],
      validPageNumbers: [1, 2, 3, 4],
    })

    expect(result).toEqual({
      role: 'assistant',
      content: 'The mitochondria is the powerhouse of the cell.',
      citations: [{ page: 3, quote: 'powerhouse of the cell' }],
    })
  })

  it('throws when the model cites a page outside the allowed page list', async () => {
    mockGenerateObject.mockResolvedValue({
      object: { result: 'grounded', answer: 'Answer text', citations: [{ page: 99, quote: 'something' }] },
    })

    await expect(
      askAI({
        model: { modelId: 'mock' } as never,
        question: 'Q',
        pagesText: 'text',
        highlightsText: '',
        history: [],
        validPageNumbers: [1, 2, 3],
      })
    ).rejects.toThrow('outside allowed page numbers')
  })

  it('throws on grounded answers when no valid page list is available', async () => {
    mockGenerateObject.mockResolvedValue({
      object: { result: 'grounded', answer: 'Answer text', citations: [{ page: 42, quote: 'something' }] },
    })

    await expect(
      askAI({
        model: { modelId: 'mock' } as never,
        question: 'Q',
        pagesText: 'text',
        highlightsText: '',
        history: [],
        validPageNumbers: [],
      })
    ).rejects.toThrow('No valid page numbers')
  })

  it('throws when a grounded answer has no citations', async () => {
    mockGenerateObject.mockResolvedValue({
      object: { result: 'grounded', answer: 'Answer text', citations: [] },
    })

    await expect(
      askAI({
        model: { modelId: 'mock' } as never,
        question: 'Q',
        pagesText: 'text',
        highlightsText: '',
        history: [],
        validPageNumbers: [1, 2, 3],
      })
    ).rejects.toThrow('without citations')
  })

  it('drops any citations the model returned on a not_found response', async () => {
    mockGenerateObject.mockResolvedValue({
      object: {
        result: 'not_found',
        answer: "I couldn't find that in the provided document text.",
        citations: [{ page: 1, quote: 'fabricated' }],
      },
    })

    const result = await askAI({
      model: { modelId: 'mock' } as never,
      question: 'Q',
      pagesText: 'text',
      highlightsText: '',
      history: [],
      validPageNumbers: [1],
    })

    expect(result).toEqual({
      role: 'assistant',
      content: "I couldn't find that in the provided document text.",
    })
  })

  it('uses a flat object schema with a timeout and a single retry', async () => {
    mockGenerateObject.mockResolvedValue({ object: { result: 'grounded', answer: 'A', citations: [{ page: 1, quote: 'q' }] } })

    await askAI({
      model: { modelId: 'mock' } as never,
      question: 'Q',
      pagesText: 'text',
      highlightsText: '',
      history: [],
      validPageNumbers: [1],
    })

    const { schema, maxRetries, abortSignal } = mockGenerateObject.mock.calls[0][0]
    expect(z.toJSONSchema(schema)).toMatchObject({
      type: 'object',
      properties: { result: { enum: ['grounded', 'not_found'] } },
      required: ['result', 'answer', 'citations'],
    })
    expect(maxRetries).toBe(1)
    expect(abortSignal).toBeInstanceOf(AbortSignal)
  })

  it('includes the question, document text, highlights, and recent history in the prompt', async () => {
    mockGenerateObject.mockResolvedValue({ object: { result: 'grounded', answer: 'A', citations: [{ page: 1, quote: 'q' }] } })

    await askAI({
      model: { modelId: 'mock' } as never,
      question: 'What did I highlight?',
      pagesText: 'Document body text',
      highlightsText: '- (page 1) "important passage"',
      history: [{ role: 'user', content: 'earlier question' }, { role: 'assistant', content: 'earlier answer' }],
      validPageNumbers: [1],
    })

    const { prompt } = mockGenerateObject.mock.calls[0][0]
    expect(prompt).toContain('What did I highlight?')
    expect(prompt).toContain('Document body text')
    expect(prompt).toContain('important passage')
    expect(prompt).toContain('earlier question')
    expect(prompt).toContain('earlier answer')
  })

  it('only includes the last 10 history turns', async () => {
    mockGenerateObject.mockResolvedValue({ object: { result: 'grounded', answer: 'A', citations: [{ page: 1, quote: 'q' }] } })
    const history = Array.from({ length: 15 }, (_, i) => ({ role: 'user' as const, content: `turn-${i}` }))

    await askAI({
      model: { modelId: 'mock' } as never,
      question: 'Q',
      pagesText: 'text',
      highlightsText: '',
      history,
      validPageNumbers: [1],
    })

    const { prompt } = mockGenerateObject.mock.calls[0][0]
    expect(prompt).not.toContain('turn-4')
    expect(prompt).toContain('turn-5')
    expect(prompt).toContain('turn-14')
  })
})
