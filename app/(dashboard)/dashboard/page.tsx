import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import DashboardClient from './DashboardClient'
import { getDashboardData } from '@/lib/dashboard-data'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return null

  let initialData: any = null
  try {
    const role = (session.user as any).role ?? 'UPLOADER'
    const userId = (session.user as any).id
    initialData = { ...(await getDashboardData(userId, role)), isFallback: false }
  } catch {}

  if (!initialData) {
    const role = (session.user as any).role ?? 'UPLOADER'
    initialData = {
      role,
      stats:
        role === 'ADMIN' ? { totalFiles: 0, weekUploads: 0, pendingEdit: 0, activeToday: 0, monthChangePct: null }
        : role === 'EDITOR' ? { filesToEdit: 0, editedThisMonth: 0, transfersWaiting: 0 }
        : { myTotal: 0, myWeek: 0, myEvents: 0 },
      recentUploads: [],
      activity: [],
      upcomingEvents: [],
      storage: null,
      onboarding: {
        dismissed: true,
        items: { uploaded: false, installedPwa: false, setNotifications: false, exploredEvents: false, askedZara: false },
        completedCount: 0,
        totalCount: 5,
      },
      generatedAt: new Date().toISOString(),
      isFallback: true,
    }
  }

  return <DashboardClient initialData={initialData} />
}
