import { Sidebar }        from '@/components/Sidebar'
import { TopBar }         from '@/components/TopBar'
import InstallBanner      from '@/components/InstallBanner'
import OnboardingTour     from '@/components/OnboardingTour'
import { getServerSession } from 'next-auth'
import { authOptions }    from '@/lib/auth'
import { prisma }         from '@/lib/prisma'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Fetch whether this user has already completed the onboarding tour.
  // Default to true (don't show tour) for unauthenticated edge cases.
  let hasCompletedOnboarding = true
  try {
    const session = await getServerSession(authOptions)
    if (session?.user?.id) {
      const user = await prisma.user.findUnique({
        where:  { id: session.user.id },
        select: { hasCompletedOnboarding: true },
      })
      hasCompletedOnboarding = user?.hasCompletedOnboarding ?? true
    }
  } catch {
    // Non-critical — skip tour if anything goes wrong
  }

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-8">
          {children}
        </main>
      </div>

      {/* PWA install prompt — renders as a fixed overlay when criteria are met */}
      <InstallBanner />

      {/* First-time onboarding tour */}
      <OnboardingTour initiallyDone={hasCompletedOnboarding} />
    </div>
  )
}

