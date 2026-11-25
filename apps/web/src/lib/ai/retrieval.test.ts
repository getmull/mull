import { selectDocumentPassages, MAX_PASSAGE_CONTEXT_CHARS, type SourcePage } from './retrieval'

const longDocument = (): SourcePage[] => Array.from({ length: 80 }, (_, i) => ({
  page_number: i + 1,
  raw_text: `Page ${i + 1}. ` + 'General background material about the experiment. '.repeat(75),
}))

test('retrieves a matching passage far beyond the old opening-text cutoff', () => {
  const pages = longDocument()
  pages[73].raw_text += ' The zirconium catalyst reduced reaction time by forty percent.'
  const context = selectDocumentPassages(pages, 'What effect did the zirconium catalyst have?')
  expect(context.pagesText).toContain('zirconium catalyst reduced reaction time')
  expect(context.pageNumbers).toContain(74)
  expect(context.pagesText.length).toBeLessThanOrEqual(MAX_PASSAGE_CONTEXT_CHARS)
  expect(context.pagesText).toContain('Selected excerpts only')
})

test('finds a passage near the end of one exceptionally long page', () => {
  const context = selectDocumentPassages([{ page_number: 5, raw_text: 'Background explanation. '.repeat(1500) + ' Luminescence peaks at wavelength 530 nanometers.' }], 'When does luminescence peak?')
  expect(context.pagesText).toContain('Luminescence peaks at wavelength 530')
  expect(context.pageNumbers).toEqual([5])
  expect(context.pagesText.length).toBeLessThanOrEqual(MAX_PASSAGE_CONTEXT_CHARS)
})

test('can bring two distant subjects into the same comparison context', () => {
  const pages = longDocument()
  pages[3].raw_text += ' Photosynthesis converts light to chemical energy.'
  pages[71].raw_text += ' Respiration releases stored chemical energy.'
  const context = selectDocumentPassages(pages, 'Compare photosynthesis and respiration.')
  expect(context.pageNumbers).toEqual(expect.arrayContaining([4, 72]))
  expect(context.pagesText).toContain('Photosynthesis converts light')
  expect(context.pagesText).toContain('Respiration releases stored')
})

test('uses the last user question to resolve a short follow-up', () => {
  const pages = longDocument()
  pages[64].raw_text += ' Calibration adjusts instrument sensitivity using a reference sample.'
  const context = selectDocumentPassages(pages, 'Why is that necessary?', [
    { role: 'user', content: 'What is calibration?' },
    { role: 'assistant', content: 'An untrusted answer discussing imaginary zeppelins.' },
  ])
  expect(context.pageNumbers).toContain(65)
  expect(context.pagesText).toContain('Calibration adjusts instrument sensitivity')
  expect(context.pagesText).not.toContain('imaginary zeppelins')
})

test('respects explicit page references even when no question term matches', () => {
  const context = selectDocumentPassages(longDocument(), 'Explain page 79.')
  expect(context.pageNumbers).toContain(79)
})

test('samples the end as well as the beginning for a general overview', () => {
  const context = selectDocumentPassages(longDocument(), 'Summarize this document.')
  expect(context.pageNumbers).toEqual(expect.arrayContaining([1, 80]))
  expect(context.pagesText).toContain('Other portions of the document are not included')
})

test('handles punctuation-only and unmatched queries with bounded representative excerpts', () => {
  for (const question of ['?!', 'intergalactic platypus']) {
    const context = selectDocumentPassages(longDocument(), question)
    expect(context.pageNumbers).toEqual(expect.arrayContaining([1, 80]))
    expect(context.pagesText.length).toBeLessThanOrEqual(MAX_PASSAGE_CONTEXT_CHARS)
  }
})

test('returns only page numbers present in the supplied excerpts, in document order', () => {
  const context = selectDocumentPassages(longDocument(), 'Explain page 79.')
  const markers = [...context.pagesText.matchAll(/--- Page (\d+) ---/g)].map((match) => Number(match[1]))
  expect(context.pageNumbers).toEqual([...new Set(markers)])
  expect(context.pageNumbers).toEqual([...context.pageNumbers].sort((a, b) => a - b))
})

test('keeps a short document complete and handles empty/scanned pages', () => {
  expect(selectDocumentPassages([{ page_number: 1, raw_text: 'First page' }, { page_number: 2, raw_text: 'Second page' }], 'Explain')).toEqual({
    pagesText: '--- Page 1 ---\nFirst page\n\n--- Page 2 ---\nSecond page', pageNumbers: [1, 2],
  })
  expect(selectDocumentPassages([{ page_number: 1, raw_text: '  ' }], 'anything')).toEqual({ pagesText: '', pageNumbers: [] })
})


test('respects a list of requested pages without letting one huge page consume all the context', () => {
  const pages = longDocument()
  pages[2].raw_text = 'Long page with background text. '.repeat(2000)
  const context = selectDocumentPassages(pages, 'Compare pages 3 and 79.')
  expect(context.pageNumbers).toEqual(expect.arrayContaining([3, 79]))
})


test('a general overview does not inherit the previous question’s narrow topic', () => {
  const pages = longDocument()
  pages[39].raw_text = 'zirconium catalyst. '.repeat(2000)
  const context = selectDocumentPassages(pages, 'Summarize this document.', [{ role: 'user', content: 'What is the zirconium catalyst?' }])
  expect(context.pageNumbers).toEqual(expect.arrayContaining([1, 80]))
})

test('questions about highlights prioritize their anchored source pages', () => {
  const context = selectDocumentPassages(longDocument(), 'What did I highlight?', [], [70])
  expect(context.pageNumbers).toContain(70)
})
