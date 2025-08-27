/**
 * Service Worker for Masjeed PWA
 * Handles offline caching, background sync, and push notifications
 */

const CACHE_NAME = 'masjeed-pwa-v1';
const STATIC_CACHE_NAME = 'masjeed-static-v1';
const DYNAMIC_CACHE_NAME = 'masjeed-dynamic-v1';
const API_CACHE_NAME = 'masjeed-api-v1';

// Static assets to cache immediately
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/offline.html',
  // Add your main CSS and JS files here
];

// API endpoints to cache
const API_ENDPOINTS = [
  '/api/prayers/today',
  '/api/events',
  '/api/announcements',
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE_NAME).then((cache) => {
        console.log('Service Worker: Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      }),
      // Skip waiting to activate immediately
      self.skipWaiting()
    ])
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');
  
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== STATIC_CACHE_NAME && 
                cacheName !== DYNAMIC_CACHE_NAME && 
                cacheName !== API_CACHE_NAME) {
              console.log('Service Worker: Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      // Take control of all clients
      self.clients.claim()
    ])
  );
});

// Fetch event - handle requests with caching strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Handle API requests (including auth endpoints)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      handleApiRequest(request).catch(error => {
        // For auth endpoints, return the actual network error response
        if (url.pathname.startsWith('/api/auth/')) {
          console.log('Auth endpoint failed, returning network error:', error);
          return new Response(JSON.stringify({
            success: false,
            error: 'Authentication service unavailable',
            offline: false
          }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        // For other API endpoints, re-throw the error
        throw error;
      })
    );
    return;
  }

  // Skip non-GET requests for non-API endpoints
  if (request.method !== 'GET') {
    return;
  }

  // Handle static assets
  if (STATIC_ASSETS.some(asset => url.pathname === asset || url.pathname.endsWith(asset))) {
    event.respondWith(handleStaticAssets(request));
    return;
  }

  // Handle navigation requests
  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }

  // Handle other requests (images, fonts, etc.)
  event.respondWith(handleOtherRequests(request));
});

// Cache-first strategy for static assets
async function handleStaticAssets(request) {
  try {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(STATIC_CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.error('Static asset fetch failed:', error);
    return new Response('Asset not available offline', { status: 503 });
  }
}

// Enhanced API request handling with IndexedDB fallback
async function handleApiRequest(request) {
  const url = new URL(request.url);
  const isWriteOperation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method);
  const isAuthEndpoint = url.pathname.startsWith('/api/auth/');
  
  // For auth endpoints, always try network first and let actual errors propagate
  if (isAuthEndpoint) {
    try {
      const networkResponse = await fetch(request);
      return networkResponse;
    } catch (error) {
      console.log('Auth endpoint network request failed:', error);
      // Let the actual network error propagate for auth endpoints
      // Don't return offline response for auth endpoints
      throw error;
    }
  }
  
  // Handle write operations when offline
  if (isWriteOperation) {
    try {
      const networkResponse = await fetch(request);
      if (networkResponse.ok) {
        return networkResponse;
      }
      throw new Error('Network response not ok');
    } catch (error) {
      console.log('Write operation failed, adding to offline queue:', error);
      
      // Add to offline queue for later sync
      const requestBody = request.method !== 'DELETE' ? await request.clone().text() : null;
      await addToOfflineQueue({
        type: getRequestType(url.pathname),
        url: request.url,
        method: request.method,
        body: requestBody,
        headers: Object.fromEntries(request.headers.entries())
      });
      
      return new Response(JSON.stringify({
        success: false,
        error: 'Request queued for when back online',
        offline: true,
        queued: true
      }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
  
  // Handle read operations with enhanced caching
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      // Cache successful API responses
      const cache = await caches.open(API_CACHE_NAME);
      cache.put(request, networkResponse.clone());
      
      // Also store in IndexedDB for better offline access
      const responseData = await networkResponse.clone().json();
      await storeApiDataInIndexedDB(url.pathname, responseData);
      
      return networkResponse;
    }
    
    throw new Error('Network response not ok');
  } catch (error) {
    console.log('API network request failed, trying fallbacks:', error);
    
    // Try cache first
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      const response = cachedResponse.clone();
      response.headers.set('X-From-Cache', 'true');
      return response;
    }
    
    // Try IndexedDB as final fallback
    const indexedDBData = await getApiDataFromIndexedDB(url.pathname);
    if (indexedDBData) {
      return new Response(JSON.stringify(indexedDBData.data), {
        status: 200,
        headers: { 
          'Content-Type': 'application/json',
          'X-From-IndexedDB': 'true'
        }
      });
    }
    
    // Return appropriate offline response
    return getOfflineResponse(url.pathname);
  }
}

// Helper function to determine request type for offline queue
function getRequestType(pathname) {
  if (pathname.includes('/donations')) return 'donations';
  if (pathname.includes('/events') && pathname.includes('/register')) return 'registrations';
  if (pathname.includes('/announcements')) return 'announcements';
  return 'general';
}

// Store API data in IndexedDB
async function storeApiDataInIndexedDB(pathname, data) {
  try {
    const db = await openIndexedDB();
    let storeName = 'general';
    let id = 'current';
    
    if (pathname.includes('/prayers')) {
      storeName = 'prayerTimes';
    } else if (pathname.includes('/events')) {
      storeName = 'events';
    } else if (pathname.includes('/announcements')) {
      storeName = 'announcements';
    }
    
    if (db.objectStoreNames.contains(storeName)) {
      const transaction = db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      
      const storeData = {
        id,
        data,
        timestamp: Date.now(),
        expiresAt: Date.now() + (60 * 60 * 1000) // 1 hour TTL
      };
      
      store.put(storeData);
    }
  } catch (error) {
    console.error('Error storing API data in IndexedDB:', error);
  }
}

// Get API data from IndexedDB
async function getApiDataFromIndexedDB(pathname) {
  try {
    const db = await openIndexedDB();
    let storeName = 'general';
    
    if (pathname.includes('/prayers')) {
      storeName = 'prayerTimes';
    } else if (pathname.includes('/events')) {
      storeName = 'events';
    } else if (pathname.includes('/announcements')) {
      storeName = 'announcements';
    }
    
    if (!db.objectStoreNames.contains(storeName)) {
      return null;
    }
    
    const transaction = db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    
    return new Promise((resolve, reject) => {
      const request = store.get('current');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const result = request.result;
        if (!result) {
          resolve(null);
          return;
        }
        
        // Check if data has expired
        if (result.expiresAt && Date.now() > result.expiresAt) {
          resolve(null);
          return;
        }
        
        resolve(result);
      };
    });
  } catch (error) {
    console.error('Error getting API data from IndexedDB:', error);
    return null;
  }
}

