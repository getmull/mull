import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PDFViewer } from './PDFViewer'

interface Rect { x: number; y: number; width: number; height: number }
interface HighlightFixture {
  id: string
  text: string
  color: string
  page_ref: number
  position: Rect[] | Rect | null
  notes?: { id: string; content: string }[]
}

const mockPage = {
  getViewport: jest.fn(() => ({ width: 600, height: 800 })),
  getTextContent: jest.fn().mockResolvedValue({ items: [] }),
  render: jest.fn(() => ({ promise: Promise.resolve(), cancel: jest.fn() })),
  cleanup: jest.fn(),
}
const mockDoc = { numPages: 3, getPage: jest.fn().mockResolvedValue(mockPage) }

jest.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  getDocument: jest.fn(() => ({ promise: Promise.resolve(mockDoc) })),
  TextLayer: jest.fn().mockImplementation(() => ({
    render: jest.fn().mockResolvedValue(undefined),
    cancel: jest.fn(),
  })),
}))

interface BookmarkFixture { id: string; page_number: number; label: string | null }

let highlightsFixture: HighlightFixture[] = []
let bookmarksFixture: BookmarkFixture[] = []
let aiEnabledFixture = false
let fetchMock: jest.Mock

beforeAll(() => {
  // jsdom doesn't implement canvas 2D contexts; the component only calls ctx.scale().
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  HTMLCanvasElement.prototype.getContext = jest.fn(() => ({ scale: jest.fn() })) as any
  // jsdom lays out everything at 0x0; give every element a fixed box so the
  // component's fraction-of-container math (rect / containerRect) is stable.
  jest.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0, top: 0, right: 600, bottom: 800, width: 600, height: 800, x: 0, y: 0, toJSON() {},
  })
})

beforeEach(() => {
  highlightsFixture = []
  bookmarksFixture = []
  aiEnabledFixture = false
  mockPage.getViewport.mockClear()
  mockPage.getTextContent.mockClear()
  mockPage.render.mockClear()
  mockPage.cleanup.mockClear()
  mockDoc.getPage.mockClear()
  fetchMock = jest.fn((url: unknown, opts?: RequestInit) => {
    const u = String(url)
    if (u.includes('/pages/')) {
      const page = Number(u.split('/').at(-1))
      return jsonResponse({ page_number: page, raw_text: `Page ${page} readable source text.\n\nAnother paragraph for reading.` })
    }
    if (u.includes('/signed-url')) {
      return jsonResponse({ url: 'https://signed.example/doc.pdf' })
    }
    if (u === '/api/ai/status') {
      return jsonResponse({ configured: aiEnabledFixture, provider: aiEnabledFixture ? 'ollama' : null })
    }
    if (u.endsWith('/ask')) {
      return jsonResponse({ messages: [] })
    }
    if (u.endsWith('/chat') && opts?.method === 'POST') {
      const body = JSON.parse(opts.body as string)
      if (body.action) {
        return jsonResponse(
          { userMessage: { role: 'user', content: `${body.action} seed` }, message: { role: 'assistant', content: `${body.action} response` } },
          201
        )
      }
      return jsonResponse(
        { userMessage: { role: 'user', content: body.message }, message: { role: 'assistant', content: `Re: ${body.message}` } },
        201
      )
    }
    if (u.endsWith('/chat')) {
      return jsonResponse({ messages: [] })
    }
    if (u.endsWith('/notes') && opts?.method === 'POST') {
      const { content } = JSON.parse(opts.body as string)
      return jsonResponse({ note: { id: 'manual-note-1', content } }, 201)
    }
    if (u.startsWith('/api/notes/') && opts?.method === 'DELETE') {
      return jsonResponse({}, 204)
    }
    if (u === '/api/highlights' && opts?.method === 'POST') {
      const body = JSON.parse(opts.body as string)
      return jsonResponse({ highlight: { id: 'new-highlight', ...body } }, 201)
    }
    if (u.startsWith('/api/highlights/') && opts?.method === 'DELETE') {
      return jsonResponse({}, 204)
    }
    if (u.startsWith('/api/highlights')) {
      return jsonResponse({ highlights: highlightsFixture })
    }
    if (u === '/api/bookmarks' && opts?.method === 'POST') {
      const body = JSON.parse(opts.body as string)
      return jsonResponse({ bookmark: { id: 'new-bookmark', page_number: body.page_number, label: body.label ?? null } }, 201)
    }
    if (u.startsWith('/api/bookmarks/') && opts?.method === 'DELETE') {
      return jsonResponse({}, 204)
    }
    if (u.startsWith('/api/bookmarks')) {
      return jsonResponse({ bookmarks: bookmarksFixture })
    }
    if (u.startsWith('/api/documents/') && opts?.method === 'PATCH') {
      return jsonResponse({})
    }
    return jsonResponse({})
  })
  global.fetch = fetchMock as unknown as typeof fetch
})

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve({ ok: status < 400, status, json: async () => body }) as unknown as Promise<Response>
}

