import { Metadata } from 'next'
import PublicShareViewClient from './PublicShareViewClient'

export const metadata: Metadata = {
  title: 'Shared File',
}

export default function PublicShareViewPage({
  params,
}: {
  params: { token: string }
}) {
  return <PublicShareViewClient token={params.token} />
}
