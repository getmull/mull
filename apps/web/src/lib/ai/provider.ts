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
        return createOpenAICompatible({ name: 'ollama', baseURL: config.baseURL, apiKey: config.apiKey })(config.model)
      case 'custom':
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
