import { Sidebar }              from '@/components/Sidebar'
import { TopBar }               from '@/components/TopBar'
import InstallBanner            from '@/components/InstallBanner'
import OnboardingTour           from '@/components/OnboardingTour'
import PendingDeletionBanner    from '@/components/PendingDeletionBanner'
import { DashboardShell }       from '@/components/DashboardShell'
import { MobileBottomNav }      from '@/components/MobileBottomNav'
import ChatbotWidget            from '@/components/ChatbotWidget'
import { getServerSession }     from 'next-auth'
import { authOptions }          from '@/lib/auth'
import { prisma }               from '@/lib/prisma'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  let hasCompletedOnboarding = true
  let pendingDeletionAt: string | null = null
  try {
    const session = await getServerSession(authOptions)
    if (session?.user?.id) {
      const user = await prisma.user.findUnique({
        where:  { id: session.user.id },
        select: { hasCompletedOnboarding: true, pendingDeletionAt: true },
      })
      hasCompletedOnboarding = user?.hasCompletedOnboarding ?? true
      pendingDeletionAt      = user?.pendingDeletionAt ? user.pendingDeletionAt.toISOString() : null
    }
  } catch {
    // Non-critical
  }

  return (
    <DashboardShell>
      <div className="flex h-screen bg-slate-950 overflow-hidden">
        <Sidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          <TopBar />
          <main className="flex-1 overflow-y-auto p-4 pb-20 sm:p-6 sm:pb-20 md:p-8">
            <PendingDeletionBanner pendingDeletionAt={pendingDeletionAt} />
            {children}
          </main>
          <MobileBottomNav />
        </div>

        {/* PWA install prompt — renders as a fixed overlay when criteria are met */}
        <InstallBanner />

        {/* First-time onboarding tour */}
        <OnboardingTour initiallyDone={hasCompletedOnboarding} />

        {/* Zara AI assistant — only for authenticated dashboard users */}
        <ChatbotWidget />
      </div>
    </DashboardShell>
  )
}

