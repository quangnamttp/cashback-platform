// Minimal service worker — its only job is to exist and be controlling
// the page, which Chrome/Edge require before they'll ever fire
// beforeinstallprompt. It intentionally does NOT cache anything: every
// page here reads live data straight from Firestore, so caching responses
// would risk serving a stale build or stale data after a deploy. Fetch
// events are left unhandled (no respondWith) so every request just goes
// to the network as normal.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
