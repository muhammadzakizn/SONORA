// ========================================
// SONORA Service Worker v2.2
// Production-Ready PWA Caching Strategy
// ========================================

const CACHE_NAME = 'sonora-v2.2';
const RUNTIME_CACHE = 'sonora-runtime-v2.2';

// Assets to cache on install
const ASSETS = [
    '/',
    '/index.html',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css',
    'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.0/font/bootstrap-icons.css',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js',
    'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap'
];

// ===== INSTALL EVENT =====
self.addEventListener('install', (event) => {
    console.log('[SW] Installing Service Worker v2.2...');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Caching assets...');
                return cache.addAll(ASSETS).catch((err) => {
                    console.error('[SW] Cache addAll failed:', err);
                    // Continue even if some assets fail
                    return Promise.resolve();
                });
            })
            .then(() => {
                console.log('[SW] Assets cached successfully');
                return self.skipWaiting();
            })
    );
});

// ===== ACTIVATE EVENT =====
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating Service Worker v2.2...');
    
    event.waitUntil(
        caches.keys()
            .then((keys) => {
                // Delete old caches
                return Promise.all(
                    keys.filter(key => key !== CACHE_NAME && key !== RUNTIME_CACHE)
                        .map(key => {
                            console.log('[SW] Deleting old cache:', key);
                            return caches.delete(key);
                        })
                );
            })
            .then(() => {
                console.log('[SW] Service Worker activated');
                return self.clients.claim();
            })
    );
});

// ===== FETCH EVENT =====
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    
    // Skip non-GET requests
    if (request.method !== 'GET') return;
    
    // Skip chrome-extension and other non-http requests
    if (!url.protocol.startsWith('http')) return;
    
    // Skip IndexedDB requests
    if (url.pathname.includes('indexeddb')) return;
    
    // Strategy: Network First with Cache Fallback
    // Good for dynamic content and API calls
    if (url.pathname.includes('/api/') || url.searchParams.has('nocache')) {
        event.respondWith(networkFirst(request));
        return;
    }
    
    // Strategy: Cache First with Network Fallback
    // Good for static assets (CSS, JS, fonts, images)
    if (
        url.pathname.endsWith('.css') ||
        url.pathname.endsWith('.js') ||
        url.pathname.endsWith('.woff2') ||
        url.pathname.endsWith('.woff') ||
        url.pathname.includes('fonts.googleapis.com') ||
        url.pathname.includes('fonts.gstatic.com') ||
        url.pathname.includes('cdn.jsdelivr.net')
    ) {
        event.respondWith(cacheFirst(request));
        return;
    }
    
    // Strategy: Stale While Revalidate
    // Good for images and media that can be slightly outdated
    if (
        url.pathname.match(/\.(jpg|jpeg|png|gif|svg|webp|mp3|wav|ogg)$/i) ||
        url.hostname.includes('unsplash.com')
    ) {
        event.respondWith(staleWhileRevalidate(request));
        return;
    }
    
    // Default: Network First
    event.respondWith(networkFirst(request));
});

// ===== CACHING STRATEGIES =====

/**
 * Network First Strategy
 * Try network, fall back to cache if offline
 */
async function networkFirst(request) {
    try {
        const networkResponse = await fetch(request);
        
        // Cache successful responses
        if (networkResponse && networkResponse.status === 200) {
            const cache = await caches.open(RUNTIME_CACHE);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        console.log('[SW] Network failed, trying cache:', request.url);
        
        // Try cache
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        
        // Return offline page if available
        if (request.mode === 'navigate') {
            const offlineResponse = await caches.match('/');
            if (offlineResponse) return offlineResponse;
        }
        
        // Return error response
        return new Response('Offline - No cached version available', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({
                'Content-Type': 'text/plain'
            })
        });
    }
}

/**
 * Cache First Strategy
 * Use cache if available, fall back to network
 */
async function cacheFirst(request) {
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
        return cachedResponse;
    }
    
    try {
        const networkResponse = await fetch(request);
        
        if (networkResponse && networkResponse.status === 200) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        console.error('[SW] Cache First failed:', error);
        return new Response('Resource not available', {
            status: 404,
            statusText: 'Not Found'
        });
    }
}

/**
 * Stale While Revalidate Strategy
 * Return cache immediately, update cache in background
 */
async function staleWhileRevalidate(request) {
    const cachedResponse = await caches.match(request);
    
    const fetchPromise = fetch(request)
        .then(networkResponse => {
            if (networkResponse && networkResponse.status === 200) {
                const cache = caches.open(RUNTIME_CACHE);
                cache.then(c => c.put(request, networkResponse.clone()));
            }
            return networkResponse;
        })
        .catch(err => {
            console.warn('[SW] Stale While Revalidate fetch failed:', err);
            return null;
        });
    
    return cachedResponse || fetchPromise;
}

// ===== MESSAGE HANDLER =====
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    if (event.data && event.data.type === 'CLEAR_CACHE') {
        event.waitUntil(
            caches.keys().then(keys => {
                return Promise.all(keys.map(key => caches.delete(key)));
            }).then(() => {
                console.log('[SW] All caches cleared');
                event.ports[0].postMessage({ success: true });
            })
        );
    }
    
    if (event.data && event.data.type === 'GET_VERSION') {
        event.ports[0].postMessage({ version: CACHE_NAME });
    }
});

// ===== BACKGROUND SYNC (Optional) =====
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-data') {
        event.waitUntil(syncData());
    }
});

async function syncData() {
    console.log('[SW] Background sync triggered');
    // Implement your sync logic here
}

// ===== PUSH NOTIFICATIONS (Optional) =====
self.addEventListener('push', (event) => {
    const options = {
        body: event.data ? event.data.text() : 'New notification from SONORA',
        icon: '/icon-192.png',
        badge: '/badge-72.png',
        vibrate: [100, 50, 100],
        data: {
            dateOfArrival: Date.now(),
            primaryKey: 1
        }
    };
    
    event.waitUntil(
        self.registration.showNotification('SONORA', options)
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    
    event.waitUntil(
        clients.openWindow('/')
    );
});

console.log('[SW] Service Worker v2.2 loaded successfully');
