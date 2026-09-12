const CACHE_NAME = 'ladders-fangs-v14';
const ASSETS_TO_CACHE = [
    './index.html',
    './manifest.json',
    'https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;600;700;800&family=Nunito+Sans:wght@400;600;700;800&display=swap',
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

// Install: Cache core assets and immediately skip waiting
self.addEventListener('install', function (event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function (cache) {
            return cache.addAll(ASSETS_TO_CACHE);
        }).then(function () {
            return self.skipWaiting();
        })
    );
});

// Activate: Purge old cache buckets and claim active clients instantly
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

// Fetch: Network-first strategy for app assets, bypassing Supabase API requests
self.addEventListener('fetch', function (event) {
    var url = event.request.url;

    // Do not cache Supabase API calls so live matchmaking and leaderboards always fetch fresh data
    if (url.includes('supabase.co')) {
        return;
    }

    event.respondWith(
        fetch(event.request).then(function (networkResponse) {
            return caches.open(CACHE_NAME).then(function (cache) {
                if (event.request.method === 'GET' && url.startsWith('http')) {
                    cache.put(event.request, networkResponse.clone());
                }
                return networkResponse;
            });
        }).catch(function () {
            return caches.match(event.request);
        })
    );
});