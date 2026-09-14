const CACHE = 'analisis-kredit-pwa-V18.3.11.161-startup-performance-safe';

// V161: cache shell tanpa duplikasi './' + index.html dan tanpa icon kembar.
// File icon-* tetap ada untuk kompatibilitas notifikasi lama, tetapi tidak lagi
// diprecache karena byte-nya sama dengan score-icon-*.
const SHELL = [
  './index.html',
  './score-v158.css?v=158',
  './score-header-v137.js?v=137',
  './score-header-background-v137.jpg?v=137',
  './score-logo-white-compact.png',
  './score-icon-192.png',
  './score-icon-512.png',
  './upload-v120.js?v=129',
  './android-back-v111.js?v=137',
  './customer-care-v109.js',
  './bundling-g6b-g2c-v117.js',
  './usage-traffic-v122.js',
  './manifest.webmanifest',
  './offline.html'
];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);

    // Jangan gagalkan seluruh instalasi hanya karena satu aset opsional gagal.
    // Masing-masing aset dicoba mandiri dan aset yang berhasil tetap tersimpan.
    await Promise.allSettled(SHELL.map(async url => {
      try {
        const request = new Request(new URL(url, self.location.href), { cache: 'reload' });
        const response = await fetch(request);
        if (response && response.ok) await cache.put(request, response.clone());
      } catch (err) {
        console.warn('[SW V161] precache skip:', url, err && err.message ? err.message : err);
      }
    }));

    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function navigationResponse(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match('./index.html');

  // Tetap cek versi online, tetapi jangan biarkan jaringan lambat menahan layar.
  // Bila 700 ms belum ada jawaban dan cache tersedia, tampilkan cache dahulu;
  // fetch tetap berjalan untuk memperbarui cache di belakang layar.
  const networkPromise = fetch(request, { cache: 'no-store' })
    .then(async response => {
      if (response && response.ok) {
        try { await cache.put('./index.html', response.clone()); } catch (_) {}
      }
      return response;
    })
    .catch(() => null);

  if (!cached) {
    const online = await networkPromise;
    if (online) return online;
    return (await cache.match('./offline.html')) || Response.error();
  }

  const fastNetwork = await Promise.race([
    networkPromise,
    sleep(700).then(() => null)
  ]);

  return fastNetwork || cached;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith(navigationResponse(request));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;

      try {
        const response = await fetch(request);
        if (response && response.ok) {
          try { await cache.put(request, response.clone()); } catch (_) {}
        }
        return response;
      } catch (err) {
        throw err;
      }
    })());
  }
});

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; }
  catch (e) {
    try { data = { body: event.data ? event.data.text() : '' }; }
    catch (_) { data = {}; }
  }

  const title = String(data.title || 'Analisis Kredit');
  const options = {
    body: String(data.body || ''),
    icon: data.icon || './score-icon-192.png',
    badge: './score-icon-192.png',
    tag: data.tag || undefined,
    renotify: true,
    data: data.data || {},
    timestamp: Date.now()
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const data = event.notification.data || {};
  event.waitUntil((async () => {
    const list = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of list) {
      if ('focus' in client) await client.focus();
      try { client.postMessage({ type: 'WEB_PUSH_CLICK', data }); } catch (e) {}
      return;
    }

    let url = './';
    if (data.kind === 'chat') url = './?push=chat&peer=' + encodeURIComponent(String(data.peerEmail || ''));
    else if (data.kind === 'reminder') url = './?push=reminder';
    if (clients.openWindow) return clients.openWindow(url);
  })());
});
