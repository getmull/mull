export const HIGHLIGHT_ACTIONS = ['explain', 'define', 'simplify', 'translate'] as const

export type HighlightAction = (typeof HIGHLIGHT_ACTIONS)[number]

export function isHighlightAction(value: unknown): value is HighlightAction {
  return typeof value === 'string' && (HIGHLIGHT_ACTIONS as readonly string[]).includes(value)
}

// V1: translation always targets English (the common case — reading a
// foreign-language source and translating passages into the reader's own
// language). Making the target configurable is a future extension, not this pass.
const TRANSLATE_TARGET_LANGUAGE = 'English'

export function buildHighlightActionPrompt(action: HighlightAction, text: string): string {
  switch (action) {
    case 'explain':
      return `Explain the following passage clearly and concisely, in plain language. Do not repeat the passage back verbatim.\n\nPassage:\n"""\n${text}\n"""`
    case 'define':
      return `Define the key term(s) or concept(s) in the following passage. If there are multiple, define each briefly.\n\nPassage:\n"""\n${text}\n"""`
    case 'simplify':
      return `Rewrite the following passage in simpler language, suitable for a general reader, while preserving its meaning.\n\nPassage:\n"""\n${text}\n"""`
    case 'translate':
      return `Translate the following passage into ${TRANSLATE_TARGET_LANGUAGE}. Reply with only the translation, nothing else.\n\nPassage:\n"""\n${text}\n"""`
  }
}
