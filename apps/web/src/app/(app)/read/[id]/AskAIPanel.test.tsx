import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AskAIPanel } from './AskAIPanel'

let fetchMock: jest.Mock

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve({ ok: status < 400, status, json: async () => body }) as unknown as Promise<Response>
}

beforeEach(() => {
  fetchMock = jest.fn((url: unknown, opts?: RequestInit) => {
    const u = String(url)
    if (u.endsWith('/ask') && opts?.method === 'POST') {
      const { question } = JSON.parse(opts.body as string)
      return jsonResponse({ message: { role: 'assistant', content: `Answer to: ${question}`, citations: [{ page: 3, quote: 'source text' }] } }, 201)
    }
    return jsonResponse({ messages: [] })
  })
  global.fetch = fetchMock as unknown as typeof fetch
})

describe('AskAIPanel', () => {
  it('loads and displays existing conversation history on mount', async () => {
    fetchMock.mockImplementationOnce(() =>
      jsonResponse({ messages: [{ role: 'user', content: 'earlier question' }, { role: 'assistant', content: 'earlier answer' }] })
    )

    render(<AskAIPanel documentId="doc-1" onCitationClick={jest.fn()} onClose={jest.fn()} />)

    expect(await screen.findByText('earlier question')).toBeInTheDocument()
    expect(screen.getByText('earlier answer')).toBeInTheDocument()
  })

  it('shows an empty-state prompt when there is no history', async () => {
    render(<AskAIPanel documentId="doc-1" onCitationClick={jest.fn()} onClose={jest.fn()} />)

    expect(await screen.findByText('Ask a question about this document.')).toBeInTheDocument()
  })

  it('sends a question and renders the answer with citation chips', async () => {
    render(<AskAIPanel documentId="doc-1" onCitationClick={jest.fn()} onClose={jest.fn()} />)
    await screen.findByText('Ask a question about this document.')

    fireEvent.change(screen.getByPlaceholderText('Ask a question…'), { target: { value: 'What is this about?' } })
    fireEvent.click(screen.getByText('Send'))

    expect(screen.getByText('What is this about?')).toBeInTheDocument()
    expect(await screen.findByText('Answer to: What is this about?')).toBeInTheDocument()
    expect(screen.getByText('p.3')).toBeInTheDocument()
  })

  it('calls onCitationClick with the page number when a citation chip is clicked', async () => {
    const onCitationClick = jest.fn()
    render(<AskAIPanel documentId="doc-1" onCitationClick={onCitationClick} onClose={jest.fn()} />)
    await screen.findByText('Ask a question about this document.')

    fireEvent.change(screen.getByPlaceholderText('Ask a question…'), { target: { value: 'Q' } })
    fireEvent.click(screen.getByText('Send'))
    fireEvent.click(await screen.findByText('p.3'))

    expect(onCitationClick).toHaveBeenCalledWith(3)
  })

  it('shows an error message when the request fails, without losing the typed question', async () => {
    fetchMock.mockImplementation((url: unknown, opts?: RequestInit) => {
      if (String(url).endsWith('/ask') && opts?.method === 'POST') {
        return jsonResponse({ error: 'AI is not configured' }, 503)
      }
      return jsonResponse({ messages: [] })
    })
    render(<AskAIPanel documentId="doc-1" onCitationClick={jest.fn()} onClose={jest.fn()} />)
    await screen.findByText('Ask a question about this document.')

    fireEvent.change(screen.getByPlaceholderText('Ask a question…'), { target: { value: 'Q' } })
    fireEvent.click(screen.getByText('Send'))

    expect(await screen.findByText('AI is not configured')).toBeInTheDocument()
    expect(screen.getByText('Q')).toBeInTheDocument()
  })

  it('calls onClose when the close button is clicked', async () => {
    const onClose = jest.fn()
    render(<AskAIPanel documentId="doc-1" onCitationClick={jest.fn()} onClose={onClose} />)

    fireEvent.click(screen.getByLabelText('Close'))

    expect(onClose).toHaveBeenCalled()
  })

  it('does not send an empty or whitespace-only question', async () => {
    render(<AskAIPanel documentId="doc-1" onCitationClick={jest.fn()} onClose={jest.fn()} />)
    await screen.findByText('Ask a question about this document.')
    fetchMock.mockClear()

    fireEvent.change(screen.getByPlaceholderText('Ask a question…'), { target: { value: '   ' } })
    fireEvent.click(screen.getByText('Send'))

    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled())
  })
})
