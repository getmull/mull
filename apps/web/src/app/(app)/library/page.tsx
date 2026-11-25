import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { UploadButton } from './UploadButton'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Library — Mull' }

export default async function LibraryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: documents, error } = await supabase
    .from('documents')
    .select('id, title, type, reading_state, page_count, is_scanned, created_at, last_page, progress_pct, last_read_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const continuing = (documents ?? [])
    .filter((doc) => doc.type === 'pdf' && doc.reading_state === 'reading')
    .sort((a, b) => (b.last_read_at ?? b.created_at).localeCompare(a.last_read_at ?? a.created_at))
    .slice(0, 3)

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Your reading workspace</h1>
        <p className="mt-2 text-sm text-neutral-500">Pick up where you left off, or make room for your next read.</p>
      </div>

      {error ? (
        <div role="alert" className="mb-8 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Couldn&apos;t load your library. <Link href="/library" className="underline">Try again</Link>.
        </div>
      ) : (
        <>
          {continuing.length > 0 && (
            <section aria-labelledby="continue-heading" className="mb-10">
              <h2 id="continue-heading" className="text-lg font-semibold mb-3">Continue Reading</h2>
              <div className="grid gap-3 sm:grid-cols-3">
                {continuing.map((doc) => {
                  const progress = Math.min(100, Math.max(0, Number(doc.progress_pct) || 0))
                  return (
                    <Link key={doc.id} href={`/read/${doc.id}`} prefetch={false} className="min-w-0 rounded-xl border border-neutral-200 bg-neutral-50 p-4 transition-colors hover:border-neutral-400 hover:bg-white">
                      <p className="truncate text-sm font-medium text-neutral-900">{doc.title}</p>
                      <p className="mt-3 text-xs text-neutral-600">Resume at page {doc.last_page ?? 1}{doc.page_count ? ` of ${doc.page_count}` : ''}</p>
                      <div role="progressbar" aria-label={`${doc.title} reading progress`} aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} className="mt-3 h-1.5 overflow-hidden rounded-full bg-neutral-200">
                        <div className="h-full rounded-full bg-neutral-700" style={{ width: `${progress}%` }} />
                      </div>
                    </Link>
                  )
                })}
              </div>
            </section>
          )}

          <section aria-labelledby="library-heading" className="mb-10">
            <div className="mb-3 flex items-center justify-between">
              <h2 id="library-heading" className="text-lg font-semibold">Library</h2>
              <span className="text-xs text-neutral-500">{documents?.length ?? 0} {(documents?.length ?? 0) === 1 ? 'document' : 'documents'}</span>
            </div>
            {documents && documents.length > 0 ? (
              <div className="space-y-2">
                {documents.map((doc) => (
                  <Link key={doc.id} href={`/read/${doc.id}`} prefetch={false} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-200 px-4 py-3 hover:bg-neutral-50 transition-colors">
                    <div className="flex flex-1 items-center gap-3 min-w-0">
                      <span className="text-neutral-500 text-xs font-mono uppercase shrink-0">{doc.type}</span>
                      <span className="text-sm font-medium truncate">{doc.title}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-neutral-500">
                      {doc.is_scanned && <span className="bg-amber-50 text-amber-800 border border-amber-200 rounded px-1.5 py-0.5">Scanned</span>}
                      {doc.page_count ? <span>{doc.page_count}p</span> : null}
                      <span className="capitalize">{doc.reading_state}</span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-6">
                <p className="text-sm font-medium text-neutral-800">Your next read starts here.</p>
                <p className="mt-2 text-sm text-neutral-600">Upload a PDF to start reading, highlight passages, and save your place.</p>
              </div>
            )}
          </section>
        </>
      )}
      <UploadButton />
    </div>
  )
}
