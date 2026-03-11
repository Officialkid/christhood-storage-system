'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UnreadCounts {
  transfers: number
  messages:  number
  urgent:    boolean
  total:     number
}

export interface UseUnreadCountOptions {
  /**
   * Polling interval in milliseconds while the tab is active.
   * Defaults to 60 000 ms (60 s).
   */
  interval?: number
  /**
   * Base document title without any badge prefix.
   * When provided, the hook will update `document.title` to reflect the unread
   * count: "(3) Christhood CMMS" vs "Christhood CMMS".
   * Pass `null` to disable title updates (e.g., inside child components that
   * share the same hook but should not touch the title).
   */
  baseTitle?: string | null
  /** Skip fetching entirely (e.g., when no session is available). */
  skip?: boolean
}

// ─── Custom event ─────────────────────────────────────────────────────────────

/**
 * Dispatch this event anywhere in the app to immediately trigger a recount
 * without waiting for the next poll interval.
 *
 * Examples:
 *   window.dispatchEvent(new Event('comms:invalidate'))
 *   window.dispatchEvent(new Event('messagemarkedread'))   // legacy — still supported
 */
export const COMMS_INVALIDATE_EVENT = 'comms:invalidate'

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useUnreadCount(options: UseUnreadCountOptions = {}): UnreadCounts & { refresh: () => void } {
  const { interval = 60_000, baseTitle = null, skip = false } = options

  const [counts, setCounts] = useState<UnreadCounts>({
    transfers: 0,
    messages:  0,
    urgent:    false,
    total:     0,
  })

  // Use a ref for the interval id so we can clear it without adding it as an
  // effect dependency.
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetch_ = useCallback(async () => {
    if (skip) return
    try {
      const res = await fetch('/api/communications/unread-count')
      if (!res.ok) return
      const data: UnreadCounts = await res.json()
      setCounts(data)

      // ── Browser tab title ─────────────────────────────────────────────────
      if (baseTitle !== null) {
        document.title = data.total > 0
          ? `(${data.total > 99 ? '99+' : data.total}) ${baseTitle}`
          : baseTitle
      }
    } catch { /* network errors — silently ignore, retry on next poll */ }
  }, [skip, baseTitle])

  // ── Visibility-aware polling ────────────────────────────────────────────────

  const startPolling = useCallback(() => {
    if (timerRef.current !== null) return          // already running
    timerRef.current = setInterval(fetch_, interval)
  }, [fetch_, interval])

  const stopPolling = useCallback(() => {
    if (timerRef.current === null) return
    clearInterval(timerRef.current)
    timerRef.current = null
  }, [])

  // Initial fetch + start polling
  useEffect(() => {
    if (skip) return
    fetch_()
    startPolling()
    return () => stopPolling()
  }, [skip, fetch_, startPolling, stopPolling])

  // Pause polling when tab is hidden, resume when visible
  useEffect(() => {
    if (skip) return

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        stopPolling()
      } else {
        // Immediately refresh when returning to tab, then restart the interval
        fetch_()
        startPolling()
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [skip, fetch_, startPolling, stopPolling])

  // Listen for invalidation events fired by other parts of the app
  useEffect(() => {
    if (skip) return

    const handleInvalidate = () => {
      fetch_()
      // Restart the interval so the next poll is a full `interval` ms away,
      // preventing a double-fetch shortly after a manual action.
      stopPolling()
      startPolling()
    }

    window.addEventListener(COMMS_INVALIDATE_EVENT, handleInvalidate)
    // Legacy event name — keep backward compat with existing call sites
    window.addEventListener('messagemarkedread',     handleInvalidate)
    return () => {
      window.removeEventListener(COMMS_INVALIDATE_EVENT, handleInvalidate)
      window.removeEventListener('messagemarkedread',     handleInvalidate)
    }
  }, [skip, fetch_, startPolling, stopPolling])

  return { ...counts, refresh: fetch_ }
}
