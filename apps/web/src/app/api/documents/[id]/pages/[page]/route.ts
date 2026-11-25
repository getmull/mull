import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; page: string }> }
) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.json({ error: 'Reflow is unavailable: Supabase is not configured.' }, { status: 503 })
  }
  const { id, page } = await params
  if (!/^[1-9]\d*$/.test(page) || !Number.isSafeInteger(Number(page)) || Number(page) > 2147483647) {
    return NextResponse.json({ error: 'Invalid page number' }, { status: 400 })
  }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: document, error: documentError } = await supabase.from('documents')
    .select('id, page_count, is_scanned').eq('id', id).eq('user_id', user.id).single()
  if (documentError && documentError.code !== 'PGRST116') {
    return NextResponse.json({ error: 'Could not load document' }, { status: 500 })
  }
  if (!document || (document.page_count && Number(page) > document.page_count)) {
    return NextResponse.json({ error: 'Page not found' }, { status: 404 })
  }
  if (document.is_scanned) return NextResponse.json({ error: 'Reflow is unavailable for this scanned PDF.' }, { status: 422 })

  const { data: source, error } = await supabase.from('document_pages')
    .select('page_number, raw_text').eq('document_id', id).eq('page_number', Number(page)).single()
  if (error && error.code !== 'PGRST116') {
    return NextResponse.json({ error: 'Could not load page text' }, { status: 500 })
  }
  if (!source?.raw_text?.trim()) {
    return NextResponse.json({ error: 'No readable text was extracted for this page.' }, { status: 422 })
  }
  return NextResponse.json(source, { headers: { 'Cache-Control': 'private, no-store' } })
}
