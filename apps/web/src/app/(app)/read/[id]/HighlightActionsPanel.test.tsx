import { render, screen, fireEvent } from '@testing-library/react'
import { HighlightActionsPanel } from './HighlightActionsPanel'

const noop = () => {}

describe('HighlightActionsPanel', () => {
  it('shows all four AI actions plus Remove when AI is enabled', () => {
    render(
      <HighlightActionsPanel
        notes={[]}
        aiEnabled
        pendingAction={null}
        onAction={noop}
        onRemove={noop}
        onMouseEnter={noop}
        onMouseLeave={noop}
      />
    )

    for (const label of ['Explain', 'Define', 'Simplify', 'Translate', 'Remove']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  it('hides the AI actions when AI is not configured, but keeps Remove', () => {
    render(
      <HighlightActionsPanel
        notes={[]}
        aiEnabled={false}
        pendingAction={null}
        onAction={noop}
        onRemove={noop}
        onMouseEnter={noop}
        onMouseLeave={noop}
      />
    )

    for (const label of ['Explain', 'Define', 'Simplify', 'Translate']) {
      expect(screen.queryByText(label)).not.toBeInTheDocument()
    }
    expect(screen.getByText('Remove')).toBeInTheDocument()
  })

  it('calls onAction with the right action name when clicked', () => {
    const onAction = jest.fn()
    render(
      <HighlightActionsPanel
        notes={[]}
        aiEnabled
        pendingAction={null}
        onAction={onAction}
        onRemove={noop}
        onMouseEnter={noop}
        onMouseLeave={noop}
      />
    )

    fireEvent.click(screen.getByText('Define'))

    expect(onAction).toHaveBeenCalledWith('define')
  })

  it('calls onRemove when Remove is clicked', () => {
    const onRemove = jest.fn()
    render(
      <HighlightActionsPanel
        notes={[]}
        aiEnabled
        pendingAction={null}
        onAction={noop}
        onRemove={onRemove}
        onMouseEnter={noop}
        onMouseLeave={noop}
      />
    )

    fireEvent.click(screen.getByText('Remove'))

    expect(onRemove).toHaveBeenCalled()
  })

  it('disables action buttons and shows a loading indicator while a request is pending', () => {
    render(
      <HighlightActionsPanel
        notes={[]}
        aiEnabled
        pendingAction="explain"
        onAction={noop}
        onRemove={noop}
        onMouseEnter={noop}
        onMouseLeave={noop}
      />
    )

    expect(screen.getByText('…')).toBeInTheDocument()
    expect(screen.getByText('Define')).toBeDisabled()
  })

  it('renders existing notes', () => {
    render(
      <HighlightActionsPanel
        notes={[{ id: 'n1', content: 'This passage means X.' }]}
        aiEnabled
        pendingAction={null}
        onAction={noop}
        onRemove={noop}
        onMouseEnter={noop}
        onMouseLeave={noop}
      />
    )

    expect(screen.getByText('This passage means X.')).toBeInTheDocument()
  })
})
