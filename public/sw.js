/**
 * public/sw.js â€” Christhood CMMS Service Worker
 *
 * Responsibilities:
 *   1. App-shell caching (cache-first for static assets, network-first for pages)
 *   2. Offline fallback page
 *   3. Background Sync â€” signals UploadZone to drain the IndexedDB offline queue
 *   4. Web Push notifications (preserved from Phase 9)
 *   5. Notification click navigation
 */

// â”€â”€ Config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const CACHE_NAME    = 'cmms-v7'
const OFFLINE_URL   = '/offline'

// App-shell routes to pre-cache on install
const PRECACHE_URLS = [
  '/',
  '/dashboard',
  '/upload',
  '/media',
  '/offline',
  '/manifest.json',
  '/icons/icon-192.svg',
  '/icons/icon-192x192.png',
  '/icons/icon-512.svg',
]

// â”€â”€ Install â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Pre-cache critical shell; ignore individual failures so install succeeds
      Promise.allSettled(PRECACHE_URLS.map(url => cache.add(url)))
    ).then(() => self.skipWaiting())
  )
})

// â”€â”€ Activate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => caches.delete(k))
      )
    ).then(() => clients.claim())
  )
})

// â”€â”€ Fetch â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Never intercept non-GET, cross-origin, or Next.js HMR websocket requests
  if (request.method !== 'GET') return
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/_next/webpack-hmr')) return

  // â”€â”€ 1. Static immutable assets â†’ cache-first â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/fonts/') ||
    url.pathname === '/manifest.json'
  ) {
    event.respondWith(cacheFirst(request))
    return
  }

  // â”€â”€ 2. Next.js image optimisation â†’ stale-while-revalidate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Covers thumbnails served via /_next/image?url=...  Thumbnails rarely
  // change so this gives fast loads while staying up to date in background.
  if (url.pathname.startsWith('/_next/image')) {
    event.respondWith(staleWhileRevalidate(request))
    return
  }

  // â”€â”€ 3. API routes â€” selective strategy â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (url.pathname.startsWith('/api/')) {
    // Never cache security-sensitive or time-sensitive endpoints:
    //   /api/auth/           â€“ session tokens
    //   /api/admin/          â€“ analytics / admin tools (always fresh)
    //   /api/download/       â€“ presigned download URLs (expire quickly)
    //   /api/dashboard       â€“ always-fresh summary stats
    //   /api/cron/           â€“ cron triggers
    //   /api/chat/           â€“ AI responses
    //   /api/assistant/      â€“ AI assistant
    //   /api/share/          â€“ share tokens (can expire)
    //   any *presign* path   â€“ R2 presigned PUT/GET URLs
    if (
      url.pathname.startsWith('/api/auth/') ||
      url.pathname.startsWith('/api/admin/') ||
      url.pathname.startsWith('/api/download/') ||
      url.pathname.startsWith('/api/dashboard') ||
      url.pathname.startsWith('/api/cron/') ||
      url.pathname.startsWith('/api/chat/') ||
      url.pathname.startsWith('/api/assistant/') ||
      url.pathname.startsWith('/api/share/') ||
      url.pathname.includes('presign')
    ) {
      return // network-only â€” do not intercept
    }

    // Safe read-only listing endpoints â†’ stale-while-revalidate.
    // Shows cached data instantly while updating in the background.
    event.respondWith(staleWhileRevalidate(request))
    return
  }

  // â”€â”€ 4. Navigation requests â†’ network-first, fallback to cache, then offline page
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstWithOfflineFallback(request))
    return
  }

  // â”€â”€ 5. Everything else â†’ stale-while-revalidate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  event.respondWith(staleWhileRevalidate(request))
})

// â”€â”€ Strategies â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME)
      cache.put(request, response.clone())
    }
    return response
  } catch {
    return new Response('Offline', { status: 503 })
  }
}

async function networkFirstWithOfflineFallback(request) {
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME)
      cache.put(request, response.clone())
    }
    return response
  } catch {
    const cached = await caches.match(request)
    if (cached) return cached
    return caches.match(OFFLINE_URL) ?? new Response('Offline', { status: 503 })
  }
}

