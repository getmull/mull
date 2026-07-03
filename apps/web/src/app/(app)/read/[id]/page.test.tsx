import { render, screen } from '@testing-library/react'
import ReadPage from './page'
import { createClient } from '@/lib/supabase/server'
import { mockSupabaseClient } from '@/test-utils/supabase'

jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('./PDFViewer', () => ({ PDFViewer: () => <div data-testid="pdf-viewer" /> }))

const mockCreateClient = createClient as jest.Mock

function ctx(id = 'doc-1') {
  return { params: Promise.resolve({ id }) }
}

describe('ReadPage', () => {
  it('redirects to /login when unauthenticated', async () => {
    mockCreateClient.mockResolvedValue(mockSupabaseClient({ user: null }))

    await expect(ReadPage(ctx())).rejects.toMatchObject({
      digest: expect.stringContaining('NEXT_REDIRECT;replace;/login'),
    })
  })

  it('renders notFound when the document does not exist', async () => {
    mockCreateClient.mockResolvedValue(mockSupabaseClient({ fromResults: [{ data: null, error: null }] }))

    await expect(ReadPage(ctx())).rejects.toMatchObject({
      digest: expect.stringContaining('NEXT_HTTP_ERROR_FALLBACK;404'),
    })
  })

  it('renders notFound when the document is not a pdf', async () => {
    mockCreateClient.mockResolvedValue(
      mockSupabaseClient({
        fromResults: [{ data: { id: 'doc-1', type: 'article', reading_state: 'reading' }, error: null }],
      })
    )

    await expect(ReadPage(ctx())).rejects.toMatchObject({
      digest: expect.stringContaining('NEXT_HTTP_ERROR_FALLBACK;404'),
    })
  })

  it('bumps reading_state from unread to reading, scoped to the doc and user', async () => {
    const updateEq2 = jest.fn().mockResolvedValue({ data: null, error: null })
    const updateEq1 = jest.fn(() => ({ eq: updateEq2 }))
    const from = jest.fn()
    from.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { id: 'doc-1', title: 'My Doc', type: 'pdf', page_count: 5, is_scanned: false, reading_state: 'unread' },
        error: null,
      }),
    })
    from.mockReturnValueOnce({ update: jest.fn(() => ({ eq: updateEq1 })) })

    mockCreateClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
      from,
    })

    const element = await ReadPage(ctx('doc-1'))
    render(element)

    expect(from).toHaveBeenCalledWith('documents')
    expect(updateEq1).toHaveBeenCalledWith('id', 'doc-1')
    expect(updateEq2).toHaveBeenCalledWith('user_id', 'user-1')
    expect(screen.getByTestId('pdf-viewer')).toBeInTheDocument()
    expect(screen.getByText('My Doc')).toBeInTheDocument()
  })

  it('does not bump reading_state when already past unread', async () => {
    const from = jest.fn()
    from.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { id: 'doc-1', title: 'My Doc', type: 'pdf', page_count: 5, is_scanned: false, reading_state: 'reading' },
        error: null,
      }),
    })

    mockCreateClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
      from,
    })

    await ReadPage(ctx('doc-1'))

    expect(from).toHaveBeenCalledTimes(1)
  })
})
