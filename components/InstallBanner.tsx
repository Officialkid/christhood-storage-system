'use client'

import { useEffect, useState } from 'react'
import { X, Share } from 'lucide-react'

// Extend window with the non-standard beforeinstallprompt event
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISSED_KEY  = 'cmms_install_dismissed'
const VISIT_KEY      = 'cmms_visit_count'
const INSTALLED_KEY  = 'cmms_install_installed'
const MIN_VISITS     = 2

type BannerState = 'chrome' | 'ios' | 'installed' | null

export default function InstallBanner() {
  const [state,       setState]       = useState<BannerState>(null)
  const [deferredEvt, setDeferredEvt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installing,  setInstalling]  = useState(false)

  useEffect(() => {
    // Skip if already installed, dismissed, or reading storage is unavailable
    if (typeof window === 'undefined') return
    if (localStorage.getItem(INSTALLED_KEY))  return
    if (localStorage.getItem(DISMISSED_KEY))  return

    // Skip if already running as a standalone PWA
    if (window.matchMedia('(display-mode: standalone)').matches) return
    if ((window.navigator as any).standalone === true) return

    // ── Visit counter ─────────────────────────────────────────────────────────
    const visits = parseInt(localStorage.getItem(VISIT_KEY) ?? '0', 10) + 1
    localStorage.setItem(VISIT_KEY, String(visits))
    if (visits < MIN_VISITS) return

    // ── iOS / Safari: no beforeinstallprompt — show manual instructions ───────
    const ua = window.navigator.userAgent
    const isIOS    = /iphone|ipad|ipod/i.test(ua)
    const isSafari = /safari/i.test(ua) && !/chrome|crios|fxios/i.test(ua)
    if (isIOS && isSafari) {
      setState('ios')
      return
    }

    // ── Android / Chrome: intercept the native prompt ─────────────────────────
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredEvt(e as BeforeInstallPromptEvent)
      setState('chrome')
    }
    window.addEventListener('beforeinstallprompt', handler)

    const installedHandler = () => {
      localStorage.setItem(INSTALLED_KEY, '1')
      setState('installed')
      setTimeout(() => setState(null), 4000)
    }
    window.addEventListener('appinstalled', installedHandler)

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      window.removeEventListener('appinstalled', installedHandler)
    }
  }, [])

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, '1')
    setState(null)
  }

  async function install() {
    if (!deferredEvt) return
    setInstalling(true)
    try {
      await deferredEvt.prompt()
      const { outcome } = await deferredEvt.userChoice
      if (outcome === 'accepted') {
        localStorage.setItem(INSTALLED_KEY, '1')
        setState('installed')
        setTimeout(() => setState(null), 4000)
      }
    } finally {
      setInstalling(false)
    }
  }

  if (!state) return null

  // ── Post-install success strip ────────────────────────────────────────────
  if (state === 'installed') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed bottom-4 left-4 right-4 z-50 max-w-md mx-auto
                   bg-emerald-600 border border-emerald-500 rounded-2xl
                   shadow-xl shadow-black/40 px-5 py-3.5
                   flex items-center gap-3
                   animate-in slide-in-from-bottom-4 duration-300"
      >
        <span className="text-xl" aria-hidden>🎉</span>
        <p className="text-sm font-medium text-white">
          App installed! Find it on your home screen.
        </p>
      </div>
    )
  }

  // Shared bottom-bar shell
  const shell = (children: React.ReactNode) => (
    <div
      role="banner"
      className="fixed bottom-0 left-0 right-0 z-50
                 bg-slate-900 border-t border-slate-700
                 shadow-[0_-4px_24px_rgba(0,0,0,0.5)]
                 safe-area-inset-bottom
                 animate-in slide-in-from-bottom-2 duration-300"
    >
      <div className="max-w-lg mx-auto px-4 py-4">
        {children}
      </div>
    </div>
  )

  // ── Android / Chrome banner ───────────────────────────────────────────────
  if (state === 'chrome') {
    return shell(
      <>
        <div className="flex items-start gap-3 mb-3.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.svg" alt="" className="w-9 h-9 rounded-xl shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white leading-snug">
              📱 Add to your home screen
            </p>
            <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
              Get the full app experience — works offline too
            </p>
          </div>
          <button
            onClick={dismiss}
            aria-label="Dismiss"
            className="shrink-0 p-1 text-slate-500 hover:text-slate-300 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={dismiss}
            className="flex-1 py-2 rounded-xl border border-slate-700
                       text-slate-300 text-sm font-medium hover:bg-slate-800 transition"
          >
            Not now
          </button>
          <button
            onClick={install}
            disabled={installing}
            className="flex-1 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500
                       disabled:opacity-60 text-white text-sm font-semibold transition"
          >
            {installing ? 'Installing…' : 'Install'}
          </button>
        </div>
      </>
    )
  }

  // ── iOS / Safari banner ───────────────────────────────────────────────────
  return shell(
    <>
      <div className="flex items-start gap-3 mb-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.svg" alt="" className="w-9 h-9 rounded-xl shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">
            📱 Add to your home screen
          </p>
          <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
            Get the full app experience — works offline too
          </p>
        </div>
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="shrink-0 p-1 text-slate-500 hover:text-slate-300 transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <p className="text-xs text-slate-400 flex items-center gap-1.5">
        Tap the
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-slate-800
                         border border-slate-700 text-white font-medium">
          <Share className="w-3 h-3" /> Share
        </span>
        button ⬆️ then <strong className="text-slate-200">'Add to Home Screen'</strong>
      </p>
      <button
        onClick={dismiss}
        className="mt-3 w-full py-2 rounded-xl border border-slate-700
                   text-slate-300 text-sm font-medium hover:bg-slate-800 transition"
      >
        Not now
      </button>
    </>
  )
}
