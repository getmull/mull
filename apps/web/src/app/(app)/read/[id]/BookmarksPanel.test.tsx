import type { ComponentProps } from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BookmarksPanel } from './BookmarksPanel'

const noop = () => {}

const defaultProps: ComponentProps<typeof BookmarksPanel> = {
  bookmarks: [],
  currentPage: 1,
  adding: false,
  onJump: noop,
  onAdd: async () => true,
  onDelete: noop,
  onClose: noop,
}

describe('BookmarksPanel', () => {
  it('shows an empty state when there are no bookmarks', () => {
    render(<BookmarksPanel {...defaultProps} />)

    expect(screen.getByText('No bookmarks yet.')).toBeInTheDocument()
  })

  it('lists existing bookmarks with page number and label', () => {
    render(
      <BookmarksPanel
        {...defaultProps}
        bookmarks={[
          { id: 'b1', page_number: 3, label: 'Chapter 2' },
          { id: 'b2', page_number: 7, label: null },
        ]}
      />
    )

    expect(screen.getByText('p.3')).toBeInTheDocument()
    expect(screen.getByText('Chapter 2')).toBeInTheDocument()
    expect(screen.getByText('p.7')).toBeInTheDocument()
  })

  it('calls onJump with the page number when a bookmark is clicked', () => {
    const onJump = jest.fn()
    render(
      <BookmarksPanel {...defaultProps} bookmarks={[{ id: 'b1', page_number: 5, label: null }]} onJump={onJump} />
    )

    fireEvent.click(screen.getByText('p.5'))

    expect(onJump).toHaveBeenCalledWith(5)
  })

  it('calls onDelete with the bookmark id when its delete button is clicked', () => {
    const onDelete = jest.fn()
    render(
      <BookmarksPanel
        {...defaultProps}
        bookmarks={[{ id: 'b1', page_number: 5, label: null }]}
        onDelete={onDelete}
      />
    )

    fireEvent.click(screen.getByLabelText('Delete bookmark'))

    expect(onDelete).toHaveBeenCalledWith('b1')
  })

  it('calls onClose when the close button is clicked', () => {
    const onClose = jest.fn()
    render(<BookmarksPanel {...defaultProps} onClose={onClose} />)

    fireEvent.click(screen.getByLabelText('Close'))

    expect(onClose).toHaveBeenCalled()
  })

  it('shows an add-bookmark composer for the current page when it is not yet bookmarked', () => {
    render(<BookmarksPanel {...defaultProps} currentPage={4} />)

    expect(screen.getByText('+ Bookmark page 4')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Label for page 4 (optional)')).toBeInTheDocument()
  })

  it('hides the composer and shows a note when the current page is already bookmarked', () => {
    render(
      <BookmarksPanel {...defaultProps} currentPage={4} bookmarks={[{ id: 'b1', page_number: 4, label: null }]} />
    )

    expect(screen.queryByText('+ Bookmark page 4')).not.toBeInTheDocument()
    expect(screen.getByText('This page is already bookmarked.')).toBeInTheDocument()
  })

  it('adds a bookmark with the typed label and clears the input on success', async () => {
    const onAdd = jest.fn().mockResolvedValue(true)
    render(<BookmarksPanel {...defaultProps} currentPage={4} onAdd={onAdd} />)
    const input = screen.getByPlaceholderText('Label for page 4 (optional)') as HTMLInputElement

    fireEvent.change(input, { target: { value: 'Chapter 6 starts here' } })
    fireEvent.click(screen.getByText('+ Bookmark page 4'))

    expect(onAdd).toHaveBeenCalledWith('Chapter 6 starts here')
    await waitFor(() => expect(input.value).toBe(''))
  })

  it('submits an empty label when Enter is pressed with no text typed', () => {
    const onAdd = jest.fn().mockResolvedValue(true)
    render(<BookmarksPanel {...defaultProps} currentPage={4} onAdd={onAdd} />)

    fireEvent.keyDown(screen.getByPlaceholderText('Label for page 4 (optional)'), { key: 'Enter' })

    expect(onAdd).toHaveBeenCalledWith('')
  })

  it('keeps the typed label when the save fails, so it is not lost', async () => {
    const onAdd = jest.fn().mockResolvedValue(false)
    render(<BookmarksPanel {...defaultProps} currentPage={4} onAdd={onAdd} />)
    const input = screen.getByPlaceholderText('Label for page 4 (optional)') as HTMLInputElement

    fireEvent.change(input, { target: { value: 'my label' } })
    fireEvent.click(screen.getByText('+ Bookmark page 4'))

    await waitFor(() => expect(onAdd).toHaveBeenCalledWith('my label'))
    expect(input.value).toBe('my label')
  })

  it('shows an error message when addError is true', () => {
    render(<BookmarksPanel {...defaultProps} currentPage={4} addError />)

    expect(screen.getByText(/couldn.t save/i)).toBeInTheDocument()
  })

  it('disables the add button while saving', () => {
    render(<BookmarksPanel {...defaultProps} currentPage={4} adding />)

    expect(screen.getByText('Saving…')).toBeDisabled()
  })
})
