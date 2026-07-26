import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAIModel } from '@/lib/ai/provider'
import { buildDocumentContext } from '@/lib/ai/context'
import { askAI, type StoredMessage } from '@/lib/ai/askAI'

const MAX_QUESTION_LENGTH = 2000
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
    .from('ai_conversations')
    .select('messages')
    .eq('document_id', id)
    .eq('user_id', user.id)
    .single()

  return NextResponse.json({ messages: (conversation?.messages as StoredMessage[]) ?? [] })
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
  const question = typeof body?.question === 'string' ? body.question.trim() : ''
  if (!question || question.length > MAX_QUESTION_LENGTH) {
    return NextResponse.json({ error: 'Invalid question' }, { status: 400 })
  }

  const { data: document } = await supabase
    .from('documents')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!document) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

  const model = getAIModel()
  if (!model) return NextResponse.json({ error: 'AI is not configured' }, { status: 503 })

  const { data: existing, error: existingError } = await supabase
    .from('ai_conversations')
    .select('messages')
    .eq('document_id', id)
    .eq('user_id', user.id)
    .single()
  if (existingError && existingError.code !== 'PGRST116') {
    return NextResponse.json({ error: existingError.message }, { status: 500 })
  }

  const history = (existing?.messages as StoredMessage[]) ?? []
  const { pagesText, highlightsText, pageNumbers } = await buildDocumentContext(id, user.id, question)

  let assistantMessage: StoredMessage
  try {
    assistantMessage = await askAI({ model, question, pagesText, highlightsText, history, validPageNumbers: pageNumbers })
  } catch {
    return NextResponse.json({ error: 'AI request failed' }, { status: 502 })
  }

  const userMessage: StoredMessage = { role: 'user', content: question }
  const persisted = await persistConversationTurn({
    supabase,
    documentId: id,
    userId: user.id,
    userMessage,
    assistantMessage,
  })
  if (!persisted.ok) {
    return NextResponse.json({ error: persisted.error }, { status: persisted.status })
  }

  return NextResponse.json({ message: assistantMessage }, { status: 201 })
}

interface PersistTurnParams {
  supabase: Awaited<ReturnType<typeof createClient>>
  documentId: string
  userId: string
  userMessage: StoredMessage
  assistantMessage: StoredMessage
}

async function persistConversationTurn({
  supabase,
  documentId,
  userId,
  userMessage,
  assistantMessage,
}: PersistTurnParams): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  for (let attempt = 0; attempt < MAX_CONVERSATION_WRITE_RETRIES; attempt += 1) {
    const { data: current, error: readError } = await supabase
      .from('ai_conversations')
      .select('messages, updated_at')
      .eq('document_id', documentId)
      .eq('user_id', userId)
      .single()

    if (readError && readError.code !== 'PGRST116') {
      return { ok: false, error: readError.message, status: 500 }
    }

    const history = (current?.messages as StoredMessage[]) ?? []
    const messages = trimMessagesToByteBudget(
      [...history, userMessage, assistantMessage],
      MAX_STORED_MESSAGES_BYTES
    )
    if (!messages) {
      return { ok: false, error: 'Conversation turn is too large to store', status: 413 }
    }

    if (!current) {
      const { error: insertError } = await supabase
        .from('ai_conversations')
        .insert({ document_id: documentId, user_id: userId, messages })
      if (!insertError) return { ok: true }
      if (insertError.code === '23505') {
        await sleepBeforeRetry(attempt)
        continue
      }
      return { ok: false, error: insertError.message, status: 500 }
    }

    const { error: updateError } = await supabase
      .from('ai_conversations')
      .update({ messages })
      .eq('document_id', documentId)
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

function trimMessagesToByteBudget(messages: StoredMessage[], maxBytes: number): StoredMessage[] | null {
  const trimmed = messages.map((message) => ({
    ...message,
    citations: message.citations ? [...message.citations] : undefined,
  }))

  while (trimmed.length > 2 && messageBytes(trimmed) > maxBytes) {
    trimmed.splice(0, 2)
  }
  if (messageBytes(trimmed) <= maxBytes) return trimmed

  const assistant = trimmed[trimmed.length - 1]
  if (!assistant || assistant.role !== 'assistant') return null

  if (assistant.citations) {
    while (assistant.citations.length > 1 && messageBytes(trimmed) > maxBytes) {
      assistant.citations.pop()
    }
  }
  if (messageBytes(trimmed) <= maxBytes) return trimmed

  let content = assistant.content
  while (content.length > 0 && messageBytes(trimmed) > maxBytes) {
    content = content.slice(0, -200)
    assistant.content = content.length > 0 ? `${content}…` : ''
  }

  return messageBytes(trimmed) <= maxBytes ? trimmed : null
}

function messageBytes(messages: StoredMessage[]): number {
  return new TextEncoder().encode(JSON.stringify(messages)).length
}

async function sleepBeforeRetry(attempt: number): Promise<void> {
  const delayMs = (attempt + 1) * 50
  await new Promise((resolve) => setTimeout(resolve, delayMs))
}
