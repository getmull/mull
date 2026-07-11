import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const MAX_NOTE_LENGTH = 2000

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const content = typeof body?.content === 'string' ? body.content.trim() : ''
  if (!content || content.length > MAX_NOTE_LENGTH) {
    return NextResponse.json({ error: 'Invalid note content' }, { status: 400 })
  }

  const { data: highlight } = await supabase
    .from('highlights')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!highlight) return NextResponse.json({ error: 'Highlight not found' }, { status: 404 })

  const { data: note, error } = await supabase
    .from('notes')
    .insert({ highlight_id: highlight.id, user_id: user.id, content })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ note }, { status: 201 })
}
