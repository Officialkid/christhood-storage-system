'use client'

import { createContext, useCallback, useContext, useState } from 'react'

// ── Shared sidebar state ──────────────────────────────────────────────────────
interface SidebarCtxValue {
  mobileOpen:   boolean
  toggleMobile: () => void
  closeMobile:  () => void
}

export const SidebarContext = createContext<SidebarCtxValue>({
  mobileOpen:   false,
  toggleMobile: () => {},
  closeMobile:  () => {},
})

export function useSidebar() { return useContext(SidebarContext) }

// ── Shell wrapper ─────────────────────────────────────────────────────────────
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)

  const toggleMobile = useCallback(() => setMobileOpen(v => !v), [])
  const closeMobile  = useCallback(() => setMobileOpen(false),    [])

  return (
    <SidebarContext.Provider value={{ mobileOpen, toggleMobile, closeMobile }}>
      {/* Backdrop — tapping it closes the drawer on mobile */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
          onClick={closeMobile}
          aria-hidden="true"
        />
      )}
      {children}
    </SidebarContext.Provider>
  )
}
