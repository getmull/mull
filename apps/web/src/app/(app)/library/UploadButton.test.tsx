import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UploadButton } from './UploadButton'

const refresh = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}))

function pdfFile(name = 'doc.pdf') {
  return new File(['%PDF-1.4'], name, { type: 'application/pdf' })
}

describe('UploadButton', () => {
  beforeEach(() => {
    refresh.mockClear()
    global.fetch = jest.fn()
  })

  it('uploads the selected file and refreshes on success', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ document: { id: 'doc-1' } }),
    })
    const { container } = render(<UploadButton />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement

    await userEvent.upload(input, pdfFile())

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      '/api/documents/upload',
      expect.objectContaining({ method: 'POST', body: expect.any(FormData) })
    ))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(screen.queryByText(/upload failed/i)).not.toBeInTheDocument()
  })

  it('shows the server error message when the upload fails', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'File is not a valid PDF' }),
    })
    const { container } = render(<UploadButton />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement

    await userEvent.upload(input, pdfFile())

    expect(await screen.findByText('File is not a valid PDF')).toBeInTheDocument()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('uploads a dropped file', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ document: { id: 'doc-1' } }),
    })
    render(<UploadButton />)
    const dropzone = screen.getByRole('button', { name: 'Upload a PDF' })

    fireEvent.drop(dropzone, { dataTransfer: { files: [pdfFile('dropped.pdf')] } })

    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })
})


test('shows busy feedback throughout the request and prevents duplicate uploads', async () => {
  let resolve!: (response: unknown) => void
  global.fetch = jest.fn(() => new Promise((done) => { resolve = done })) as jest.Mock
  const { container } = render(<UploadButton />)
  const input = container.querySelector('input')!
  await userEvent.upload(input, pdfFile())
  expect(screen.getByRole('button', { name: 'Upload a PDF' })).toBeDisabled()
  expect(screen.getByText('Uploading and processing…')).toBeInTheDocument()
  fireEvent.drop(screen.getByRole('button'), { dataTransfer: { files: [pdfFile()] } })
  expect(global.fetch).toHaveBeenCalledTimes(1)
  resolve({ ok: true, json: async () => ({ document: { id: 'doc-1' } }) })
  await waitFor(() => expect(screen.getByRole('button')).toBeEnabled())
})

test('recovers after a network failure with an actionable error', async () => {
  global.fetch = jest.fn().mockRejectedValue(new Error('offline'))
  const { container } = render(<UploadButton />)
  await userEvent.upload(container.querySelector('input')!, pdfFile())
  expect(await screen.findByRole('alert')).toHaveTextContent('Check your connection and try again')
  expect(screen.getByRole('button', { name: 'Upload a PDF' })).toBeEnabled()
})
