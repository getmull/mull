'use client'

import 'pdfjs-dist/web/pdf_viewer.css'
import { useEffect, useRef, useState, useCallback } from 'react'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import { SelectionToolbar } from './SelectionToolbar'

interface Rect { x: number; y: number; width: number; height: number }

interface Highlight {
  id: string
  text: string
  color: string
  page_ref: number
  position: Rect[] | null
}

interface SelectionState {
  text: string
  pageRef: number
  rects: Rect[]
  toolbarX: number
  toolbarY: number
}

interface Props {
  documentId: string
  pageCount: number
  isScanned: boolean
}

const COLOR_BG: Record<string, string> = {
  yellow: 'bg-yellow-300',
  green:  'bg-green-300',
  blue:   'bg-blue-300',
  pink:   'bg-pink-300',
}

export function PDFViewer({ documentId, pageCount, isScanned }: Props) {
  const canvasRef        = useRef<HTMLCanvasElement>(null)
  const textLayerRef     = useRef<HTMLDivElement>(null)
  const pageContainerRef = useRef<HTMLDivElement>(null)
  const renderTaskRef    = useRef<{ cancel: () => void } | null>(null)
  const textLayerRef2    = useRef<{ cancel: () => void } | null>(null)

  const [pdf, setPdf]               = useState<PDFDocumentProxy | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [scale, setScale]           = useState(1.2)
  const [pageSize, setPageSize]     = useState({ width: 0, height: 0 })
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [highlights, setHighlights] = useState<Highlight[]>([])
  const [selection, setSelection]   = useState<SelectionState | null>(null)
  const [hoveredId, setHoveredId]   = useState<string | null>(null)
  const [saving, setSaving]         = useState(false)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load PDF
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`/api/documents/${documentId}/signed-url`)
        if (!res.ok) throw new Error('Could not load document')
        const { url } = await res.json()
        const pdfjs = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url
        ).toString()
        const doc = await pdfjs.getDocument(url).promise
        if (!cancelled) { setPdf(doc); setLoading(false) }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load PDF')
          setLoading(false)
        }
      }
    }
    load()
    return () => { cancelled = true }
  }, [documentId])

  // Load highlights — normalize position to Rect[] regardless of stored format
  useEffect(() => {
    fetch(`/api/highlights?documentId=${documentId}`)
      .then((r) => r.json())
      .then(({ highlights: h }) => {
        if (!h) return
        setHighlights(h.map((hl: Highlight & { position: unknown }) => ({
          ...hl,
          position: Array.isArray(hl.position)
            ? hl.position
            : hl.position
            ? [hl.position as Rect]
            : null,
        })))
      })
      .catch(() => {})
  }, [documentId])

  const renderPage = useCallback(async (doc: PDFDocumentProxy, pageNum: number, pageScale: number) => {
    const canvas      = canvasRef.current
    const textLayerDiv = textLayerRef.current
    if (!canvas || !textLayerDiv) return

    if (renderTaskRef.current) { renderTaskRef.current.cancel(); renderTaskRef.current = null }
    if (textLayerRef2.current) { textLayerRef2.current.cancel(); textLayerRef2.current = null }
    textLayerDiv.innerHTML = ''

    let page: PDFPageProxy
    try { page = await doc.getPage(pageNum) } catch { return }

    const viewport = page.getViewport({ scale: pageScale })
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width  = viewport.width  * dpr
    canvas.height = viewport.height * dpr
    canvas.style.width  = `${viewport.width}px`
    canvas.style.height = `${viewport.height}px`
    ctx.scale(dpr, dpr)
    setPageSize({ width: viewport.width, height: viewport.height })

    const renderTask = page.render({ canvasContext: ctx, viewport, canvas })
    renderTaskRef.current = renderTask
    try { await renderTask.promise } catch { page.cleanup(); return }

    const pdfjs = await import('pdfjs-dist')
    const textContent = await page.getTextContent()
    const textLayer = new pdfjs.TextLayer({ textContentSource: textContent, container: textLayerDiv, viewport })
    textLayerRef2.current = textLayer
    try { await textLayer.render() } catch { /* cancelled */ }

    page.cleanup()
  }, [])

  useEffect(() => {
    if (pdf) renderPage(pdf, currentPage, scale)
  }, [pdf, currentPage, scale, renderPage])

  const handleMouseUp = useCallback(() => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed) { setSelection(null); return }
    const text = sel.toString().trim()
    if (text.length < 3) { setSelection(null); return }

    const range = sel.getRangeAt(0)
    if (!textLayerRef.current?.contains(range.commonAncestorContainer)) { setSelection(null); return }

    const container = pageContainerRef.current
    if (!container) return
    const pageRect = container.getBoundingClientRect()

    // Per-line rects so highlights follow text lines, not one big box
    const clientRects = Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0)
    if (clientRects.length === 0) { setSelection(null); return }

    const rects: Rect[] = clientRects.map((r) => ({
      x:      (r.left   - pageRect.left) / pageRect.width,
      y:      (r.top    - pageRect.top)  / pageRect.height,
      width:  r.width   / pageRect.width,
      height: r.height  / pageRect.height,
    }))

    // Position toolbar above the first rect
    const first = clientRects[0]
    setSelection({
      text,
      pageRef: currentPage,
      rects,
      toolbarX: first.left + first.width / 2 - 60,
      toolbarY: first.top,
    })
  }, [currentPage])

  // Hover detection via coordinate math — keeps text layer fully interactive
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const container = pageContainerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const mx = (e.clientX - rect.left) / rect.width
    const my = (e.clientY - rect.top)  / rect.height

    const pageHighlights = highlights.filter((h) => h.page_ref === currentPage)
    const hit = pageHighlights.find((h) =>
      h.position?.some((r) => mx >= r.x && mx <= r.x + r.width && my >= r.y && my <= r.y + r.height)
    )

    if (hit) {
      if (hoverTimer.current) { clearTimeout(hoverTimer.current); hoverTimer.current = null }
      setHoveredId(hit.id)
    } else {
      // Delay clearing so the mouse can travel to the Remove button
      if (!hoverTimer.current) {
        hoverTimer.current = setTimeout(() => {
          setHoveredId(null)
          hoverTimer.current = null
        }, 400)
      }
    }
  }, [highlights, currentPage])

  async function saveHighlight(color: string) {
    if (!selection || saving) return
    setSaving(true)
    window.getSelection()?.removeAllRanges()

    const res = await fetch('/api/highlights', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        document_id: documentId,
        text: selection.text,
        color,
        page_ref: selection.pageRef,
        position: selection.rects,
      }),
    })
    if (res.ok) {
      const { highlight } = await res.json()
      setHighlights((prev) => [...prev, highlight])
    }
    setSelection(null)
    setSaving(false)
  }

  async function deleteHighlight(id: string) {
    setHoveredId(null)
    await fetch(`/api/highlights/${id}`, { method: 'DELETE' })
    setHighlights((prev) => prev.filter((h) => h.id !== id))
  }

  function goTo(page: number) {
    setSelection(null)
    setCurrentPage(Math.max(1, Math.min(page, pdf?.numPages ?? pageCount)))
  }

  if (loading) return (
    <div className="flex items-center justify-center bg-neutral-100 min-h-screen w-full text-sm text-neutral-400">
      Loading...
    </div>
  )
  if (error) return (
    <div className="flex items-center justify-center bg-neutral-100 min-h-screen w-full text-sm text-red-500">
      {error}
    </div>
  )

  const totalPages      = pdf?.numPages ?? pageCount
  const pageHighlights  = highlights.filter((h) => h.page_ref === currentPage)
  const hoveredHighlight = pageHighlights.find((h) => h.id === hoveredId)

  return (
    <div className="flex flex-col items-center gap-4 pb-12 bg-neutral-100 min-h-screen">
      {isScanned && (
        <div className="w-full max-w-3xl mt-4 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-800">
          This PDF appears to be scanned — text search and AI features may not be available.
        </div>
      )}

      {/* Controls */}
      <div className="sticky top-0 z-10 bg-white border-b border-neutral-200 w-full flex items-center justify-center gap-4 px-4 py-2">
        <button onClick={() => goTo(currentPage - 1)} disabled={currentPage <= 1}
          className="px-3 py-1 text-sm text-neutral-700 rounded border border-neutral-200 disabled:opacity-30 hover:bg-neutral-50 transition-colors">
          Prev
        </button>
        <span className="text-sm text-neutral-600 tabular-nums">{currentPage} / {totalPages}</span>
        <button onClick={() => goTo(currentPage + 1)} disabled={currentPage >= totalPages}
          className="px-3 py-1 text-sm text-neutral-700 rounded border border-neutral-200 disabled:opacity-30 hover:bg-neutral-50 transition-colors">
          Next
        </button>
        <div className="flex items-center gap-1 ml-4">
          <button onClick={() => setScale((s) => Math.max(0.5, s - 0.2))}
            className="px-3 py-1 text-sm text-neutral-700 rounded border border-neutral-200 hover:bg-neutral-50 transition-colors">-</button>
          <span className="text-xs text-neutral-500 w-12 text-center tabular-nums">{Math.round(scale * 100)}%</span>
          <button onClick={() => setScale((s) => Math.min(3, s + 0.2))}
            className="px-3 py-1 text-sm text-neutral-700 rounded border border-neutral-200 hover:bg-neutral-50 transition-colors">+</button>
        </div>
      </div>

      {/* Page */}
      <div
        ref={pageContainerRef}
        className="relative shadow-lg bg-white"
        style={pageSize.width ? { width: pageSize.width, height: pageSize.height } : undefined}
        onMouseUp={handleMouseUp}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => {
          if (!hoverTimer.current) {
            hoverTimer.current = setTimeout(() => { setHoveredId(null); hoverTimer.current = null }, 400)
          }
        }}
      >
        <canvas ref={canvasRef} className="block" style={{ pointerEvents: 'none' }} />

        {/* Highlight overlays — pointer-events: none so text layer stays fully interactive */}
        {pageHighlights.map((h) =>
          h.position?.map((r, i) => (
            <div
              key={`${h.id}-${i}`}
              className={`absolute rounded-sm opacity-40 ${COLOR_BG[h.color] ?? 'bg-yellow-300'}`}
              style={{
                left:   `${r.x      * 100}%`,
                top:    `${r.y      * 100}%`,
                width:  `${r.width  * 100}%`,
                height: `${r.height * 100}%`,
                pointerEvents: 'none',
                zIndex: 1,
              }}
            />
          ))
        )}

        {/* Text layer on top for selection */}
        <div ref={textLayerRef} className="textLayer" style={{ zIndex: 2 }} />

        {/* Floating delete button on highlight hover — positioned in the same
            percentage-of-container coordinate space as the overlays above,
            so it scrolls and resizes with the page instead of drifting. */}
        {hoveredHighlight?.position?.[0] && (
          <button
            onClick={() => deleteHighlight(hoveredHighlight.id)}
            onMouseEnter={() => { if (hoverTimer.current) { clearTimeout(hoverTimer.current); hoverTimer.current = null } }}
            onMouseLeave={() => setHoveredId(null)}
            className="absolute z-50 bg-white border border-neutral-300 rounded shadow text-xs text-neutral-600 hover:bg-red-50 hover:text-red-600 hover:border-red-300 transition-colors px-2 py-0.5"
            style={{
              left: `${hoveredHighlight.position[0].x * 100}%`,
              top:  `calc(${hoveredHighlight.position[0].y * 100}% - 28px)`,
            }}
          >
            Remove
          </button>
        )}
      </div>

      {/* Selection toolbar */}
      {selection && (
        <SelectionToolbar
          x={selection.toolbarX}
          y={selection.toolbarY}
          onColor={saveHighlight}
          onDismiss={() => { window.getSelection()?.removeAllRanges(); setSelection(null) }}
        />
      )}
    </div>
  )
}
