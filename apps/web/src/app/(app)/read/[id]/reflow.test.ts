import { reflowParagraphs, reflowHighlightRanges } from './reflow'

test('joins soft line wraps while preserving paragraph and list boundaries', () => {
  expect(reflowParagraphs('Wrapped\nline.\r\n\r\nNext paragraph.\n• One\n• Two\n\n1. First\n2. Second')).toEqual([
    'Wrapped line.', 'Next paragraph.', '• One', '• Two', '1. First', '2. Second',
  ])
})

test('removes soft hyphens but does not guess at hard hyphens or rewrite source text', () => {
  expect(reflowParagraphs('under\u00adstanding and state-\nof-the-art')).toEqual(['understanding and state- of-the-art'])
  expect(reflowParagraphs('  \n\n ')).toEqual([])
})

test('anchors a unique quote while normalizing PDF line-break whitespace', () => {
  const highlight = { id: 'h1', text: 'a unique\npassage', color: 'yellow' }
  expect(reflowHighlightRanges('Read a unique passage today.', 'Read a unique passage today.', [highlight])).toEqual([
    { start: 5, end: 21, highlight },
  ])
})

test('does not guess which occurrence of a repeated quote was highlighted', () => {
  expect(reflowHighlightRanges('Same quote.', 'Same quote. Same quote.', [{ id: 'h1', text: 'Same quote.', color: 'blue' }])).toEqual([])
})

test('avoids nested/overlapping marks while retaining a deterministic match', () => {
  const longer = { id: 'long', text: 'long quote', color: 'green' }
  const shorter = { id: 'short', text: 'quote', color: 'pink' }
  expect(reflowHighlightRanges('A long quote.', 'A long quote.', [shorter, longer])).toEqual([{ start: 2, end: 12, highlight: longer }])
})
