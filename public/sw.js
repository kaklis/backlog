// Offline support: the app shell is cached on first load and served from cache afterwards (updating in the background).
// Bump VERSION to drop old caches. All data lives in localStorage, so nothing else needs to work offline.
const VERSION = 'backlog-v1'
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true })
      const network = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone())
          return res
        })
        .catch(() => undefined)
      if (cached) {
        e.waitUntil(network) // refresh in the background
        return cached
      }
      return (await network) ?? (req.mode === 'navigate' ? cache.match('./index.html') : Response.error())
    }),
  )
})
