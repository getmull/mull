import { getAIProviderConfig, isAIConfigured } from './config'

const AI_ENV_KEYS = [
  'AI_PROVIDER',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_MODEL',
  'OPENAI_API_KEY',
  'OPENAI_MODEL',
  'OLLAMA_BASE_URL',
  'OLLAMA_MODEL',
  'OLLAMA_API_KEY',
  'AI_BASE_URL',
  'AI_API_KEY',
  'AI_MODEL',
] as const

beforeEach(() => {
  for (const key of AI_ENV_KEYS) delete process.env[key]
})

describe('getAIProviderConfig', () => {
  it('returns null when AI_PROVIDER is unset', () => {
    expect(getAIProviderConfig()).toBeNull()
  })

  it('returns null for an unrecognized AI_PROVIDER value', () => {
    process.env.AI_PROVIDER = 'bedrock'
    expect(getAIProviderConfig()).toBeNull()
  })

  describe('anthropic', () => {
    it('returns config with the default model when ANTHROPIC_MODEL is unset', () => {
      process.env.AI_PROVIDER = 'anthropic'
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test'

      expect(getAIProviderConfig()).toEqual({
        provider: 'anthropic',
        apiKey: 'sk-ant-test',
        model: 'claude-sonnet-4-6',
      })
    })

    it('respects an explicit ANTHROPIC_MODEL', () => {
      process.env.AI_PROVIDER = 'anthropic'
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test'
      process.env.ANTHROPIC_MODEL = 'claude-haiku-4-5'

      expect(getAIProviderConfig()).toMatchObject({ model: 'claude-haiku-4-5' })
    })

    it('returns null when ANTHROPIC_API_KEY is missing', () => {
      process.env.AI_PROVIDER = 'anthropic'
      expect(getAIProviderConfig()).toBeNull()
    })
  })

  describe('openai', () => {
    it('returns config with the default model when OPENAI_MODEL is unset', () => {
      process.env.AI_PROVIDER = 'openai'
      process.env.OPENAI_API_KEY = 'sk-openai-test'

      expect(getAIProviderConfig()).toEqual({
        provider: 'openai',
        apiKey: 'sk-openai-test',
        model: 'gpt-5.1',
      })
    })

    it('respects an explicit OPENAI_MODEL', () => {
      process.env.AI_PROVIDER = 'openai'
      process.env.OPENAI_API_KEY = 'sk-openai-test'
      process.env.OPENAI_MODEL = 'gpt-5-mini'

      expect(getAIProviderConfig()).toMatchObject({ model: 'gpt-5-mini' })
    })

    it('returns null when OPENAI_API_KEY is missing', () => {
      process.env.AI_PROVIDER = 'openai'
      expect(getAIProviderConfig()).toBeNull()
    })
  })

  describe('ollama', () => {
    it('returns a fully-defaulted config when only AI_PROVIDER is set', () => {
      process.env.AI_PROVIDER = 'ollama'

      expect(getAIProviderConfig()).toEqual({
        provider: 'ollama',
        baseURL: 'http://localhost:11434/v1',
        model: 'llama3.1',
        apiKey: 'ollama',
      })
    })

    it('respects explicit overrides', () => {
      process.env.AI_PROVIDER = 'ollama'
      process.env.OLLAMA_BASE_URL = 'http://host.docker.internal:11434/v1'
      process.env.OLLAMA_MODEL = 'mistral'
      process.env.OLLAMA_API_KEY = 'custom-key'

      expect(getAIProviderConfig()).toEqual({
        provider: 'ollama',
        baseURL: 'http://host.docker.internal:11434/v1',
        model: 'mistral',
        apiKey: 'custom-key',
      })
    })
  })

  describe('custom', () => {
    it('returns config when all three vars are set', () => {
      process.env.AI_PROVIDER = 'custom'
      process.env.AI_BASE_URL = 'https://api.groq.com/openai/v1'
      process.env.AI_API_KEY = 'groq-key'
      process.env.AI_MODEL = 'llama-3.3-70b'

      expect(getAIProviderConfig()).toEqual({
        provider: 'custom',
        baseURL: 'https://api.groq.com/openai/v1',
        apiKey: 'groq-key',
        model: 'llama-3.3-70b',
      })
    })

    it.each(['AI_BASE_URL', 'AI_API_KEY', 'AI_MODEL'])('returns null when %s is missing', (missingKey) => {
      process.env.AI_PROVIDER = 'custom'
      process.env.AI_BASE_URL = 'https://api.groq.com/openai/v1'
      process.env.AI_API_KEY = 'groq-key'
      process.env.AI_MODEL = 'llama-3.3-70b'
      delete process.env[missingKey]

      expect(getAIProviderConfig()).toBeNull()
    })
  })
})

describe('isAIConfigured', () => {
  it('returns false when unconfigured', () => {
    expect(isAIConfigured()).toBe(false)
  })

  it('returns true when a provider is fully configured', () => {
    process.env.AI_PROVIDER = 'ollama'
    expect(isAIConfigured()).toBe(true)
  })
})