async function renderAndWaitForLoad(props: Partial<React.ComponentProps<typeof PDFViewer>> = {}) {
  const utils = render(
    <PDFViewer documentId="doc-1" pageCount={3} isScanned={false} {...props} />
  )
  await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument())
  // Let the page-render effect's async chain (getPage → render → getTextContent)
  // settle before interacting, so its state updates land inside RTL's act scope.
  await waitFor(() => expect(mockPage.render).toHaveBeenCalled())
  return utils
}

function getPageContainer(container: HTMLElement) {
  return container.querySelector('.textLayer')!.parentElement as HTMLElement
}

function simulateSelection(container: HTMLElement, text: string, rect = { left: 60, top: 100, width: 120, height: 20 }) {
  const textLayer = container.querySelector('.textLayer')!
  const node = document.createElement('span')
  node.textContent = text
  textLayer.appendChild(node)

  const fakeSelection = {
    isCollapsed: false,
    toString: () => text,
    getRangeAt: () => ({
      commonAncestorContainer: node,
      getClientRects: () => [rect],
    }),
    removeAllRanges: jest.fn(),
  }
  window.getSelection = jest.fn(() => fakeSelection as unknown as Selection)
  fireEvent.mouseUp(getPageContainer(container))
  return fakeSelection
}

