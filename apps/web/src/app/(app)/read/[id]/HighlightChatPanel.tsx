'use client'

import { useEffect, useRef, useState } from 'react'
import type { Action } from './HighlightActionsPanel'

interface Message { role: 'user' | 'assistant'; content: string }
interface PendingSeed { action: Action; token: number }

interface Props {
  highlightId: string
  pageRef: number | null
  pendingSeed: PendingSeed | null
  onSeedHandled: () => void
  onClose: () => void
}

export function HighlightChatPanel({ highlightId, pageRef, pendingSeed, onSeedHandled, onClose }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch(`/api/highlights/${highlightId}/chat`)
      .then((r) => r.json())
      .then(({ messages: history }) => setMessages(history ?? []))
      .catch(() => {})
      .finally(() => setHistoryLoaded(true))
  }, [highlightId])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages, loading])

  // A seed posted from the hover panel arrives as a prop change, not a local
  // event this component originated. `token` changes on every click — even
  // repeats of the same action — so this fires exactly once per click.
  // Gated on historyLoaded so a slow-resolving initial GET can't clobber the
  // seed's just-appended messages; gated on !loading so a seed that arrives
  // mid-request waits for the current one to finish instead of firing
  // concurrently.
  useEffect(() => {
    if (!pendingSeed || !historyLoaded || loading) return
    onSeedHandled()
    sendTurn({ action: pendingSeed.action })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSeed, historyLoaded, loading])

  async function sendTurn(body: { action: Action } | { message: string }, optimisticUserContent?: string) {
    setError(null)
    if (optimisticUserContent) {
      setMessages((prev) => [...prev, { role: 'user', content: optimisticUserContent }])
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/highlights/${highlightId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Something went wrong')
        return
      }
      // Freeform turns already show the user's bubble optimistically above;
      // seeds don't know the server-chosen wording ahead of time, so they
      // render both bubbles from the response instead.
      setMessages((prev) => (optimisticUserContent ? [...prev, json.message] : [...prev, json.userMessage, json.message]))
    } catch {
      setError('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  function handleSend() {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    sendTurn({ message: text }, text)
  }

  return (
    <div className="fixed right-0 top-0 z-40 flex h-full w-full max-w-sm flex-col border-l border-neutral-200 bg-white shadow-xl">
      <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-neutral-800">
          Chat about this highlight{pageRef ? ` — p. ${pageRef}` : ''}
        </h2>
        <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 transition-colors" aria-label="Close">
          ✕
        </button>
      </div>

      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {messages.length === 0 && !loading && (
          <p className="text-sm text-neutral-400">Ask a question about this highlight.</p>
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
          placeholder="Ask a follow-up…"
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
