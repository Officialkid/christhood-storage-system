import type { Metadata } from 'next'
import SharePageClient from './SharePageClient'

interface Props {
  params: Promise<{ token: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params
  return {
    title: `Shared Files · Christhood CMMS`,
    description: `View and download files shared with you via a secure link.`,
    robots: { index: false, follow: false },
    openGraph: {
      title: 'Shared Files · Christhood CMMS',
      description: 'Secure file sharing link',
    },
  }
}

export default async function SharePage({ params }: Props) {
  const { token } = await params
  return <SharePageClient token={token} />
}
