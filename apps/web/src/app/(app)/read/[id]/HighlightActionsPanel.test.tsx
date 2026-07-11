import type { ComponentProps } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { HighlightActionsPanel } from './HighlightActionsPanel'

const noop = () => {}

const defaultProps: ComponentProps<typeof HighlightActionsPanel> = {
  notes: [],
  aiEnabled: true,
  addingNote: false,
  composingNote: false,
  onAction: noop,
  onOpenChat: noop,
  onOpenNoteComposer: noop,
  onCloseNoteComposer: noop,
  onAddNote: noop,
  onDeleteNote: noop,
  onRemove: noop,
  onMouseEnter: noop,
  onMouseLeave: noop,
}

describe('HighlightActionsPanel', () => {
  it('shows all four AI actions plus Chat and Remove when AI is enabled', () => {
    render(<HighlightActionsPanel {...defaultProps} />)

    for (const label of ['Explain', 'Define', 'Simplify', 'Translate', 'Chat', 'Remove']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  it('hides the AI actions and Chat button when AI is not configured, but keeps Remove and the + Note button', () => {
    render(<HighlightActionsPanel {...defaultProps} aiEnabled={false} />)

    for (const label of ['Explain', 'Define', 'Simplify', 'Translate', 'Chat']) {
      expect(screen.queryByText(label)).not.toBeInTheDocument()
    }
    expect(screen.getByText('Remove')).toBeInTheDocument()
    expect(screen.getByText('+ Note')).toBeInTheDocument()
  })

  it('calls onOpenChat when "Chat" is clicked', () => {
    const onOpenChat = jest.fn()
    render(<HighlightActionsPanel {...defaultProps} onOpenChat={onOpenChat} />)

    fireEvent.click(screen.getByText('Chat'))

    expect(onOpenChat).toHaveBeenCalled()
  })

  it('calls onAction with the right action name when clicked', () => {
    const onAction = jest.fn()
    render(<HighlightActionsPanel {...defaultProps} onAction={onAction} />)

    fireEvent.click(screen.getByText('Define'))

    expect(onAction).toHaveBeenCalledWith('define')
  })

  it('calls onRemove when Remove is clicked', () => {
    const onRemove = jest.fn()
    render(<HighlightActionsPanel {...defaultProps} onRemove={onRemove} />)

    fireEvent.click(screen.getByText('Remove'))

    expect(onRemove).toHaveBeenCalled()
  })

  it('renders existing notes', () => {
    render(<HighlightActionsPanel {...defaultProps} notes={[{ id: 'n1', content: 'This passage means X.' }]} />)

    expect(screen.getByText('This passage means X.')).toBeInTheDocument()
  })

  it('shows a "+ Note" button by default, not the composer', () => {
    render(<HighlightActionsPanel {...defaultProps} />)

    expect(screen.getByText('+ Note')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Add a note…')).not.toBeInTheDocument()
  })

  it('calls onOpenNoteComposer when "+ Note" is clicked', () => {
    const onOpenNoteComposer = jest.fn()
    render(<HighlightActionsPanel {...defaultProps} onOpenNoteComposer={onOpenNoteComposer} />)

    fireEvent.click(screen.getByText('+ Note'))

    expect(onOpenNoteComposer).toHaveBeenCalled()
  })

  it('shows the composer (not the "+ Note" button) once pinned open', () => {
    render(<HighlightActionsPanel {...defaultProps} composingNote />)

    expect(screen.getByPlaceholderText('Add a note…')).toBeInTheDocument()
    expect(screen.queryByText('+ Note')).not.toBeInTheDocument()
  })

  it('calls onCloseNoteComposer when Cancel is clicked', () => {
    const onCloseNoteComposer = jest.fn()
    render(<HighlightActionsPanel {...defaultProps} composingNote onCloseNoteComposer={onCloseNoteComposer} />)

    fireEvent.click(screen.getByText('Cancel'))

    expect(onCloseNoteComposer).toHaveBeenCalled()
  })

  it('calls onCloseNoteComposer when Escape is pressed in the textarea', () => {
    const onCloseNoteComposer = jest.fn()
    render(<HighlightActionsPanel {...defaultProps} composingNote onCloseNoteComposer={onCloseNoteComposer} />)

    fireEvent.keyDown(screen.getByPlaceholderText('Add a note…'), { key: 'Escape' })

    expect(onCloseNoteComposer).toHaveBeenCalled()
  })

  it('adds a note when typed and submitted via the Add note button', () => {
    const onAddNote = jest.fn()
    render(<HighlightActionsPanel {...defaultProps} composingNote onAddNote={onAddNote} />)

    fireEvent.change(screen.getByPlaceholderText('Add a note…'), { target: { value: 'my thought' } })
    fireEvent.click(screen.getByText('Add note'))

    expect(onAddNote).toHaveBeenCalledWith('my thought')
  })

  it('adds a note when Cmd+Enter is pressed, and clears the textarea', () => {
    const onAddNote = jest.fn()
    render(<HighlightActionsPanel {...defaultProps} composingNote onAddNote={onAddNote} />)
    const textarea = screen.getByPlaceholderText('Add a note…') as HTMLTextAreaElement

    fireEvent.change(textarea, { target: { value: 'my thought' } })
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true })

    expect(onAddNote).toHaveBeenCalledWith('my thought')
    expect(textarea.value).toBe('')
  })

  it('does not submit on a plain Enter, so multi-line notes can use real newlines', () => {
    const onAddNote = jest.fn()
    render(<HighlightActionsPanel {...defaultProps} composingNote onAddNote={onAddNote} />)
    const textarea = screen.getByPlaceholderText('Add a note…')

    fireEvent.change(textarea, { target: { value: 'my thought' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })

    expect(onAddNote).not.toHaveBeenCalled()
  })

  it('does not submit an empty or whitespace-only note', () => {
    const onAddNote = jest.fn()
    render(<HighlightActionsPanel {...defaultProps} composingNote onAddNote={onAddNote} />)

    fireEvent.change(screen.getByPlaceholderText('Add a note…'), { target: { value: '   ' } })
    fireEvent.click(screen.getByText('Add note'))

    expect(onAddNote).not.toHaveBeenCalled()
  })

  it('disables the Add note button and shows a saving state while a note is being submitted', () => {
    render(<HighlightActionsPanel {...defaultProps} composingNote addingNote />)

    expect(screen.getByText('Saving…')).toBeDisabled()
  })

  it('shows the "+ Note" button and Remove even when AI is disabled (manual notes are not AI-gated)', () => {
    render(<HighlightActionsPanel {...defaultProps} aiEnabled={false} notes={[{ id: 'n1', content: 'a thought' }]} />)

    expect(screen.getByText('a thought')).toBeInTheDocument()
    expect(screen.getByText('+ Note')).toBeInTheDocument()
  })

  it('calls onDeleteNote with the note id when its delete button is clicked', () => {
    const onDeleteNote = jest.fn()
    render(
      <HighlightActionsPanel
        {...defaultProps}
        notes={[{ id: 'n1', content: 'a thought' }]}
        onDeleteNote={onDeleteNote}
      />
    )

    fireEvent.click(screen.getByLabelText('Delete note'))

    expect(onDeleteNote).toHaveBeenCalledWith('n1')
  })
})
