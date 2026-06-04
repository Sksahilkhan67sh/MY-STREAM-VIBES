// Stream Scheduler Service Worker
// Handles push notifications for scheduled streams

const CACHE_NAME = 'streamvault-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// Handle push notifications
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: 'Stream Notification', body: event.data.text(), roomId: null };
  }

  const options = {
    body: data.body || 'Your stream is starting soon!',
    icon: '/icon.png',
    badge: '/favicon.ico',
    tag: `stream-${data.roomId || 'general'}`,
    requireInteraction: true,
    vibrate: [200, 100, 200],
    data: {
      url: data.roomId ? `/s/${data.roomId}` : '/',
      roomId: data.roomId,
    },
    actions: [
      { action: 'watch', title: '▶ Watch Now' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Stream Starting!', options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const url = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});

// Handle scheduled notification messages from main thread
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SCHEDULE_NOTIFICATION') {
    const { title, body, roomId, delay } = event.data;
    setTimeout(() => {
      self.registration.showNotification(title, {
        body,
        icon: '/icon.png',
        badge: '/favicon.ico',
        tag: `stream-${roomId}`,
        requireInteraction: true,
        vibrate: [200, 100, 200],
        data: { url: `/s/${roomId}`, roomId },
        actions: [
          { action: 'watch', title: '▶ Watch Now' },
          { action: 'dismiss', title: 'Dismiss' },
        ],
      });
    }, delay);
  }
});