// Get appropriate offline response based on endpoint
function getOfflineResponse(pathname) {
  // Never return offline response for auth endpoints
  if (pathname.startsWith('/api/auth/')) {
    // This should not be called for auth endpoints, but if it is,
    // return a proper error response
    return new Response(JSON.stringify({
      success: false,
      error: 'Authentication service unavailable'
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  if (pathname.includes('/prayers')) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Prayer times not available offline',
      offline: true,
      data: null
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  if (pathname.includes('/events')) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Events not available offline',
      offline: true,
      data: []
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  if (pathname.includes('/announcements')) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Announcements not available offline',
      offline: true,
      data: []
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  return new Response(JSON.stringify({
    success: false,
    error: 'API not available offline',
    offline: true
  }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' }
  });
}

// Network-first strategy for navigation with offline fallback
async function handleNavigation(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      return networkResponse;
    }
    throw new Error('Network response not ok');
  } catch (error) {
    console.log('Navigation request failed, serving offline page');
    
    // Try to serve cached version of the page
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Serve offline page
    const offlinePage = await caches.match('/offline.html');
    return offlinePage || new Response('Offline', { status: 503 });
  }
}

// Stale-while-revalidate strategy for other requests
async function handleOtherRequests(request) {
  const cache = await caches.open(DYNAMIC_CACHE_NAME);
  const cachedResponse = await cache.match(request);
  
  const fetchPromise = fetch(request).then((networkResponse) => {
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  }).catch(() => {
    // Return cached version if network fails
    return cachedResponse;
  });
  
  // Return cached version immediately if available, otherwise wait for network
  return cachedResponse || fetchPromise;
}

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  console.log('Service Worker: Background sync triggered:', event.tag);
  
  if (event.tag === 'background-sync-donations') {
    event.waitUntil(syncOfflineDonations());
  }
  
  if (event.tag === 'background-sync-registrations') {
    event.waitUntil(syncOfflineRegistrations());
  }
});

