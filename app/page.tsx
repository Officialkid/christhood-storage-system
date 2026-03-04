import { redirect } from 'next/navigation'

/**
 * Root route — redirect unauthenticated users to /login,
 * authenticated users land on /dashboard (handled by middleware).
 */
export default function RootPage() {
  redirect('/login')
}
