/**
 * @jest-environment node
 */
import { buildDocumentContext } from './context'
import { createClient } from '@/lib/supabase/server'
import { mockSupabaseClient } from '@/test-utils/supabase'

jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))

const mockCreateClient = createClient as jest.Mock

describe('buildDocumentContext', () => {
  it('joins pages with page markers and formats highlights', async () => {
    mockCreateClient.mockResolvedValue(
      mockSupabaseClient({
        fromResults: [
          {
            data: [
              { page_number: 1, raw_text: 'First page text' },
              { page_number: 2, raw_text: 'Second page text' },
            ],
            error: null,
          },
          {
            data: [{ text: 'a highlighted passage', page_ref: 2 }],
            error: null,
          },
        ],
      })
    )

    const context = await buildDocumentContext('doc-1', 'user-1')

    expect(context.pagesText).toBe(
      '--- Page 1 ---\nFirst page text\n\n--- Page 2 ---\nSecond page text'
    )
    expect(context.highlightsText).toBe('- (page 2) "a highlighted passage"')
    expect(context.pageNumbers).toEqual([1, 2])
  })

  it('handles no pages and no highlights gracefully', async () => {
    mockCreateClient.mockResolvedValue(
      mockSupabaseClient({ fromResults: [{ data: null, error: null }, { data: null, error: null }] })
    )

    const context = await buildDocumentContext('doc-1', 'user-1')

    expect(context.pagesText).toBe('')
    expect(context.highlightsText).toBe('')
    expect(context.pageNumbers).toEqual([])
  })

  it('truncates page text past the character budget', async () => {
    mockCreateClient.mockResolvedValue(
      mockSupabaseClient({
        fromResults: [
          { data: [{ page_number: 1, raw_text: 'x'.repeat(20000) }], error: null },
          { data: [], error: null },
        ],
      })
    )

    const context = await buildDocumentContext('doc-1', 'user-1')

    expect(context.pagesText.length).toBeLessThan(20000)
    expect(context.pagesText).toMatch(/\[\.\.\.document truncated\.\.\.\]$/)
  })

  it('shows a fallback page marker when a highlight has no page_ref', async () => {
    mockCreateClient.mockResolvedValue(
      mockSupabaseClient({
        fromResults: [
          { data: [], error: null },
          { data: [{ text: 'orphan highlight', page_ref: null }], error: null },
        ],
      })
    )

    const context = await buildDocumentContext('doc-1', 'user-1')

    expect(context.highlightsText).toBe('- (page ?) "orphan highlight"')
  })
})
