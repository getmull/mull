import { render, screen } from '@testing-library/react'
import LibraryPage from './page'
import { createClient } from '@/lib/supabase/server'
import { mockSupabaseClient } from '@/test-utils/supabase'

jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))

const mockCreateClient = createClient as jest.Mock

async function renderPage() {
  const element = await LibraryPage()
  render(element)
}

describe('LibraryPage', () => {
  it('shows an empty state when there are no documents', async () => {
    mockCreateClient.mockResolvedValue(mockSupabaseClient({ fromResults: [{ data: [], error: null }] }))

    await renderPage()

    expect(screen.getByText('No documents yet.')).toBeInTheDocument()
  })

  it('lists documents, linking each to its reader and flagging scanned ones', async () => {
    const documents = [
      { id: 'doc-1', title: 'Report', type: 'pdf', reading_state: 'reading', page_count: 12, is_scanned: false, created_at: 't1' },
      { id: 'doc-2', title: 'Scanned Memo', type: 'pdf', reading_state: 'unread', page_count: 3, is_scanned: true, created_at: 't2' },
    ]
    mockCreateClient.mockResolvedValue(mockSupabaseClient({ fromResults: [{ data: documents, error: null }] }))

    await renderPage()

    const reportLink = screen.getByText('Report').closest('a')
    expect(reportLink).toHaveAttribute('href', '/read/doc-1')
    expect(screen.getByText('12p')).toBeInTheDocument()

    const scannedLink = screen.getByText('Scanned Memo').closest('a')
    expect(scannedLink).toHaveAttribute('href', '/read/doc-2')
    expect(screen.getByText('Scanned')).toBeInTheDocument()
  })
})
