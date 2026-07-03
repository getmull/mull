import Link from 'next/link'
import { login } from '../actions'
import { AuthForm } from '../components/AuthForm'

export const metadata = { title: 'Sign in — Mull' }

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
          <p className="text-sm text-neutral-500">Sign in to your library</p>
        </div>

        <AuthForm action={login} submitLabel="Sign in" />

        <p className="text-sm text-center text-neutral-500">
          No account?{' '}
          <Link href="/signup" className="underline underline-offset-4 hover:text-neutral-900">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  )
}
