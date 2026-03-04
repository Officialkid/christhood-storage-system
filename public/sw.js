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
const CACHE_NAME    = 'cmms-v3'
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

  // ── 2. API routes → network-only (never cache) ────────────────────────────
  if (url.pathname.startsWith('/api/')) return

  // ── 3. Navigation requests → network-first, fallback to cache, then offline page
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstWithOfflineFallback(request))
    return
  }

  // ── 4. Everything else → stale-while-revalidate ───────────────────────────
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

// ── Background Sync — offline upload queue ─────────────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'cmms-upload-sync') {
    // Tell all open windows to drain the IndexedDB upload queue
    event.waitUntil(notifyClientsToSync())
  }
})

async function notifyClientsToSync() {
  const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true })
  for (const client of allClients) {
    client.postMessage({ type: 'OFFLINE_QUEUE_DRAIN' })
  }
}

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
