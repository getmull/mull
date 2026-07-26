import 'server-only'
import { z } from 'zod'
import { generateObject, type LanguageModel } from 'ai'

export interface StoredCitation {
  page: number
  quote: string
}

export interface StoredMessage {
  role: 'user' | 'assistant'
  content: string
  citations?: StoredCitation[]
}

const CitationSchema = z.object({
  page: z.number().int().describe('The page number in the source document this citation refers to.'),
  quote: z.string().describe('A short supporting quote or paraphrase from that page.'),
})

// Grounded answers require citations; "not found in provided content" answers
// must not fabricate one.
const AskAIResponseSchema = z.discriminatedUnion('result', [
  z.object({
    result: z.literal('grounded'),
    answer: z.string().describe("The answer to the user's question, grounded in the provided document."),
    citations: z.array(CitationSchema).min(1),
  }),
  z.object({
    result: z.literal('not_found'),
    answer: z.string().describe("A brief response saying the answer is not in the provided document context."),
  }),
])

export interface AskAIParams {
  model: LanguageModel
  question: string
  pagesText: string
  highlightsText: string
  history: StoredMessage[]
  validPageNumbers: number[]
}

export async function askAI({
  model,
  question,
  pagesText,
  highlightsText,
  history,
  validPageNumbers,
}: AskAIParams): Promise<StoredMessage> {
  const historyText = history
    .slice(-10)
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n')

  const validPagesText = validPageNumbers.length > 0
    ? validPageNumbers.join(', ')
    : '(no valid document pages were provided)'

  const prompt = [
    "You are answering questions about a document the user is reading. Answer only from the document content below.",
    "If the answer is not present in the provided content, return result='not_found'.",
    "If the answer is present, return result='grounded' with at least one citation. Each cited page must be one of the allowed page numbers.",
    `Allowed page numbers: ${validPagesText}`,
    '',
    '=== Document ===',
    pagesText || '(no extracted text available for this document)',
    highlightsText && `\n=== The user's highlighted passages ===\n${highlightsText}`,
    historyText && `\n=== Recent conversation ===\n${historyText}`,
    `\n=== Question ===\n${question}`,
  ]
    .filter(Boolean)
    .join('\n')

  const { object } = await generateObject({ model, schema: AskAIResponseSchema, prompt, maxOutputTokens: 700 })

  if (object.result === 'not_found') {
    return {
      role: 'assistant',
      content: object.answer,
    }
  }

  const citations = validateCitations(object.citations, validPageNumbers)

  return {
    role: 'assistant',
    content: object.answer,
    citations,
  }
}

function validateCitations(citations: StoredCitation[], validPageNumbers: number[]): StoredCitation[] {
  if (validPageNumbers.length === 0) {
    throw new Error('No valid page numbers available for grounded response')
  }
  const validPages = new Set(validPageNumbers)
  if (!citations.every((citation) => validPages.has(citation.page))) {
    throw new Error('Model returned citation page outside allowed page numbers')
  }
  return citations
}
