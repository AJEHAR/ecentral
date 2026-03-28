// eCentral — Service Worker v3 (FCM V1 + Web Push)
const CACHE_NAME = 'ecentral-v3';
const STATIC_ASSETS = [
  '/ecentral/',
  '/ecentral/index.html',
  '/ecentral/manifest.json',
  '/ecentral/icon-192.png',
  '/ecentral/icon-512.png'
];

const BYPASS_DOMAINS = [
  'script.google.com',
  'googleapis.com',
  'accounts.google.com',
  'moe-dl.edu.my',
  'fcm.googleapis.com'
];

// VAPID key disimpan bila index_pwa.html hantar message
let _vapidKey = null;

// ── Install ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// ── Activate ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (BYPASS_DOMAINS.some(d => url.hostname.includes(d))) {
    event.respondWith(fetch(event.request));
    return;
  }
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response && response.status === 200 && url.pathname.startsWith('/ecentral/')) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => caches.match('/ecentral/index.html'));
    })
  );
});

// ── Terima mesej dari index_pwa.html ──
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SET_VAPID_KEY') {
    _vapidKey = event.data.vapidKey;
    console.log('[eCentral SW] VAPID key diterima.');
  }
});

// ══════════════════════════════════════════
// PUSH NOTIFICATION
// ══════════════════════════════════════════

self.addEventListener('push', event => {
  console.log('[eCentral SW] Push diterima:', event.data ? event.data.text() : 'kosong');

  let title = 'eCentral';
  let body  = 'Notifikasi baru';
  let tag   = 'ecentral-notif';
  let url   = 'https://ajehar.github.io/ecentral/';

  if (event.data) {
    try {
      const payload = event.data.json();
      if (payload.notification) {
        title = payload.notification.title || title;
        body  = payload.notification.body  || body;
      }
      if (payload.data) {
        title = payload.data.title || title;
        body  = payload.data.body  || body;
        tag   = payload.data.tag   || tag;
        url   = payload.data.url   || url;
      }
    } catch(e) {
      try { body = event.data.text(); } catch(e2) {}
    }
  }

  event.waitUntil(
    self.registration.showNotification(title, {
      body:     body,
      icon:     '/ecentral/icon-192.png',
      badge:    '/ecentral/icon-192.png',
      tag:      tag,
      renotify: true,
      vibrate:  [200, 100, 200],
      data:     { url: url },
      actions:  [
        { action: 'buka',  title: '📖 Buka App' },
        { action: 'tutup', title: '✕ Tutup'     }
      ]
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'tutup') return;

  const urlToOpen = (event.notification.data && event.notification.data.url)
    ? event.notification.data.url
    : 'https://ajehar.github.io/ecentral/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes('ecentral') && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(urlToOpen);
    })
  );
});

// ── Push subscription berubah (token expired) ──
self.addEventListener('pushsubscriptionchange', event => {
  console.log('[eCentral SW] Subscription berubah, renew...');
  if (!_vapidKey) {
    console.warn('[eCentral SW] VAPID key tiada, tidak boleh renew.');
    return;
  }

  function urlBase64ToUint8Array(b) {
    var pad = '='.repeat((4 - b.length % 4) % 4);
    var s = (b + pad).replace(/-/g, '+').replace(/_/g, '/');
    var raw = atob(s);
    var arr = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    return arr;
  }

  event.waitUntil(
    self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(_vapidKey)
    }).then(newSub => {
      // Hantar ke client untuk proses dengan userId
      return clients.matchAll({ type: 'window' }).then(list => {
        list.forEach(c => c.postMessage({ type: 'PUSH_RENEW', sub: JSON.stringify(newSub) }));
      });
    }).catch(err => console.error('[eCentral SW] Gagal renew:', err))
  );
});
