import 'server-only'

export type AIProviderId = 'anthropic' | 'openai' | 'ollama' | 'custom'

export type AIProviderConfig =
  | { provider: 'anthropic'; apiKey: string; model: string }
  | { provider: 'openai'; apiKey: string; model: string }
  | { provider: 'ollama'; baseURL: string; apiKey: string; model: string }
  | { provider: 'custom'; baseURL: string; apiKey: string; model: string }

const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-6'
const DEFAULT_OPENAI_MODEL = 'gpt-5.1'
const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434/v1'
const DEFAULT_OLLAMA_MODEL = 'llama3.1'
const DEFAULT_OLLAMA_API_KEY = 'ollama' // placeholder — Ollama ignores auth, but the client always sends an Authorization header

export function getAIProviderConfig(): AIProviderConfig | null {
  const selected = process.env.AI_PROVIDER?.trim().toLowerCase()
  if (!selected) return null

  switch (selected) {
    case 'anthropic': {
      const apiKey = process.env.ANTHROPIC_API_KEY
      if (!apiKey) return null
      return { provider: 'anthropic', apiKey, model: process.env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL }
    }
    case 'openai': {
      const apiKey = process.env.OPENAI_API_KEY
      if (!apiKey) return null
      return { provider: 'openai', apiKey, model: process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL }
    }
    case 'ollama': {
      return {
        provider: 'ollama',
        baseURL: process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE_URL,
        model: process.env.OLLAMA_MODEL || DEFAULT_OLLAMA_MODEL,
        apiKey: process.env.OLLAMA_API_KEY || DEFAULT_OLLAMA_API_KEY,
      }
    }
    case 'custom': {
      const baseURL = process.env.AI_BASE_URL
      const apiKey = process.env.AI_API_KEY
      const model = process.env.AI_MODEL
      // No safe default for an unknown provider — partial config is treated as unconfigured.
      if (!baseURL || !apiKey || !model) return null
      return { provider: 'custom', baseURL, apiKey, model }
    }
    default:
      return null
  }
}

export function isAIConfigured(): boolean {
  return getAIProviderConfig() !== null
}
