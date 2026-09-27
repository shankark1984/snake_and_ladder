/* ============================================================
   Ladders & Fangs — Advanced Service Worker (hardened)
   ============================================================ */

const SW_VERSION = 'v17';
const CACHE_PREFIX = 'ladders-fangs-';
const STATIC_CACHE = `${CACHE_PREFIX}static-${SW_VERSION}`;
const RUNTIME_CACHE = `${CACHE_PREFIX}runtime-${SW_VERSION}`;
const FONT_CACHE = `${CACHE_PREFIX}fonts-${SW_VERSION}`;
const CDN_CACHE = `${CACHE_PREFIX}cdn-${SW_VERSION}`;
const OFFLINE_URL = './offline.html';

const APP_SHELL = [
    './index.html',
    './manifest.json'
];

const CDN_ASSETS = [
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

const FONT_ASSETS = [
    'https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;600;700;800&family=Nunito+Sans:wght@400;600;700;800&display=swap'
];

const OFFLINE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0b1f21">
<title>Offline — Ladders & Fangs</title>
<style>
  :root { color-scheme: dark; }
  html, body { height: 100%; margin: 0; }
  body {
    display: flex; align-items: center; justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background:
      radial-gradient(circle at 20% 10%, #1f4245 0%, transparent 55%),
      radial-gradient(circle at 85% 90%, #1a3638 0%, transparent 55%),
      #0b1f21;
    color: #fcf7ec;
    padding: 24px;
    text-align: center;
  }
  .box {
    max-width: 380px;
    padding: 32px 26px;
    border-radius: 20px;
    background: rgba(252, 247, 236, .06);
    border: 1px solid rgba(252, 247, 236, .18);
    backdrop-filter: blur(12px);
  }
  h1 { font-size: 24px; margin: 0 0 8px; letter-spacing: .3px; }
  p { color: #a9c9c6; line-height: 1.55; font-size: 14px; margin: 0 0 20px; }
  button {
    background: linear-gradient(180deg, #ffc95c, #e0a032 55%, #d49220);
    color: #fff; border: none; padding: 12px 24px; border-radius: 12px;
    font-weight: 700; font-size: 14px; cursor: pointer; letter-spacing: .3px;
    box-shadow: 0 4px 0 #a06a10;
  }
  button:active { transform: translateY(3px); box-shadow: 0 1px 0 #a06a10; }
  .icon { font-size: 48px; margin-bottom: 12px; }
</style>
</head>
<body>
  <div class="box">
    <div class="icon">🎲</div>
    <h1>You're offline</h1>
    <p>Ladders &amp; Fangs can't reach the network right now. Reconnect to play online battles and sync the leaderboard.</p>
    <button onclick="location.reload()">Try again</button>
  </div>
</body>
</html>`;

/* ------------------------------------------------------------
   Small helper: only http(s) responses are cacheable.
   Silently no-ops on anything else.
   ------------------------------------------------------------ */
function safePut(cacheName, request, response) {
    if (!response) return Promise.resolve(false);
    if (response.status !== 200) return Promise.resolve(false);
    if (response.type === 'opaque' && request.method !== 'GET') return Promise.resolve(false);
    return caches.open(cacheName).then((cache) => {
        try {
            return cache.put(request, response).then(() => true).catch(() => false);
        } catch (e) {
            return false;
        }
    });
}

/* ------------------------------------------------------------
   INSTALL
   ------------------------------------------------------------ */
self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const staticCache = await caches.open(STATIC_CACHE);
        const cdnCache = await caches.open(CDN_CACHE);
        const fontCache = await caches.open(FONT_CACHE);

        const results = await Promise.allSettled([
            ...APP_SHELL.map((url) => staticCache.add(new Request(url, { cache: 'reload' }))),
            ...CDN_ASSETS.map((url) => cdnCache.add(new Request(url, { mode: 'cors' }))),
            ...FONT_ASSETS.map((url) => fontCache.add(new Request(url, { mode: 'cors' })))
        ]);

        results.forEach((r, i) => {
            if (r.status === 'rejected') {
                console.warn('[SW] Precache failed for asset #' + i + ':', r.reason);
            }
        });

        try {
            const offlineRes = new Response(OFFLINE_HTML, {
                headers: { 'Content-Type': 'text/html; charset=utf-8' }
            });
            await staticCache.put(OFFLINE_URL, offlineRes);
        } catch (e) {
            console.warn('[SW] Could not cache offline page:', e);
        }

        await self.skipWaiting();
    })());
});

/* ------------------------------------------------------------
   ACTIVATE
   ------------------------------------------------------------ */
self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(
            keys
                .filter((k) => k.startsWith(CACHE_PREFIX) && !k.endsWith(SW_VERSION))
                .map((k) => caches.delete(k))
        );

        if (self.registration.navigationPreload) {
            try { await self.registration.navigationPreload.enable(); } catch (e) { /* noop */ }
        }

        await self.clients.claim();
        broadcastToClients({ type: 'SW_ACTIVATED', version: SW_VERSION });
    })());
});

/* ------------------------------------------------------------
   MESSAGE
   ------------------------------------------------------------ */
self.addEventListener('message', (event) => {
    const data = event.data || {};
    if (data.type === 'SKIP_WAITING') self.skipWaiting();
    if (data.type === 'CHECK_VERSION' && event.source) {
        event.source.postMessage({ type: 'SW_VERSION', version: SW_VERSION });
    }
    if (data.type === 'CLEAR_CACHE') {
        event.waitUntil(
            caches.keys().then((keys) =>
                Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX)).map((k) => caches.delete(k)))
            )
        );
    }
    if (data.type === 'SYNC_NOW') {
        event.waitUntil(doBackgroundSync());
    }
});

/* ------------------------------------------------------------
   FETCH — hardened against non-HTTP schemes
   ------------------------------------------------------------ */
self.addEventListener('fetch', (event) => {
    const req = event.request;

    // 1) Only GET requests
    if (req.method !== 'GET') return;

    // 2) Parse URL safely
    let url;
    try { url = new URL(req.url); } catch (e) { return; }

    // 3) HARD STOP: skip anything that isn't http(s).
    //    This is what fixes the chrome-extension:// error.
    //    It also skips data:, blob:, file:, ws:, wss:, etc.
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

    // 4) Bypass Supabase realtime + API
    if (url.hostname.includes('supabase.co')) return;
    if (url.hostname.includes('supabase.in')) return;

    // 5) Route by resource type
    if (req.mode === 'navigate') {
        event.respondWith(handleNavigate(event));
        return;
    }

    if (url.hostname === 'fonts.googleapis.com') {
        event.respondWith(staleWhileRevalidate(event, FONT_CACHE));
        return;
    }
    if (url.hostname === 'fonts.gstatic.com') {
        event.respondWith(cacheFirst(event, FONT_CACHE));
        return;
    }
    if (url.hostname.includes('cdn.jsdelivr.net') ||
        url.hostname.includes('unpkg.com') ||
        url.hostname.includes('cdnjs.cloudflare.com')) {
        event.respondWith(cacheFirst(event, CDN_CACHE));
        return;
    }
    if (url.origin === self.location.origin) {
        event.respondWith(staleWhileRevalidate(event, STATIC_CACHE));
        return;
    }

    event.respondWith(networkFirst(event, RUNTIME_CACHE));
});

/* ------------------------------------------------------------
   STRATEGIES — every cache.put goes through safePut()
   ------------------------------------------------------------ */
async function handleNavigate(event) {
    const req = event.request;
    try {
        const preload = event.preloadResponse ? await event.preloadResponse : null;
        const response = preload || await fetch(req);

        if (response && response.status === 200) {
            // Fire and forget — never block the response on cache
            safePut(STATIC_CACHE, req, response.clone());
        }
        return response;
    } catch (err) {
        const cached = await caches.match(req);
        if (cached) return cached;

        const shell = await caches.match('./index.html');
        if (shell) return shell;

        const offline = await caches.match(OFFLINE_URL);
        return offline || new Response('Offline', {
            status: 503,
            headers: { 'Content-Type': 'text/plain' }
        });
    }
}

async function cacheFirst(event, cacheName) {
    const req = event.request;
    const cache = await caches.open(cacheName);
    const cached = await cache.match(req);

    if (cached) {
        fetch(req).then((fresh) => safePut(cacheName, req, fresh)).catch(() => { });
        return cached;
    }

    try {
        const fresh = await fetch(req);
        safePut(cacheName, req, fresh.clone());
        return fresh;
    } catch (err) {
        return cached || new Response('Offline', { status: 503 });
    }
}

async function networkFirst(event, cacheName) {
    const req = event.request;
    try {
        const fresh = await fetch(req);
        // Never await — and never throw — on cache write
        safePut(cacheName, req, fresh.clone()).catch(() => { });
        return fresh;
    } catch (err) {
        const cached = await caches.match(req);
        return cached || new Response('Offline', { status: 503 });
    }
}

async function staleWhileRevalidate(event, cacheName) {
    const req = event.request;
    const cache = await caches.open(cacheName);
    const cached = await cache.match(req);

    const networkPromise = fetch(req).then((fresh) => {
        safePut(cacheName, req, fresh.clone()).catch(() => { });
        return fresh;
    }).catch(() => cached || new Response('Offline', { status: 503 }));

    return cached || networkPromise;
}

/* ------------------------------------------------------------
   BACKGROUND / PERIODIC SYNC
   ------------------------------------------------------------ */
self.addEventListener('sync', (event) => {
    if (event.tag === 'ladders-fangs-sync') event.waitUntil(doBackgroundSync());
});

async function doBackgroundSync() {
    broadcastToClients({ type: 'SYNC_COMPLETE', at: Date.now() });
}

self.addEventListener('periodicsync', (event) => {
    if (event.tag === 'ladders-fangs-refresh') event.waitUntil(refreshAppShell());
});

async function refreshAppShell() {
    const cache = await caches.open(STATIC_CACHE);
    await Promise.allSettled(APP_SHELL.map(async (url) => {
        try {
            const res = await fetch(url, { cache: 'no-cache' });
            if (res && res.status === 200) await cache.put(url, res);
        } catch (e) { /* offline: keep old */ }
    }));
}

/* ------------------------------------------------------------
   PUSH
   ------------------------------------------------------------ */
self.addEventListener('push', (event) => {
    let payload = { title: 'Ladders & Fangs', body: 'Your turn!' };
    try { payload = event.data ? event.data.json() : payload; } catch (e) { /* noop */ }

    event.waitUntil(
        self.registration.showNotification(payload.title, {
            body: payload.body,
            icon: './icons/icon-192.png',
            badge: './icons/icon-192.png',
            tag: payload.tag || 'ladders-fangs',
            data: payload.data || {}
        })
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
            for (const c of list) if ('focus' in c) return c.focus();
            if (self.clients.openWindow) return self.clients.openWindow('./');
        })
    );
});

/* ------------------------------------------------------------
   HELPERS
   ------------------------------------------------------------ */
function broadcastToClients(msg) {
    self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then((clients) => {
        clients.forEach((c) => c.postMessage(msg));
    });
}