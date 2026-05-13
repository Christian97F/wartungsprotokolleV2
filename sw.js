// ============================================================
// Service Worker – sorgt dafür, dass die App komplett offline
// funktioniert, nachdem sie einmal geladen wurde.
// Alle App-Dateien werden beim ersten Aufruf im Browser-Cache
// gespeichert. Danach läuft alles ohne Internet.
// ============================================================

const CACHE_NAME = 'notstrom-wartung-v15';

// Liste aller Dateien, die gecacht werden sollen
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './icon-192-v2.png',
  './icon-512-v2.png',
  './404.html',
  './css/variables.css',
  './css/base.css',
  './css/layout.css',
  './css/components.css',
  './js/db.js',
  './js/io.js',
  './js/konfigurator.js',
  './js/protokoll.js',
  './js/eintraege.js',
  './js/app.js'
];

// Installation: Alle Dateien einzeln cachen (fehlertolerant)
// cache.addAll() bricht bei einem einzigen Fehler ab – auf GitHub Pages
// können einzelne Dateien mal nicht erreichbar sein (race conditions).
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.allSettled(
        ASSETS.map(url =>
          cache.add(url).catch(() => {
            console.warn('SW: Konnte nicht cachen:', url);
          })
        )
      )
    )
  );
  self.skipWaiting();
});

// Aktivierung: Alten Cache löschen (bei App-Updates)
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Netzwerkanfragen abfangen: erst Cache prüfen, dann Netzwerk
// Netzwerkfehler (z.B. Server offline) werden abgefangen → Fallback auf index.html
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).catch(() =>
        caches.match('./index.html')
      );
    })
  );
});
