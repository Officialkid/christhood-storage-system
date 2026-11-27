import { ThemeToggle } from '@/components/ThemeToggle'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="cmms-app min-h-[100dvh] relative bg-slate-950">
      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle />
      </div>
      {children}
    </div>
  )
}
