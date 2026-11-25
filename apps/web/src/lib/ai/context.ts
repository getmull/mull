import 'server-only'
import { createClient } from '@/lib/supabase/server'

import { selectDocumentPassages, type SourcePage } from './retrieval'
import type { StoredMessage } from './askAI'

const PAGE_BATCH_SIZE = 200
const MAX_HIGHLIGHTS = 15
const MAX_HIGHLIGHT_CHARS = 2000

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

export async function buildDocumentContext(documentId: string, userId: string, question = '', history: StoredMessage[] = []): Promise<DocumentContext> {
  const supabase = await createClient()
  const pages: SourcePage[] = []
  // PostgREST caps each response. Page through the full document so a late
  // passage is searchable even in a document with more than 1,000 pages.
  for (let offset = 0; ; offset += PAGE_BATCH_SIZE) {
    const { data, error } = await supabase
      .from('document_pages')
      .select('page_number, raw_text')
      .eq('document_id', documentId)
      .order('page_number', { ascending: true })
      .range(offset, offset + PAGE_BATCH_SIZE - 1)
    if (error) throw new DocumentContextError('Could not load document text')
    const batch: SourcePage[] = data ?? []
    pages.push(...batch)
    if (batch.length < PAGE_BATCH_SIZE) break
  }
  const { data: highlights, error } = await supabase
    .from('highlights')
    .select('text, page_ref')
    .eq('document_id', documentId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(MAX_HIGHLIGHTS)
  if (error) throw new DocumentContextError('Could not load highlights')
  const highlightedPages = (highlights ?? []).map((highlight) => highlight.page_ref).filter((page): page is number => typeof page === 'number')
  const { pagesText, pageNumbers } = selectDocumentPassages(pages, question, history, highlightedPages)

  // Only include highlights anchored to supplied pages. Unanchored text must
  // not become an uncitable second source or an unbounded prompt addition.
  const highlightsText = truncateToBudget((highlights ?? [])
    .filter((highlight) => pageNumbers.includes(highlight.page_ref))
    .map((highlight) => `- (page ${highlight.page_ref}) "${highlight.text}"`)
    .join('\n'), MAX_HIGHLIGHT_CHARS)
  return { pagesText, highlightsText, pageNumbers }
}

function truncateToBudget(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  const notice = '\n[...passage truncated...]'
  return `${text.slice(0, maxChars - notice.length)}${notice}`
}
