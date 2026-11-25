'use client'

import { useEffect, useState } from 'react'

interface Bookmark {
  id: string
  page_number: number
  label: string | null
}

interface Props {
  bookmarks: Bookmark[]
  currentPage: number
  adding: boolean
  // True when the most recent onAdd call failed — mirrors HighlightActionsPanel's
  // noteError so a failed save doesn't look like it silently succeeded.
  addError?: boolean
  loadError?: boolean
  deleteError?: boolean
  deletingId?: string | null
  onRetryLoad?: () => void
  onJump: (page: number) => void
  onAdd: (label: string) => Promise<boolean>
  onDelete: (id: string) => void
  onClose: () => void
}

export function BookmarksPanel({ bookmarks, currentPage, adding, addError, loadError, deleteError, deletingId, onRetryLoad, onJump, onAdd, onDelete, onClose }: Props) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])
  const [labelInput, setLabelInput] = useState('')
  const currentPageBookmark = bookmarks.find((b) => b.page_number === currentPage)

  async function submitAdd() {
    if (adding) return
    const ok = await onAdd(labelInput.trim())
    if (ok) setLabelInput('')
  }

  return (
    <div role="region" aria-label="Bookmarks" className="flex flex-col gap-2 bg-white border border-neutral-200 rounded-lg shadow-lg p-3 text-xs w-full sm:w-72">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-800">Bookmarks</h3>
        <button onClick={onClose} aria-label="Close" className="text-neutral-400 hover:text-neutral-700 transition-colors">
          ✕
        </button>
      </div>

      {loadError && <p role="alert" className="text-red-700">Couldn&apos;t load bookmarks. <button className="underline" onClick={onRetryLoad}>Retry</button></p>}
      {deleteError && <p role="alert" className="text-red-700">Couldn&apos;t delete the bookmark. Please try again.</p>}
      {!loadError && bookmarks.length === 0 ? (
        <p className="text-neutral-400">No bookmarks yet.</p>
      ) : (
        <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
          {bookmarks.map((b) => (
            <div key={b.id} className="flex items-start gap-1.5 border-b border-neutral-100 pb-1.5 last:border-0 last:pb-0">
              <button
                onClick={() => onJump(b.page_number)}
                className="flex-1 text-left text-neutral-600 hover:text-neutral-900 transition-colors"
              >
                <span className="font-medium tabular-nums">p.{b.page_number}</span>
                {b.label && <span className="ml-1.5 text-neutral-500">{b.label}</span>}
              </button>
              <button
                onClick={() => onDelete(b.id)}
                aria-label="Delete bookmark"
                disabled={Boolean(deletingId)}
                className="shrink-0 text-neutral-300 hover:text-red-600 transition-colors"
              >
                {deletingId === b.id ? '…' : '✕'}
              </button>
            </div>
          ))}
        </div>
      )}

      {loadError ? null : currentPageBookmark ? (
        <p className="text-[10px] text-neutral-400 border-t border-neutral-100 pt-2">This page is already bookmarked.</p>
      ) : (
        <div className="flex flex-col gap-1 border-t border-neutral-100 pt-2">
          <input
            aria-label={`Label for page ${currentPage}`}
            maxLength={200}
            value={labelInput}
            onChange={(e) => setLabelInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitAdd() }}
            placeholder={`Label for page ${currentPage} (optional)`}
            className="w-full rounded border border-neutral-200 px-2 py-1.5 text-xs outline-none focus:border-neutral-400"
          />
          {addError && <p role="alert" className="text-[10px] text-red-600">Couldn&apos;t save — try again.</p>}
          <button
            onClick={submitAdd}
            disabled={adding}
            className="self-start text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50 border border-neutral-200 rounded px-2 py-1 disabled:opacity-40 transition-colors"
          >
            {adding ? 'Saving…' : `+ Bookmark page ${currentPage}`}
          </button>
        </div>
      )}
    </div>
  )
}
