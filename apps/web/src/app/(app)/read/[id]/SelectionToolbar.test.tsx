import { render, screen, fireEvent } from '@testing-library/react'
import { SelectionToolbar } from './SelectionToolbar'

describe('SelectionToolbar', () => {
  it('renders a button for each highlight color', () => {
    render(<SelectionToolbar x={0} y={0} onColor={jest.fn()} onDismiss={jest.fn()} />)

    for (const label of ['Yellow', 'Green', 'Blue', 'Pink']) {
      expect(screen.getByTitle(label)).toBeInTheDocument()
    }
  })

  it('calls onColor with the color name when a swatch is clicked', () => {
    const onColor = jest.fn()
    render(<SelectionToolbar x={0} y={0} onColor={onColor} onDismiss={jest.fn()} />)

    fireEvent.click(screen.getByTitle('Green'))

    expect(onColor).toHaveBeenCalledWith('green')
  })

  it('calls onDismiss when the close button is clicked', () => {
    const onDismiss = jest.fn()
    render(<SelectionToolbar x={0} y={0} onColor={jest.fn()} onDismiss={onDismiss} />)

    fireEvent.click(screen.getByText('✕'))

    expect(onDismiss).toHaveBeenCalled()
  })

  it('prevents the default mousedown so the text selection is not cleared', () => {
    render(<SelectionToolbar x={0} y={0} onColor={jest.fn()} onDismiss={jest.fn()} />)
    const toolbar = screen.getByTitle('Yellow').parentElement!

    const event = fireEvent.mouseDown(toolbar)

    // fireEvent returns false when preventDefault() was called on a cancelable event
    expect(event).toBe(false)
  })
})