// Sync offline donations when back online
async function syncOfflineDonations() {
  try {
    // Get offline donations from IndexedDB or localStorage
    const offlineDonations = await getOfflineData('donations');
    
    for (const donation of offlineDonations) {
      try {
        const response = await fetch('/api/donations', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${donation.token}`
          },
          body: JSON.stringify(donation.data)
        });
        
        if (response.ok) {
          await removeOfflineData('donations', donation.id);
          console.log('Synced offline donation:', donation.id);
        }
      } catch (error) {
        console.error('Failed to sync donation:', error);
      }
    }
  } catch (error) {
    console.error('Background sync failed:', error);
  }
}

// Sync offline event registrations when back online
async function syncOfflineRegistrations() {
  try {
    const offlineRegistrations = await getOfflineData('registrations');
    
    for (const registration of offlineRegistrations) {
      try {
        const response = await fetch(`/api/events/${registration.eventId}/register`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${registration.token}`
          }
        });
        
        if (response.ok) {
          await removeOfflineData('registrations', registration.id);
          console.log('Synced offline registration:', registration.id);
        }
      } catch (error) {
        console.error('Failed to sync registration:', error);
      }
    }
  } catch (error) {
    console.error('Background sync failed:', error);
  }
}

// Push notification handling
self.addEventListener('push', (event) => {
  console.log('Service Worker: Push notification received');
  
  let notificationData = {
    title: 'Masjeed Notification',
    body: 'You have a new notification',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    tag: 'masjeed-notification',
    requireInteraction: false,
    actions: [
      {
        action: 'view',
        title: 'View',
        icon: '/icons/view-icon.png'
      },
      {
        action: 'dismiss',
        title: 'Dismiss',
        icon: '/icons/dismiss-icon.png'
      }
    ]
  };
  
  if (event.data) {
    try {
      const data = event.data.json();
      notificationData = { ...notificationData, ...data };
    } catch (error) {
      console.error('Error parsing push data:', error);
    }
  }
  
  event.waitUntil(
    self.registration.showNotification(notificationData.title, notificationData)
  );
});

// Notification click handling
self.addEventListener('notificationclick', (event) => {
  console.log('Service Worker: Notification clicked');
  
  event.notification.close();
  
  if (event.action === 'view') {
    event.waitUntil(
      clients.openWindow(event.notification.data?.url || '/')
    );
  } else if (event.action === 'dismiss') {
    // Just close the notification
    return;
  } else {
    // Default action - open the app
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then((clientList) => {
        for (const client of clientList) {
          if (client.url === self.location.origin && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow('/');
        }
      })
    );
  }
});

// IndexedDB helper functions for offline data management
async function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('masjeed-offline-db', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      if (!db.objectStoreNames.contains('offlineQueue')) {
        db.createObjectStore('offlineQueue', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('prayerTimes')) {
        db.createObjectStore('prayerTimes', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('events')) {
        db.createObjectStore('events', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('announcements')) {
        db.createObjectStore('announcements', { keyPath: 'id' });
      }
    };
  });
}

async function getOfflineData(type) {
  try {
    const db = await openIndexedDB();
    const transaction = db.transaction(['offlineQueue'], 'readonly');
    const store = transaction.objectStore('offlineQueue');
    const request = store.getAll();
    
    return new Promise((resolve, reject) => {
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const allData = request.result || [];
        const filteredData = allData.filter(item => item.type === type);
        resolve(filteredData);
      };
    });
  } catch (error) {
    console.error('Error getting offline data:', error);
    return [];
  }
}

async function removeOfflineData(type, id) {
  try {
    const db = await openIndexedDB();
    const transaction = db.transaction(['offlineQueue'], 'readwrite');
    const store = transaction.objectStore('offlineQueue');
    
    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        console.log(`Removed offline ${type} data:`, id);
        resolve();
      };
    });
  } catch (error) {
    console.error('Error removing offline data:', error);
  }
}

async function addToOfflineQueue(data) {
  try {
    const db = await openIndexedDB();
    const transaction = db.transaction(['offlineQueue'], 'readwrite');
    const store = transaction.objectStore('offlineQueue');
    
    const queueItem = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ...data,
      timestamp: Date.now(),
      retryCount: 0
    };
    
    return new Promise((resolve, reject) => {
      const request = store.add(queueItem);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(queueItem.id);
    });
  } catch (error) {
    console.error('Error adding to offline queue:', error);
  }
}

// Message handling from main thread
self.addEventListener('message', (event) => {
  console.log('Service Worker: Message received:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_NAME });
  }
});