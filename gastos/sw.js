// Guarda la app en el teléfono para que funcione sin internet.
// Cambiar VERSION cada vez que se modifique la app para que se actualice.
const VERSION = "gastos-v3";
const ARCHIVOS = [
  "./", "./index.html", "./datos.js", "./manifest.webmanifest",
  "./icons/icon-180.png", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-512-maskable.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("gastos-") && k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Primero intenta la red (para tener la última versión) y si no hay internet usa la copia guardada.
// Las fuentes de Google también se guardan, así la app se ve igual sin conexión.
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  const propio = url.origin === location.origin;
  const fuente = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (!propio && !fuente) return;
  e.respondWith(
    fetch(e.request, propio ? { cache: "no-cache" } : undefined).then(r => {
      if (r.ok || r.type === "opaque") {
        const copia = r.clone();
        caches.open(VERSION).then(c => c.put(e.request, copia));
      }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || (propio ? caches.match("./index.html") : undefined)))
  );
});
