const BYTES_PER_GB = 1_073_741_824
const GB_PER_TB = 1024
const DEFAULT_STORAGE_LIMIT_GB = 100

export function getStorageLimitGb(): number {
  const raw = Number(process.env.STORAGE_LIMIT_GB ?? DEFAULT_STORAGE_LIMIT_GB)
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_STORAGE_LIMIT_GB
}

export function getStorageLimitBytes(): number {
  return getStorageLimitGb() * BYTES_PER_GB
}

export function formatStorageLimit(gb = getStorageLimitGb()): string {
  if (gb >= GB_PER_TB) {
    const tb = gb / GB_PER_TB
    return `${Number.isInteger(tb) ? tb.toFixed(0) : tb.toFixed(1)} TB`
  }

  return `${gb} GB`
}

export { BYTES_PER_GB }
