import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAIModel } from '@/lib/ai/provider'
import { isHighlightAction, buildHighlightActionSeedMessage } from '@/lib/ai/prompts'
import { buildHighlightPageContext } from '@/lib/ai/context'
import { chatAboutHighlight, type HighlightChatMessage } from '@/lib/ai/highlightChat'

const MAX_MESSAGE_LENGTH = 2000
const MAX_STORED_MESSAGES_BYTES = 64000
const MAX_CONVERSATION_WRITE_RETRIES = 3

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

  const { data: existing, error: existingError } = await supabase
    .from('highlight_conversations')
    .select('messages')
    .eq('highlight_id', id)
    .eq('user_id', user.id)
    .single()
  if (existingError && existingError.code !== 'PGRST116') {
    return NextResponse.json({ error: existingError.message }, { status: 500 })
  }

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
  const persisted = await persistConversationTurn({
    supabase,
    highlightId: id,
    userId: user.id,
    userMessage,
    assistantMessage,
  })
  if (!persisted.ok) {
    return NextResponse.json({ error: persisted.error }, { status: persisted.status })
  }

  return NextResponse.json({ userMessage, message: assistantMessage }, { status: 201 })
}

interface PersistTurnParams {
  supabase: Awaited<ReturnType<typeof createClient>>
  highlightId: string
  userId: string
  userMessage: HighlightChatMessage
  assistantMessage: HighlightChatMessage
}

async function persistConversationTurn({
  supabase,
  highlightId,
  userId,
  userMessage,
  assistantMessage,
}: PersistTurnParams): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  for (let attempt = 0; attempt < MAX_CONVERSATION_WRITE_RETRIES; attempt += 1) {
    const { data: current, error: readError } = await supabase
      .from('highlight_conversations')
      .select('messages, updated_at')
      .eq('highlight_id', highlightId)
      .eq('user_id', userId)
      .single()

    if (readError && readError.code !== 'PGRST116') {
      return { ok: false, error: readError.message, status: 500 }
    }

    const history = (current?.messages as HighlightChatMessage[]) ?? []
    const messages = trimMessagesToByteBudget(
      [...history, userMessage, assistantMessage],
      MAX_STORED_MESSAGES_BYTES
    )
    if (!messages) {
      return { ok: false, error: 'Conversation turn is too large to store', status: 413 }
    }

    if (!current) {
      const { error: insertError } = await supabase
        .from('highlight_conversations')
        .insert({ highlight_id: highlightId, user_id: userId, messages })
      if (!insertError) return { ok: true }
      if (insertError.code === '23505') {
        await sleepBeforeRetry(attempt)
        continue
      }
      return { ok: false, error: insertError.message, status: 500 }
    }

    const { error: updateError } = await supabase
      .from('highlight_conversations')
      .update({ messages })
      .eq('highlight_id', highlightId)
      .eq('user_id', userId)
      .eq('updated_at', current.updated_at)
      .select('id')
      .single()

    if (!updateError) return { ok: true }
    if (updateError.code === 'PGRST116') {
      await sleepBeforeRetry(attempt)
      continue
    }
    return { ok: false, error: updateError.message, status: 500 }
  }

  return { ok: false, error: 'Conversation changed while saving, please retry', status: 409 }
}

function trimMessagesToByteBudget(messages: HighlightChatMessage[], maxBytes: number): HighlightChatMessage[] | null {
  const trimmed = messages.map((message) => ({ ...message }))
  while (trimmed.length > 2 && messageBytes(trimmed) > maxBytes) {
    trimmed.splice(0, 2)
  }
  if (messageBytes(trimmed) <= maxBytes) return trimmed

  const assistant = trimmed[trimmed.length - 1]
  if (!assistant || assistant.role !== 'assistant') return null

  let content = assistant.content
  while (content.length > 0 && messageBytes(trimmed) > maxBytes) {
    content = content.slice(0, -200)
    assistant.content = content.length > 0 ? `${content}…` : ''
  }

  return messageBytes(trimmed) <= maxBytes ? trimmed : null
}

function messageBytes(messages: HighlightChatMessage[]): number {
  return new TextEncoder().encode(JSON.stringify(messages)).length
}

async function sleepBeforeRetry(attempt: number): Promise<void> {
  const delayMs = (attempt + 1) * 50
  await new Promise((resolve) => setTimeout(resolve, delayMs))
}
