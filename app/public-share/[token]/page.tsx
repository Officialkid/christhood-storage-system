import { Metadata } from 'next'
import PublicShareViewClient from './PublicShareViewClient'

export const metadata: Metadata = {
  title: 'Shared File',
}

export default async function PublicShareViewPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  return <PublicShareViewClient token={token} />
}
