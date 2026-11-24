/**
 * @jest-environment node
 */
import { buildDocumentContext, DocumentContextError } from './context'
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

    const context = await buildDocumentContext('doc-1', 'user-1', 'What does this say?')

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

    const context = await buildDocumentContext('doc-1', 'user-1', 'Anything?')

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

    const context = await buildDocumentContext('doc-1', 'user-1', 'Anything?')

    expect(context.pagesText.length).toBeLessThanOrEqual(12000)
    expect(context.pagesText).toMatch(/^--- Page 1 ---\n/)
    expect(context.pagesText).toMatch(/\[\.\.\.page truncated\.\.\.\]$/)
    expect(context.pageNumbers).toEqual([1])
  })

  it('prefers query-relevant pages over a fixed prefix when over budget', async () => {
    mockCreateClient.mockResolvedValue(
      mockSupabaseClient({
        fromResults: [
          {
            data: [
              { page_number: 1, raw_text: 'x'.repeat(8000) },
              { page_number: 2, raw_text: 'x'.repeat(8000) },
              { page_number: 3, raw_text: 'targetterm appears here' },
            ],
            error: null,
          },
          { data: [], error: null },
        ],
      })
    )

    const context = await buildDocumentContext('doc-1', 'user-1', 'Where is targetterm used?')

    expect(context.pagesText).toContain('--- Page 3 ---')
    expect(context.pagesText).toContain('--- Page 1 ---')
    expect(context.pagesText).not.toContain('--- Page 2 ---')
    expect(context.pageNumbers).toEqual([1, 3])
  })

  it('excerpts the best-ranked page instead of skipping it when it exceeds the budget', async () => {
    mockCreateClient.mockResolvedValue(
      mockSupabaseClient({
        fromResults: [
          {
            data: [
              { page_number: 1, raw_text: 'short unrelated page' },
              { page_number: 2, raw_text: `targetterm ${'y'.repeat(20000)}` },
            ],
            error: null,
          },
          { data: [], error: null },
        ],
      })
    )

    const context = await buildDocumentContext('doc-1', 'user-1', 'Where is targetterm used?')

    expect(context.pagesText.length).toBeLessThanOrEqual(12000)
    expect(context.pagesText).toContain('--- Page 2 ---\ntargetterm')
    expect(context.pagesText).toContain('[...page truncated...]')
    expect(context.pageNumbers).toContain(2)
  })

  it('only reports pages actually included in the text as valid citation pages', async () => {
    mockCreateClient.mockResolvedValue(
      mockSupabaseClient({
        fromResults: [
          {
            data: [
              { page_number: 1, raw_text: 'x'.repeat(7000) },
              { page_number: 2, raw_text: 'x'.repeat(7000) },
              { page_number: 3, raw_text: 'x'.repeat(7000) },
            ],
            error: null,
          },
          { data: [], error: null },
        ],
      })
    )

    const context = await buildDocumentContext('doc-1', 'user-1', 'Anything?')

    for (const page of [1, 2, 3]) {
      expect(context.pagesText.includes(`--- Page ${page} ---`)).toBe(context.pageNumbers.includes(page))
    }
    expect(context.pageNumbers).toEqual([1, 2])
  })

  it('throws instead of returning empty context when the pages query fails', async () => {
    mockCreateClient.mockResolvedValue(
      mockSupabaseClient({ fromResults: [{ data: null, error: { message: 'db down' } }] })
    )

    await expect(buildDocumentContext('doc-1', 'user-1', 'Q')).rejects.toBeInstanceOf(DocumentContextError)
  })

  it('throws instead of returning empty highlights when the highlights query fails', async () => {
    mockCreateClient.mockResolvedValue(
      mockSupabaseClient({
        fromResults: [
          { data: [{ page_number: 1, raw_text: 'text' }], error: null },
          { data: null, error: { message: 'db down' } },
        ],
      })
    )

    await expect(buildDocumentContext('doc-1', 'user-1', 'Q')).rejects.toBeInstanceOf(DocumentContextError)
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

    const context = await buildDocumentContext('doc-1', 'user-1', 'Anything?')

    expect(context.highlightsText).toBe('- (page ?) "orphan highlight"')
  })
})
