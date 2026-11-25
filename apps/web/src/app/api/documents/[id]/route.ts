import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const progressSchema = z.object({
  last_page: z.number().int().positive().max(2147483647),
  progress_pct: z.number().min(0).max(100),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.json({ error: 'Document saving is unavailable: Supabase is not configured.' }, { status: 503 })
  }
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = progressSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Provide a valid page and progress between 0 and 100.' }, { status: 400 })
  }
  const { data: doc, error: readError } = await supabase.from('documents')
    .select('id, page_count').eq('id', id).eq('user_id', user.id).single()
  if (readError && readError.code !== 'PGRST116') {
    return NextResponse.json({ error: 'Could not load document.' }, { status: 500 })
  }
  if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  if (doc.page_count && parsed.data.last_page > doc.page_count) {
    return NextResponse.json({ error: 'Page is outside this document.' }, { status: 400 })
  }

  // Derive progress from the stored page count when extraction succeeded.
  const progress = {
    last_page: parsed.data.last_page,
    progress_pct: doc.page_count
      ? Math.round((parsed.data.last_page / doc.page_count) * 10000) / 100
      : parsed.data.progress_pct,
  }
  const { data: updated, error } = await supabase
    .from('documents')
    .update({ ...progress, last_read_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: 'Could not save reading position.' }, { status: 500 })
  if (!updated) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  return NextResponse.json(progress)
}
