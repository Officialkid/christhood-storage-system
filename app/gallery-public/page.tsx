import Link   from 'next/link'
import { redirect } from 'next/navigation'
import { Camera, Share2, Lock, Download } from 'lucide-react'
import { getGallerySessionServer } from '@/lib/photo-gallery/session'

export const dynamic = 'force-dynamic'

export default async function GalleryLandingPage() {
  const gpSession = await getGallerySessionServer()

  // Logged-in users go straight to their dashboard
  if (gpSession) redirect('/dashboard')

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">

      {/* ── Nav ── */}
      <nav className="border-b border-zinc-900 px-5 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Camera className="w-5 h-5 text-white" />
          <span className="font-bold text-sm tracking-tight">Christhood Gallery</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Link href="/login" className="text-zinc-400 hover:text-white transition-colors">
            Log in
          </Link>
          <Link
            href="/signup"
            className="bg-white text-black font-semibold px-4 py-1.5 rounded-lg text-xs hover:bg-zinc-200 transition-colors"
          >
            Create gallery
          </Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="flex-1 flex flex-col items-center justify-center text-center px-4 py-24 sm:py-32">
        <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-6">
          <Camera className="w-8 h-8 text-white" />
        </div>

        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-tight max-w-2xl">
          Your photos,<br />
          <span className="text-zinc-400">beautifully shared.</span>
        </h1>

        <p className="text-zinc-400 mt-5 text-base sm:text-lg max-w-md leading-relaxed">
          Create collections, organise albums, and share your memories privately or with the world.
          Free to start — 5 GB included.
        </p>

        <div className="flex items-center gap-3 mt-8">
          <Link
            href="/signup"
            className="bg-white text-black font-bold px-6 py-3 rounded-xl text-sm hover:bg-zinc-200 transition-colors"
          >
            Create your free gallery
          </Link>
          <Link
            href="/login"
            className="border border-zinc-700 text-zinc-300 font-medium px-6 py-3 rounded-xl text-sm hover:border-zinc-500 hover:text-white transition-colors"
          >
            Sign in
          </Link>
        </div>

        <p className="text-zinc-600 text-xs mt-5">
          No credit card required &nbsp;·&nbsp; Free plan includes 5 GB
        </p>
      </section>

      {/* ── Features ── */}
      <section className="border-t border-zinc-900 px-5 py-16 max-w-4xl mx-auto w-full">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 text-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center">
              <Share2 className="w-5 h-5 text-zinc-300" />
            </div>
            <h3 className="font-semibold text-sm">Easy sharing</h3>
            <p className="text-zinc-500 text-xs leading-relaxed">
              Share albums with a single link. Control who can view and download.
            </p>
          </div>
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center">
              <Lock className="w-5 h-5 text-zinc-300" />
            </div>
            <h3 className="font-semibold text-sm">Private albums</h3>
            <p className="text-zinc-500 text-xs leading-relaxed">
              Password-protect albums or keep them fully private. You stay in control.
            </p>
          </div>
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center">
              <Download className="w-5 h-5 text-zinc-300" />
            </div>
            <h3 className="font-semibold text-sm">Download controls</h3>
            <p className="text-zinc-500 text-xs leading-relaxed">
              Choose whether viewers can download your originals or just view them.
            </p>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-zinc-900 py-6 text-center">
        <p className="text-zinc-600 text-xs">Christhood Media Team</p>
        <p className="text-zinc-700 text-xs mt-0.5">© {new Date().getFullYear()} Christhood</p>
      </footer>
    </div>
  )
}
