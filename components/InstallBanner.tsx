'use client'

/**
 * components/InstallBanner.tsx
 *
 * Displays an install-to-home-screen prompt when PWA criteria are met.
 *
 * Chrome / Android:   intercepts the native `beforeinstallprompt` event and
 *                     presents a custom banner with a one-click "Install" button.
 *
 * iOS / Safari:       Safari never fires `beforeinstallprompt`, so we detect
 *                     iOS + standalone=false and show step-by-step instructions
 *                     for "Add to Home Screen".
 *
 * Dismissed state is persisted in localStorage so the banner stays hidden after
 * the user explicitly closes it.
 */

import { useEffect, useState } from 'react'
import { X, Download, Share, MoreVertical } from 'lucide-react'

// Extend window with the non-standard beforeinstallprompt event
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISSED_KEY = 'cmms_install_dismissed'

type BannerVariant = 'chrome' | 'ios' | null

export default function InstallBanner() {
  const [variant,     setVariant]     = useState<BannerVariant>(null)
  const [deferredEvt, setDeferredEvt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installing,  setInstalling]  = useState(false)

  useEffect(() => {
    // Don't show if already dismissed or already running in standalone mode
    if (localStorage.getItem(DISMISSED_KEY)) return
    if (window.matchMedia('(display-mode: standalone)').matches) return
    if ((window.navigator as any).standalone === true) return // iOS standalone

    // ── Detect iOS ────────────────────────────────────────────────────────────
    const isIOS = /iphone|ipad|ipod/i.test(window.navigator.userAgent)
    const isSafari = /safari/i.test(window.navigator.userAgent) &&
                     !/chrome|crios|fxios/i.test(window.navigator.userAgent)

    if (isIOS && isSafari) {
      setVariant('ios')
      return
    }

    // ── Chrome / Android: wait for beforeinstallprompt ────────────────────────
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredEvt(e as BeforeInstallPromptEvent)
      setVariant('chrome')
    }
    window.addEventListener('beforeinstallprompt', handler)

    // Hide banner after installation completes
    const installedHandler = () => setVariant(null)
    window.addEventListener('appinstalled', installedHandler)

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      window.removeEventListener('appinstalled', installedHandler)
    }
  }, [])

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, '1')
    setVariant(null)
  }

  async function install() {
    if (!deferredEvt) return
    setInstalling(true)
    try {
      await deferredEvt.prompt()
      const { outcome } = await deferredEvt.userChoice
      if (outcome === 'accepted') setVariant(null)
    } finally {
      setInstalling(false)
    }
  }

  if (!variant) return null

  // ── Chrome / Android banner ───────────────────────────────────────────────
  if (variant === 'chrome') {
    return (
      <div
        role="banner"
        className="fixed bottom-4 left-4 right-4 z-50 max-w-md mx-auto
                   bg-slate-800 border border-slate-700 rounded-2xl
                   shadow-xl shadow-black/40 p-4
                   flex items-start gap-4
                   animate-in slide-in-from-bottom-4 duration-300"
      >
        {/* App icon */}
        <div className="shrink-0 w-11 h-11 rounded-xl bg-slate-900 border border-slate-700
                        flex items-center justify-center overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.svg" alt="App icon" className="w-10 h-10" />
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white leading-snug">
            Install Christhood CMMS
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            Add to your home screen for quick access and offline uploads.
          </p>
          <button
            onClick={install}
            disabled={installing}
            className="mt-2.5 flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                       bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60
                       text-white text-xs font-semibold transition"
          >
            <Download className="w-3.5 h-3.5" />
            {installing ? 'Installing…' : 'Install App'}
          </button>
        </div>

        {/* Dismiss */}
        <button
          onClick={dismiss}
          aria-label="Dismiss install prompt"
          className="shrink-0 p-1.5 rounded-lg text-slate-500 hover:text-white
                     hover:bg-slate-700 transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    )
  }

  // ── iOS / Safari instructions banner ─────────────────────────────────────
  return (
    <div
      role="banner"
      className="fixed bottom-4 left-4 right-4 z-50 max-w-md mx-auto
                 bg-slate-800 border border-slate-700 rounded-2xl
                 shadow-xl shadow-black/40 p-4
                 animate-in slide-in-from-bottom-4 duration-300"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <div className="shrink-0 w-10 h-10 rounded-xl bg-slate-900 border border-slate-700
                          flex items-center justify-center overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/icon-192.svg" alt="App icon" className="w-9 h-9" />
          </div>
          <p className="text-sm font-semibold text-white">Install Christhood CMMS</p>
        </div>
        <button
          onClick={dismiss}
          aria-label="Dismiss install prompt"
          className="shrink-0 p-1.5 rounded-lg text-slate-500 hover:text-white
                     hover:bg-slate-700 transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <p className="text-xs text-slate-400 mb-3">
        Add to your home screen for offline uploads and instant access:
      </p>

      <ol className="space-y-2 text-xs text-slate-300">
        <li className="flex items-start gap-2">
          <span className="shrink-0 w-5 h-5 rounded-full bg-indigo-600/30 text-indigo-400
                           flex items-center justify-center font-semibold text-[10px]">1</span>
          <span>
            Tap the{' '}
            <span className="inline-flex items-center gap-1 align-middle text-white">
              <Share className="w-3.5 h-3.5" /> Share
            </span>{' '}
            button in Safari's toolbar
          </span>
        </li>
        <li className="flex items-start gap-2">
          <span className="shrink-0 w-5 h-5 rounded-full bg-indigo-600/30 text-indigo-400
                           flex items-center justify-center font-semibold text-[10px]">2</span>
          <span>Scroll down and tap <strong className="text-white">Add to Home Screen</strong></span>
        </li>
        <li className="flex items-start gap-2">
          <span className="shrink-0 w-5 h-5 rounded-full bg-indigo-600/30 text-indigo-400
                           flex items-center justify-center font-semibold text-[10px]">3</span>
          <span>Tap <strong className="text-white">Add</strong> to confirm</span>
        </li>
      </ol>
    </div>
  )
}
