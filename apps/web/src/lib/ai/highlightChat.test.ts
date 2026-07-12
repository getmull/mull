/**
 * @jest-environment node
 */
import { chatAboutHighlight } from './highlightChat'
import { generateText } from 'ai'

jest.mock('ai', () => ({ generateText: jest.fn() }))

const mockGenerateText = generateText as jest.Mock

describe('chatAboutHighlight', () => {
  beforeEach(() => {
    mockGenerateText.mockReset()
  })

  it('returns an assistant message with no citations field', async () => {
    mockGenerateText.mockResolvedValue({ text: 'The mitochondria is the powerhouse of the cell.' })

    const result = await chatAboutHighlight({
      model: { modelId: 'mock' } as never,
      highlightText: 'the mitochondria',
      pageRef: 3,
      pageContext: '',
      history: [],
      action: 'explain',
    })

    expect(result).toEqual({ role: 'assistant', content: 'The mitochondria is the powerhouse of the cell.' })
    expect(result).not.toHaveProperty('citations')
  })

  it('includes the per-action instruction and passage for a seed turn', async () => {
    mockGenerateText.mockResolvedValue({ text: 'A' })

    await chatAboutHighlight({
      model: { modelId: 'mock' } as never,
      highlightText: 'sample passage',
      pageRef: 1,
      pageContext: '',
      history: [],
      action: 'define',
    })

    const { prompt } = mockGenerateText.mock.calls[0][0]
    expect(prompt).toContain('sample passage')
    expect(prompt).toContain('Define the key term')
  })

  it('includes the freeform message and continuation framing when no action is given', async () => {
    mockGenerateText.mockResolvedValue({ text: 'A' })

    await chatAboutHighlight({
      model: { modelId: 'mock' } as never,
      highlightText: 'sample passage',
      pageRef: 1,
      pageContext: '',
      history: [],
      message: 'What does "it" refer to?',
    })

    const { prompt } = mockGenerateText.mock.calls[0][0]
    expect(prompt).toContain('What does "it" refer to?')
    expect(prompt).toContain('Continue the conversation')
  })

  it('includes page context only when provided', async () => {
    mockGenerateText.mockResolvedValue({ text: 'A' })

    await chatAboutHighlight({
      model: { modelId: 'mock' } as never,
      highlightText: 'passage',
      pageRef: 2,
      pageContext: 'Full page body text',
      history: [],
      action: 'explain',
    })
    const { prompt: withContext } = mockGenerateText.mock.calls[0][0]
    expect(withContext).toContain('Full page body text')

    mockGenerateText.mockClear()
    await chatAboutHighlight({
      model: { modelId: 'mock' } as never,
      highlightText: 'passage',
      pageRef: 2,
      pageContext: '',
      history: [],
      action: 'explain',
    })
    const { prompt: withoutContext } = mockGenerateText.mock.calls[0][0]
    expect(withoutContext).not.toContain('surrounding context')
  })

  it('includes conversation history, truncated to the last 10 turns', async () => {
    mockGenerateText.mockResolvedValue({ text: 'A' })
    const history = Array.from({ length: 15 }, (_, i) => ({
      role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
      content: `turn-${i}`,
    }))

    await chatAboutHighlight({
      model: { modelId: 'mock' } as never,
      highlightText: 'passage',
      pageRef: 1,
      pageContext: '',
      history,
      message: 'follow-up',
    })

    const { prompt } = mockGenerateText.mock.calls[0][0]
    expect(prompt).not.toContain('turn-4')
    expect(prompt).toContain('turn-5')
    expect(prompt).toContain('turn-14')
  })
})