async function staleWhileRevalidate(request) {
  const cache  = await caches.open(CACHE_NAME)
  const cached = await cache.match(request)

  const fetchPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone())
    return response
  }).catch(() => null)

  return cached ?? (await fetchPromise) ?? new Response('Offline', { status: 503 })
}

// â”€â”€ IDB helpers (SW-side â€” mirrors upload-session-store.ts schema) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const SW_DB_NAME  = 'cmms_upload_sessions'
const SW_DB_STORE = 'sessions'

function swOpenDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SW_DB_NAME, 1)
    req.onsuccess = e => resolve(e.target.result)
    req.onerror   = () => reject(req.error)
  })
}

async function getPausedSessions() {
  try {
    const db = await swOpenDB()
    return await new Promise((resolve, reject) => {
      const req = db.transaction(SW_DB_STORE, 'readonly').objectStore(SW_DB_STORE).getAll()
      req.onsuccess = () => resolve(
        req.result.filter(s => s.status === 'active' || s.status === 'paused')
      )
      req.onerror = () => reject(req.error)
    })
  } catch {
    return []
  }
}

/**
 * Look up a single session by its R2 multipart uploadId.
 * The uploadId is stored on the session object (distinct from sessionId which is the IDB key).
 */
async function getSessionByUploadId(uploadId) {
  try {
    const db = await swOpenDB()
    return await new Promise((resolve, reject) => {
      const req = db.transaction(SW_DB_STORE, 'readonly').objectStore(SW_DB_STORE).getAll()
      req.onsuccess = () => {
        const match = req.result.find(s => s.uploadId === uploadId)
        resolve(match ?? null)
      }
      req.onerror = () => reject(req.error)
    })
  } catch {
    return null
  }
}

// â”€â”€ Background Sync â€” offline upload queue â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
self.addEventListener('sync', (event) => {
  if (event.tag === 'cmms-upload-sync') {
    // Tell all open windows to drain the IndexedDB upload queue;
    // if no window is open, show a "tap to continue" notification.
    event.waitUntil(notifyClientsToSync())
  }
  // Generic resume tag â€” message all open clients or show a generic notification
  if (event.tag === 'resume-upload') {
    event.waitUntil(handleResumeSync())
  }
  // Per-upload tags: resume-upload-<uploadId> â€” handle with per-file logic
  if (event.tag.startsWith('resume-upload-') && event.tag !== 'resume-upload') {
    const uploadId = event.tag.slice('resume-upload-'.length)
    event.waitUntil(backgroundResumeUpload(uploadId))
  }
})

/**
 * If the app is open: message every window to resume paused uploads.
 * If no window is open: show a notification so the user can tap back in.
 */
async function handleResumeSync() {
  const openClients = await clients.matchAll({ type: 'window', includeUncontrolled: true })
  if (openClients.length > 0) {
    for (const client of openClients) {
      client.postMessage({ type: 'RESUME_UPLOADS' })
    }
    return
  }
  // No window â€” read IDB to show a meaningful "come back" notification
  const sessions = await getPausedSessions()
  if (sessions.length === 0) return
  const count = sessions.length
  await self.registration.showNotification('Uploads paused â¸', {
    body:  `${count} file${count !== 1 ? 's' : ''} waiting â€” tap to resume`,
    icon:  '/icons/icon-192x192.png',
    badge: '/icons/icon-192x192.png',
    tag:   'cmms-upload-resume',
    data:  { url: '/upload' },
  }).catch(() => {})
}

/**
 * Per-upload Background Sync handler.
 * If a window is open, messages it to resume (the window has the File object).
 * If no window is open, shows a richer per-file notification to bring the user back.
 * NOTE: The service worker cannot access the original File object, so actual byte-level
 * uploading is delegated to the main thread; the SW acts as a wake-up / notification layer.
 */
async function backgroundResumeUpload(uploadId) {
  const openClients = await clients.matchAll({ type: 'window', includeUncontrolled: true })
  if (openClients.length > 0) {
    // App is open in background â€” message it to resume
    for (const client of openClients) {
      client.postMessage({ type: 'RESUME_UPLOADS' })
    }
    return
  }
  // No window open â€” look up the session for a richer, per-file notification
  const session = await getSessionByUploadId(uploadId)
  if (!session) {
    // Fall back to the generic notification if session is not found
    return handleResumeSync()
  }
  const pct = session.totalChunks > 0
    ? Math.round((session.completedParts.length / session.totalChunks) * 100)
    : 0
  await self.registration.showNotification('Upload complete âœ…', {
    body:  `${session.fileName} Â· ${pct}% complete â€” tap to resume`,
    icon:  '/icons/icon-192x192.png',
    badge: '/icons/icon-192x192.png',
    tag:   `cmms-upload-resume-${uploadId}`,
    data:  { url: '/upload' },
  }).catch(() => {})
}

