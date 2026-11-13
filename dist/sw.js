/* FKBAD PWA service worker. HTML stays network-first so published content remains fresh. */
const VERSION = '844aec9ace55';
const PRECACHE = ["/", "/offline.html", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/section-colors.css?v=cb10bdd69abb", "/performance.css?v=e584c7af1dc1", "/refinement.css?v=29a344599963", "/styles.css?v=c3c4f6bf19d2", "/experience.css?v=dcccf16e1b54", "/app.js?v=5b0a34e99e40", "/experience.js?v=c3795a012256", "/motion.css?v=3ec109a25c7d", "/motion.js?v=3fc52466b6f3", "/kinetic.css?v=882afb7ab4b0", "/forest.css?v=0a80deab182d", "/polish.css?v=cd71185ef1b1", "/kinetic.js?v=5239414b9d6d", "/holographic.js?v=7bf89e428a51"];
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
