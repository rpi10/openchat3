// sw.js

// Cache static assets
const CACHE_NAME = 'openchat-cache-v1';
const urlsToCache = [
  '/',
  '/styles.css',
  '/script.js',
  '/pngegg.png',
  '/microphone.svg',
  '/icons8-attachment-50.png',
  '/ring-tone.mp3'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response
        if (response) {
          return response;
        }
        return fetch(event.request);
      })
  );
});

// Handle push notifications
self.addEventListener('push', event => {
  try {
    let data = { title: 'New Message', message: 'You have a new message' };
    
    // Try to parse data from the push event
    if (event.data) {
      try {
        data = event.data.json();
      } catch (e) {
        // If not JSON, try to get as text
        const text = event.data.text();
        data = { title: 'New Message', message: text };
      }
    }
    
    // Show the notification
    const options = {
      body: data.message || data.body || 'You have a new message',
      icon: '/pngegg.png',
      badge: '/pngegg.png',
      tag: data.tag || 'message',
      vibrate: [200, 100, 200],
      data: {
        url: data.url || '/'
      },
      actions: [
        {
          action: 'view',
          title: 'View'
        }
      ]
    };

    event.waitUntil(
      self.registration.showNotification(data.title || 'New Message', options)
    );
  } catch (error) {
    console.error('Error in push handler:', error);
    // Fallback notification
    event.waitUntil(
      self.registration.showNotification('New Message', {
        body: 'You have a new message',
        icon: '/pngegg.png'
      })
    );
  }
});

// Handle notification click
self.addEventListener('notificationclick', event => {
  event.notification.close();

  // Handle action click
  if (event.action === 'view' && event.notification.data && event.notification.data.url) {
    clients.openWindow(event.notification.data.url);
    return;
  }

  // Default action
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        if (clientList.length > 0) {
          // If there's at least one client, focus it
          return clientList[0].focus();
        }
        // Otherwise open a new window
        return clients.openWindow('/');
      })
  );
});
