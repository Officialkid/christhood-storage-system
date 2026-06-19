export function xhrPut(
  url: string,
  data: Blob,
  contentType: string,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', contentType)
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    })
    xhr.addEventListener('load', () => (xhr.status < 300 ? resolve() : reject(new Error(`HTTP ${xhr.status}`))))
    xhr.addEventListener('error', () => reject(new Error('Network error')))
    xhr.send(data)
  })
}

export function formatUploadSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

export function formatUploadSpeed(bps: number): string {
  if (bps < 1024) return `${bps} B/s`
  if (bps < 1024 ** 2) return `${(bps / 1024).toFixed(1)} KB/s`
  return `${(bps / 1024 ** 2).toFixed(1)} MB/s`
}

export function formatUploadEta(bytesLeft: number, bps: number): string {
  if (bps <= 0 || bytesLeft <= 0) return '…'
  const secs = Math.round(bytesLeft / bps)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  const rem = secs % 60
  return rem > 0 ? `${mins}m ${rem}s` : `${mins}m`
}

export function isVideoFile(file: File) {
  return file.type.startsWith('video/')
}

export function resolveUploadMimeType(fileName: string, browserType: string): string {
  if (browserType && browserType.includes('/') && browserType !== 'application/octet-stream') {
    return browserType
  }
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    gif: 'image/gif', webp: 'image/webp', heic: 'image/heic',
    heif: 'image/heif', tiff: 'image/tiff', tif: 'image/tiff',
    raw: 'image/x-raw', cr2: 'image/x-canon-cr2', nef: 'image/x-nikon-nef',
    mp4: 'video/mp4', mov: 'video/quicktime', avi: 'video/x-msvideo',
    mkv: 'video/x-matroska', webm: 'video/webm', '3gp': 'video/3gpp',
    m4v: 'video/x-m4v', wmv: 'video/x-ms-wmv',
  }
  return map[ext] ?? browserType ?? 'application/octet-stream'
}
