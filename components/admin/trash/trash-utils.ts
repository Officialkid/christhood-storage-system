export function daysRemaining(purgeAt: string): number {
  const ms = new Date(purgeAt).getTime() - Date.now()
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)))
}

export function hoursRemaining(purgeAt: string): number {
  const ms = new Date(purgeAt).getTime() - Date.now()
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60)))
}

export function urgencyClass(purgeAt: string) {
  const days = daysRemaining(purgeAt)
  if (days <= 3) return 'bg-red-500/15 text-red-300 border-red-500/30'
  if (days <= 10) return 'bg-amber-500/15 text-amber-300 border-amber-500/30'
  return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
}

export function purgeLabel(purgeAt: string) {
  const days = daysRemaining(purgeAt)
  const hours = hoursRemaining(purgeAt)
  if (days === 0 && hours === 0) return 'Purge imminent'
  if (days === 0) return `${hours}h remaining`
  if (days === 1) return '1 day remaining'
  return `${days} days remaining`
}

export function formatTrashDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

export function formatTrashSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}