describe('PDFViewer', () => {
  it('shows a loading state and then the page controls once the PDF resolves', async () => {
    render(<PDFViewer documentId="doc-1" pageCount={3} isScanned={false} />)

    expect(screen.getByText('Loading...')).toBeInTheDocument()

    await waitFor(() => expect(screen.getByText('1 / 3')).toBeInTheDocument())
  })

  it('passes the signed URL to getDocument as a { url } params object (pdfjs-dist 6 dropped the bare-string form)', async () => {
    const { getDocument } = jest.requireMock('pdfjs-dist') as { getDocument: jest.Mock }
    getDocument.mockClear()

    await renderAndWaitForLoad()

    expect(getDocument).toHaveBeenCalledTimes(1)
    expect(getDocument).toHaveBeenCalledWith({ url: 'https://signed.example/doc.pdf' })
  })

  it('shows an error message when the signed URL request fails', async () => {
    fetchMock.mockImplementationOnce(() => jsonResponse({ error: 'nope' }, 500))

    render(<PDFViewer documentId="doc-1" pageCount={3} isScanned={false} />)

    expect(await screen.findByText('Could not load document')).toBeInTheDocument()
  })

  it('shows the scanned-PDF notice when isScanned is true', async () => {
    await renderAndWaitForLoad({ isScanned: true })

    expect(screen.getByText(/appears to be scanned/i)).toBeInTheDocument()
  })

  it('navigates between pages and disables Prev/Next at the bounds', async () => {
    await renderAndWaitForLoad()

    expect(screen.getByText('Prev')).toBeDisabled()
    await act(async () => { fireEvent.click(screen.getByText('Next')) })
    expect(screen.getByText('2 / 3')).toBeInTheDocument()
    expect(screen.getByText('Prev')).not.toBeDisabled()

    await act(async () => { fireEvent.click(screen.getByText('Next')) })
    expect(screen.getByText('3 / 3')).toBeInTheDocument()
    expect(screen.getByText('Next')).toBeDisabled()
  })

  it('opens at initialPage instead of page 1 when the document has reading progress', async () => {
    await renderAndWaitForLoad({ initialPage: 2 })

    expect(screen.getByText('2 / 3')).toBeInTheDocument()
  })

  it('clamps an out-of-range initialPage into the valid page bounds', async () => {
    await renderAndWaitForLoad({ initialPage: 99 })

    expect(screen.getByText('3 / 3')).toBeInTheDocument()
  })

  it('uses the actual PDF page count to resume when extraction metadata is missing', async () => {
    await renderAndWaitForLoad({ initialPage: 3, pageCount: 1 })
    expect(screen.getByText('3 / 3')).toBeInTheDocument()
  })

  it('persists reading progress after navigating, debounced, but not on initial mount', async () => {
    await renderAndWaitForLoad()
    jest.useFakeTimers()
    try {
      act(() => { jest.advanceTimersByTime(2000) })
      expect(fetchMock.mock.calls.some(([u]) => u === '/api/documents/doc-1')).toBe(false)

      await act(async () => { fireEvent.click(screen.getByText('Next')) })
      act(() => { jest.advanceTimersByTime(999) })
      expect(fetchMock.mock.calls.some(([u]) => u === '/api/documents/doc-1')).toBe(false)

      await act(async () => { jest.advanceTimersByTime(1) })
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/documents/doc-1',
        expect.objectContaining({ method: 'PATCH' })
      )
      const [, opts] = fetchMock.mock.calls.find(([u]) => u === '/api/documents/doc-1')!
      const body = JSON.parse((opts as RequestInit).body as string)
      expect(body).toEqual({ last_page: 2, progress_pct: 66.67 })
    } finally {
      jest.useRealTimers()
    }
  })

  it('only persists progress once for several quick page turns, at the page it settles on', async () => {
    await renderAndWaitForLoad()
    jest.useFakeTimers()
    try {
      await act(async () => { fireEvent.click(screen.getByText('Next')) })
      act(() => { jest.advanceTimersByTime(400) })
      await act(async () => { fireEvent.click(screen.getByText('Next')) })
      await act(async () => { jest.advanceTimersByTime(1000) })

      expect(fetchMock.mock.calls.filter(([u]) => u === '/api/documents/doc-1').length).toBe(1)
      const [, opts] = fetchMock.mock.calls.find(([u]) => u === '/api/documents/doc-1')!
      const body = JSON.parse((opts as RequestInit).body as string)
      expect(body.last_page).toBe(3)
    } finally {
      jest.useRealTimers()
    }
  })

  it('zooms in and out within the 50%-300% bounds', async () => {
    await renderAndWaitForLoad()

    expect(screen.getByText('120%')).toBeInTheDocument()
    await act(async () => { fireEvent.click(screen.getByText('+')) })
    expect(screen.getByText('140%')).toBeInTheDocument()
    await act(async () => { fireEvent.click(screen.getByText('-')) })
    await act(async () => { fireEvent.click(screen.getByText('-')) })
    expect(screen.getByText('100%')).toBeInTheDocument()
  })

  it('normalizes a legacy single-Rect highlight position into Rect[]', async () => {
    highlightsFixture = [
      { id: 'h1', text: 'old', color: 'blue', page_ref: 1, position: { x: 0.1, y: 0.1, width: 0.2, height: 0.05 } },
    ]

    const { container } = await renderAndWaitForLoad()

    expect(container.querySelectorAll('div.absolute.bg-blue-300').length).toBe(1)
  })

  it('only renders highlight overlays for the current page', async () => {
    highlightsFixture = [
      { id: 'h1', text: 'page one', color: 'yellow', page_ref: 1, position: [{ x: 0.1, y: 0.1, width: 0.2, height: 0.05 }] },
      { id: 'h2', text: 'page two', color: 'green', page_ref: 2, position: [{ x: 0.1, y: 0.1, width: 0.2, height: 0.05 }] },
    ]

    const { container } = await renderAndWaitForLoad()

    expect(container.querySelectorAll('div.absolute.bg-yellow-300').length).toBe(1)
    expect(container.querySelectorAll('div.absolute.bg-green-300').length).toBe(0)

    await act(async () => { fireEvent.click(screen.getByText('Next')) })

    expect(container.querySelectorAll('div.absolute.bg-yellow-300').length).toBe(0)
    expect(container.querySelectorAll('div.absolute.bg-green-300').length).toBe(1)
  })

  it('selecting text shows the color toolbar, and picking a color saves the highlight', async () => {
    const { container } = await renderAndWaitForLoad()

    simulateSelection(container, 'Hello world')

    expect(await screen.findByTitle('Yellow')).toBeInTheDocument()

    fireEvent.click(screen.getByTitle('Yellow'))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/highlights',
        expect.objectContaining({ method: 'POST' })
      )
    )
    const [, opts] = fetchMock.mock.calls.find(([u]) => u === '/api/highlights')!
    const body = JSON.parse((opts as RequestInit).body as string)
    expect(body).toMatchObject({ document_id: 'doc-1', text: 'Hello world', color: 'yellow', page_ref: 1 })

    await waitFor(() => expect(screen.queryByTitle('Yellow')).not.toBeInTheDocument())
    expect(container.querySelectorAll('div.absolute.bg-yellow-300').length).toBe(1)
  })

  it('dismissing the toolbar clears the selection without saving', async () => {
    const { container } = await renderAndWaitForLoad()

    simulateSelection(container, 'Hello world')
    fireEvent.click(await screen.findByText('✕'))

    expect(screen.queryByTitle('Yellow')).not.toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([u]) => u === '/api/highlights')).toBe(false)
  })

  it('ignores selections shorter than 3 characters', async () => {
    const { container } = await renderAndWaitForLoad()

    simulateSelection(container, 'Hi')

    expect(screen.queryByTitle('Yellow')).not.toBeInTheDocument()
  })

  it('hovering a highlight reveals a Remove button that deletes it', async () => {
    highlightsFixture = [
      { id: 'h1', text: 'target', color: 'pink', page_ref: 1, position: [{ x: 0.1, y: 0.1, width: 0.2, height: 0.05 }] },
    ]
    const { container } = await renderAndWaitForLoad()
    const pageContainer = getPageContainer(container)

    // Center of the highlight rect: x fraction 0.2 * 600 = 120, y fraction 0.125 * 800 = 100
    fireEvent.mouseMove(pageContainer, { clientX: 120, clientY: 100 })

    const removeButton = await screen.findByText('Remove')
    fireEvent.click(removeButton)

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/highlights/h1', expect.objectContaining({ method: 'DELETE' }))
    )
    await waitFor(() => expect(container.querySelectorAll('div.absolute.bg-pink-300').length).toBe(0))
  })

  it('does not show a Remove button when the mouse is outside every highlight', async () => {
    highlightsFixture = [
      { id: 'h1', text: 'target', color: 'pink', page_ref: 1, position: [{ x: 0.1, y: 0.1, width: 0.2, height: 0.05 }] },
    ]
    const { container } = await renderAndWaitForLoad()
    const pageContainer = getPageContainer(container)

    fireEvent.mouseMove(pageContainer, { clientX: 500, clientY: 700 })

    expect(screen.queryByText('Remove')).not.toBeInTheDocument()
  })

  it('hides highlight AI actions when no AI provider is configured', async () => {
    aiEnabledFixture = false
    highlightsFixture = [
      { id: 'h1', text: 'target', color: 'pink', page_ref: 1, position: [{ x: 0.1, y: 0.1, width: 0.2, height: 0.05 }] },
    ]
    const { container } = await renderAndWaitForLoad()
    const pageContainer = getPageContainer(container)

    fireEvent.mouseMove(pageContainer, { clientX: 120, clientY: 100 })
    await screen.findByText('Remove')

    for (const label of ['Explain', 'Define', 'Simplify', 'Translate']) {
      expect(screen.queryByText(label)).not.toBeInTheDocument()
    }
  })

  it('clicking a highlight action opens the chat panel and sends it as a seed turn', async () => {
    aiEnabledFixture = true
    highlightsFixture = [
      { id: 'h1', text: 'target', color: 'pink', page_ref: 1, position: [{ x: 0.1, y: 0.1, width: 0.2, height: 0.05 }] },
    ]
    const { container } = await renderAndWaitForLoad()
    const pageContainer = getPageContainer(container)

    fireEvent.mouseMove(pageContainer, { clientX: 120, clientY: 100 })
    fireEvent.click(await screen.findByText('Explain'))

    expect(await screen.findByText('Chat about this highlight — p. 1')).toBeInTheDocument()
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/highlights/h1/chat',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ action: 'explain' }) })
      )
    )
    expect(await screen.findByText('explain seed')).toBeInTheDocument()
    expect(await screen.findByText('explain response')).toBeInTheDocument()
  })

  it('clicking a second action on the same open highlight sends another turn without reloading history', async () => {
    aiEnabledFixture = true
    highlightsFixture = [
      { id: 'h1', text: 'target', color: 'pink', page_ref: 1, position: [{ x: 0.1, y: 0.1, width: 0.2, height: 0.05 }] },
    ]
    const { container } = await renderAndWaitForLoad()
    const pageContainer = getPageContainer(container)

    fireEvent.mouseMove(pageContainer, { clientX: 120, clientY: 100 })
    fireEvent.click(await screen.findByText('Explain'))
    await screen.findByText('explain response')

    const chatGetCallsAfterFirst = fetchMock.mock.calls.filter(([u, opts]) => String(u).endsWith('/chat') && !opts?.method).length

    fireEvent.mouseMove(pageContainer, { clientX: 120, clientY: 100 })
    fireEvent.click(await screen.findByText('Translate'))

    expect(await screen.findByText('translate response')).toBeInTheDocument()
    const chatGetCallsAfterSecond = fetchMock.mock.calls.filter(([u, opts]) => String(u).endsWith('/chat') && !opts?.method).length
    expect(chatGetCallsAfterSecond).toBe(chatGetCallsAfterFirst)
  })

  it('clicking an action on a different highlight swaps the chat panel and reloads history', async () => {
    aiEnabledFixture = true
    highlightsFixture = [
      { id: 'h1', text: 'first', color: 'pink', page_ref: 1, position: [{ x: 0.1, y: 0.1, width: 0.2, height: 0.05 }] },
      { id: 'h2', text: 'second', color: 'blue', page_ref: 1, position: [{ x: 0.5, y: 0.5, width: 0.2, height: 0.05 }] },
    ]
    const { container } = await renderAndWaitForLoad()
    const pageContainer = getPageContainer(container)

    fireEvent.mouseMove(pageContainer, { clientX: 120, clientY: 100 })
    fireEvent.click(await screen.findByText('Explain'))
    await screen.findByText('explain response')

    fireEvent.mouseMove(pageContainer, { clientX: 420, clientY: 420 })
    fireEvent.click(await screen.findByText('Define'))

    expect(await screen.findByText('define response')).toBeInTheDocument()
    expect(screen.queryByText('explain response')).not.toBeInTheDocument()
  })

  it('opens an empty chat panel via the "Chat" button, without sending anything', async () => {
    aiEnabledFixture = true
    highlightsFixture = [
      { id: 'h1', text: 'target', color: 'pink', page_ref: 1, position: [{ x: 0.1, y: 0.1, width: 0.2, height: 0.05 }] },
    ]
    const { container } = await renderAndWaitForLoad()
    const pageContainer = getPageContainer(container)

    fireEvent.mouseMove(pageContainer, { clientX: 120, clientY: 100 })
    fireEvent.click(await screen.findByText('Chat'))

    expect(await screen.findByText('Chat about this highlight — p. 1')).toBeInTheDocument()
    expect(await screen.findByText('Ask a question about this highlight.')).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([u, opts]) => String(u).endsWith('/chat') && opts?.method === 'POST')).toBe(false)
  })

  it('opening Ask AI closes an open highlight chat panel, and vice versa', async () => {
    aiEnabledFixture = true
    highlightsFixture = [
      { id: 'h1', text: 'target', color: 'pink', page_ref: 1, position: [{ x: 0.1, y: 0.1, width: 0.2, height: 0.05 }] },
    ]
    const { container } = await renderAndWaitForLoad()
    const pageContainer = getPageContainer(container)

    fireEvent.mouseMove(pageContainer, { clientX: 120, clientY: 100 })
    fireEvent.click(await screen.findByText('Chat'))
    await screen.findByText('Chat about this highlight — p. 1')

    fireEvent.click(screen.getByText('Ask AI'))

    expect(await screen.findByText('Ask a question about this document.')).toBeInTheDocument()
    expect(screen.queryByText('Chat about this highlight — p. 1')).not.toBeInTheDocument()
  })

  it('deleting a highlight closes its open chat panel', async () => {
    aiEnabledFixture = true
    highlightsFixture = [
      { id: 'h1', text: 'target', color: 'pink', page_ref: 1, position: [{ x: 0.1, y: 0.1, width: 0.2, height: 0.05 }] },
    ]
    const { container } = await renderAndWaitForLoad()
    const pageContainer = getPageContainer(container)

    fireEvent.mouseMove(pageContainer, { clientX: 120, clientY: 100 })
    fireEvent.click(await screen.findByText('Chat'))
    await screen.findByText('Chat about this highlight — p. 1')

    fireEvent.mouseMove(pageContainer, { clientX: 120, clientY: 100 })
    fireEvent.click(await screen.findByText('Remove'))

    await waitFor(() => expect(screen.queryByText('Chat about this highlight — p. 1')).not.toBeInTheDocument())
  })

  it('shows existing notes for a highlight on hover', async () => {
    aiEnabledFixture = true
    highlightsFixture = [
      {
        id: 'h1',
        text: 'target',
        color: 'pink',
        page_ref: 1,
        position: [{ x: 0.1, y: 0.1, width: 0.2, height: 0.05 }],
        notes: [{ id: 'note-1', content: 'Previously generated note' }],
      },
    ]
    const { container } = await renderAndWaitForLoad()
    const pageContainer = getPageContainer(container)

    fireEvent.mouseMove(pageContainer, { clientX: 120, clientY: 100 })

    expect(await screen.findByText('Previously generated note')).toBeInTheDocument()
  })

  it('opens highlight actions via the focusable affordance without hover hit-testing', async () => {
    highlightsFixture = [
      { id: 'h1', text: 'target', color: 'pink', page_ref: 1, position: [{ x: 0.1, y: 0.1, width: 0.2, height: 0.05 }] },
    ]
    await renderAndWaitForLoad()

    fireEvent.click(screen.getByLabelText('Open highlight actions'))

    expect(await screen.findByText('+ Note')).toBeInTheDocument()
  })

  it('lets the user add a manual note to a highlight, independent of AI', async () => {
    aiEnabledFixture = false
    highlightsFixture = [
      { id: 'h1', text: 'target', color: 'pink', page_ref: 1, position: [{ x: 0.1, y: 0.1, width: 0.2, height: 0.05 }] },
    ]
    const { container } = await renderAndWaitForLoad()
    const pageContainer = getPageContainer(container)

    fireEvent.mouseMove(pageContainer, { clientX: 120, clientY: 100 })
    fireEvent.click(await screen.findByText('+ Note'))
    const input = await screen.findByPlaceholderText('Add a note…')
    fireEvent.change(input, { target: { value: 'my thought on this' } })
    fireEvent.click(screen.getByText('Add note'))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/highlights/h1/notes',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ content: 'my thought on this' }) })
      )
    )
    expect(screen.queryByText('Could not save note. Please try again.')).not.toBeInTheDocument()
  })

  it('pins the note composer open once opened, surviving mouse movement away from the highlight entirely', async () => {
    highlightsFixture = [
      { id: 'h1', text: 'target', color: 'pink', page_ref: 1, position: [{ x: 0.1, y: 0.1, width: 0.2, height: 0.05 }] },
    ]
    const { container } = await renderAndWaitForLoad()
    const pageContainer = getPageContainer(container)

    fireEvent.mouseMove(pageContainer, { clientX: 120, clientY: 100 })
    fireEvent.click(await screen.findByText('+ Note'))
    await screen.findByPlaceholderText('Add a note…')

    jest.useFakeTimers()
    try {
      // Mouse leaves the highlight entirely and the container itself — this
      // used to be exactly what the 400ms hover-hide timer reacted to.
      fireEvent.mouseMove(pageContainer, { clientX: 500, clientY: 700 })
      fireEvent.mouseLeave(pageContainer)
      act(() => { jest.advanceTimersByTime(5000) })
    } finally {
      jest.useRealTimers()
    }

    expect(screen.getByPlaceholderText('Add a note…')).toBeInTheDocument()
  })

  it('closes the note composer via its Cancel button, which also lets hover-hide resume', async () => {
    highlightsFixture = [
      { id: 'h1', text: 'target', color: 'pink', page_ref: 1, position: [{ x: 0.1, y: 0.1, width: 0.2, height: 0.05 }] },
    ]
    const { container } = await renderAndWaitForLoad()
    const pageContainer = getPageContainer(container)

    fireEvent.mouseMove(pageContainer, { clientX: 120, clientY: 100 })
    fireEvent.click(await screen.findByText('+ Note'))
    await screen.findByPlaceholderText('Add a note…')

    fireEvent.click(screen.getByText('Cancel'))

    expect(screen.queryByPlaceholderText('Add a note…')).not.toBeInTheDocument()
  })

  it('does not hide the panel when the mouse reaches it, even without focus (no dead zone between highlight and panel)', async () => {
    highlightsFixture = [
      { id: 'h1', text: 'target', color: 'pink', page_ref: 1, position: [{ x: 0.1, y: 0.1, width: 0.2, height: 0.05 }] },
    ]
    const { container } = await renderAndWaitForLoad()
    const pageContainer = getPageContainer(container)

    fireEvent.mouseMove(pageContainer, { clientX: 120, clientY: 100 })
    const noteButton = await screen.findByText('+ Note')

    jest.useFakeTimers()
    try {
      // Mouse leaves the highlight's own rect (arming the hide timer)
      // partway through actually moving toward the panel...
      fireEvent.mouseMove(pageContainer, { clientX: 500, clientY: 700 })
      // ...then arrives at the panel itself — this alone, with no focus at
      // all, must cancel that timer immediately.
      fireEvent.mouseOver(noteButton)
      await act(async () => { jest.advanceTimersByTime(1000) })
    } finally {
      jest.useRealTimers()
    }

    expect(screen.getByText('+ Note')).toBeInTheDocument()
  })

  it('does not arm a fresh hide timer for mousemoves that merely continue within the panel', async () => {
    highlightsFixture = [
      { id: 'h1', text: 'target', color: 'pink', page_ref: 1, position: [{ x: 0.1, y: 0.1, width: 0.2, height: 0.05 }] },
    ]
    const { container } = await renderAndWaitForLoad()
    const pageContainer = getPageContainer(container)

    fireEvent.mouseMove(pageContainer, { clientX: 120, clientY: 100 })
    const noteButton = await screen.findByText('+ Note')

    jest.useFakeTimers()
    try {
      // Arrive at the panel (clears any pending timer)...
      fireEvent.mouseOver(noteButton)
      // ...then keep moving *within* the panel, same as a real cursor
      // drifting while approaching a button. Before stopPropagation was
      // added, each of these bubbled up to the container's own handler —
      // which has no notion of the panel's existence — and silently
      // re-armed a fresh hide timer that nothing then cancelled, since
      // onMouseEnter only fires once, on the initial entry.
      for (let i = 0; i < 5; i++) {
        fireEvent.mouseMove(noteButton, { clientX: 500 + i, clientY: 700 + i })
        act(() => { jest.advanceTimersByTime(150) })
      }
      await act(async () => { jest.advanceTimersByTime(1000) })
    } finally {
      jest.useRealTimers()
    }

    expect(screen.getByText('+ Note')).toBeInTheDocument()
  })

  it('hides the panel after the hover-hide delay when no note is pinned open', async () => {
    highlightsFixture = [
      { id: 'h1', text: 'target', color: 'pink', page_ref: 1, position: [{ x: 0.1, y: 0.1, width: 0.2, height: 0.05 }] },
    ]
    const { container } = await renderAndWaitForLoad()
    const pageContainer = getPageContainer(container)

    fireEvent.mouseMove(pageContainer, { clientX: 120, clientY: 100 })
    await screen.findByText('+ Note')

    jest.useFakeTimers()
    try {
      fireEvent.mouseMove(pageContainer, { clientX: 500, clientY: 700 })
      await act(async () => { jest.advanceTimersByTime(1000) })
    } finally {
      jest.useRealTimers()
    }

    expect(screen.queryByText('+ Note')).not.toBeInTheDocument()
  })

  it('lets the user delete a note from a highlight', async () => {
    highlightsFixture = [
      {
        id: 'h1',
        text: 'target',
        color: 'pink',
        page_ref: 1,
        position: [{ x: 0.1, y: 0.1, width: 0.2, height: 0.05 }],
        notes: [{ id: 'note-1', content: 'a note to remove' }],
      },
    ]
    const { container } = await renderAndWaitForLoad()
    const pageContainer = getPageContainer(container)

    fireEvent.mouseMove(pageContainer, { clientX: 120, clientY: 100 })
    await screen.findByText('a note to remove')
    fireEvent.click(screen.getByLabelText('Delete note'))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/notes/note-1', expect.objectContaining({ method: 'DELETE' }))
    )
    await waitFor(() => expect(screen.queryByText('a note to remove')).not.toBeInTheDocument())
  })

  it('keeps the note visible and shows an error when note deletion fails', async () => {
    highlightsFixture = [
      {
        id: 'h1',
        text: 'target',
        color: 'pink',
        page_ref: 1,
        position: [{ x: 0.1, y: 0.1, width: 0.2, height: 0.05 }],
        notes: [{ id: 'note-1', content: 'a note to remove' }],
      },
    ]
    fetchMock.mockImplementation((url: unknown, opts?: RequestInit) => {
      const u = String(url)
      if (u.startsWith('/api/notes/') && opts?.method === 'DELETE') return jsonResponse({}, 500)
      if (u.includes('/signed-url')) return jsonResponse({ url: 'https://signed.example/doc.pdf' })
      if (u === '/api/ai/status') return jsonResponse({ configured: aiEnabledFixture, provider: null })
      if (u.startsWith('/api/highlights')) return jsonResponse({ highlights: highlightsFixture })
      return jsonResponse({})
    })

    const { container } = await renderAndWaitForLoad()
    const pageContainer = getPageContainer(container)

    fireEvent.mouseMove(pageContainer, { clientX: 120, clientY: 100 })
    await screen.findByText('a note to remove')
    fireEvent.click(screen.getByLabelText('Delete note'))

    expect(await screen.findByText('Could not delete note. Please try again.')).toBeInTheDocument()
    expect(screen.getByText('a note to remove')).toBeInTheDocument()
  })

  it('hides the Ask AI toggle when no AI provider is configured', async () => {
    aiEnabledFixture = false
    await renderAndWaitForLoad()

    expect(screen.queryByText('Ask AI')).not.toBeInTheDocument()
  })

  it('opens and closes the Ask AI panel via the toggle button', async () => {
    aiEnabledFixture = true
    await renderAndWaitForLoad()

    fireEvent.click(screen.getByText('Ask AI'))
    expect(await screen.findByText('Ask a question about this document.')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Close'))
    expect(screen.queryByText('Ask a question about this document.')).not.toBeInTheDocument()
  })

  it('shows the bookmark count and opens the Bookmarks panel via its toggle button', async () => {
    bookmarksFixture = [{ id: 'b1', page_number: 2, label: 'Chapter 2' }]
    await renderAndWaitForLoad()

    expect(screen.getByText('Bookmarks (1)')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Bookmarks (1)'))

    expect(await screen.findByText('Chapter 2')).toBeInTheDocument()
  })

  it('adds a bookmark for the current page from the panel', async () => {
    await renderAndWaitForLoad()

    fireEvent.click(screen.getByText('Bookmarks'))
    fireEvent.click(await screen.findByText('+ Bookmark page 1'))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/bookmarks',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ document_id: 'doc-1', page_number: 1, label: undefined }) })
      )
    )
    expect(await screen.findByText('Bookmarks (1)')).toBeInTheDocument()
  })

  it('jumping to a bookmark navigates there and closes the panel', async () => {
    bookmarksFixture = [{ id: 'b1', page_number: 3, label: null }]
    await renderAndWaitForLoad()

    fireEvent.click(screen.getByText('Bookmarks (1)'))
    fireEvent.click(await screen.findByText('p.3'))

    expect(await screen.findByText('3 / 3')).toBeInTheDocument()
    expect(screen.queryByText('p.3')).not.toBeInTheDocument()
  })

  it('deletes a bookmark from the panel', async () => {
    bookmarksFixture = [{ id: 'b1', page_number: 2, label: null }]
    await renderAndWaitForLoad()

    fireEvent.click(screen.getByText('Bookmarks (1)'))
    fireEvent.click(await screen.findByLabelText('Delete bookmark'))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/bookmarks/b1', expect.objectContaining({ method: 'DELETE' }))
    )
    await waitFor(() => expect(screen.getByRole('button', { name: 'Bookmarks' })).toBeInTheDocument())
  })
})


