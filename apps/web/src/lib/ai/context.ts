import 'server-only'
import { createClient } from '@/lib/supabase/server'

// V1 has no embeddings (pgvector is V1.1 per CLAUDE.md), so the context
// builder can't do semantic ranking — it takes the whole document if it fits
// a character budget, otherwise the pages sharing the most terms with the
// question, plus the user's own recent highlights as a proxy for "what
// they've already flagged as important."
const MAX_CONTEXT_CHARS = 12000
const MAX_HIGHLIGHTS = 15
// Minimum body length worth sending as a truncated page excerpt — anything
// shorter is just a page header plus noise.
const MIN_PAGE_EXCERPT_CHARS = 200
const PAGE_TRUNCATED_MARKER = '\n[...page truncated...]'

export interface DocumentContext {
  pagesText: string
  highlightsText: string
  /** Exactly the pages included in pagesText — the only pages a citation may reference. */
  pageNumbers: number[]
}

// Thrown when the context can't be read from the database. Callers must turn
// this into an error response rather than asking the model about an
// incomplete (or empty) document.
export class DocumentContextError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DocumentContextError'
  }
}

interface PageRow {
  page_number: number
  raw_text: string
}

export async function buildDocumentContext(documentId: string, userId: string, question: string): Promise<DocumentContext> {
  const supabase = await createClient()

  const { data: pages, error: pagesError } = await supabase
    .from('document_pages')
    .select('page_number, raw_text')
    .eq('document_id', documentId)
    .order('page_number', { ascending: true })
  if (pagesError) throw new DocumentContextError('Failed to load document pages')

  const pageRows: PageRow[] = pages ?? []
  const { text: pagesText, includedPages } = buildQueryRelevantPagesText(pageRows, question, MAX_CONTEXT_CHARS)

  const { data: highlights, error: highlightsError } = await supabase
    .from('highlights')
    .select('text, page_ref')
    .eq('document_id', documentId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(MAX_HIGHLIGHTS)
  if (highlightsError) throw new DocumentContextError('Failed to load highlights')

  const highlightsText = (highlights ?? [])
    .map((h) => `- (page ${h.page_ref ?? '?'}) "${h.text}"`)
    .join('\n')

  return { pagesText, highlightsText, pageNumbers: includedPages }
}

function pageBlock(page: PageRow): string {
  return `--- Page ${page.page_number} ---\n${page.raw_text}`
}

// Header + as much of the page body as fits in maxChars, or null if too
// little of the body would fit to be useful.
function pageExcerpt(page: PageRow, maxChars: number): string | null {
  const header = `--- Page ${page.page_number} ---\n`
  const bodyBudget = maxChars - header.length - PAGE_TRUNCATED_MARKER.length
  if (bodyBudget < MIN_PAGE_EXCERPT_CHARS) return null
  return `${header}${page.raw_text.slice(0, bodyBudget)}${PAGE_TRUNCATED_MARKER}`
}

function buildQueryRelevantPagesText(
  pages: PageRow[],
  question: string,
  maxChars: number
): { text: string; includedPages: number[] } {
  if (pages.length === 0) return { text: '', includedPages: [] }

  const allText = pages.map(pageBlock).join('\n\n')
  if (allText.length <= maxChars) return { text: allText, includedPages: pages.map((p) => p.page_number) }

  const tokenMatches = question.toLocaleLowerCase().match(/[\p{L}\p{N}_-]+/gu) ?? []
  const tokens = Array.from(new Set(tokenMatches.filter((token) => token.length >= 3)))
  const scored = pages.map((page, index) => ({
    page,
    index,
    score: scorePage(page.raw_text, tokens),
  }))
  // If no page matches the question at all, ranking is plain document order
  // and the first page that doesn't fit is excerpted — i.e. document-prefix
  // truncation, with the included pages still tracked exactly.
  const anyRanked = scored.some((candidate) => candidate.score > 0)

  const ranked = [...scored].sort((a, b) => (b.score - a.score) || (a.index - b.index))
  const selected: Array<{ page: PageRow; index: number; text: string }> = []
  let selectedLength = 0
  for (const candidate of ranked) {
    const separatorLength = selected.length === 0 ? 0 : 2
    const remaining = maxChars - selectedLength - separatorLength
    const pageText = pageBlock(candidate.page)
    if (pageText.length <= remaining) {
      selected.push({ page: candidate.page, index: candidate.index, text: pageText })
      selectedLength += separatorLength + pageText.length
      continue
    }
    // A relevant page too large for the remaining budget is excerpted rather
    // than skipped, so the best match is never dropped entirely.
    if (candidate.score > 0 || !anyRanked) {
      const excerpt = pageExcerpt(candidate.page, remaining)
      if (excerpt) {
        selected.push({ page: candidate.page, index: candidate.index, text: excerpt })
        selectedLength += separatorLength + excerpt.length
      }
      if (!anyRanked) break
    }
  }

  const ordered = selected.sort((a, b) => a.index - b.index)
  return {
    text: ordered.map(({ text }) => text).join('\n\n'),
    includedPages: ordered.map(({ page }) => page.page_number),
  }
}

function scorePage(text: string, tokens: string[]): number {
  if (tokens.length === 0) return 0
  const normalized = text.toLowerCase()
  return tokens.reduce((score, token) => (normalized.includes(token) ? score + 1 : score), 0)
}
