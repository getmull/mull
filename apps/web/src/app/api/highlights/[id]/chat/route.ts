import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAIModel } from '@/lib/ai/provider'
import { isHighlightAction, buildHighlightActionSeedMessage } from '@/lib/ai/prompts'
import { buildHighlightPageContext } from '@/lib/ai/context'
import { chatAboutHighlight, type HighlightChatMessage } from '@/lib/ai/highlightChat'

const MAX_MESSAGE_LENGTH = 2000
// Keeps highlight_conversations.messages comfortably under its 64 KB check
// constraint without needing to compute serialized size precisely.
const MAX_STORED_MESSAGES = 40

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: conversation } = await supabase
    .from('highlight_conversations')
    .select('messages')
    .eq('highlight_id', id)
    .eq('user_id', user.id)
    .single()

  return NextResponse.json({ messages: (conversation?.messages as HighlightChatMessage[]) ?? [] })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const action = isHighlightAction(body?.action) ? body.action : null
  const message = typeof body?.message === 'string' ? body.message.trim() : ''
  const hasAction = action !== null
  const hasMessage = message.length > 0

  // Exactly one of a seed action or a freeform message — never both, never neither.
  if (hasAction === hasMessage || message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const { data: highlight } = await supabase
    .from('highlights')
    .select('id, document_id, text, page_ref')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!highlight) return NextResponse.json({ error: 'Highlight not found' }, { status: 404 })

  const model = getAIModel()
  if (!model) return NextResponse.json({ error: 'AI is not configured' }, { status: 503 })

  const { data: existing } = await supabase
    .from('highlight_conversations')
    .select('messages')
    .eq('highlight_id', id)
    .eq('user_id', user.id)
    .single()

  const history = (existing?.messages as HighlightChatMessage[]) ?? []
  const pageContext = await buildHighlightPageContext(highlight.document_id, highlight.page_ref)

  let assistantMessage: HighlightChatMessage
  try {
    assistantMessage = await chatAboutHighlight({
      model,
      highlightText: highlight.text,
      pageRef: highlight.page_ref,
      pageContext,
      history,
      action: hasAction ? action : undefined,
      message: hasMessage ? message : undefined,
    })
  } catch {
    return NextResponse.json({ error: 'AI request failed' }, { status: 502 })
  }

  const userMessage: HighlightChatMessage = {
    role: 'user',
    content: hasAction ? buildHighlightActionSeedMessage(action) : message,
  }
  const messages = [...history, userMessage, assistantMessage].slice(-MAX_STORED_MESSAGES)

  const { error } = await supabase
    .from('highlight_conversations')
    .upsert({ highlight_id: id, user_id: user.id, messages }, { onConflict: 'highlight_id,user_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ userMessage, message: assistantMessage }, { status: 201 })
}
