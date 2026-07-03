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
    const dropzone = screen.getByText(/upload a pdf/i).closest('div')!

    fireEvent.drop(dropzone, { dataTransfer: { files: [pdfFile('dropped.pdf')] } })

    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })
})
