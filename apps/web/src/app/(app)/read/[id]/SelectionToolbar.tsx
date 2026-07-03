'use client'

const COLORS = [
  { name: 'yellow', bg: 'bg-yellow-300', label: 'Yellow' },
  { name: 'green',  bg: 'bg-green-300',  label: 'Green' },
  { name: 'blue',   bg: 'bg-blue-300',   label: 'Blue' },
  { name: 'pink',   bg: 'bg-pink-300',   label: 'Pink' },
] as const

interface Props {
  x: number
  y: number
  onColor: (color: string) => void
  onDismiss: () => void
}

export function SelectionToolbar({ x, y, onColor, onDismiss }: Props) {
  return (
    <div
      className="fixed z-50 flex items-center gap-1 bg-white border border-neutral-200 rounded-lg shadow-lg px-2 py-1.5"
      style={{ left: x, top: y - 48 }}
      onMouseDown={(e) => e.preventDefault()} // keep selection alive
    >
      {COLORS.map((c) => (
        <button
          key={c.name}
          title={c.label}
          onClick={() => onColor(c.name)}
          className={`w-5 h-5 rounded-full ${c.bg} hover:scale-110 transition-transform border border-white ring-1 ring-neutral-200`}
        />
      ))}
      <div className="w-px h-4 bg-neutral-200 mx-1" />
      <button
        onClick={onDismiss}
        className="text-xs text-neutral-400 hover:text-neutral-700 transition-colors px-1"
      >
        ✕
      </button>
    </div>
  )
}
