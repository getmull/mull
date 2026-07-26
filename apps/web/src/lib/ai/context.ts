import 'server-only'
import { createClient } from '@/lib/supabase/server'

// V1 has no embeddings (pgvector is V1.1 per CLAUDE.md), so the context
// builder can't do relevance ranking — it just takes the whole document up
// to a character budget, plus the user's own recent highlights as a proxy
// for "what they've already flagged as important."
const MAX_CONTEXT_CHARS = 12000
const MAX_HIGHLIGHTS = 15

export interface DocumentContext {
  pagesText: string
  highlightsText: string
  pageNumbers: number[]
}

interface PageRow {
  page_number: number
  raw_text: string
}

export async function buildDocumentContext(documentId: string, userId: string, question: string): Promise<DocumentContext> {
  const supabase = await createClient()

  const { data: pages } = await supabase
    .from('document_pages')
    .select('page_number, raw_text')
    .eq('document_id', documentId)
    .order('page_number', { ascending: true })

  const pageRows: PageRow[] = pages ?? []
  const pagesText = buildQueryRelevantPagesText(pageRows, question, MAX_CONTEXT_CHARS)

  const { data: highlights } = await supabase
    .from('highlights')
    .select('text, page_ref')
    .eq('document_id', documentId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(MAX_HIGHLIGHTS)

  const highlightsText = (highlights ?? [])
    .map((h) => `- (page ${h.page_ref ?? '?'}) "${h.text}"`)
    .join('\n')

  return { pagesText, highlightsText, pageNumbers: pageRows.map((p) => p.page_number) }
}

function truncateToBudget(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars)}\n[...document truncated...]`
}

function buildQueryRelevantPagesText(pages: PageRow[], question: string, maxChars: number): string {
  if (pages.length === 0) return ''

  const allText = pages.map((p) => `--- Page ${p.page_number} ---\n${p.raw_text}`).join('\n\n')
  if (allText.length <= maxChars) return allText

  const tokenMatches = question.toLocaleLowerCase().match(/[\p{L}\p{N}_-]+/gu) ?? []
  const tokens = Array.from(new Set(tokenMatches.filter((token) => token.length >= 3)))
  const scored = pages.map((page, index) => ({
    page,
    index,
    score: scorePage(page.raw_text, tokens),
  }))

  const ranked = [...scored].sort((a, b) => (b.score - a.score) || (a.index - b.index))
  const selected: Array<{ page: PageRow; index: number }> = []
  let selectedLength = 0
  for (const candidate of ranked) {
    const pageText = `--- Page ${candidate.page.page_number} ---\n${candidate.page.raw_text}`
    const addition = selected.length === 0 ? pageText.length : pageText.length + 2
    if (selectedLength + addition > maxChars) continue
    selected.push({ page: candidate.page, index: candidate.index })
    selectedLength += addition
  }

  if (selected.length === 0) {
    return truncateToBudget(allText, maxChars)
  }

  const ordered = selected.sort((a, b) => a.index - b.index)
  const combined = ordered.map(({ page }) => `--- Page ${page.page_number} ---\n${page.raw_text}`).join('\n\n')
  return truncateToBudget(combined, maxChars)
}

function scorePage(text: string, tokens: string[]): number {
  if (tokens.length === 0) return 0
  const normalized = text.toLowerCase()
  return tokens.reduce((score, token) => (normalized.includes(token) ? score + 1 : score), 0)
}

// Single page of surrounding context for a highlight chat — much smaller
// budget than MAX_CONTEXT_CHARS above, since it's always exactly one page,
// not a whole document, and there's no multi-page valid-pages list to build.
const MAX_HIGHLIGHT_PAGE_CONTEXT_CHARS = 4000

export async function buildHighlightPageContext(documentId: string, pageRef: number | null): Promise<string> {
  if (pageRef === null) return ''
  const supabase = await createClient()

  const { data: page } = await supabase
    .from('document_pages')
    .select('raw_text')
    .eq('document_id', documentId)
    .eq('page_number', pageRef)
    .single()

  return truncateToBudget(page?.raw_text ?? '', MAX_HIGHLIGHT_PAGE_CONTEXT_CHARS)
}
