import { Sidebar }       from '@/components/Sidebar'
import { TopBar }        from '@/components/TopBar'
import InstallBanner     from '@/components/InstallBanner'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
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
    </div>
  )
}

