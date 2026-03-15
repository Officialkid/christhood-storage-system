/**
 * public/sw.js — Christhood CMMS Service Worker
 *
 * Responsibilities:
 *   1. App-shell caching (cache-first for static assets, network-first for pages)
 *   2. Offline fallback page
 *   3. Background Sync — signals UploadZone to drain the IndexedDB offline queue
 *   4. Web Push notifications (preserved from Phase 9)
 *   5. Notification click navigation
 */

// ── Config ────────────────────────────────────────────────────────────────────
const CACHE_NAME    = 'cmms-v4'
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
  '/icons/icon-512.svg',
]

// ── Install ───────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Pre-cache critical shell; ignore individual failures so install succeeds
      Promise.allSettled(PRECACHE_URLS.map(url => cache.add(url)))
    ).then(() => self.skipWaiting())
  )
})

// ── Activate ──────────────────────────────────────────────────────────────────
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

// ── Fetch ──────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Never intercept non-GET, cross-origin, or Next.js HMR websocket requests
  if (request.method !== 'GET') return
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/_next/webpack-hmr')) return

  // ── 1. Static immutable assets → cache-first ─────────────────────────────
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/fonts/') ||
    url.pathname === '/manifest.json'
  ) {
    event.respondWith(cacheFirst(request))
    return
  }

  // ── 2. Next.js image optimisation → stale-while-revalidate ───────────────
  // Covers thumbnails served via /_next/image?url=...  Thumbnails rarely
  // change so this gives fast loads while staying up to date in background.
  if (url.pathname.startsWith('/_next/image')) {
    event.respondWith(staleWhileRevalidate(request))
    return
  }

  // ── 3. API routes — selective strategy ───────────────────────────────────
  if (url.pathname.startsWith('/api/')) {
    // Never cache security-sensitive or time-sensitive endpoints:
    //   /api/auth/           – session tokens
    //   /api/admin/          – analytics / admin tools (always fresh)
    //   /api/download/       – presigned download URLs (expire quickly)
    //   /api/dashboard       – always-fresh summary stats
    //   /api/cron/           – cron triggers
    //   /api/chat/           – AI responses
    //   /api/assistant/      – AI assistant
    //   /api/share/          – share tokens (can expire)
    //   any *presign* path   – R2 presigned PUT/GET URLs
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
      return // network-only — do not intercept
    }

    // Safe read-only listing endpoints → stale-while-revalidate.
    // Shows cached data instantly while updating in the background.
    event.respondWith(staleWhileRevalidate(request))
    return
  }

  // ── 4. Navigation requests → network-first, fallback to cache, then offline page
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstWithOfflineFallback(request))
    return
  }

  // ── 5. Everything else → stale-while-revalidate ───────────────────────────
  event.respondWith(staleWhileRevalidate(request))
})

// ── Strategies ────────────────────────────────────────────────────────────────

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

// ── IDB helpers (SW-side — mirrors upload-session-store.ts schema) ───────────
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

// ── Background Sync — offline upload queue ─────────────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'cmms-upload-sync') {
    // Tell all open windows to drain the IndexedDB upload queue;
    // if no window is open, show a "tap to continue" notification.
    event.waitUntil(notifyClientsToSync())
  }
  // Handle both the generic tag and per-upload tags (resume-upload-<sessionId>)
  if (event.tag === 'resume-upload' || event.tag.startsWith('resume-upload-')) {
    event.waitUntil(handleResumeSync())
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
  // No window — read IDB to show a meaningful "come back" notification
  const sessions = await getPausedSessions()
  if (sessions.length === 0) return
  const count = sessions.length
  await self.registration.showNotification('Uploads paused ⏸', {
    body:  `${count} file${count !== 1 ? 's' : ''} waiting — tap to resume`,
    icon:  '/icons/icon-192.svg',
    badge: '/icons/icon-192.svg',
    tag:   'cmms-upload-resume',
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
  // No window open — let the user know uploads are waiting
  const sessions = await getPausedSessions()
  if (sessions.length === 0) return
  const count = sessions.length
  await self.registration.showNotification('Upload queue ready ☁️', {
    body:  `${count} file${count !== 1 ? 's' : ''} ready to upload — tap to continue`,
    icon:  '/icons/icon-192.svg',
    badge: '/icons/icon-192.svg',
    tag:   'cmms-upload-resume',
    data:  { url: '/upload' },
  }).catch(() => {})
}

// ── Upload progress notifications (from main thread via postMessage) ─────────
self.addEventListener('message', (event) => {
  const data = event.data
  if (!data) return

  if (data.type === 'UPLOAD_PROGRESS') {
    const { active, total, pct, speed, tag } = data
    const body = speed
      ? `${active} of ${total} files · ${pct}% · ${speed}`
      : `${active} of ${total} files · ${pct}%`
    self.registration.showNotification('CMMS Upload in progress', {
      body,
      icon:   '/icons/icon-192.svg',
      badge:  '/icons/icon-192.svg',
      tag:    tag ?? 'cmms-upload-progress',
      silent: true,
      data:   { url: '/upload' },
    }).catch(() => {})
  }

  if (data.type === 'UPLOAD_COMPLETE') {
    const { total, tag } = data
    self.registration.showNotification('Upload complete ✅', {
      body:  `${total} file${total !== 1 ? 's' : ''} uploaded successfully`,
      icon:  '/icons/icon-192.svg',
      badge: '/icons/icon-192.svg',
      tag:   tag ?? 'cmms-upload-progress',
      data:  { url: '/media' },
    }).catch(() => {})
  }

  if (data.type === 'UPLOAD_FAILED') {
    const { failedCount, tag } = data
    self.registration.showNotification('Upload failed ❌', {
      body:  `${failedCount} file${failedCount !== 1 ? 's' : ''} failed — tap to retry`,
      icon:  '/icons/icon-192.svg',
      badge: '/icons/icon-192.svg',
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

// ── Push event ────────────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return

  let payload = { title: 'Christhood CMMS', body: 'You have a new notification.', url: '/', tag: 'default' }
  try {
    payload = { ...payload, ...event.data.json() }
  } catch {
    payload.body = event.data.text()
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body:  payload.body,
      icon:  payload.icon  ?? '/icons/icon-192.svg',
      badge: payload.badge ?? '/icons/icon-192.svg',
      tag:   payload.tag,
      data:  { url: payload.url ?? '/' },
    })
  )
})

// ── Notification click ────────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const url = event.notification.data?.url ?? '/'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      if (clients.openWindow) return clients.openWindow(url)
    })
  )
})
