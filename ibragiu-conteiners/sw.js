// Guarda la app en el dispositivo para que funcione sin internet.
// Cambiar VERSION cada vez que se modifique la app para que se actualice.
const VERSION = "ibragiu-v6";
const ARCHIVOS = [
  "./", "./index.html", "./manifest.json", "./logo.png",
  "./lib/JsBarcode.all.min.js", "./lib/html5-qrcode.min.js",
  "./icons/icon-192.png", "./icons/icon-512.png",
  "./icons/icon-192-maskable.png", "./icons/icon-512-maskable.png", "./icons/icon-180.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("ibragiu-") && k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Primero intenta la red (para tener la última versión) y si no hay internet usa la copia guardada.
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request).then(r => {
      if (r.ok && new URL(e.request.url).origin === location.origin) {
        const copia = r.clone();
        caches.open(VERSION).then(c => c.put(e.request, copia));
      }
      return r;
    }).catch(() => caches.match(e.request, {ignoreSearch: true}))
  );
});
