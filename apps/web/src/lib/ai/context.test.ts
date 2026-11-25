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

  it('loads every batch and retrieves relevant text after PostgREST’s default row cap', async () => {
    const pages = Array.from({ length: 1001 }, (_, i) => ({ page_number: i + 1, raw_text: 'Background material. '.repeat(100) }))
    pages[1000].raw_text = 'The zirconium catalyst increases efficiency.'
    const fromResults = []
    for (let start = 0; start < pages.length; start += 200) fromResults.push({ data: pages.slice(start, start + 200), error: null })
    fromResults.push({ data: [], error: null })
    const client = mockSupabaseClient({ fromResults })
    mockCreateClient.mockResolvedValue(client)
    const context = await buildDocumentContext('doc-1', 'user-1', 'How does the zirconium catalyst work?')
    expect(context.pageNumbers).toContain(1001)
    expect(context.pagesText).toContain('zirconium catalyst increases efficiency')
    expect(client.from.mock.results[5].value.range).toHaveBeenCalledWith(1000, 1199)
    expect(client.from.mock.results[0].value.eq).toHaveBeenCalledWith('document_id', 'doc-1')
  })

  it('fails closed on a text query error instead of answering from incomplete results', async () => {
    mockCreateClient.mockResolvedValue(mockSupabaseClient({ fromResults: [{ data: null, error: { message: 'db unavailable' } }] }))
    await expect(buildDocumentContext('doc-1', 'user-1', 'Question')).rejects.toThrow('Could not load document text')
  })

  it('fails closed when a later page batch cannot be read', async () => {
    mockCreateClient.mockResolvedValue(mockSupabaseClient({ fromResults: [
      { data: Array.from({ length: 200 }, (_, i) => ({ page_number: i + 1, raw_text: 'Text' })), error: null },
      { data: null, error: { message: 'read failed' } },
    ] }))
    await expect(buildDocumentContext('doc-1', 'user-1', 'Question')).rejects.toThrow('Could not load document text')
  })

  it('omits unanchored highlights and bounds the extra source text', async () => {
    mockCreateClient.mockResolvedValue(mockSupabaseClient({ fromResults: [
      { data: [{ page_number: 1, raw_text: 'Source page' }], error: null },
      { data: [{ text: 'orphan highlight', page_ref: null }, { text: 'Missing page', page_ref: 999 }, { text: 'x'.repeat(10000), page_ref: 1 }], error: null },
    ] }))
    const context = await buildDocumentContext('doc-1', 'user-1', 'Source')
    expect(context.highlightsText).not.toContain('orphan highlight')
    expect(context.highlightsText).not.toContain('Missing page')
    expect(context.highlightsText.length).toBeLessThanOrEqual(2000)
    expect(context.pagesText.length + context.highlightsText.length).toBeLessThanOrEqual(12000)
  })

  it('does not hide highlight read failures', async () => {
    mockCreateClient.mockResolvedValue(mockSupabaseClient({ fromResults: [
      { data: [], error: null }, { data: null, error: { message: 'read failed' } },
    ] }))
    await expect(buildDocumentContext('doc-1', 'user-1')).rejects.toThrow('Could not load highlights')
  })

})
