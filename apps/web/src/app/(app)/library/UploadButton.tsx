'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

export function UploadButton() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  async function handleFile(file: File) {
    setError(null)
    const form = new FormData()
    form.append('file', file)

    const res = await fetch('/api/documents/upload', { method: 'POST', body: form })
    const json = await res.json()

    if (!res.ok) {
      setError(json.error ?? 'Upload failed')
      return
    }

    startTransition(() => router.refresh())
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
      <div
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
        className="flex flex-col items-center justify-center w-full max-w-sm border-2 border-dashed border-neutral-200 rounded-lg px-8 py-10 cursor-pointer hover:border-neutral-400 hover:bg-neutral-50 transition-colors"
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={onChange}
        />
        <span className="text-2xl mb-2">＋</span>
        <p className="text-sm font-medium text-neutral-700">
          {isPending ? 'Processing…' : 'Upload a PDF'}
        </p>
        <p className="text-xs text-neutral-400 mt-1">or drag and drop · up to 50 MB</p>
      </div>
      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>
      )}
    </div>
  )
}
