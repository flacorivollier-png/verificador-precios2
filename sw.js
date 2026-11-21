/* Service worker: permite usar la app sin internet.
 * Estrategia "red primero": si hay conexión se baja la versión nueva,
 * si no, se usa la copia guardada. Cambiar CACHE al publicar cambios grandes. */
const CACHE = 'verificador-v19';
const ARCHIVOS = [
  './',
  './index.html',
  './css/app.css',
  './js/db.js',
  './js/acceso.js',
  './icons/portada.jpg',
  './js/importar.js',
  './js/app.js',
  './js/etiquetas.js',
  './vendor/barcode-detector.js',
  './vendor/zxing_reader.wasm',
  './js/escaner.js',
  './vendor/xlsx.full.min.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/logo-guille.png',
  './icons/logo-etiqueta.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('verificador-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then(res => {
        if (res.ok) {
          const copia = res.clone();
          caches.open(CACHE).then(c => c.put(req, copia));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('./index.html')))
  );
});
