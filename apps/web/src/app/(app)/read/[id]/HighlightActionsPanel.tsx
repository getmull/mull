'use client'

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
  pendingAction: Action | null
  onAction: (action: Action) => void
  onRemove: () => void
  onMouseEnter: () => void
  onMouseLeave: () => void
}

export function HighlightActionsPanel({
  notes,
  aiEnabled,
  pendingAction,
  onAction,
  onRemove,
  onMouseEnter,
  onMouseLeave,
}: Props) {
  return (
    <div
      className="absolute z-50 flex flex-col gap-1.5 bg-white border border-neutral-200 rounded-lg shadow-lg p-2 text-xs w-56"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {notes.length > 0 && (
        <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
          {notes.map((note) => (
            <p
              key={note.id}
              className="text-neutral-600 leading-snug border-b border-neutral-100 pb-1.5 last:border-0 last:pb-0"
            >
              {note.content}
            </p>
          ))}
        </div>
      )}
      <div className="flex items-center gap-1 flex-wrap">
        {aiEnabled &&
          ACTIONS.map((action) => (
            <button
              key={action}
              onClick={() => onAction(action)}
              disabled={pendingAction !== null}
              className="text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50 border border-neutral-200 rounded px-1.5 py-0.5 disabled:opacity-40 transition-colors"
            >
              {pendingAction === action ? '…' : ACTION_LABELS[action]}
            </button>
          ))}
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
