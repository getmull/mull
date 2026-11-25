'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

/** Serializes writes so a slow request cannot overwrite a newer page. */
export function useReadingProgress(documentId: string, page: number, totalPages: number, initialPage: number) {
  const latest = useRef({ page, totalPages })
  const persisted = useRef(initialPage)
  const inFlight = useRef<Promise<void> | null>(null)
  const mounted = useRef(true)
  const [savedPage, setSavedPage] = useState(initialPage)
  const [status, setStatus] = useState<SaveStatus>('idle')

  const save = useCallback((): Promise<void> => {
    if (inFlight.current) return inFlight.current
    if (persisted.current === latest.current.page) return Promise.resolve()

    const request = async () => {
      if (mounted.current) setStatus('saving')
      try {
        while (persisted.current !== latest.current.page) {
          const { page: nextPage, totalPages: count } = latest.current
          const response = await fetch(`/api/documents/${documentId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            keepalive: true,
            body: JSON.stringify({
              last_page: nextPage,
              progress_pct: Math.round((nextPage / count) * 10000) / 100,
            }),
          })
          if (!response.ok) throw new Error('Position save failed')
          persisted.current = nextPage
        }
        if (mounted.current) { setSavedPage(persisted.current); setStatus('saved') }
      } catch {
        if (mounted.current) setStatus('error')
      } finally {
        inFlight.current = null
      }
    }
    inFlight.current = request()
    return inFlight.current
  }, [documentId])

  useEffect(() => {
    latest.current = { page, totalPages }
    const timer = setTimeout(() => { void save() }, 1000)
    return () => clearTimeout(timer)
  }, [page, totalPages, save])

  useEffect(() => {
    mounted.current = true
    const flush = () => { void save() }
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush() }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      mounted.current = false
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onVisibility)
      flush()
    }
  }, [save])

  return { status: page !== savedPage && status !== 'error' ? 'saving' as const : status, retry: save }
}
