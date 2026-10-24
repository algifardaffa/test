/* Tancredi Clan - Testaments Visualizer: offline support.
   Strategy: network first, cache as fallback. Online you always get fresh data
   (the Google Sheet CSV included); offline you get the last copy that was loaded.
   Bump CACHE when you want every device to drop its old copy. */
const CACHE = 'tancredi-v1';
const PRECACHE = ['./', 'assets/logo.png', 'manifest.webmanifest'];
const NETWORK_WAIT_MS = 6000;   // slow network: show the cached copy while the fresh one finishes

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => Promise.all(PRECACHE.map(url => cache.add(url).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || !/^https?:/.test(req.url)) return;
  event.respondWith(networkFirst(req));
});

function fromCache(req) {
  return caches.match(req)
    .then(hit => hit || (req.mode === 'navigate' ? caches.match('./') : undefined));
}

function networkFirst(req) {
  return new Promise(resolve => {
    let settled = false;
    const settle = res => { if (!settled && res) { settled = true; resolve(res); } };
    const timer = setTimeout(() => { fromCache(req).then(settle); }, NETWORK_WAIT_MS);

    fetch(req).then(res => {
      clearTimeout(timer);
      if (res && (res.status === 200 || res.type === 'opaque')) {
        const copy = res.clone();
        caches.open(CACHE).then(cache => cache.put(req, copy)).catch(() => {});
      }
      if (settled) return;            // the cached copy already went out; the cache is now refreshed
      settled = true; resolve(res);
    }).catch(() => {
      clearTimeout(timer);
      fromCache(req).then(hit => { if (!settled) { settled = true; resolve(hit || Response.error()); } });
    });
  });
}
