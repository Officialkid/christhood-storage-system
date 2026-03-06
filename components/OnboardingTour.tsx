'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, ChevronRight, Compass }          from 'lucide-react'

// ── Tour step definitions ──────────────────────────────────────────────────
interface TourStep {
  selector: string
  title:    string
  body:     string
  side:     'right' | 'left' | 'bottom' | 'top'
}

const STEPS: TourStep[] = [
  {
    selector: '[data-tour="sidebar"]',
    title:    'Navigate the CMMS',
    body:     'Use the sidebar to move between sections — Dashboard, Media library, Upload, Events, Search, and Notifications.',
    side:     'right',
  },
  {
    selector: 'a[href="/upload"]',
    title:    'Upload Media',
    body:     'Click Upload to add photos, videos, and documents for an event. Supported formats include JPEG, PNG, MP4, and RAW camera files.',
    side:     'right',
  },
  {
    selector: 'a[href="/media"]',
    title:    'Media Library & Statuses',
    body:     'Browse all media files here. Each file has a workflow status — RAW, Editing In Progress, Edited, or Published — so your team always knows where a file stands.',
    side:     'right',
  },
  {
    selector: '[data-tour="notification-bell"]',
    title:    'Notifications',
    body:     'Stay informed with real-time alerts. You can also enable push notifications to be alerted even when the app is closed.',
    side:     'bottom',
  },
  {
    selector: '[data-tour="search-bar"]',
    title:    'Search Files',
    body:     'Instantly search for any file by name, tags, or status. Press Ctrl+K (or ⌘K on Mac) to focus the search bar at any time.',
    side:     'bottom',
  },
  {
    selector: '[data-tour="chatbot-fab"]',
    title:    'AI Help Assistant',
    body:     "Got a question? Click this button to chat with the AI assistant. It knows the full CMMS workflow and can guide you through any task.",
    side:     'top',
  },
]

const PAD    = 10   // px of breathing room around spotlight
const TW     = 300  // tooltip width (px)

// ── Helpers ────────────────────────────────────────────────────────────────
interface Rect { top: number; left: number; right: number; bottom: number; width: number; height: number }

function measureTarget(selector: string): Rect | null {
  if (typeof document === 'undefined') return null
  const el = document.querySelector(selector)
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height }
}

function centreRect(): Rect {
  const vw = window.innerWidth
  const vh = window.innerHeight
  return { top: vh / 2 - 60, left: vw / 2 - 100, right: vw / 2 + 100, bottom: vh / 2 + 60, width: 200, height: 120 }
}

// ── Component ──────────────────────────────────────────────────────────────
interface Props { initiallyDone: boolean }

type Phase = 'idle' | 'welcome' | 'touring' | 'done'

