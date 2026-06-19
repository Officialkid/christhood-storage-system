export function getPublicShareBaseUrl(): string {
  const explicit =
    process.env.NEXT_PUBLIC_SHARELINK_URL ||
    process.env.SHARELINK_PUBLIC_BASE_URL

  if (explicit?.trim()) {
    return explicit.trim().replace(/\/+$/, '')
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL
  if (appUrl?.includes('localhost') || appUrl?.includes('127.0.0.1')) {
    return appUrl.replace(/\/+$/, '')
  }

  return 'https://sharelink.cmmschristhood.org'
}
