import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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

let highlightsFixture: HighlightFixture[] = []
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
  aiEnabledFixture = false
  mockPage.getViewport.mockClear()
  mockPage.getTextContent.mockClear()
  mockPage.render.mockClear()
  mockPage.cleanup.mockClear()
  mockDoc.getPage.mockClear()
  fetchMock = jest.fn((url: unknown, opts?: RequestInit) => {
    const u = String(url)
    if (u.includes('/signed-url')) {
      return jsonResponse({ url: 'https://signed.example/doc.pdf' })
    }
    if (u === '/api/ai/status') {
      return jsonResponse({ configured: aiEnabledFixture, provider: aiEnabledFixture ? 'ollama' : null })
    }
    if (u.endsWith('/actions') && opts?.method === 'POST') {
      const { action } = JSON.parse(opts.body as string)
      return jsonResponse({ note: { id: 'note-1', content: `${action} response` } }, 201)
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
    fireEvent.click(screen.getByText('Next'))
    expect(screen.getByText('2 / 3')).toBeInTheDocument()
    expect(screen.getByText('Prev')).not.toBeDisabled()

    fireEvent.click(screen.getByText('Next'))
    expect(screen.getByText('3 / 3')).toBeInTheDocument()
    expect(screen.getByText('Next')).toBeDisabled()
  })

  it('zooms in and out within the 50%-300% bounds', async () => {
    await renderAndWaitForLoad()

    expect(screen.getByText('120%')).toBeInTheDocument()
    fireEvent.click(screen.getByText('+'))
    expect(screen.getByText('140%')).toBeInTheDocument()
    fireEvent.click(screen.getByText('-'))
    fireEvent.click(screen.getByText('-'))
    expect(screen.getByText('100%')).toBeInTheDocument()
  })

  it('normalizes a legacy single-Rect highlight position into Rect[]', async () => {
    highlightsFixture = [
      { id: 'h1', text: 'old', color: 'blue', page_ref: 1, position: { x: 0.1, y: 0.1, width: 0.2, height: 0.05 } },
    ]

    const { container } = await renderAndWaitForLoad()

    expect(container.getElementsByClassName('bg-blue-300').length).toBe(1)
  })

  it('only renders highlight overlays for the current page', async () => {
    highlightsFixture = [
      { id: 'h1', text: 'page one', color: 'yellow', page_ref: 1, position: [{ x: 0.1, y: 0.1, width: 0.2, height: 0.05 }] },
      { id: 'h2', text: 'page two', color: 'green', page_ref: 2, position: [{ x: 0.1, y: 0.1, width: 0.2, height: 0.05 }] },
    ]

    const { container } = await renderAndWaitForLoad()

    expect(container.getElementsByClassName('bg-yellow-300').length).toBe(1)
    expect(container.getElementsByClassName('bg-green-300').length).toBe(0)

    fireEvent.click(screen.getByText('Next'))

    expect(container.getElementsByClassName('bg-yellow-300').length).toBe(0)
    expect(container.getElementsByClassName('bg-green-300').length).toBe(1)
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
    expect(container.getElementsByClassName('bg-yellow-300').length).toBe(1)
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
    await waitFor(() => expect(container.getElementsByClassName('bg-pink-300').length).toBe(0))
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

  it('shows highlight AI actions when configured, and running one posts and displays the result', async () => {
    aiEnabledFixture = true
    highlightsFixture = [
      { id: 'h1', text: 'target', color: 'pink', page_ref: 1, position: [{ x: 0.1, y: 0.1, width: 0.2, height: 0.05 }] },
    ]
    const { container } = await renderAndWaitForLoad()
    const pageContainer = getPageContainer(container)

    fireEvent.mouseMove(pageContainer, { clientX: 120, clientY: 100 })
    fireEvent.click(await screen.findByText('Explain'))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/highlights/h1/actions',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ action: 'explain' }) })
      )
    )
    expect(await screen.findByText('explain response')).toBeInTheDocument()
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
})
