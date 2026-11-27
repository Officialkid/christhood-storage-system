'use client'

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'

export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme   = 'light' | 'dark'

interface ThemeContextValue {
  theme:         ThemePreference
  resolvedTheme: ResolvedTheme
  setTheme:      (next: ThemePreference) => void
  toggleTheme:   () => void
}

const STORAGE_KEY = 'cmms-theme'

const ThemeContext = createContext<ThemeContextValue>({
  theme:         'system',
  resolvedTheme: 'dark',
  setTheme:      () => {},
  toggleTheme:   () => {},
})

function resolveSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function applyThemeToDOM(resolved: ResolvedTheme) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.classList.remove('light', 'dark')
  root.classList.add(resolved)
  root.setAttribute('data-theme', resolved)
  root.style.colorScheme = resolved

  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) {
    meta.setAttribute('content', resolved === 'light' ? '#f8fafc' : '#020617')
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState]         = useState<ThemePreference>('system')
  const [resolvedTheme, setResolved]   = useState<ResolvedTheme>('dark')

  useEffect(() => {
    const stored = (localStorage.getItem(STORAGE_KEY) as ThemePreference | null) ?? 'system'
    const valid: ThemePreference = stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system'
    setThemeState(valid)
    const initialResolved = valid === 'system' ? resolveSystemTheme() : valid
    setResolved(initialResolved)
    applyThemeToDOM(initialResolved)
  }, [])

  useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = () => {
      const next: ResolvedTheme = mq.matches ? 'light' : 'dark'
      setResolved(next)
      applyThemeToDOM(next)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [theme])

  const setTheme = useCallback((next: ThemePreference) => {
    setThemeState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch { /* ignore */ }
    const resolved = next === 'system' ? resolveSystemTheme() : next
    setResolved(resolved)
    applyThemeToDOM(resolved)
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
  }, [resolvedTheme, setTheme])

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
