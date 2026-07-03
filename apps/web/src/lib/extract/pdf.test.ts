import { extractPdf } from './pdf'

const getText = jest.fn()
const destroy = jest.fn()

jest.mock('pdf-parse', () => ({
  PDFParse: jest.fn().mockImplementation(() => ({
    getText,
    destroy,
  })),
}))

describe('extractPdf', () => {
  beforeEach(() => {
    getText.mockReset()
    destroy.mockReset()
  })

  it('maps pages, computes page_count and word_count', async () => {
    getText.mockResolvedValue({
      total: 2,
      pages: [
        { num: 1, text: '  Hello world  ' },
        { num: 2, text: 'Another page of text here' },
      ],
    })

    const result = await extractPdf(Buffer.from('%PDF-1.4'))

    expect(result.page_count).toBe(2)
    expect(result.pages).toEqual([
      { page_number: 1, raw_text: 'Hello world' },
      { page_number: 2, raw_text: 'Another page of text here' },
    ])
    expect(result.word_count).toBe(7)
    expect(destroy).toHaveBeenCalled()
  })

  it('flags a PDF as scanned when average chars/page is below threshold', async () => {
    getText.mockResolvedValue({
      total: 1,
      pages: [{ num: 1, text: 'short' }],
    })

    const result = await extractPdf(Buffer.from('%PDF-1.4'))

    expect(result.is_scanned).toBe(true)
  })

  it('does not flag a text-heavy PDF as scanned', async () => {
    getText.mockResolvedValue({
      total: 1,
      pages: [{ num: 1, text: 'x'.repeat(200) }],
    })

    const result = await extractPdf(Buffer.from('%PDF-1.4'))

    expect(result.is_scanned).toBe(false)
  })

  it('treats a document with zero pages as scanned rather than dividing by zero', async () => {
    getText.mockResolvedValue({ total: 0, pages: [] })

    const result = await extractPdf(Buffer.from('%PDF-1.4'))

    expect(result.is_scanned).toBe(true)
    expect(result.word_count).toBe(0)
  })
})
