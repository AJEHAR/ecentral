// eCentral — Service Worker v2 (dengan Push Notification)
const CACHE_NAME = 'ecentral-v2';
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

// ══════════════════════════════════════════
// PUSH NOTIFICATION
// ══════════════════════════════════════════

// ── Terima push dari FCM ──
self.addEventListener('push', event => {
  let data = { title: 'eCentral', body: 'Notifikasi baru', icon: '/ecentral/icon-192.png', tag: 'ecentral-notif' };

  if (event.data) {
    try {
      const payload = event.data.json();
      // FCM hantar dalam notification atau data
      if (payload.notification) {
        data.title = payload.notification.title || data.title;
        data.body  = payload.notification.body  || data.body;
      }
      if (payload.data) {
        data.title   = payload.data.title   || data.title;
        data.body    = payload.data.body    || data.body;
        data.tag     = payload.data.tag     || data.tag;
        data.url     = payload.data.url     || '';
        data.subjek  = payload.data.subjek  || '';
        data.kelas   = payload.data.kelas   || '';
        data.masa    = payload.data.masa    || '';
      }
    } catch(e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body:    data.body,
    icon:    '/ecentral/icon-192.png',
    badge:   '/ecentral/icon-192.png',
    tag:     data.tag,
    vibrate: [200, 100, 200],
    data:    { url: data.url || 'https://ajehar.github.io/ecentral/' },
    actions: [
      { action: 'buka', title: '📖 Buka App' },
      { action: 'tutup', title: '✕ Tutup' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// ── Klik pada notifikasi ──
self.addEventListener('notificationclick', event => {
  event.notification.close();

  if (event.action === 'tutup') return;

  const urlToOpen = event.notification.data?.url || 'https://ajehar.github.io/ecentral/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // Kalau app dah buka, focus je
      for (const client of clientList) {
        if (client.url.includes('ecentral') && 'focus' in client) {
          return client.focus();
        }
      }
      // Kalau tak, buka tab baru
      if (clients.openWindow) return clients.openWindow(urlToOpen);
    })
  );
});

// ── Push subscription berubah (token expired) ──
self.addEventListener('pushsubscriptionchange', event => {
  event.waitUntil(
    self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: self._vapidKey
    }).then(sub => {
      // Hantar token baru ke GAS
      return fetch('https://script.google.com/macros/s/AKfycbwe_vG0R0m6C0uAeBrBMeIFr4Mqi14zJwTr0DYO_jdw3Rv3E1FTR6WUcle3aYTTnXbv1w/exec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'updatePushToken', subscription: JSON.stringify(sub) })
      });
    })
  );
});
