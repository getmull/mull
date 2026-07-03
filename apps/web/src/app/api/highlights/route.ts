import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const documentId = request.nextUrl.searchParams.get('documentId')
  if (!documentId) return NextResponse.json({ error: 'documentId required' }, { status: 400 })

  const { data, error } = await supabase
    .from('highlights')
    .select('id, text, color, page_ref, position, created_at, notes(id, content)')
    .eq('document_id', documentId)
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ highlights: data })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { document_id, text, color, page_ref, position } = body

  if (!document_id || !text || !color || page_ref == null) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const VALID_COLORS = ['yellow', 'green', 'blue', 'pink']
  if (!VALID_COLORS.includes(color)) {
    return NextResponse.json({ error: 'Invalid color' }, { status: 400 })
  }

  // Verify the document belongs to this user
  const { data: doc } = await supabase
    .from('documents')
    .select('id')
    .eq('id', document_id)
    .eq('user_id', user.id)
    .single()

  if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

  const { data, error } = await supabase
    .from('highlights')
    .insert({ document_id, user_id: user.id, text, color, page_ref, position })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ highlight: data }, { status: 201 })
}
