import { PDFParse } from 'pdf-parse'

const SCANNED_THRESHOLD = 50 // chars/page average below this = scanned

export interface ExtractedPage {
  page_number: number
  raw_text: string
}

export interface ExtractionResult {
  pages: ExtractedPage[]
  page_count: number
  word_count: number
  is_scanned: boolean
}

export async function extractPdf(buffer: Buffer): Promise<ExtractionResult> {
  const parser = new PDFParse({ data: buffer })
  const result = await parser.getText()
  await parser.destroy()

  const pages: ExtractedPage[] = result.pages.map((p) => ({
    page_number: p.num,
    raw_text: p.text.trim(),
  }))

  const page_count = result.total
  const allText = pages.map((p) => p.raw_text).join(' ')
  const word_count = allText.split(/\s+/).filter(Boolean).length
  const totalChars = pages.reduce((sum, p) => sum + p.raw_text.length, 0)
  const avgCharsPerPage = page_count > 0 ? totalChars / page_count : 0
  const is_scanned = avgCharsPerPage < SCANNED_THRESHOLD

  return { pages, page_count, word_count, is_scanned }
}
