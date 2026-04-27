import { redirect } from 'next/navigation'

interface Props {
  searchParams: Promise<{ token?: string }>
}

export default async function LegacyResetPasswordPage({ searchParams }: Props) {
  const { token } = await searchParams
  const target = token ? `/reset-password?token=${encodeURIComponent(token)}` : '/reset-password'
  redirect(target)
}
