// Service Worker: App-Dateien offline verfügbar machen.
// Strategie: Cache zuerst, im Hintergrund aktualisieren (stale-while-revalidate).
// Bei jeder Änderung an den App-Dateien VERSION erhöhen.

const VERSION = 'v2.9.0';
const CACHE = `wartung-${VERSION}`;
const FONT_CACHE = 'wartung-fonts';

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './icon-192-v2.png',
  './icon-512-v2.png',
  './css/basis.css',
  './css/bericht.css',
  './css/druck.css',
  './css/komponenten.css',
  './css/layout.css',
  './css/screens.css',
  './css/tokens.css',
  './js/app.js',
  './js/core/bild.js',
  './js/core/db.js',
  './js/core/icons.js',
  './js/core/migration.js',
  './js/core/model.js',
  './js/core/router.js',
  './js/core/shell.js',
  './js/core/thema.js',
  './js/core/ui.js',
  './js/core/util.js',
  './js/io/austausch.js',
  './js/io/altformat.js', // ALTFORMAT
  './js/io/bericht.js',
  './js/io/pdf.js',
  './js/screens/anlage.js',
  './js/screens/anlagen.js',
  './js/screens/bericht.js',
  './js/screens/daten.js',
  './js/screens/erinnerung.js',
  './js/screens/protokoll.js',
  './js/screens/protokolle.js',
  './js/screens/pruefplan-editor.js',
  './js/screens/stammdaten-editor.js',
  './js/screens/unterschrift.js',
  './js/screens/vorlagen.js',
  './js/sektionen/aufgaben.js',
  './js/sektionen/batterien.js',
  './js/sektionen/checkliste.js',
  './js/sektionen/felder.js',
  './js/sektionen/helfer.js',
  './js/sektionen/messreihe.js',
  './js/sektionen/pdfhelfer.js',
  './js/sektionen/registry.js',
  './js/sektionen/tabelle.js',
  './js/vorlagen/builtin.js',
  './js/vorlagen/vorlagen.js',
  './vendor/pdfmake/pdfmake.min.js',
  './vendor/pdfmake/vfs_fonts.js',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache =>
      Promise.allSettled(ASSETS.map(url => cache.add(new Request(url, { cache: 'reload' })))))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== FONT_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Google Fonts: einmal laden, danach aus dem Cache
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(FONT_CACHE).then(async cache => {
        const treffer = await cache.match(req);
        if (treffer) return treffer;
        const antwort = await fetch(req);
        if (antwort.ok || antwort.type === 'opaque') cache.put(req, antwort.clone());
        return antwort;
      }).catch(() => new Response('', { status: 504 }))
    );
    return;
  }

  if (url.origin !== location.origin) return;

  event.respondWith(
    caches.open(CACHE).then(async cache => {
      const treffer = await cache.match(req, { ignoreSearch: true });
      const netz = fetch(req).then(antwort => {
        if (antwort.ok) cache.put(req, antwort.clone());
        return antwort;
      }).catch(() => null);
      if (treffer) {
        event.waitUntil(netz);
        return treffer;
      }
      const antwort = await netz;
      if (antwort) return antwort;
      if (req.mode === 'navigate') return cache.match('./index.html');
      return new Response('Offline', { status: 503 });
    })
  );
});
