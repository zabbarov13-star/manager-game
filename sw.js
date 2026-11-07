const scope = new URL(self.registration.scope);
const prefix = 'manager-pages:' + scope.pathname + ':';
const cacheName = prefix + '3d2f33b973cad9f2';
const entry = new URL('index.html', scope).href;
const assets = ['index.html', 'manifest.webmanifest', 'manager-icon.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache =>
    cache.addAll(assets.map(path => new Request(new URL(path, scope), { cache: 'reload' })))
  ).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith(prefix) && key !== cacheName)
    .map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== scope.origin) return;
  if (request.mode === 'navigate' && (url.pathname === scope.pathname || url.pathname === new URL(entry).pathname)) {
    event.respondWith(fetch(request).catch(async () => {
      const cached = await (await caches.open(cacheName)).match(entry);
      return cached ?? Response.error();
    }));
  } else if (assets.slice(1).some(path => url.href === new URL(path, scope).href)) {
    event.respondWith(fetch(request).catch(async () => {
      const cached = await (await caches.open(cacheName)).match(request);
      return cached ?? Response.error();
    }));
  }
});
