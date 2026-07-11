import 'server-only'
import { generateText, type LanguageModel } from 'ai'
import { type HighlightAction, buildHighlightActionPrompt } from './prompts'

export interface HighlightChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface HighlightChatParams {
  model: LanguageModel
  highlightText: string
  pageRef: number | null
  pageContext: string
  history: HighlightChatMessage[]
  /** Exactly one of these is set per call — the route enforces this. */
  action?: HighlightAction
  message?: string
}

export async function chatAboutHighlight({
  model,
  highlightText,
  pageRef,
  pageContext,
  history,
  action,
  message,
}: HighlightChatParams): Promise<HighlightChatMessage> {
  const historyText = history
    .slice(-10)
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n')

  // Seed turns reuse the exact instruction the old one-shot actions endpoint
  // used, so Explain/Define/Simplify/Translate behave identically to
  // before — just inside a persisted thread instead of a throwaway call.
  const turnInstruction = action
    ? buildHighlightActionPrompt(action, highlightText)
    : `Continue the conversation about the passage below. Answer the user's question, grounded in the passage and (if relevant) the surrounding page text. Stay focused on this passage — you are not answering questions about the rest of the document.\n\nUser: ${message}`

  const prompt = [
    `You are discussing a single highlighted passage a user selected on page ${pageRef ?? '?'} of a document they're reading. This passage — and this page — are the entire scope of the conversation.`,
    '',
    '=== Highlighted passage ===',
    `"""\n${highlightText}\n"""`,
    pageContext && `\n=== Full text of page ${pageRef ?? '?'} (for surrounding context) ===\n${pageContext}`,
    historyText && `\n=== Conversation so far ===\n${historyText}`,
    `\n=== ${action ? 'Instruction' : 'Next message'} ===\n${turnInstruction}`,
  ]
    .filter(Boolean)
    .join('\n')

  const { text } = await generateText({ model, prompt })
  return { role: 'assistant', content: text }
}
