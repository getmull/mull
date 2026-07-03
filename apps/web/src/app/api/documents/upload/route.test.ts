/**
 * @jest-environment node
 */
import type { NextRequest } from 'next/server'
import { POST } from './route'
import { createClient } from '@/lib/supabase/server'
import { extractPdf } from '@/lib/extract/pdf'
import { mockSupabaseClient } from '@/test-utils/supabase'

jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/lib/extract/pdf', () => ({ extractPdf: jest.fn() }))

const mockCreateClient = createClient as jest.Mock
const mockExtractPdf = extractPdf as jest.Mock

const PDF_BYTES = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(10, 'x')])

// A lightweight stand-in for the File object `request.formData()` would
// produce — avoids materializing real multipart bodies (esp. for the
// oversized-file case, which would otherwise need a real 50 MB buffer).
function fakeFile(bytes: Buffer, { name = 'test.pdf', size }: { name?: string; size?: number } = {}) {
  return {
    size: size ?? bytes.length,
    name,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  }
}

function makeRequest(file?: unknown) {
  return {
    formData: async () => ({
      get: (key: string) => (key === 'file' ? (file ?? null) : null),
    }),
  } as unknown as NextRequest
}

function pdfFile(bytes: Buffer = PDF_BYTES, name = 'test.pdf') {
  return fakeFile(bytes, { name })
}

describe('POST /api/documents/upload', () => {
  beforeEach(() => {
    mockExtractPdf.mockReset()
  })

  it('returns 401 when unauthenticated', async () => {
    mockCreateClient.mockResolvedValue(mockSupabaseClient({ user: null }))

    const res = await POST(makeRequest(pdfFile()))

    expect(res.status).toBe(401)
  })

  it('returns 400 when no file is provided', async () => {
    mockCreateClient.mockResolvedValue(mockSupabaseClient())

    const res = await POST(makeRequest())

    expect(res.status).toBe(400)
  })

  it('returns 413 when the file exceeds the 50 MB limit', async () => {
    mockCreateClient.mockResolvedValue(mockSupabaseClient())
    const big = fakeFile(Buffer.alloc(1), { size: 50 * 1024 * 1024 + 1 })

    const res = await POST(makeRequest(big))

    expect(res.status).toBe(413)
  })

  it('returns 400 when the file is not a valid PDF (bad magic bytes)', async () => {
    mockCreateClient.mockResolvedValue(mockSupabaseClient())
    const notPdf = fakeFile(Buffer.from('not a pdf'), { name: 'fake.pdf' })

    const res = await POST(makeRequest(notPdf))

    expect(res.status).toBe(400)
  })

  it('uploads, extracts, and chunks page inserts on the happy path', async () => {
    const pages = Array.from({ length: 150 }, (_, i) => ({
      page_number: i + 1,
      raw_text: `page ${i + 1}`,
    }))
    mockExtractPdf.mockResolvedValue({
      pages,
      page_count: 150,
      word_count: 300,
      is_scanned: false,
    })

    const from = jest.fn()
    from.mockReturnValueOnce({
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { id: 'doc-1' }, error: null }),
    })
    from.mockReturnValueOnce({
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ data: null, error: null }),
    })
    const insertPages = jest.fn().mockResolvedValue({ data: null, error: null })
    from.mockReturnValueOnce({ insert: insertPages })
    from.mockReturnValueOnce({ insert: insertPages })

    const upload = jest.fn().mockResolvedValue({ data: {}, error: null })
    mockCreateClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
      from,
      storage: { from: jest.fn().mockReturnValue({ upload }) },
    })

    const res = await POST(makeRequest(pdfFile()))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.document).toMatchObject({ id: 'doc-1', page_count: 150, word_count: 300, is_scanned: false })
    expect(upload).toHaveBeenCalledWith('user-1/doc-1.pdf', expect.any(Buffer), {
      contentType: 'application/pdf',
      upsert: false,
    })
    // 150 pages at CHUNK=100 → two inserts
    expect(insertPages).toHaveBeenCalledTimes(2)
    expect(insertPages.mock.calls[0][0]).toHaveLength(100)
    expect(insertPages.mock.calls[1][0]).toHaveLength(50)
  })

  it('rolls back the document row when storage upload fails', async () => {
    const deleteEq = jest.fn().mockResolvedValue({ data: null, error: null })
    const from = jest.fn()
    from.mockReturnValueOnce({
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { id: 'doc-1' }, error: null }),
    })
    from.mockReturnValueOnce({
      delete: jest.fn().mockReturnThis(),
      eq: deleteEq,
    })

    const upload = jest.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    mockCreateClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
      from,
      storage: { from: jest.fn().mockReturnValue({ upload }) },
    })

    const res = await POST(makeRequest(pdfFile()))

    expect(res.status).toBe(500)
    expect(deleteEq).toHaveBeenCalledWith('id', 'doc-1')
  })

  it('marks the document scanned and still succeeds when extraction throws', async () => {
    mockExtractPdf.mockRejectedValue(new Error('extraction failed'))

    const updateEq = jest.fn().mockResolvedValue({ data: null, error: null })
    const from = jest.fn()
    from.mockReturnValueOnce({
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { id: 'doc-1' }, error: null }),
    })
    from.mockReturnValueOnce({
      update: jest.fn().mockReturnThis(),
      eq: updateEq,
    })

    const upload = jest.fn().mockResolvedValue({ data: {}, error: null })
    mockCreateClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
      from,
      storage: { from: jest.fn().mockReturnValue({ upload }) },
    })

    const res = await POST(makeRequest(pdfFile()))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.document.is_scanned).toBe(true)
  })
})
