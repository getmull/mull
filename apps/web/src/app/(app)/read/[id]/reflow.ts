/** Preserve paragraph/list boundaries; join soft line wraps without inventing layout. */
export function reflowParagraphs(text: string): string[] {
  return text.replace(/\r\n?/g, '\n').replace(/\u00ad/g, '')
    .split(/\n\s*\n|\n(?=\s*(?:[•*\-–]|\d+[.)])\s+)/)
    .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

export interface TextHighlight { id: string; text: string; color: string }
export interface HighlightRange { start: number; end: number; highlight: TextHighlight }

/** Ambiguous/overlapping quotes stay available in the page's highlight list. */
export function reflowHighlightRanges(paragraph: string, pageText: string, highlights: TextHighlight[]): HighlightRange[] {
  const ranges: HighlightRange[] = []
  for (const highlight of highlights) {
    const quote = highlight.text.replace(/\u00ad/g, '').replace(/\s+/g, ' ').trim()
    if (!quote) continue
    const globalStart = pageText.indexOf(quote)
    const start = paragraph.indexOf(quote)
    if (start < 0 || globalStart < 0 || pageText.indexOf(quote, globalStart + 1) >= 0) continue
    ranges.push({ start, end: start + quote.length, highlight })
  }
  const result: HighlightRange[] = []
  for (const range of ranges.sort((a, b) => a.start - b.start || b.end - a.end)) {
    if (!result.length || range.start >= result[result.length - 1].end) result.push(range)
  }
  return result
}
