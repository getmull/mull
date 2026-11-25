import { getAIModel, getAIStatus, logAIError } from './provider'
import { getAIProviderConfig } from './config'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'

jest.mock('./config', () => ({ getAIProviderConfig: jest.fn() }))
jest.mock('@ai-sdk/anthropic', () => ({ createAnthropic: jest.fn() }))
jest.mock('@ai-sdk/openai', () => ({ createOpenAI: jest.fn() }))
jest.mock('@ai-sdk/openai-compatible', () => ({ createOpenAICompatible: jest.fn() }))

const mockGetConfig = getAIProviderConfig as jest.Mock
const mockCreateAnthropic = createAnthropic as jest.Mock
const mockCreateOpenAI = createOpenAI as jest.Mock
const mockCreateOpenAICompatible = createOpenAICompatible as jest.Mock

function mockModelFactory(returnValue: unknown = { modelId: 'mock-model' }) {
  const modelFactory = jest.fn().mockReturnValue(returnValue)
  return modelFactory
}

describe('getAIModel', () => {
  beforeEach(() => {
    mockGetConfig.mockReset()
    mockCreateAnthropic.mockReset()
    mockCreateOpenAI.mockReset()
    mockCreateOpenAICompatible.mockReset()
  })

  it('returns null when no provider is configured', () => {
    mockGetConfig.mockReturnValue(null)

    expect(getAIModel()).toBeNull()
    expect(mockCreateAnthropic).not.toHaveBeenCalled()
  })

  it('resolves an Anthropic model', () => {
    mockGetConfig.mockReturnValue({ provider: 'anthropic', apiKey: 'sk-ant', model: 'claude-sonnet-4-6' })
    const modelFactory = mockModelFactory()
    mockCreateAnthropic.mockReturnValue(modelFactory)

    const result = getAIModel()

    expect(mockCreateAnthropic).toHaveBeenCalledWith({ apiKey: 'sk-ant' })
    expect(modelFactory).toHaveBeenCalledWith('claude-sonnet-4-6')
    expect(result).toEqual({ modelId: 'mock-model' })
  })

  it('resolves an OpenAI model', () => {
    mockGetConfig.mockReturnValue({ provider: 'openai', apiKey: 'sk-oa', model: 'gpt-5.1' })
    const modelFactory = mockModelFactory()
    mockCreateOpenAI.mockReturnValue(modelFactory)

    getAIModel()

    expect(mockCreateOpenAI).toHaveBeenCalledWith({ apiKey: 'sk-oa' })
    expect(modelFactory).toHaveBeenCalledWith('gpt-5.1')
  })

  it('resolves an Ollama model via the OpenAI-compatible adapter, forcing structured-output support', () => {
    mockGetConfig.mockReturnValue({
      provider: 'ollama',
      baseURL: 'http://localhost:11434/v1',
      apiKey: 'ollama',
      model: 'llama3.1',
    })
    const modelFactory = mockModelFactory()
    mockCreateOpenAICompatible.mockReturnValue(modelFactory)

    const result = getAIModel()

    expect(mockCreateOpenAICompatible).toHaveBeenCalledWith({
      name: 'ollama',
      baseURL: 'http://localhost:11434/v1',
      apiKey: 'ollama',
      supportsStructuredOutputs: true,
    })
    expect(modelFactory).toHaveBeenCalledWith('llama3.1')
    expect(result).toEqual({ modelId: 'mock-model' })
  })

  it('resolves a custom model via the OpenAI-compatible adapter', () => {
    mockGetConfig.mockReturnValue({
      provider: 'custom',
      baseURL: 'https://api.groq.com/openai/v1',
      apiKey: 'groq-key',
      model: 'llama-3.3-70b',
    })
    const modelFactory = mockModelFactory()
    mockCreateOpenAICompatible.mockReturnValue(modelFactory)

    getAIModel()

    expect(mockCreateOpenAICompatible).toHaveBeenCalledWith({
      name: 'custom',
      baseURL: 'https://api.groq.com/openai/v1',
      apiKey: 'groq-key',
    })
    expect(modelFactory).toHaveBeenCalledWith('llama-3.3-70b')
  })

  it('returns null instead of throwing if provider construction fails', () => {
    mockGetConfig.mockReturnValue({ provider: 'anthropic', apiKey: 'sk-ant', model: 'claude-sonnet-4-6' })
    mockCreateAnthropic.mockImplementation(() => {
      throw new Error('boom')
    })

    expect(getAIModel()).toBeNull()
  })
})

describe('getAIStatus', () => {
  beforeEach(() => {
    mockGetConfig.mockReset()
  })

  it('reports unconfigured when there is no provider config', () => {
    mockGetConfig.mockReturnValue(null)

    expect(getAIStatus()).toEqual({ configured: false, provider: null })
  })

  it('reports the active provider when configured', () => {
    mockGetConfig.mockReturnValue({ provider: 'ollama', baseURL: 'x', apiKey: 'x', model: 'x' })

    expect(getAIStatus()).toEqual({ configured: true, provider: 'ollama' })
  })
})

describe('logAIError', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('logs only the error class, status code, and provider — never the message or request details', () => {
    mockGetConfig.mockReturnValue({ provider: 'anthropic', apiKey: 'sk-ant-secret', model: 'claude-sonnet-4-6' })
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    const error = Object.assign(new Error('prompt text: secret document contents'), {
      name: 'AI_APICallError',
      statusCode: 429,
      requestBodyValues: { prompt: 'secret document contents' },
      responseHeaders: { authorization: 'sk-ant-secret' },
    })

    logAIError('ask', error)

    expect(consoleError).toHaveBeenCalledWith('[ask] AI request failed', {
      name: 'AI_APICallError',
      statusCode: 429,
      provider: 'anthropic',
    })
    const logged = JSON.stringify(consoleError.mock.calls)
    expect(logged).not.toContain('secret')
  })

  it('reads the status code from a RetryError lastError', () => {
    mockGetConfig.mockReturnValue({ provider: 'openai', apiKey: 'sk', model: 'gpt-5.1' })
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    const error = Object.assign(new Error('retries exhausted'), {
      name: 'AI_RetryError',
      lastError: Object.assign(new Error('x'), { statusCode: 503 }),
    })

    logAIError('chat', error)

    expect(consoleError).toHaveBeenCalledWith('[chat] AI request failed', {
      name: 'AI_RetryError',
      statusCode: 503,
      provider: 'openai',
    })
  })
})
