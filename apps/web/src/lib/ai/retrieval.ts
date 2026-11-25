export interface SourcePage {
  page_number: number
  raw_text: string
}

interface ConversationTurn { role: 'user' | 'assistant'; content: string }
interface Passage { page: number; text: string; order: number; terms: Map<string, number> }

// Leaves a separate 2,000-character allowance for anchored user highlights.
export const MAX_PASSAGE_CONTEXT_CHARS = 10000
const PASSAGE_CHARS = 1600
const OVERLAP_CHARS = 200
const PARTIAL_NOTICE = '\n\n[Selected excerpts only. Other portions of the document are not included; missing information here may exist elsewhere in the document.]'
const STOP_WORDS = new Set(('a an and are as at be been being but by can could did do does for from had has have how i if in into is it its me my of on or our please should so some than that the their them there these they this those to us was we were what when where which who why will with would you your about document paper page pages tell explain describe compare summarize summarise summary overview give').split(' '))

function terms(text: string): string[] {
  return (text.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word))
}

function passagesFor(pages: SourcePage[]): Passage[] {
  const passages: Passage[] = []
  for (const page of pages) {
    const text = page.raw_text.trim()
    for (let start = 0; start < text.length;) {
      let end = Math.min(start + PASSAGE_CHARS, text.length)
      if (end < text.length) {
        const boundary = text.lastIndexOf(' ', end)
        if (boundary > start + PASSAGE_CHARS / 2) end = boundary
      }
      const excerpt = text.slice(start, end)
      const counts = new Map<string, number>()
      for (const word of terms(excerpt)) counts.set(word, (counts.get(word) ?? 0) + 1)
      passages.push({ page: page.page_number, text: excerpt, order: passages.length, terms: counts })
      if (end === text.length) break
      start = end - OVERLAP_CHARS
    }
  }
  return passages
}

// Interleaved sampling keeps general questions and unmatched searches from
// silently seeing only the opening pages. It is not a whole-document summary.
function representativeOrder(length: number): number[] {
  if (length === 0) return []
  const result = new Set([0, length - 1])
  for (let divisions = 2; divisions < length * 2; divisions *= 2) {
    for (let i = 1; i < divisions; i += 2) result.add(Math.floor((i * (length - 1)) / divisions))
  }
  return [...result]
}

/** Keyword ranking across every page; no embeddings, provider call, or new index. */
export function selectDocumentPassages(pages: SourcePage[], question: string, history: ConversationTurn[] = [], highlightedPages: number[] = []) {
  const passages = passagesFor(pages)
  const query = new Map(terms(question).map((word) => [word, 1]))
  // Short follow-ups borrow the last user's subject without letting an old
  // conversation outweigh the current question. Assistant claims are not sources.
  const overview = query.size === 0 && /\b(summari[sz]e|summary|overview|(?:this|the) (?:document|paper))\b/i.test(question)
  if (query.size <= 3 && !overview) {
    const previous = history.findLast((turn) => turn.role === 'user')
    for (const word of terms(previous?.content ?? '')) if (!query.has(word)) query.set(word, 0.2)
  }
  const pageRanges = [...question.matchAll(/\b(?:pages?|pp?)\.?\s*(\d+(?:\s*(?:[-–,]|and|to)\s*\d+)*)/giu)]
    .flatMap((match) => match[1].split(/\s*(?:,|and)\s*/i).map((part) => {
      const [start, end = start] = part.split(/\s*(?:[-–]|to)\s*/i).map(Number)
      return [start, end]
    }))
  const frequency = new Map<string, number>()
  for (const word of query.keys()) {
    frequency.set(word, passages.reduce((count, passage) => count + Number(passage.terms.has(word)), 0))
  }
  const ranked = passages.map((passage) => {
    const requestedHighlight = /\bhighlights?(?:ed|ing)?\b/i.test(question) && highlightedPages.includes(passage.page)
    let score = requestedHighlight || pageRanges.some(([start, end]) => passage.page >= start && passage.page <= end) ? 100 : 0
    for (const [word, weight] of query) {
      const count = passage.terms.get(word) ?? 0
      if (count) score += weight * (1 + Math.log(count)) * Math.log(1 + passages.length / (frequency.get(word) ?? 1))
    }
    return { passage, score }
  }).filter(({ score }) => score > 0).sort((a, b) => b.score - a.score || a.passage.order - b.passage.order)

  // Give each matching page its best passage before filling remaining space
  // with more passages from the same page.
  const bestPerPage = new Map<number, number>()
  for (const { passage } of ranked) if (!bestPerPage.has(passage.page)) bestPerPage.set(passage.page, passage.order)
  const candidates = new Set(bestPerPage.values())
  for (const { passage } of ranked) candidates.add(passage.order)
  // Include nearby text after the matches, when space permits.
  for (const { passage } of ranked) {
    for (const neighbor of [passage.order - 1, passage.order + 1]) {
      if (passages[neighbor]?.page === passage.page) candidates.add(neighbor)
    }
  }
  for (const index of representativeOrder(passages.length)) candidates.add(index)

  let used = PARTIAL_NOTICE.length
  const selected: Passage[] = []
  for (const index of candidates) {
    const passage = passages[index]
    const size = `--- Page ${passage.page} ---\n${passage.text}`.length + (selected.length ? 2 : 0)
    if (used + size > MAX_PASSAGE_CONTEXT_CHARS) continue
    selected.push(passage)
    used += size
  }
  selected.sort((a, b) => a.order - b.order)
  const partial = selected.length < passages.length
  return {
    pagesText: selected.map((passage) => `--- Page ${passage.page} ---\n${passage.text}`).join('\n\n') + (partial ? PARTIAL_NOTICE : ''),
    pageNumbers: [...new Set(selected.map((passage) => passage.page))],
  }
}
