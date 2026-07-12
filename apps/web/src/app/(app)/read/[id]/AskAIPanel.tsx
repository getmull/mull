'use client'

import { useEffect, useRef, useState } from 'react'

interface Citation { page: number; quote: string }
interface Message { role: 'user' | 'assistant'; content: string; citations?: Citation[] }

interface Props {
  documentId: string
  onCitationClick: (page: number) => void
  onClose: () => void
}

export function AskAIPanel({ documentId, onCitationClick, onClose }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch(`/api/documents/${documentId}/ask`)
      .then((r) => r.json())
      .then(({ messages: history }) => setMessages(history ?? []))
      .catch(() => {})
  }, [documentId])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages, loading])

  async function handleSend() {
    const question = input.trim()
    if (!question || loading) return
    setInput('')
    setError(null)
    setMessages((prev) => [...prev, { role: 'user', content: question }])
    setLoading(true)

    try {
      const res = await fetch(`/api/documents/${documentId}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Something went wrong')
        return
      }
      setMessages((prev) => [...prev, json.message])
    } catch {
      setError('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed right-0 top-0 z-40 flex h-full w-full max-w-sm flex-col border-l border-neutral-200 bg-white shadow-xl">
      <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-neutral-800">Ask AI</h2>
        <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 transition-colors" aria-label="Close">
          ✕
        </button>
      </div>

      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {messages.length === 0 && (
          <p className="text-sm text-neutral-400">Ask a question about this document.</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'text-right' : 'text-left'}>
            <div
              className={`inline-block max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                m.role === 'user' ? 'bg-neutral-800 text-white' : 'bg-neutral-100 text-neutral-800'
              }`}
            >
              {m.content}
            </div>
            {m.citations && m.citations.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {m.citations.map((c, j) => (
                  <button
                    key={j}
                    onClick={() => onCitationClick(c.page)}
                    title={c.quote}
                    className="rounded border border-neutral-200 px-1.5 py-0.5 text-xs text-neutral-500 hover:bg-neutral-50 hover:text-neutral-800 transition-colors"
                  >
                    p.{c.page}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {loading && <p className="text-sm text-neutral-400">Thinking…</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      <div className="flex gap-2 border-t border-neutral-200 p-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSend() }}
          placeholder="Ask a question…"
          className="flex-1 rounded border border-neutral-200 px-3 py-1.5 text-sm outline-none focus:border-neutral-400"
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          className="rounded bg-neutral-800 px-3 py-1.5 text-sm text-white disabled:opacity-40 transition-colors"
        >
          Send
        </button>
      </div>
    </div>
  )
}
