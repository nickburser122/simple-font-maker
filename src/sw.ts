declare const PRECACHE: string[];
declare const VERSION: string;

const sw = self as unknown as ServiceWorkerGlobalScope;
const NAME = `hfm-${VERSION}`;

sw.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(NAME)
      .then((c) => c.addAll(PRECACHE))
      .then(() => sw.skipWaiting()),
  );
});

sw.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== NAME).map((k) => caches.delete(k))))
      .then(() => sw.clients.claim()),
  );
});

sw.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== sw.location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(
      (hit) =>
        hit ??
        fetch(req).catch(async () => {
          const shell = await caches.match('./index.html');
          return req.mode === 'navigate' && shell ? shell : Response.error();
        }),
    ),
  );
});
