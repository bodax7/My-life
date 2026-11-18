/* MyLife service worker: cache-first app shell so the app opens and works offline. */
const CACHE = 'mylife-v1';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'css/styles.css', 'js/finance.js', 'js/life.js', 'js/i18n.js', 'js/db.js', 'js/app.js', 'js/ui-home.js', 'js/ui-money.js', 'js/ui-notes.js', 'js/ui-tasks.js', 'js/ui-more.js', 'js/boot.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // third-party (e.g. optional OCR engine) is never cached here
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => {
    const net = fetch(req).then(res => { if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; }).catch(() => hit || caches.match('index.html'));
    return hit || net;   // cache-first; refreshed in the background for next launch
  }));
});
self.addEventListener('notificationclick', e => { e.notification.close(); e.waitUntil(clients.matchAll({ type: 'window' }).then(cs => cs[0] ? cs[0].focus() : clients.openWindow('./'))); });
