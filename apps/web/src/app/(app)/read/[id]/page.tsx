import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { PDFViewer } from './PDFViewer'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('documents').select('title').eq('id', id).single()
  return { title: data?.title ? `${data.title} — Mull` : 'Read — Mull' }
}

export default async function ReadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: doc } = await supabase
    .from('documents')
    .select('id, title, type, page_count, is_scanned, reading_state, last_page')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!doc) notFound()
  if (doc.type !== 'pdf') notFound()

  await supabase
    .from('documents')
    .update({
      last_read_at: new Date().toISOString(),
      ...(doc.reading_state === 'unread' ? { reading_state: 'reading' } : {}),
    })
    .eq('id', id)
    .eq('user_id', user.id)

  return (
    <div className="flex flex-col min-h-screen">
      <div className="border-b border-neutral-100 px-4 py-2 flex items-center gap-3">
        <Link
          href="/library"
          className="text-sm text-neutral-400 hover:text-neutral-700 transition-colors"
        >
          ← Library
        </Link>
        <span className="text-sm text-neutral-300">|</span>
        <span className="text-sm font-medium text-neutral-800 truncate">{doc.title}</span>
      </div>

      <PDFViewer
        key={doc.id}
        documentId={doc.id}
        pageCount={doc.page_count ?? 1}
        isScanned={doc.is_scanned ?? false}
        initialPage={doc.last_page ?? 1}
      />
    </div>
  )
}
