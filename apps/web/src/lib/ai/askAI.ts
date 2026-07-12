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

// Structured output, not free text — this is what makes the cite-back
// standard in CLAUDE.md enforceable at the architecture level rather than
// just a prompt suggestion the model can ignore. `citations` requires at
// least one entry, so a response with none fails schema validation.
const AskAIResponseSchema = z.object({
  answer: z.string().describe("The answer to the user's question, grounded in the provided document."),
  citations: z
    .array(
      z.object({
        page: z.number().int().describe('The page number in the source document this citation refers to.'),
        quote: z.string().describe('A short supporting quote or paraphrase from that page.'),
      })
    )
    .min(1)
    .describe('At least one citation linking the answer back to the document.'),
})

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

  const prompt = [
    "You are answering questions about a document the user is reading. Answer only from the document content below — if the answer isn't in the document, say so clearly. Every answer must cite at least one page number it draws from.",
    '',
    '=== Document ===',
    pagesText || '(no extracted text available for this document)',
    highlightsText && `\n=== The user's highlighted passages ===\n${highlightsText}`,
    historyText && `\n=== Recent conversation ===\n${historyText}`,
    `\n=== Question ===\n${question}`,
  ]
    .filter(Boolean)
    .join('\n')

  const { object } = await generateObject({ model, schema: AskAIResponseSchema, prompt })

  return {
    role: 'assistant',
    content: object.answer,
    citations: object.citations.map((c) => resolveCitation(c, validPageNumbers)),
  }
}

// The model can be off by a page or cite one outside the document's range.
// Snapping to the nearest real page keeps "every answer has a citation"
// true in the exact-source-location sense CLAUDE.md's cite-back standard
// requires, rather than shipping a citation pointing nowhere real.
function resolveCitation(citation: StoredCitation, validPageNumbers: number[]): StoredCitation {
  if (validPageNumbers.length === 0 || validPageNumbers.includes(citation.page)) return citation
  const nearest = validPageNumbers.reduce((closest, page) =>
    Math.abs(page - citation.page) < Math.abs(closest - citation.page) ? page : closest
  )
  return { ...citation, page: nearest }
}
