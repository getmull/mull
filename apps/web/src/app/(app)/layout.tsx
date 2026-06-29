import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { logout } from '@/app/(auth)/actions'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-neutral-200 px-4 h-14 flex items-center justify-between shrink-0">
        <span className="font-semibold tracking-tight">Mull</span>
        <form action={logout}>
          <button
            type="submit"
            className="text-sm text-neutral-500 hover:text-neutral-900 transition-colors"
          >
            Sign out
          </button>
        </form>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  )
}
