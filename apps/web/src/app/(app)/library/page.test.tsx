import { render, screen } from '@testing-library/react'
import LibraryPage from './page'
import { createClient } from '@/lib/supabase/server'
import { mockSupabaseClient } from '@/test-utils/supabase'

jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('next/navigation', () => ({ ...jest.requireActual('next/navigation'), useRouter: () => ({ refresh: jest.fn() }) }))

const mockCreateClient = createClient as jest.Mock

async function renderPage() {
  const element = await LibraryPage()
  render(element)
}

describe('LibraryPage', () => {
  it('shows an empty state when there are no documents', async () => {
    mockCreateClient.mockResolvedValue(mockSupabaseClient({ fromResults: [{ data: [], error: null }] }))

    await renderPage()

    expect(screen.getByText('Your next read starts here.')).toBeInTheDocument()
  })

  it('lists documents, linking each to its reader and flagging scanned ones', async () => {
    const documents = [
      { id: 'doc-1', title: 'Report', type: 'pdf', reading_state: 'reading', page_count: 12, is_scanned: false, created_at: 't1' },
      { id: 'doc-2', title: 'Scanned Memo', type: 'pdf', reading_state: 'unread', page_count: 3, is_scanned: true, created_at: 't2' },
    ]
    mockCreateClient.mockResolvedValue(mockSupabaseClient({ fromResults: [{ data: documents, error: null }] }))

    await renderPage()

    const reportLink = screen.getAllByText('Report')[0].closest('a')
    expect(reportLink).toHaveAttribute('href', '/read/doc-1')
    expect(screen.getByText('12p')).toBeInTheDocument()

    const scannedLink = screen.getByText('Scanned Memo').closest('a')
    expect(scannedLink).toHaveAttribute('href', '/read/doc-2')
    expect(screen.getByText('Scanned')).toBeInTheDocument()
  })
})


test('orders Continue Reading by reading recency, excludes archived documents, and shows the saved page', async () => {
  const documents = [
    { id: 'old', title: 'Older read', type: 'pdf', reading_state: 'reading', last_read_at: '2026-01-01', created_at: '2026-01-01', last_page: 2, page_count: 10, progress_pct: 20 },
    { id: 'archived', title: 'Archived read', type: 'pdf', reading_state: 'archived', last_read_at: '2026-12-01', created_at: '2026-01-01' },
    { id: 'new', title: 'Latest read', type: 'pdf', reading_state: 'reading', last_read_at: '2026-11-01', created_at: '2026-01-01', last_page: 7, page_count: 10, progress_pct: 70 },
  ]
  mockCreateClient.mockResolvedValue(mockSupabaseClient({ fromResults: [{ data: documents, error: null }] }))
  await renderPage()
  const section = screen.getByRole('region', { name: 'Continue Reading' })
  const links = section.querySelectorAll('a')
  expect(links[0]).toHaveAttribute('href', '/read/new')
  expect(links[1]).toHaveAttribute('href', '/read/old')
  expect(links).toHaveLength(2)
  expect(screen.getByText('Resume at page 7 of 10')).toBeInTheDocument()
  expect(screen.getByRole('progressbar', { name: 'Latest read reading progress' })).toHaveAttribute('aria-valuenow', '70')
})

test('shows a query failure instead of a misleading empty library', async () => {
  mockCreateClient.mockResolvedValue(mockSupabaseClient({ fromResults: [{ data: null, error: { message: 'db down' } }] }))
  await renderPage()
  expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load your library")
  expect(screen.queryByText('Your next read starts here.')).not.toBeInTheDocument()
})

test('redirects an expired session to login', async () => {
  mockCreateClient.mockResolvedValue(mockSupabaseClient({ user: null }))
  await expect(LibraryPage()).rejects.toMatchObject({ digest: expect.stringContaining('NEXT_REDIRECT') })
})
