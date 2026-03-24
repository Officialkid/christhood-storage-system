import { headers }         from 'next/headers'
import { getServerSession } from 'next-auth'
import { authOptions }      from '@/lib/auth'
import DashboardClient      from './DashboardClient'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return null

  // Fetch initial data server-side so the page arrives pre-populated (no flash).
  let initialData: any = null
  try {
    const reqHeaders = await headers()
    const cookie     = reqHeaders.get('cookie') ?? ''
    const origin     = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'
    const res = await fetch(`${origin}/api/dashboard`, {
      headers: { cookie },
      cache:   'no-store',
    })
    if (res.ok) initialData = await res.json()
  } catch { /* client will fetch on mount */ }

  if (!initialData) {
    const role = (session.user as any).role ?? 'UPLOADER'
    initialData = {
      role,
      stats:
        role === 'ADMIN'   ? { totalFiles: 0, weekUploads: 0, pendingEdit: 0, activeToday: 0, monthChangePct: null }
        : role === 'EDITOR'  ? { filesToEdit: 0, editedThisMonth: 0, transfersWaiting: 0 }
        : { myTotal: 0, myWeek: 0, myEvents: 0 },
      recentUploads:  [],
      activity:       [],
      upcomingEvents: [],
      storage:        null,
      onboarding: {
        dismissed:      true,
        items:          { uploaded: false, installedPwa: false, setNotifications: false, exploredEvents: false, askedZara: false },
        completedCount: 0,
        totalCount:     5,
      },
      generatedAt: new Date().toISOString(),
    }
  }

  return <DashboardClient initialData={initialData} />
}


