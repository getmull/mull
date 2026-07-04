import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAIModel } from '@/lib/ai/provider'
import { buildDocumentContext } from '@/lib/ai/context'
import { askAI, type StoredMessage } from '@/lib/ai/askAI'

const MAX_QUESTION_LENGTH = 2000
// Keeps ai_conversations.messages comfortably under its 64 KB check
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

  const { data: existing } = await supabase
    .from('ai_conversations')
    .select('messages')
    .eq('document_id', id)
    .eq('user_id', user.id)
    .single()

  const history = (existing?.messages as StoredMessage[]) ?? []
  const { pagesText, highlightsText, pageNumbers } = await buildDocumentContext(id, user.id)

  let assistantMessage: StoredMessage
  try {
    assistantMessage = await askAI({ model, question, pagesText, highlightsText, history, validPageNumbers: pageNumbers })
  } catch {
    return NextResponse.json({ error: 'AI request failed' }, { status: 502 })
  }

  const userMessage: StoredMessage = { role: 'user', content: question }
  const messages = [...history, userMessage, assistantMessage].slice(-MAX_STORED_MESSAGES)

  const { error } = await supabase
    .from('ai_conversations')
    .upsert({ document_id: id, user_id: user.id, messages }, { onConflict: 'document_id,user_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ message: assistantMessage }, { status: 201 })
}
