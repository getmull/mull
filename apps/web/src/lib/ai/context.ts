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

export async function buildDocumentContext(documentId: string, userId: string): Promise<DocumentContext> {
  const supabase = await createClient()

  const { data: pages } = await supabase
    .from('document_pages')
    .select('page_number, raw_text')
    .eq('document_id', documentId)
    .order('page_number', { ascending: true })

  const pagesText = truncateToBudget(
    (pages ?? []).map((p) => `--- Page ${p.page_number} ---\n${p.raw_text}`).join('\n\n'),
    MAX_CONTEXT_CHARS
  )

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

  return { pagesText, highlightsText, pageNumbers: (pages ?? []).map((p) => p.page_number) }
}

function truncateToBudget(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars)}\n[...document truncated...]`
}
