import Link from 'next/link'
import { signup } from '../actions'
import { AuthForm } from '../components/AuthForm'

export const metadata = { title: 'Create account — Mull' }

export default function SignupPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
          <p className="text-sm text-neutral-500">Start building your reading library</p>
        </div>

        <AuthForm action={signup} submitLabel="Create account" />

        <p className="text-sm text-center text-neutral-500">
          Already have an account?{' '}
          <Link href="/login" className="underline underline-offset-4 hover:text-neutral-900">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
