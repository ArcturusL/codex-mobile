// Retire existing app-shell installations. New clients do not register a worker.
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter((key) => key.startsWith('codexweb-shell-')).map((key) => caches.delete(key)))
    await self.clients.claim()
    await self.registration.unregister()
  })())
})
