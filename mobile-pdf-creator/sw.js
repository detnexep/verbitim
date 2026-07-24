const CACHE_NAME = 'pdf-creator-v2';

// All paths are relative to this file's own location, so this works
// correctly whether the app is served from a domain root or from a
// GitHub Pages project path like /verbitim/. Do NOT use an absolute
// '/' here — on a project-page deployment that resolves to the wrong
// URL, cache.addAll() fails on it, and since addAll is all-or-nothing
// the whole service worker install breaks silently.
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './css/style.css',
    './js/app.js',
    './js/pdf-engine.js',
    './js/file-handler.js',
    './js/image-processor.js',
    './manifest.json'
];

// Install service worker
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(ASSETS_TO_CACHE))
            .then(() => self.skipWaiting())
            .catch((err) => console.error('SW install/cache failed:', err))
    );
});

// Activate service worker
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch strategy: Cache first, then network
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                if (cachedResponse) {
                    return cachedResponse;
                }

                return fetch(event.request)
                    .then((response) => {
                        // Cache successful responses
                        if (response && response.status === 200) {
                            const responseClone = response.clone();
                            caches.open(CACHE_NAME)
                                .then((cache) => cache.put(event.request, responseClone));
                        }
                        return response;
                    })
                    .catch(() => cachedResponse);
            })
    );
});
