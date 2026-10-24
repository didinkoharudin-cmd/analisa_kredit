/* SCORE PWA Service Worker — V18.3.11.239
 * Goal: force a clean app-shell generation so old HTML/UI patches are not
 * retained by CacheStorage, while preserving offline fallback + Web Push.
 */
'use strict';

const SW_VERSION = '18.3.11.239';
const CACHE_NAME = 'score-pwa-v239';
const NAV_CACHE_KEY = './index.html';
const SHELL_ASSETS = [
  './icon-192.png',
  './icon-512.png',
  './manifest.webmanifest'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Fetch a fresh HTML copy explicitly; do not trust the HTTP/browser cache.
    try {
      const fresh = await fetch(new Request('./index.html', { cache: 'reload' }));
      if (fresh && fresh.ok) await cache.put(NAV_CACHE_KEY, fresh.clone());
    } catch (_) {}
    await Promise.all(SHELL_ASSETS.map(async asset => {
      try {
        const response = await fetch(new Request(asset, { cache: 'reload' }));
        if (response && response.ok) await cache.put(asset, response.clone());
      } catch (_) {}
    }));
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Dedicated SCORE origin: remove every previous CacheStorage generation.
    // This intentionally prevents V208/V23x cached HTML from surviving V239.
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function networkFirstNavigation(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(new Request(request, { cache: 'no-store' }));
    if (response && response.ok) {
      await cache.put(NAV_CACHE_KEY, response.clone());
      return response;
    }
    throw new Error('navigation response not ok');
  } catch (_) {
    return (await cache.match(NAV_CACHE_KEY)) || Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const network = fetch(new Request(request, { cache: 'no-cache' }))
    .then(response => {
      if (response && response.ok) cache.put(request, response.clone()).catch(() => {});
      return response;
    })
    .catch(() => null);
  return cached || (await network) || Response.error();
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Do not interfere with API/auth requests or third-party CDN traffic.
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate' || url.pathname.endsWith('/index.html') || url.pathname === '/') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  const dest = request.destination;
  if (['style','script','image','font','manifest'].includes(dest)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

// Preserve SCORE Web Push functionality when replacing an older service worker.
self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; }
  catch (_) { try { payload = { body: event.data ? event.data.text() : '' }; } catch (_) {} }

  const notification = payload.notification && typeof payload.notification === 'object' ? payload.notification : {};
  const data = payload.data && typeof payload.data === 'object' ? payload.data : payload;
  const title = payload.title || notification.title || data.title || 'SCORE';
  const body = payload.body || notification.body || data.body || data.message || 'Ada pembaruan baru.';
  const options = {
    body,
    icon: notification.icon || payload.icon || './icon-192.png',
    badge: notification.badge || payload.badge || './icon-192.png',
    tag: payload.tag || notification.tag || data.tag || undefined,
    renotify: false,
    data
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const data = event.notification.data || {};
  event.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientsList) {
      try {
        await client.focus();
        client.postMessage({ type: 'WEB_PUSH_CLICK', data });
        return;
      } catch (_) {}
    }
    let target = data.url || './';
    if (!data.url && data.kind) {
      const params = new URLSearchParams({ push: String(data.kind) });
      if (data.peerEmail) params.set('peer', String(data.peerEmail));
      target = './?' + params.toString();
    }
    if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});

self.addEventListener('message', event => {
  const type = event.data && event.data.type;
  if (type === 'SKIP_WAITING') self.skipWaiting();
  if (type === 'CLEAR_SCORE_CACHE') {
    event.waitUntil((async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)));
    })());
  }
});
