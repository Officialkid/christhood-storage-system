'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function GallerySignupPage() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState({
    username:    '',
    displayName: '',
    email:       '',
    password:    '',
  })
  const [error, setError] = useState('')

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    startTransition(async () => {
      const res = await fetch('/api/photo/auth/signup', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Signup failed.')
        return
      }
      router.push('/dashboard')
      router.refresh()
    })
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-16">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Create your gallery</h1>
        <p className="mt-1 text-sm text-zinc-400">Share your photos beautifully</p>
      </div>

      <div className="w-full max-w-sm space-y-4">
        <a
          href="/api/photo/auth/google"
          className="flex items-center justify-center gap-3 w-full rounded-lg border border-zinc-700
                     bg-zinc-900 px-4 py-2.5 text-sm font-medium hover:bg-zinc-800 transition-colors"
        >
          <GoogleIcon />
          Continue with Google
        </a>

        <div className="relative flex items-center gap-3">
          <div className="flex-1 border-t border-zinc-800" />
          <span className="text-xs text-zinc-500">or</span>
          <div className="flex-1 border-t border-zinc-800" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {error && (
            <p className="rounded-lg bg-red-950 border border-red-800 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}

          <div>
            <label className="block text-xs text-zinc-400 mb-1" htmlFor="displayName">Your name</label>
            <input
              id="displayName"
              name="displayName"
              type="text"
              autoComplete="name"
              required
              value={form.displayName}
              onChange={handleChange}
              className={inputClass}
              placeholder="Jane Doe"
              maxLength={60}
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1" htmlFor="username">
              Username{' '}
              <span className="text-zinc-600">(letters &amp; numbers, shown on your public page)</span>
            </label>
            <input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              required
              value={form.username}
              onChange={handleChange}
              className={inputClass}
              placeholder="janedoe"
              maxLength={30}
              pattern="[a-zA-Z0-9]+"
              title="Letters and numbers only"
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1" htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={form.email}
              onChange={handleChange}
              className={inputClass}
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1" htmlFor="password">
              Password <span className="text-zinc-600">(min. 8 characters)</span>
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={form.password}
              onChange={handleChange}
              className={inputClass}
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-lg bg-white text-black font-semibold py-2.5 text-sm
                       hover:bg-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="text-xs text-zinc-600 text-center leading-relaxed">
          By creating an account you agree to our{' '}
          <Link href="/terms" className="text-zinc-400 underline underline-offset-2">Terms</Link>{' '}
          and{' '}
          <Link href="/privacy" className="text-zinc-400 underline underline-offset-2">Privacy Policy</Link>.
        </p>

        <p className="text-center text-xs text-zinc-500">
          Already have an account?{' '}
          <Link href="/login" className="text-white underline underline-offset-2 hover:no-underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  )
}

const inputClass =
  'w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 ' +
  'text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 ' +
  'focus:ring-white/20 focus:border-zinc-500 transition'

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#EA4335" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 002.38-5.88c0-.57-.05-.66-.15-1.18z"/>
      <path fill="#4285F4" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 01-7.18-2.54H1.83v2.07A8 8 0 008.98 17z"/>
      <path fill="#34A853" d="M4.5 10.52a4.8 4.8 0 010-3.04V5.41H1.83a8 8 0 000 7.18l2.67-2.07z"/>
      <path fill="#FBBC05" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 001.83 5.4L4.5 7.49a4.77 4.77 0 014.48-3.31z"/>
    </svg>
  )
}
