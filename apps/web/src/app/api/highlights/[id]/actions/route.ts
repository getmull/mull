import { NextRequest, NextResponse } from 'next/server'
import { generateText } from 'ai'
import { createClient } from '@/lib/supabase/server'
import { getAIModel } from '@/lib/ai/provider'
import { isHighlightAction, buildHighlightActionPrompt } from '@/lib/ai/prompts'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { action } = body
  if (!isHighlightAction(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  const { data: highlight } = await supabase
    .from('highlights')
    .select('id, text')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!highlight) return NextResponse.json({ error: 'Highlight not found' }, { status: 404 })

  const model = getAIModel()
  if (!model) return NextResponse.json({ error: 'AI is not configured' }, { status: 503 })

  let content: string
  try {
    const result = await generateText({ model, prompt: buildHighlightActionPrompt(action, highlight.text) })
    content = result.text
  } catch {
    return NextResponse.json({ error: 'AI request failed' }, { status: 502 })
  }

  const { data: note, error } = await supabase
    .from('notes')
    .insert({ highlight_id: highlight.id, user_id: user.id, content })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ note }, { status: 201 })
}
