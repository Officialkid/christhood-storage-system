import type { Metadata } from 'next'
import TransferShareViewClient from './TransferShareViewClient'

export const metadata: Metadata = {
  title: 'Shared transfer',
}

export default async function TransferSharePage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code } = await params
  return <TransferShareViewClient code={code} />
}
