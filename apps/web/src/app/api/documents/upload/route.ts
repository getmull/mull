import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { extractPdf } from '@/lib/extract/pdf'

const MAX_SIZE_BYTES = 50 * 1024 * 1024 // 50 MB
const PDF_MAGIC = Buffer.from('%PDF-')

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file')

  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: 'File exceeds 50 MB limit' }, { status: 413 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  if (!buffer.slice(0, 5).equals(PDF_MAGIC)) {
    return NextResponse.json({ error: 'File is not a valid PDF' }, { status: 400 })
  }

  // Insert document row first to get the ID for the storage path
  const { data: doc, error: docError } = await supabase
    .from('documents')
    .insert({
      user_id: user.id,
      type: 'pdf',
      title: file.name.replace(/\.pdf$/i, ''),
    })
    .select()
    .single()

  if (docError || !doc) {
    return NextResponse.json({ error: 'Failed to create document' }, { status: 500 })
  }

  const storagePath = `${user.id}/${doc.id}.pdf`

  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(storagePath, buffer, { contentType: 'application/pdf', upsert: false })

  if (uploadError) {
    await supabase.from('documents').delete().eq('id', doc.id)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }

  // Run extraction
  let extraction
  try {
    extraction = await extractPdf(buffer)
  } catch {
    // Extraction failure is non-fatal — original PDF is still readable
    await supabase
      .from('documents')
      .update({ storage_path: storagePath, is_scanned: true })
      .eq('id', doc.id)
    return NextResponse.json({ document: { ...doc, storage_path: storagePath, is_scanned: true } })
  }

  const { pages, page_count, word_count, is_scanned } = extraction

  await supabase
    .from('documents')
    .update({ storage_path: storagePath, page_count, word_count, is_scanned })
    .eq('id', doc.id)

  if (pages.length > 0) {
    await supabase.from('document_pages').insert(
      pages.map((p) => ({ document_id: doc.id, ...p }))
    )
  }

  return NextResponse.json({
    document: { ...doc, storage_path: storagePath, page_count, word_count, is_scanned },
  })
}
