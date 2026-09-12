const CACHE_NAME = 'ladders-fangs-v1';
const ASSETS_TO_CACHE = [
    './index.html',
    './manifest.json',
    'https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;600;700;800&family=Nunito+Sans:wght@400;600;700;800&display=swap',
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

// Install Event: Cache essential assets
self.addEventListener('install', function (event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function (cache) {
            return cache.addAll(ASSETS_TO_CACHE);
        }).then(function () {
            return self.skipWaiting();
        })
    );
});

// Activate Event: Clean up old caches
self.addEventListener('activate', function (event) {
    event.waitUntil(
        caches.keys().then(function (keys) {
            return Promise.all(
                keys.map(function (key) {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        }).then(function () {
            return self.clients.claim();
        })
    );
});

// Fetch Event: Serve from cache, fallback to network
self.addEventListener('fetch', function (event) {
    event.respondWith(
        caches.match(event.request).then(function (cachedResponse) {
            return cachedResponse || fetch(event.request).catch(function () {
                // Fallback offline handling can go here if needed
            });
        })
    );
});