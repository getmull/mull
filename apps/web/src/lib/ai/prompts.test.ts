import { HIGHLIGHT_ACTIONS, isHighlightAction, buildHighlightActionPrompt, buildHighlightActionSeedMessage } from './prompts'

describe('isHighlightAction', () => {
  it.each(HIGHLIGHT_ACTIONS)('accepts %s', (action) => {
    expect(isHighlightAction(action)).toBe(true)
  })

  it('rejects an unknown string', () => {
    expect(isHighlightAction('summarize')).toBe(false)
  })

  it('rejects non-string values', () => {
    expect(isHighlightAction(null)).toBe(false)
    expect(isHighlightAction(undefined)).toBe(false)
    expect(isHighlightAction(42)).toBe(false)
  })
})

describe('buildHighlightActionPrompt', () => {
  it.each(HIGHLIGHT_ACTIONS)('includes the passage text for %s', (action) => {
    const prompt = buildHighlightActionPrompt(action, 'the mitochondria is the powerhouse of the cell')
    expect(prompt).toContain('the mitochondria is the powerhouse of the cell')
  })

  it('produces a distinct prompt per action', () => {
    const prompts = HIGHLIGHT_ACTIONS.map((a) => buildHighlightActionPrompt(a, 'sample text'))
    expect(new Set(prompts).size).toBe(HIGHLIGHT_ACTIONS.length)
  })

  it('asks translate to target English', () => {
    expect(buildHighlightActionPrompt('translate', 'bonjour')).toMatch(/English/)
  })
})

describe('buildHighlightActionSeedMessage', () => {
  it.each(HIGHLIGHT_ACTIONS)('returns a non-empty message for %s', (action) => {
    expect(buildHighlightActionSeedMessage(action).length).toBeGreaterThan(0)
  })

  it('produces a distinct message per action', () => {
    const messages = HIGHLIGHT_ACTIONS.map((a) => buildHighlightActionSeedMessage(a))
    expect(new Set(messages).size).toBe(HIGHLIGHT_ACTIONS.length)
  })
})