test('switches to reflow without changing page and returns to the correct original page', async () => {
  await renderAndWaitForLoad({ initialPage: 2 })
  fireEvent.click(screen.getByRole('button', { name: 'Reflow' }))
  expect(await screen.findByRole('article', { name: 'Reflow page 2' })).toBeVisible()
  expect(screen.getByText('2 / 3')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Zoom in' })).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Text size'), { target: { value: '24' } })
  expect(screen.getByText('Page 2 readable source text.').parentElement).toHaveStyle({ fontSize: '24px' })
  await act(async () => { fireEvent.click(screen.getByText('Next')) })
  expect(await screen.findByRole('article', { name: 'Reflow page 3' })).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Original' }))
  await waitFor(() => expect(mockDoc.getPage).toHaveBeenCalledWith(3))
  expect(screen.getByText('3 / 3')).toBeInTheDocument()
})

test('keeps the original view and explains reflow failure', async () => {
  await renderAndWaitForLoad()
  const originalFetch = fetchMock.getMockImplementation()!
  fetchMock.mockImplementation((url, options) => String(url).includes('/pages/') ? jsonResponse({}, 500) : originalFetch(url, options))
  fireEvent.click(screen.getByRole('button', { name: 'Reflow' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Showing Original instead')
  expect(screen.getByRole('button', { name: 'Original' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: 'Zoom in' })).toBeVisible()
})

test('keeps scanned PDFs readable in Original and disables reflow with a reason', async () => {
  await renderAndWaitForLoad({ isScanned: true })
  expect(screen.getByRole('button', { name: 'Reflow' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Reflow' })).toHaveAttribute('title', 'Reflow is unavailable for scanned PDFs')
  expect(screen.getByRole('button', { name: 'Original' })).toHaveAttribute('aria-pressed', 'true')
})

test('page-linked highlights without PDF coordinates remain accessible in Original', async () => {
  highlightsFixture = [{ id: 'h1', text: 'A passage highlighted in Reflow', color: 'blue', page_ref: 1, position: null }]
  await renderAndWaitForLoad()
  fireEvent.click(screen.getByRole('button', { name: 'A passage highlighted in Reflow' }))
  expect(screen.getByText('+ Note')).toBeVisible()
  expect(screen.getByText('Remove')).toBeVisible()
})


test('keeps the original canvas readable when PDF text-layer extraction fails', async () => {
  mockPage.getTextContent.mockRejectedValueOnce(new Error('Text extraction failed'))
  await renderAndWaitForLoad()
  expect(screen.getByRole('img', { name: 'Original PDF page 1' })).toBeVisible()
})
