'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'

interface Props {
  documentId: string
  pageCount: number
  isScanned: boolean
}

export function PDFViewer({ documentId, pageCount, isScanned }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [scale, setScale] = useState(1.2)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

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
        if (!cancelled) {
          setPdf(doc)
          setLoading(false)
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load PDF')
      }
    }

    load()
    return () => { cancelled = true }
  }, [documentId])

  const renderPage = useCallback(async (doc: PDFDocumentProxy, pageNum: number, pageScale: number) => {
    const canvas = canvasRef.current
    if (!canvas) return

    if (renderTaskRef.current) {
      renderTaskRef.current.cancel()
      renderTaskRef.current = null
    }

    let page: PDFPageProxy
    try {
      page = await doc.getPage(pageNum)
    } catch {
      return
    }

    const viewport = page.getViewport({ scale: pageScale })
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = viewport.width * dpr
    canvas.height = viewport.height * dpr
    canvas.style.width = `${viewport.width}px`
    canvas.style.height = `${viewport.height}px`
    ctx.scale(dpr, dpr)

    const task = page.render({ canvasContext: ctx, viewport, canvas })
    renderTaskRef.current = task
    try {
      await task.promise
    } catch {
      // cancelled — ignore
    }
    page.cleanup()
  }, [])

  useEffect(() => {
    if (pdf) renderPage(pdf, currentPage, scale)
  }, [pdf, currentPage, scale, renderPage])

  function goTo(page: number) {
    setCurrentPage(Math.max(1, Math.min(page, pdf?.numPages ?? pageCount)))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-neutral-400 bg-neutral-100 min-h-screen w-full">
        Loading...
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-red-500 bg-neutral-100 min-h-screen w-full">
        {error}
      </div>
    )
  }

  const totalPages = pdf?.numPages ?? pageCount

  return (
    <div className="flex flex-col items-center gap-4 pb-12 bg-neutral-100 min-h-screen">
      {isScanned && (
        <div className="w-full max-w-3xl mt-4 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-800">
          This PDF appears to be scanned — text search and AI features may not be available.
        </div>
      )}

      {/* Controls */}
      <div className="sticky top-0 z-10 bg-white border-b border-neutral-200 w-full flex items-center justify-center gap-4 px-4 py-2">
        <button
          onClick={() => goTo(currentPage - 1)}
          disabled={currentPage <= 1}
          className="px-3 py-1 text-sm text-neutral-700 rounded border border-neutral-200 disabled:opacity-30 hover:bg-neutral-50 transition-colors"
        >
          Prev
        </button>
        <span className="text-sm text-neutral-600 tabular-nums">
          {currentPage} / {totalPages}
        </span>
        <button
          onClick={() => goTo(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="px-3 py-1 text-sm text-neutral-700 rounded border border-neutral-200 disabled:opacity-30 hover:bg-neutral-50 transition-colors"
        >
          Next
        </button>
        <div className="flex items-center gap-1 ml-4">
          <button
            onClick={() => setScale((s) => Math.max(0.5, s - 0.2))}
            className="px-3 py-1 text-sm text-neutral-700 rounded border border-neutral-200 hover:bg-neutral-50 transition-colors"
          >
            -
          </button>
          <span className="text-xs text-neutral-500 w-12 text-center tabular-nums">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={() => setScale((s) => Math.min(3, s + 0.2))}
            className="px-3 py-1 text-sm text-neutral-700 rounded border border-neutral-200 hover:bg-neutral-50 transition-colors"
          >
            +
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div ref={containerRef} className="shadow-lg bg-white">
        <canvas ref={canvasRef} className="block" />
      </div>
    </div>
  )
}
