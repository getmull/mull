import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { HighlightChatPanel } from './HighlightChatPanel'

let fetchMock: jest.Mock

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve({ ok: status < 400, status, json: async () => body }) as unknown as Promise<Response>
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => { resolve = res })
  return { promise, resolve }
}

beforeEach(() => {
  fetchMock = jest.fn((url: unknown, opts?: RequestInit) => {
    const u = String(url)
    if (u.endsWith('/chat') && opts?.method === 'POST') {
      const body = JSON.parse(opts.body as string)
      if (body.action) {
        return jsonResponse(
          { userMessage: { role: 'user', content: 'Explain this passage.' }, message: { role: 'assistant', content: 'It means X.' } },
          201
        )
      }
      return jsonResponse(
        { userMessage: { role: 'user', content: body.message }, message: { role: 'assistant', content: `Re: ${body.message}` } },
        201
      )
    }
    return jsonResponse({ messages: [] })
  })
  global.fetch = fetchMock as unknown as typeof fetch
})

describe('HighlightChatPanel', () => {
  it('loads and displays existing conversation history on mount', async () => {
    fetchMock.mockImplementationOnce(() =>
      jsonResponse({ messages: [{ role: 'user', content: 'earlier question' }, { role: 'assistant', content: 'earlier answer' }] })
    )

    render(<HighlightChatPanel highlightId="h1" pageRef={3} pendingSeed={null} onSeedHandled={jest.fn()} onClose={jest.fn()} />)

    expect(await screen.findByText('earlier question')).toBeInTheDocument()
    expect(screen.getByText('earlier answer')).toBeInTheDocument()
  })

  it('shows an empty-state prompt and the page number in the header when there is no history', async () => {
    render(<HighlightChatPanel highlightId="h1" pageRef={3} pendingSeed={null} onSeedHandled={jest.fn()} onClose={jest.fn()} />)

    expect(await screen.findByText('Ask a question about this highlight.')).toBeInTheDocument()
    expect(screen.getByText('Chat about this highlight — p. 3')).toBeInTheDocument()
  })

  it('sends a pending seed action once history has loaded, rendering both bubbles from the response', async () => {
    const onSeedHandled = jest.fn()
    render(
      <HighlightChatPanel
        highlightId="h1"
        pageRef={1}
        pendingSeed={{ action: 'explain', token: 1 }}
        onSeedHandled={onSeedHandled}
        onClose={jest.fn()}
      />
    )

    expect(await screen.findByText('Explain this passage.')).toBeInTheDocument()
    expect(await screen.findByText('It means X.')).toBeInTheDocument()
    expect(onSeedHandled).toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/highlights/h1/chat',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ action: 'explain' }) })
    )
  })

  it('sends a freeform message optimistically, then appends the reply', async () => {
    render(<HighlightChatPanel highlightId="h1" pageRef={1} pendingSeed={null} onSeedHandled={jest.fn()} onClose={jest.fn()} />)
    await screen.findByText('Ask a question about this highlight.')

    fireEvent.change(screen.getByPlaceholderText('Ask a follow-up…'), { target: { value: 'What does this mean?' } })
    fireEvent.click(screen.getByText('Send'))

    expect(screen.getByText('What does this mean?')).toBeInTheDocument()
    expect(await screen.findByText('Re: What does this mean?')).toBeInTheDocument()
  })

  it('re-sends the same action when its token changes (repeat click on the same button)', async () => {
    const { rerender } = render(
      <HighlightChatPanel
        highlightId="h1"
        pageRef={1}
        pendingSeed={{ action: 'explain', token: 1 }}
        onSeedHandled={jest.fn()}
        onClose={jest.fn()}
      />
    )
    await screen.findByText('It means X.')
    const postCallsAfterFirst = fetchMock.mock.calls.filter(([, opts]) => opts?.method === 'POST').length
    expect(postCallsAfterFirst).toBe(1)

    rerender(
      <HighlightChatPanel
        highlightId="h1"
        pageRef={1}
        pendingSeed={{ action: 'explain', token: 2 }}
        onSeedHandled={jest.fn()}
        onClose={jest.fn()}
      />
    )

    await waitFor(() => {
      const postCalls = fetchMock.mock.calls.filter(([, opts]) => opts?.method === 'POST').length
      expect(postCalls).toBe(2)
    })
  })

  it('does not send the pending seed until the initial history load resolves, so a slow GET cannot be clobbered', async () => {
    const getDeferred = deferred<Response>()
    fetchMock.mockImplementationOnce(() => getDeferred.promise)

    render(
      <HighlightChatPanel
        highlightId="h1"
        pageRef={1}
        pendingSeed={{ action: 'explain', token: 1 }}
        onSeedHandled={jest.fn()}
        onClose={jest.fn()}
      />
    )

    // GET is still pending — the seed must not have fired yet.
    await act(() => new Promise((r) => setTimeout(r, 0)))
    expect(fetchMock.mock.calls.filter(([, opts]) => opts?.method === 'POST')).toHaveLength(0)

    // Now let the slow GET resolve with some existing history.
    getDeferred.resolve(await jsonResponse({ messages: [{ role: 'user', content: 'earlier' }, { role: 'assistant', content: 'earlier reply' }] }))

    // The seed can now fire, and its messages must land *in addition to*
    // the history the GET returned, not be wiped out by it.
    expect(await screen.findByText('earlier')).toBeInTheDocument()
    expect(await screen.findByText('Explain this passage.')).toBeInTheDocument()
    expect(await screen.findByText('It means X.')).toBeInTheDocument()
  })

  it('calls onClose when the close button is clicked', async () => {
    const onClose = jest.fn()
    render(<HighlightChatPanel highlightId="h1" pageRef={1} pendingSeed={null} onSeedHandled={jest.fn()} onClose={onClose} />)

    fireEvent.click(screen.getByLabelText('Close'))

    expect(onClose).toHaveBeenCalled()
  })

  it('shows an error message when the request fails, without losing the typed message', async () => {
    fetchMock.mockImplementation((url: unknown, opts?: RequestInit) => {
      if (String(url).endsWith('/chat') && opts?.method === 'POST') {
        return jsonResponse({ error: 'AI is not configured' }, 503)
      }
      return jsonResponse({ messages: [] })
    })
    render(<HighlightChatPanel highlightId="h1" pageRef={1} pendingSeed={null} onSeedHandled={jest.fn()} onClose={jest.fn()} />)
    await screen.findByText('Ask a question about this highlight.')

    fireEvent.change(screen.getByPlaceholderText('Ask a follow-up…'), { target: { value: 'Q' } })
    fireEvent.click(screen.getByText('Send'))

    expect(await screen.findByText('AI is not configured')).toBeInTheDocument()
    expect(screen.getByText('Q')).toBeInTheDocument()
  })

  it('does not send an empty or whitespace-only message', async () => {
    render(<HighlightChatPanel highlightId="h1" pageRef={1} pendingSeed={null} onSeedHandled={jest.fn()} onClose={jest.fn()} />)
    await screen.findByText('Ask a question about this highlight.')
    fetchMock.mockClear()

    fireEvent.change(screen.getByPlaceholderText('Ask a follow-up…'), { target: { value: '   ' } })
    fireEvent.click(screen.getByText('Send'))

    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled())
  })
})
