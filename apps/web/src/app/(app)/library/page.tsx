import { createClient } from '@/lib/supabase/server'

export const metadata = { title: 'Library — Mull' }

export default async function LibraryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight mb-8">Your library</h1>
      <p className="text-neutral-500 text-sm">
        Signed in as {user?.email}
      </p>
      <p className="text-neutral-400 text-sm mt-8">
        No documents yet — upload a PDF or save an article to get started.
      </p>
    </div>
  )
}
