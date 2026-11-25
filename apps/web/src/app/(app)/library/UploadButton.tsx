'use client'

import { useRef, useState, useSyncExternalStore, useTransition } from 'react'
import { useRouter } from 'next/navigation'

const subscribe = () => () => {}
const clientReady = () => true
const serverReady = () => false

export function UploadButton() {
  const hydrated = useSyncExternalStore(subscribe, clientReady, serverReady)
  const inputRef = useRef<HTMLInputElement>(null)
  const uploadingRef = useRef(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  async function handleFile(file: File) {
    if (uploadingRef.current || isPending) return
    setError(null)
    if (file.size > 50 * 1024 * 1024) {
      setError('File exceeds 50 MB limit')
      return
    }
    uploadingRef.current = true
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/documents/upload', { method: 'POST', body: form })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Upload failed. Please try again.')
        return
      }
      startTransition(() => router.refresh())
    } catch {
      setError('Could not upload your PDF. Check your connection and try again.')
    } finally {
      uploadingRef.current = false
      setUploading(false)
    }
  }

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        disabled={!hydrated || uploading || isPending}
        aria-label="Upload a PDF"
        aria-busy={uploading || isPending}
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
        className="flex flex-col items-center justify-center w-full max-w-sm border-2 border-dashed border-neutral-200 rounded-lg px-8 py-10 cursor-pointer hover:border-neutral-400 hover:bg-neutral-50 transition-colors disabled:cursor-wait disabled:opacity-60"
      >
        <span className="text-2xl mb-2">＋</span>
        <span className="text-sm font-medium text-neutral-700">
          {uploading || isPending ? 'Uploading and processing…' : 'Upload a PDF'}
        </span>
        <span className="text-xs text-neutral-500 mt-1">or drag and drop · up to 50 MB</span>
      </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={onChange}
          disabled={!hydrated || uploading || isPending}
          aria-label="Choose PDF file"
        />
      {error && (
        <p role="alert" className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>
      )}
    </div>
  )
}
