'use client'

import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react'

// ── Types ──────────────────────────────────────────────────────────────────────

type ToastVariant = 'success' | 'error' | 'warning' | 'info'

interface ToastOptions {
  /** Auto-dismiss delay in ms. Pass 0 to never auto-dismiss. Defaults: error=5000, others=3500 */
  duration?: number
  /** If provided, a Retry button is shown clicking which calls this callback. */
  onRetry?: () => void
}

interface Toast {
  id: string
  message: string
  variant: ToastVariant
  duration: number
  onRetry?: () => void
}

interface ToastContextValue {
  success: (message: string, options?: ToastOptions) => void
  error:   (message: string, options?: ToastOptions) => void
  warning: (message: string, options?: ToastOptions) => void
  info:    (message: string, options?: ToastOptions) => void
  dismiss: (id: string) => void
}

// ── Context ────────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null)

const MAX_TOASTS = 5
const DEFAULT_DURATION: Record<ToastVariant, number> = {
  success: 3500,
  error:   5000,
  warning: 4500,
  info:    3500,
}

// ── Variant styling ────────────────────────────────────────────────────────────

const TOAST_STYLES: Record<ToastVariant, string> = {
  success: 'bg-emerald-600 border-emerald-500 text-white',
  error:   'bg-red-600   border-red-500   text-white',
  warning: 'bg-amber-500 border-amber-400 text-white',
  info:    'bg-blue-600  border-blue-500  text-white',
}

const ICON: Record<ToastVariant, React.ReactNode> = {
  success: (
    <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  ),
  error: (
    <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    </svg>
  ),
  warning: (
    <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    </svg>
  ),
  info: (
    <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
}

// ── Individual Toast component ─────────────────────────────────────────────────

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast
  onDismiss: (id: string) => void
}) {
  return (
    <div
      role="alert"
      aria-live={toast.variant === 'error' ? 'assertive' : 'polite'}
      className={[
        'flex items-start gap-3 w-full max-w-sm px-4 py-3 rounded-lg border shadow-lg',
        'animate-in slide-in-from-bottom-2 fade-in duration-200',
        TOAST_STYLES[toast.variant],
      ].join(' ')}
    >
      {/* Icon */}
      <span className="mt-0.5">{ICON[toast.variant]}</span>

      {/* Message */}
      <p className="flex-1 text-sm font-medium leading-snug">{toast.message}</p>

      {/* Retry (optional) */}
      {toast.onRetry && (
        <button
          onClick={() => {
            toast.onRetry?.()
            onDismiss(toast.id)
          }}
          className="shrink-0 text-xs font-semibold underline underline-offset-2 hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-white/50 rounded"
        >
          Retry
        </button>
      )}

      {/* Dismiss */}
      <button
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        className="shrink-0 opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-white/50 rounded"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

// ── Provider ───────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: string) => {
    clearTimeout(timers.current.get(id))
    timers.current.delete(id)
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const add = useCallback(
    (variant: ToastVariant, message: string, options: ToastOptions = {}) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const duration =
        options.duration !== undefined ? options.duration : DEFAULT_DURATION[variant]

      setToasts((prev) => {
        const next: Toast = { id, message, variant, duration, onRetry: options.onRetry }
        // Keep newest MAX_TOASTS; remove oldest if over limit
        const updated = [next, ...prev].slice(0, MAX_TOASTS)
        return updated
      })

      if (duration > 0) {
        const timer = setTimeout(() => dismiss(id), duration)
        timers.current.set(id, timer)
      }
    },
    [dismiss],
  )

  const ctx: ToastContextValue = {
    success: (msg, opts) => add('success', msg, opts),
    error:   (msg, opts) => add('error',   msg, opts),
    warning: (msg, opts) => add('warning', msg, opts),
    info:    (msg, opts) => add('info',    msg, opts),
    dismiss,
  }

  return (
    <ToastContext.Provider value={ctx}>
      {children}

      {/* Toast tray — bottom-right, above any z-50 modals */}
      {toasts.length > 0 && (
        <div
          aria-label="Notifications"
          className="fixed bottom-6 right-6 z-[9999] flex flex-col-reverse gap-2 pointer-events-none"
        >
          {[...toasts].reverse().map((t) => (
            <div key={t.id} className="pointer-events-auto">
              <ToastItem toast={t} onDismiss={dismiss} />
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  )
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast must be used inside a <ToastProvider>.')
  }
  return ctx
}
