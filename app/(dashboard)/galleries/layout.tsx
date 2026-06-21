import { redirect } from 'next/navigation'

export default function GalleriesDisabledLayout({
  children,
}: {
  children: React.ReactNode
}) {
  void children
  redirect('/dashboard')
}
