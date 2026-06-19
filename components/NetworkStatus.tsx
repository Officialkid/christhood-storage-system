'use client'

import { useCallback, useEffect, useState } from 'react'

type ConnectionStatus = 'unknown' | 'online' | 'offline' | 'slow'

export const NETWORK_OFFLINE_EVENT = 'app:network-offline'
export const NETWORK_ONLINE_EVENT = 'app:network-online'

export function useNetworkStatus(): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>('unknown')

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
    void probe()

    const goOnline = () => {
      void probe()
      window.dispatchEvent(new Event(NETWORK_ONLINE_EVENT))
    }

    const goOffline = () => {
      setStatus('offline')
      window.dispatchEvent(new Event(NETWORK_OFFLINE_EVENT))
    }

    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)

    const interval = setInterval(() => {
      if (navigator.onLine) void probe()
    }, 30_000)

    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
      clearInterval(interval)
    }
  }, [probe])

  return status
}

const CONFIG: Record<ConnectionStatus, { dot: string; label: string; title: string }> = {
  unknown: { dot: 'bg-slate-500', label: '', title: 'Checking connection…' },
  online: { dot: 'bg-emerald-400', label: '', title: 'Connected' },
  slow: { dot: 'bg-amber-400 animate-pulse', label: 'Slow', title: 'Slow connection detected' },
  offline: {
    dot: 'bg-red-500 animate-pulse',
    label: 'Offline',
    title: 'You are offline — uploads and transfers are paused',
  },
}

export function NetworkStatus() {
  const status = useNetworkStatus()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <span title="Checking connection…" className="inline-flex items-center">
        <span className="inline-block h-2 w-2 rounded-full bg-slate-500" />
      </span>
    )
  }

  const { dot, label, title } = CONFIG[status]

  if (status === 'unknown' || status === 'online') {
    return (
      <span title={title} className="inline-flex items-center">
        <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
      </span>
    )
  }

  return (
    <span
      title={title}
      className="inline-flex items-center gap-1.5 text-xs font-medium text-white/80"
    >
      <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
      {label}
    </span>
  )
}
