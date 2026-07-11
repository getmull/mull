'use client'

import { useEffect, useRef, useState } from 'react'

export const ACTIONS = ['explain', 'define', 'simplify', 'translate'] as const
export type Action = (typeof ACTIONS)[number]

const ACTION_LABELS: Record<Action, string> = {
  explain: 'Explain',
  define: 'Define',
  simplify: 'Simplify',
  translate: 'Translate',
}

interface Note {
  id: string
  content: string
}

interface Props {
  notes: Note[]
  aiEnabled: boolean
  addingNote: boolean
  // Note-writing is pinned open explicitly (see PDFViewer) rather than
  // tied to hover — a text input needs to survive the mouse moving away.
  composingNote: boolean
  onAction: (action: Action) => void
  onOpenChat: () => void
  onOpenNoteComposer: () => void
  onCloseNoteComposer: () => void
  onAddNote: (content: string) => void
  onDeleteNote: (noteId: string) => void
  onRemove: () => void
  onMouseEnter: () => void
  onMouseLeave: () => void
}

export function HighlightActionsPanel({
  notes,
  aiEnabled,
  addingNote,
  composingNote,
  onAction,
  onOpenChat,
  onOpenNoteComposer,
  onCloseNoteComposer,
  onAddNote,
  onDeleteNote,
  onRemove,
  onMouseEnter,
  onMouseLeave,
}: Props) {
  const [noteInput, setNoteInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (composingNote) textareaRef.current?.focus()
  }, [composingNote])

  function submitNote() {
    const content = noteInput.trim()
    if (!content || addingNote) return
    onAddNote(content)
    setNoteInput('')
  }

  return (
    <div
      className="flex flex-col gap-1.5 bg-white border border-neutral-200 rounded-lg shadow-lg p-2 text-xs w-72"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {notes.length > 0 && (
        <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
          {notes.map((note) => (
            <div
              key={note.id}
              className="flex items-start gap-1.5 border-b border-neutral-100 pb-1.5 last:border-0 last:pb-0"
            >
              <p className="flex-1 text-neutral-600 leading-snug whitespace-pre-wrap">{note.content}</p>
              <button
                onClick={() => onDeleteNote(note.id)}
                aria-label="Delete note"
                className="shrink-0 text-neutral-300 hover:text-red-600 transition-colors"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {composingNote ? (
        <div className="flex flex-col gap-1">
          <textarea
            ref={textareaRef}
            value={noteInput}
            onChange={(e) => setNoteInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                submitNote()
              } else if (e.key === 'Escape') {
                onCloseNoteComposer()
              }
            }}
            placeholder="Add a note…"
            rows={3}
            className="w-full resize-y rounded border border-neutral-200 px-2 py-1.5 text-xs leading-snug outline-none focus:border-neutral-400"
          />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-neutral-400">⌘Enter to save</span>
            <div className="flex items-center gap-1">
              <button
                onClick={onCloseNoteComposer}
                className="text-neutral-500 hover:text-neutral-800 hover:bg-neutral-50 border border-neutral-200 rounded px-2 py-1 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submitNote}
                disabled={addingNote || !noteInput.trim()}
                className="text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50 border border-neutral-200 rounded px-2 py-1 disabled:opacity-40 transition-colors"
              >
                {addingNote ? 'Saving…' : 'Add note'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          onClick={onOpenNoteComposer}
          className="self-start text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50 border border-neutral-200 rounded px-2 py-1 transition-colors"
        >
          + Note
        </button>
      )}

      <div className="flex items-center gap-1 flex-wrap">
        {aiEnabled && (
          <>
            {ACTIONS.map((action) => (
              <button
                key={action}
                onClick={() => onAction(action)}
                className="text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50 border border-neutral-200 rounded px-1.5 py-0.5 transition-colors"
              >
                {ACTION_LABELS[action]}
              </button>
            ))}
            <button
              onClick={onOpenChat}
              className="text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50 border border-neutral-200 rounded px-1.5 py-0.5 transition-colors"
            >
              Chat
            </button>
          </>
        )}
        <button
          onClick={onRemove}
          className="text-neutral-500 hover:text-red-600 hover:bg-red-50 hover:border-red-300 border border-neutral-200 rounded px-1.5 py-0.5 ml-auto transition-colors"
        >
          Remove
        </button>
      </div>
    </div>
  )
}