async function notifyClientsToSync() {
  const openClients = await clients.matchAll({ type: 'window', includeUncontrolled: true })
  if (openClients.length > 0) {
    for (const client of openClients) {
      client.postMessage({ type: 'OFFLINE_QUEUE_DRAIN' })
    }
    return
  }
  // No window open â€” let the user know uploads are waiting
  const sessions = await getPausedSessions()
  if (sessions.length === 0) return
  const count = sessions.length
  await self.registration.showNotification('Upload queue ready â˜ï¸', {
    body:  `${count} file${count !== 1 ? 's' : ''} ready to upload â€” tap to continue`,
    icon:  '/icons/icon-192x192.png',
    badge: '/icons/icon-192x192.png',
    tag:   'cmms-upload-resume',
    data:  { url: '/upload' },
  }).catch(() => {})
}

// â”€â”€ Upload progress notifications (from main thread via postMessage) â”€â”€â”€â”€â”€â”€â”€â”€â”€
self.addEventListener('message', (event) => {
  const data = event.data
  if (!data) return

  if (data.type === 'UPLOAD_PROGRESS') {
    const { active, total, pct, speed, tag } = data
    const body = speed
      ? `${active} of ${total} files Â· ${pct}% Â· ${speed}`
      : `${active} of ${total} files Â· ${pct}%`
    self.registration.showNotification('CMMS Upload in progress', {
      body,
      icon:   '/icons/icon-192x192.png',
      badge:  '/icons/icon-192x192.png',
      tag:    tag ?? 'cmms-upload-progress',
      silent: true,
      data:   { url: '/upload' },
    }).catch(() => {})
  }

  if (data.type === 'UPLOAD_COMPLETE') {
    const { total, tag } = data
    self.registration.showNotification('Upload complete âœ…', {
      body:  `${total} file${total !== 1 ? 's' : ''} uploaded successfully`,
      icon:  '/icons/icon-192x192.png',
      badge: '/icons/icon-192x192.png',
      tag:   tag ?? 'cmms-upload-progress',
      data:  { url: '/media' },
    }).catch(() => {})
  }

  if (data.type === 'UPLOAD_FAILED') {
    const { failedCount, tag } = data
    self.registration.showNotification('Upload failed âŒ', {
      body:  `${failedCount} file${failedCount !== 1 ? 's' : ''} failed â€” tap to retry`,
      icon:  '/icons/icon-192x192.png',
      badge: '/icons/icon-192x192.png',
      tag:   tag ?? 'cmms-upload-progress',
      data:  { url: '/upload' },
    }).catch(() => {})
  }

  if (data.type === 'UPLOAD_DISMISS') {
    const { tag } = data
    self.registration.getNotifications({ tag: tag ?? 'cmms-upload-progress' })
      .then(notifs => notifs.forEach(n => n.close()))
      .catch(() => {})
  }
})

