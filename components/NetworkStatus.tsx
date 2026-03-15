'use client'

import { useCallback, useEffect, useState } from 'react'

// ── Connection state ───────────────────────────────────────────────────────────

type ConnectionStatus = 'online' | 'offline' | 'slow'

// Custom event name used by upload / transfer components to react to offline.
export const NETWORK_OFFLINE_EVENT = 'app:network-offline'
export const NETWORK_ONLINE_EVENT  = 'app:network-online'

// ── Hook ───────────────────────────────────────────────────────────────────────

/**
 * Returns current network status.
 * Dispatches `app:network-offline` / `app:network-online` window events
 * so upload/transfer components can react without prop-drilling.
 */
export function useNetworkStatus(): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>(
    typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'online',
  )

  // Basic round-trip latency probe — a tiny cached-busted request to /favicon.ico.
  const probe = useCallback(async () => {
    if (typeof window === 'undefined') return
    const start = Date.now()
    try {
      await fetch(`/favicon.ico?_cb=${start}`, { cache: 'no-store', mode: 'no-cors' })
      const ms = Date.now() - start
      setStatus(ms > 2000 ? 'slow' : 'online')
    } catch {
      setStatus('offline')
    }
  }, [])

  useEffect(() => {
    // Initial probe
    void probe()

    const goOnline = () => {
      void probe()
      window.dispatchEvent(new Event(NETWORK_ONLINE_EVENT))
    }
    const goOffline = () => {
      setStatus('offline')
      window.dispatchEvent(new Event(NETWORK_OFFLINE_EVENT))
    }

    window.addEventListener('online',  goOnline)
    window.addEventListener('offline', goOffline)

    // Re-probe every 30 s while online to catch silent connection degradation.
    const interval = setInterval(() => {
      if (navigator.onLine) void probe()
    }, 30_000)

    return () => {
      window.removeEventListener('online',  goOnline)
      window.removeEventListener('offline', goOffline)
      clearInterval(interval)
    }
  }, [probe])

  return status
}

// ── Visual component ───────────────────────────────────────────────────────────

const CONFIG: Record<
  ConnectionStatus,
  { dot: string; label: string; title: string }
> = {
  online:  { dot: 'bg-emerald-400',            label: '',       title: 'Connected' },
  slow:    { dot: 'bg-amber-400 animate-pulse', label: 'Slow',  title: 'Slow connection detected' },
  offline: { dot: 'bg-red-500   animate-pulse', label: 'Offline', title: 'You are offline — uploads and transfers are paused' },
}

/**
 * Small indicator that lives in the TopBar right cluster.
 * Only shows a label when the connection is degraded; otherwise it's just a dot.
 */
export function NetworkStatus() {
  const status = useNetworkStatus()
  const { dot, label, title } = CONFIG[status]

  // Only renders when something is worth showing — avoids visual noise when online.
  if (status === 'online') {
    return (
      <span title={title} className="inline-flex items-center">
        <span className={`inline-block w-2 h-2 rounded-full ${dot}`} />
      </span>
    )
  }

  return (
    <span
      title={title}
      className="inline-flex items-center gap-1.5 text-xs font-medium text-white/80"
    >
      <span className={`inline-block w-2 h-2 rounded-full ${dot}`} />
      {label}
    </span>
  )
}
