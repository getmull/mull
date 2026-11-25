import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ReflowPage, type ReflowSelection } from './ReflowPage'

const props = { documentId: 'doc-1', page: 1, fontSize: 18, highlights: [], onUnavailable: jest.fn(), onSelection: jest.fn(), onHighlightSelected: jest.fn() }
const response = (page = 1, text = 'Readable\nsource text.\n\nAnother paragraph.') => ({ ok: true, json: async () => ({ page_number: page, raw_text: text }) })
beforeEach(() => {
  jest.clearAllMocks()
  global.fetch = jest.fn().mockResolvedValue(response())
})

test('renders readable text with paragraph boundaries and adjustable font size', async () => {
  render(<ReflowPage {...props} fontSize={24} />)
  expect(screen.getByRole('status')).toHaveTextContent('Loading text for page 1')
  const text = await screen.findByText('Readable source text.')
  expect(text.parentElement).toHaveStyle({ fontSize: '24px' })
  expect(screen.getByText('Another paragraph.')).toBeVisible()
})

test('treats HTML-looking source as text', async () => {
  ;(fetch as jest.Mock).mockResolvedValue(response(1, '<script>alert(1)</script>'))
  const { container } = render(<ReflowPage {...props} />)
  expect(await screen.findByText('<script>alert(1)</script>')).toBeVisible()
  expect(container.querySelector('script')).toBeNull()
})

test.each([
  { ok: false, json: async () => ({ error: 'failed' }) },
  response(1, ''), response(2, 'Wrong page'),
])('falls back on failed, empty, or mismatched page responses', async (result) => {
  ;(fetch as jest.Mock).mockResolvedValue(result)
  render(<ReflowPage {...props} />)
  await waitFor(() => expect(props.onUnavailable).toHaveBeenCalledWith(expect.stringContaining('Showing Original')))
})

test('ignores an old response after navigating to a new page', async () => {
  let resolve!: (value: unknown) => void
  ;(fetch as jest.Mock).mockImplementationOnce(() => new Promise((done) => { resolve = done })).mockResolvedValueOnce(response(2, 'Second page'))
  const { rerender } = render(<ReflowPage {...props} />)
  rerender(<ReflowPage {...props} page={2} />)
  expect(await screen.findByText('Second page')).toBeVisible()
  await act(async () => { resolve(response(1, 'Stale first page')) })
  expect(screen.queryByText('Stale first page')).not.toBeInTheDocument()
  expect(props.onUnavailable).not.toHaveBeenCalled()
})

test('opens an anchored highlight with the keyboard', async () => {
  render(<ReflowPage {...props} highlights={[{ id: 'h1', text: 'Readable source text.', color: 'yellow' }]} />)
  const highlight = await screen.findByRole('button', { name: 'Highlight: Readable source text.' })
  fireEvent.keyDown(highlight, { key: 'Enter' })
  expect(props.onHighlightSelected).toHaveBeenCalledWith('h1')
})

test('captures a text selection for a page-linked highlight, including touch selection changes', async () => {
  render(<ReflowPage {...props} />)
  const paragraph = await screen.findByText('Readable source text.')
  const selection = { isCollapsed: false, rangeCount: 1, toString: () => 'Readable source text.', getRangeAt: () => ({ commonAncestorContainer: paragraph.firstChild, getBoundingClientRect: () => ({ left: 16, top: 180, width: 200, height: 30 }) }) }
  jest.spyOn(window, 'getSelection').mockReturnValue(selection as unknown as Selection)
  fireEvent(document, new Event('selectionchange'))
  await waitFor(() => expect(props.onSelection).toHaveBeenCalledWith({ text: 'Readable source text.', pageRef: 1, toolbarX: 16, toolbarY: 180 } satisfies ReflowSelection))
  jest.restoreAllMocks()
})
