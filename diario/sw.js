const V = 'super-diario-v2';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('super-diario-') && k !== V).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const u = new URL(e.request.url);
  if (u.origin === location.origin) {
    // red primero para recibir actualizaciones; si no hay conexión, usa la copia guardada
    e.respondWith(fetch(e.request).then(r => {
      const c = r.clone(); caches.open(V).then(ca => ca.put(e.request, c)); return r;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html'))));
  } else if (['fonts.googleapis.com','fonts.gstatic.com','unpkg.com','cdn.jsdelivr.net'].includes(u.hostname)) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => {
      const c = res.clone(); caches.open(V).then(ca => ca.put(e.request, c)); return res;
    })));
  }
});