// â”€â”€ Push event â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
self.addEventListener('push', (event) => {
  if (!event.data) return
  let data = {}
  try { data = event.data.json() } catch { return }

  const ICON  = '/icons/icon-192x192.png'
  const BADGE = '/icons/badge-72x72.png'

  /**
   * Build rich notification options for a typed push event.
   * Returns an object that includes `title` (pulled out by the caller).
   * `url` from the server payload is used for navigation on tap.
   */
  const buildContent = (type, p, fallbackUrl) => {
    const nav = { url: fallbackUrl ?? '/notifications' }
    switch (type) {
      case 'TRANSFER_RECEIVED':
        return {
          title:              'ðŸ“¦ New Transfer Received',
          body:               `${p.senderName} sent you ${p.fileCount ?? ''} file(s): "${p.subject}"`,
          icon:  ICON, badge: BADGE,
          tag:                `transfer-${p.transferId ?? 'received'}`,
          vibrate:            [200, 100, 200],
          requireInteraction: false,
          data:               nav,
        }
      case 'TRANSFER_RESPONDED':
        return {
          title:   'âœ… Transfer Response Received',
          body:    `${p.recipientName} returned edited files for: "${p.subject}"`,
          icon:  ICON, badge: BADGE,
          tag:     `transfer-responded-${p.transferId ?? 'responded'}`,
          vibrate: [200, 100, 200],
          data:    nav,
        }
      case 'TRANSFER_COMPLETED':
        return {
          title: 'ðŸŽ‰ Transfer Completed',
          body:  `Your transfer "${p.subject}" has been marked complete`,
          icon:  ICON, badge: BADGE,
          tag:   `transfer-completed-${p.transferId ?? 'completed'}`,
          data:  nav,
        }
      case 'TRANSFER_CANCELLED':
        return {
          title: 'âŒ Transfer Cancelled',
          body:  `A transfer from ${p.senderName} was cancelled: "${p.subject}"`,
          icon:  ICON, badge: BADGE,
          tag:   `transfer-cancelled-${p.transferId ?? 'cancelled'}`,
          data:  nav,
        }
      case 'DIRECT_MESSAGE': {
        const prefix = p.priority === 'URGENT' ? 'ðŸš¨ URGENT: ' : 'ðŸ’¬ '
        return {
          title:              `${prefix}Message from ${p.senderName}`,
          body:               p.subject,
          icon:  ICON, badge: BADGE,
          tag:                `message-${p.messageId ?? 'msg'}`,
          vibrate:            p.priority === 'URGENT' ? [300, 100, 300, 100, 300] : [200, 100, 200],
          requireInteraction: p.priority === 'URGENT',
          data:               nav,
        }
      }
      case 'FILE_UPLOADED':
        return {
          title: 'ðŸ“ New Upload',
          body:  `${p.uploaderName ?? 'Someone'} uploaded to "${p.eventName}"`,
          icon:  ICON, badge: BADGE,
          tag:   `upload-${p.eventId ?? 'upload'}`,
          data:  nav,
        }
      case 'FILE_STATUS_CHANGED':
        return {
          title: 'ðŸ”„ File Status Updated',
          body:  `"${p.fileName}" is now ${p.newStatus}`,
          icon:  ICON, badge: BADGE,
          tag:   `status-${p.fileId ?? 'status'}`,
          data:  nav,
        }
      case 'FILE_PUBLISHED':
        return {
          title: 'âœ… File Published',
          body:  `"${p.fileName}" has been published`,
          icon:  ICON, badge: BADGE,
          tag:   `published-${p.fileId ?? 'published'}`,
          data:  nav,
        }
      case 'UPLOAD_COMPLETE':
        return {
          title: 'âœ… Upload Complete',
          body:  `${p.fileName ?? 'Your file'} has been uploaded successfully`,
          icon:  ICON, badge: BADGE,
          tag:   `upload-complete-${p.fileId ?? 'upload'}`,
          data:  { url: '/upload' },
        }
      default:
        return {
          title: data.title ?? 'Christhood CMMS',
          body:  data.body  ?? 'You have a new notification',
          icon:  ICON, badge: BADGE,
          tag:   data.tag ?? 'cmms-notification',
          data:  nav,
        }
    }
  }

  let title, options
  if (data.type) {
    const { title: t, ...rest } = buildContent(data.type, data.payload ?? {}, data.url)
    title   = t
    options = rest
  } else {
    title   = data.title ?? 'Christhood CMMS'
    options = {
      body:  data.body  ?? 'You have a new notification',
      icon:  ICON,
      badge: BADGE,
      tag:   data.tag ?? 'cmms-notification',
      data:  { url: data.url ?? '/notifications' },
    }
  }

  event.waitUntil(
    self.registration.showNotification(title, options)
  )
})

// â”€â”€ Notification tap â€” focus/navigate an existing window or open a new one â”€â”€â”€â”€
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const path    = event.notification.data?.url ?? '/'
  const fullUrl = path.startsWith('http') ? path : (self.location.origin + path)

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // If the PWA is already open in any tab, focus it and navigate there
      for (const client of windowClients) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          client.focus()
          return client.navigate(fullUrl).catch(() => {})
        }
      }
      // Otherwise open a new window
      return clients.openWindow(fullUrl)
    })
  )
})
