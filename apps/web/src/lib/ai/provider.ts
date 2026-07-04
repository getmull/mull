import 'server-only'
import type { LanguageModel } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { getAIProviderConfig, type AIProviderId } from './config'

export function getAIModel(): LanguageModel | null {
  const config = getAIProviderConfig()
  if (!config) return null

  try {
    switch (config.provider) {
      case 'anthropic':
        return createAnthropic({ apiKey: config.apiKey })(config.model)
      case 'openai':
        return createOpenAI({ apiKey: config.apiKey })(config.model)
      case 'ollama':
        // Ollama enforces the JSON schema server-side via grammar-constrained
        // decoding regardless of model size — without this flag, generateObject
        // falls back to a loosely-prompted "just return JSON" instruction that
        // small local models frequently fail to follow exactly. Note: this has
        // to be a top-level provider option, not a per-model-call option —
        // @ai-sdk/openai-compatible@2.0.56's `.languageModel(id, config)`
        // accepts a config argument per its types but silently ignores it.
        return createOpenAICompatible({
          name: 'ollama',
          baseURL: config.baseURL,
          apiKey: config.apiKey,
          supportsStructuredOutputs: true,
        })(config.model)
      case 'custom':
        // Unknown provider — can't assume structured-output support, so this
        // stays on the SDK's default (prompted, unenforced) JSON mode.
        return createOpenAICompatible({ name: 'custom', baseURL: config.baseURL, apiKey: config.apiKey })(config.model)
    }
  } catch {
    return null
  }
}

export interface AIStatus {
  configured: boolean
  provider: AIProviderId | null
}

export function getAIStatus(): AIStatus {
  const config = getAIProviderConfig()
  return { configured: config !== null, provider: config?.provider ?? null }
}
