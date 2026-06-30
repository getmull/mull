import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { UploadButton } from './UploadButton'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Library — Mull' }

export default async function LibraryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: documents } = await supabase
    .from('documents')
    .select('id, title, type, reading_state, page_count, is_scanned, created_at')
    .eq('user_id', user!.id)
    .order('created_at', { ascending: false })

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Library</h1>
      </div>

      {documents && documents.length > 0 ? (
        <div className="space-y-2 mb-12">
          {documents.map((doc) => (
            <Link
              key={doc.id}
              href={`/read/${doc.id}`}
              className="flex items-center justify-between rounded-lg border border-neutral-200 px-4 py-3 hover:bg-neutral-50 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-neutral-400 text-xs font-mono uppercase shrink-0">
                  {doc.type}
                </span>
                <span className="text-sm font-medium truncate">{doc.title}</span>
                {doc.is_scanned && (
                  <span className="shrink-0 text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded px-1.5 py-0.5">
                    Scanned
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0 ml-4">
                {doc.page_count && (
                  <span className="text-xs text-neutral-400">{doc.page_count}p</span>
                )}
                <span className="text-xs text-neutral-400 capitalize">{doc.reading_state}</span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-sm text-neutral-400 mb-12">No documents yet.</p>
      )}

      <UploadButton />
    </div>
  )
}
