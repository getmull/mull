import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const bookmarkSchema = z.object({
  document_id: z.string().min(1),
  page_number: z.number().int().positive().max(2147483647),
  label: z.string().trim().max(200).optional(),
})

export async function GET(request: NextRequest) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.json({ error: 'Bookmarks are unavailable: Supabase is not configured.' }, { status: 503 })
  }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const documentId = request.nextUrl.searchParams.get('documentId')
  if (!documentId) return NextResponse.json({ error: 'documentId required' }, { status: 400 })

  const { data, error } = await supabase
    .from('bookmarks')
    .select('id, page_number, label, created_at')
    .eq('document_id', documentId)
    .eq('user_id', user.id)
    .order('page_number', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ bookmarks: data })
}

export async function POST(request: NextRequest) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.json({ error: 'Bookmarks are unavailable: Supabase is not configured.' }, { status: 503 })
  }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = bookmarkSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Provide a document, valid page, and a label of up to 200 characters.' }, { status: 400 })
  }
  const { document_id, page_number, label } = parsed.data

  // Verify the document belongs to this user
  const { data: doc } = await supabase
    .from('documents')
    .select('id, page_count')
    .eq('id', document_id)
    .eq('user_id', user.id)
    .single()

  if (doc?.page_count && page_number > doc.page_count) {
    return NextResponse.json({ error: 'Page is outside this document.' }, { status: 400 })
  }

  if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

  const { data, error } = await supabase
    .from('bookmarks')
    .insert({ document_id, user_id: user.id, page_number, label: label || null })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ bookmark: data }, { status: 201 })
}
