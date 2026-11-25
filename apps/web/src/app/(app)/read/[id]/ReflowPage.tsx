'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { reflowParagraphs, reflowHighlightRanges, type TextHighlight } from './reflow'

export interface ReflowSelection { text: string; pageRef: number; toolbarX: number; toolbarY: number }
interface Props {
  documentId: string
  page: number
  fontSize: number
  highlights: TextHighlight[]
  onUnavailable: (message: string) => void
  onSelection: (selection: ReflowSelection | null) => void
  onHighlightSelected: (id: string) => void
}
const COLORS: Record<string, string> = { yellow: 'bg-yellow-200', green: 'bg-green-200', blue: 'bg-blue-200', pink: 'bg-pink-200' }

export function ReflowPage({ documentId, page, fontSize, highlights, onUnavailable, onSelection, onHighlightSelected }: Props) {
  const contentRef = useRef<HTMLDivElement>(null)
  const [loaded, setLoaded] = useState<{ documentId: string; page: number; text: string } | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/documents/${encodeURIComponent(documentId)}/pages/${page}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Page text unavailable')
        const source: { page_number?: number; raw_text?: string } = await response.json()
        if (source.page_number !== page || typeof source.raw_text !== 'string' || !reflowParagraphs(source.raw_text).length) throw new Error('Page text unavailable')
        if (!controller.signal.aborted) setLoaded({ documentId, page, text: source.raw_text })
      })
      .catch(() => {
        if (!controller.signal.aborted) onUnavailable('Reflow could not load text for this page. Showing Original instead.')
      })
    return () => controller.abort()
  }, [documentId, page, onUnavailable])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const updateSelection = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        const selection = window.getSelection()
        if (!selection || selection.isCollapsed || !selection.rangeCount) { onSelection(null); return }
        const range = selection.getRangeAt(0)
        if (!contentRef.current?.contains(range.commonAncestorContainer)) { onSelection(null); return }
        const text = selection.toString().trim()
        const rect = range.getBoundingClientRect()
        if (text.length < 3 || !rect.width || !rect.height) { onSelection(null); return }
        onSelection({ text, pageRef: page, toolbarX: rect.left, toolbarY: rect.top })
      }, 120)
    }
    document.addEventListener('selectionchange', updateSelection)
    return () => { clearTimeout(timer); document.removeEventListener('selectionchange', updateSelection) }
  }, [page, onSelection])

  if (loaded?.page !== page || loaded.documentId !== documentId) return <p role="status" className="px-4 py-8 text-sm text-neutral-600">Loading text for page {page}…</p>
  const paragraphs = reflowParagraphs(loaded.text)
  const pageText = paragraphs.join(' ')
  return (
    <article aria-label={`Reflow page ${page}`} className="mx-4 w-[calc(100%_-_2rem)] max-w-3xl rounded-xl border border-neutral-200 bg-white px-5 py-6 sm:px-10 sm:py-8">
      <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-neutral-500">Page {page}</h2>
      <p className="mb-6 text-sm text-neutral-600">Columns, tables, and equations may lose their layout. Choose Original to check the source.</p>
      <div ref={contentRef} style={{ fontSize }} className="space-y-5 leading-[1.85] text-neutral-800 [overflow-wrap:anywhere]">
        {paragraphs.map((paragraph, index) => {
          const ranges = reflowHighlightRanges(paragraph, pageText, highlights)
          const nodes: ReactNode[] = []
          let start = 0
          for (const range of ranges) {
            nodes.push(paragraph.slice(start, range.start))
            nodes.push(
              <mark key={range.highlight.id} role="button" tabIndex={0} aria-label={`Highlight: ${range.highlight.text}`}
                className={`${COLORS[range.highlight.color] ?? COLORS.yellow} rounded-sm text-inherit cursor-pointer`}
                onClick={() => onHighlightSelected(range.highlight.id)}
                onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onHighlightSelected(range.highlight.id) } }}>
                {paragraph.slice(range.start, range.end)}
              </mark>
            )
            start = range.end
          }
          nodes.push(paragraph.slice(start))
          return <p key={index}>{nodes}</p>
        })}
      </div>
    </article>
  )
}
