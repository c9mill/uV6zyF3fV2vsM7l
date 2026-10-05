/* FKBAD PWA service worker. HTML stays network-first so published content remains fresh. */
const VERSION = 'fa86145140df';
const PRECACHE = ["/", "/offline.html", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/section-colors.css?v=cb10bdd69abb", "/performance.css?v=b2d5119d52df", "/refinement.css?v=fb26f474021e", "/styles.css?v=c3c4f6bf19d2", "/experience.css?v=e8e345788ff4", "/app.js?v=163c2aaed96c", "/experience.js?v=7e5fb422b361", "/motion.css?v=3ec109a25c7d", "/motion.js?v=54a70ea33653"];
const STATIC_CACHE = `fkbad-static-${VERSION}`;
const PAGE_CACHE = `fkbad-pages-${VERSION}`;
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => (key.startsWith('fkbad-static-') && key !== STATIC_CACHE) || (key.startsWith('fkbad-pages-') && key !== PAGE_CACHE))
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function sameOrigin(url) {
  return url.origin === self.location.origin;
}

function staticRequest(url) {
  return sameOrigin(url) && (
    /\.(?:css|js|webp|svg|jpe?g|png|woff2?)$/i.test(url.pathname) ||
    url.pathname === '/manifest.webmanifest' || url.pathname === OFFLINE_URL
  );
}

async function networkFirstPage(request) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') await cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request)) || (await caches.match(OFFLINE_URL));
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (!sameOrigin(url) || url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin/') || url.pathname === '/search-index.json' || url.pathname === '/_worker.js') return;
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstPage(request));
    return;
  }
  if (staticRequest(url)) {
    event.respondWith(
      caches.match(request).then(cached => cached || fetch(request).then(response => {
        if (response.ok) caches.open(STATIC_CACHE).then(cache => cache.put(request, response.clone()));
        return response;
      }).catch(() => caches.match(OFFLINE_URL)))
    );
  }
});
