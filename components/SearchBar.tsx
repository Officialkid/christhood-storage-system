'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams }  from 'next/navigation'
import { Search, X }                   from 'lucide-react'

export function SearchBar() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const inputRef     = useRef<HTMLInputElement>(null)

  const [value, setValue] = useState(searchParams.get('q') ?? '')

  // Sync input value when navigating between search pages
  useEffect(() => {
    setValue(searchParams.get('q') ?? '')
  }, [searchParams])

  // Ctrl/Cmd+K focuses the search bar
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const q = value.trim()
    if (!q) return
    // Preserve existing non-q filters when already on /search
    const current = new URLSearchParams(Array.from(searchParams.entries()))
    current.set('q', q)
    current.set('page', '1')
    router.push('/search?' + current.toString())
  }

  function handleClear() {
    setValue('')
    inputRef.current?.focus()
    // Remove q from URL if we're on the search page
    const current = new URLSearchParams(Array.from(searchParams.entries()))
    current.delete('q')
    current.set('page', '1')
    if (window.location.pathname === '/search') {
      router.push('/search?' + current.toString())
    }
  }

  return (
    <form data-tour="search-bar" onSubmit={handleSubmit} className="relative flex items-center">
      <Search className="absolute left-3 w-4 h-4 text-slate-400 pointer-events-none" />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder="Search files, events, tags…"
        className="w-64 pl-9 pr-8 py-2 rounded-xl bg-slate-800/70 border border-slate-700/60
                   text-sm text-slate-200 placeholder-slate-500 outline-none
                   focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition"
      />
      {value ? (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-2.5 text-slate-500 hover:text-slate-300 transition"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      ) : (
        <kbd className="absolute right-2.5 hidden sm:inline-flex items-center gap-0.5
                        text-[10px] text-slate-600 font-mono">
          ⌘K
        </kbd>
      )}
    </form>
  )
}