export default function OnboardingTour({ initiallyDone }: Props) {
  const [phase,   setPhase]   = useState<Phase>('idle')
  const [step,    setStep]    = useState(0)
  const [rect,    setRect]    = useState<Rect | null>(null)

  // On mount: show welcome screen to first-time users
  useEffect(() => {
    if (!initiallyDone) setPhase('welcome')
  }, [initiallyDone])

  // Listen for a custom 'restart-tour' event dispatched by the Profile page
  useEffect(() => {
    function handleRestart() {
      setStep(0)
      setPhase('welcome')
    }
    window.addEventListener('restart-tour', handleRestart)
    return () => window.removeEventListener('restart-tour', handleRestart)
  }, [])

  // Measure the spotlight target after each step change / resize
  const measureStep = useCallback(() => {
    if (phase !== 'touring') return
    setRect(measureTarget(STEPS[step].selector))
  }, [phase, step])

  useEffect(() => {
    measureStep()
    window.addEventListener('resize', measureStep)
    return () => window.removeEventListener('resize', measureStep)
  }, [measureStep])

  // ── Actions ───────────────────────────────────────────────────────────
  async function markDone() {
    try { await fetch('/api/user/onboarding', { method: 'PATCH' }) } catch { /* non-blocking */ }
    setPhase('done')
  }

  function startTour()  { setStep(0); setPhase('touring') }
  function skipTour()   { markDone() }
  function nextStep()   { step < STEPS.length - 1 ? setStep(s => s + 1) : markDone() }

  // ── Render: nothing when idle or finished ─────────────────────────────
  if (phase === 'idle' || phase === 'done') return null

  // ── Render: welcome modal ─────────────────────────────────────────────
  if (phase === 'welcome') {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center">
        <div
          className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          onClick={skipTour}
        />

        <div className="relative z-10 bg-slate-900 border border-slate-700/60 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
          {/* Icon */}
          <div className="w-12 h-12 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center mb-5">
            <Compass className="w-6 h-6 text-indigo-400" />
          </div>

          <h2 className="text-xl font-bold text-white mb-2">Welcome to Christhood CMMS</h2>
          <p className="text-slate-400 text-sm leading-relaxed mb-6">
            Take a quick 6-step tour to get familiar with the key features. It only takes about a minute.
          </p>

          {/* Progress dots */}
          <div className="flex gap-1.5 mb-6">
            {STEPS.map((_, i) => (
              <span key={i} className="h-1.5 w-1.5 rounded-full bg-slate-700" />
            ))}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={startTour}
              className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl px-4 py-2.5 text-sm font-medium transition-colors"
            >
              Start Tour
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={skipTour}
              className="px-4 py-2.5 text-sm text-slate-400 hover:text-white transition-colors rounded-xl"
            >
              Skip
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Render: step spotlight ─────────────────────────────────────────────
  const current = STEPS[step]
  const r       = rect ?? centreRect()
  const vw      = typeof window !== 'undefined' ? window.innerWidth  : 1920
  const vh      = typeof window !== 'undefined' ? window.innerHeight : 1080

  // Tooltip positioning
  let tooltipStyle: React.CSSProperties
  switch (current.side) {
    case 'right':
      tooltipStyle = {
        top:  Math.min(r.top, vh - 200),
        left: Math.min(r.right + PAD * 2, vw - TW - PAD),
      }
      break
    case 'left':
      tooltipStyle = {
        top:  Math.min(r.top, vh - 200),
        left: Math.max(r.left - TW - PAD * 2, PAD),
      }
      break
    case 'bottom':
      tooltipStyle = {
        top:  Math.min(r.bottom + PAD * 2, vh - 200),
        left: Math.min(Math.max(r.left, PAD), vw - TW - PAD),
      }
      break
    case 'top':
    default:
      tooltipStyle = {
        bottom: Math.max(vh - r.top + PAD * 2, PAD),
        left:   Math.min(Math.max(r.left, PAD), vw - TW - PAD),
      }
  }

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-none">

      {/* ── Four overlay panels that darken everything except the spotlight ── */}

      {/* Top */}
      <div
        style={{ position: 'fixed', top: 0, left: 0, right: 0, height: Math.max(0, r.top - PAD) }}
        className="bg-black/70 pointer-events-auto"
      />
      {/* Bottom */}
      <div
        style={{ position: 'fixed', top: r.bottom + PAD, left: 0, right: 0, bottom: 0 }}
        className="bg-black/70 pointer-events-auto"
      />
      {/* Left */}
      <div
        style={{ position: 'fixed', top: r.top - PAD, left: 0, width: Math.max(0, r.left - PAD), height: r.height + PAD * 2 }}
        className="bg-black/70 pointer-events-auto"
      />
      {/* Right */}
      <div
        style={{ position: 'fixed', top: r.top - PAD, left: r.right + PAD, right: 0, height: r.height + PAD * 2 }}
        className="bg-black/70 pointer-events-auto"
      />

      {/* ── Spotlight ring ─────────────────────────────────────────────── */}
      <div
        style={{
          position: 'fixed',
          top:    r.top    - PAD,
          left:   r.left   - PAD,
          width:  r.width  + PAD * 2,
          height: r.height + PAD * 2,
        }}
        className="rounded-xl border-2 border-indigo-500/60 shadow-[0_0_24px_rgba(99,102,241,0.35)] pointer-events-none"
      />

      {/* ── Tooltip ────────────────────────────────────────────────────── */}
      <div
        style={{ ...tooltipStyle, position: 'fixed', width: TW }}
        className="pointer-events-auto"
      >
        <div className="bg-slate-900 border border-slate-700/60 rounded-xl p-4 shadow-2xl">

          {/* Header: step counter + close */}
          <div className="flex items-center justify-between mb-3">
            {/* Progress dots */}
            <div className="flex gap-1.5">
              {STEPS.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${
                    i === step ? 'w-4 bg-indigo-500' : i < step ? 'w-1.5 bg-indigo-700' : 'w-1.5 bg-slate-700'
                  }`}
                />
              ))}
            </div>

            <button
              onClick={skipTour}
              className="text-slate-500 hover:text-white transition-colors p-0.5"
              aria-label="Close tour"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <h3 className="text-sm font-semibold text-white mb-1.5">{current.title}</h3>
          <p className="text-xs text-slate-400 leading-relaxed mb-4">{current.body}</p>

          {/* Footer: skip + next/finish */}
          <div className="flex items-center justify-between">
            <button
              onClick={skipTour}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              Skip tour
            </button>

            <button
              onClick={nextStep}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
            >
              {step < STEPS.length - 1
                ? <><span>Next</span><ChevronRight className="w-3 h-3" /></>
                : <span>Finish</span>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
