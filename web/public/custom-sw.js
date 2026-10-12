// Custom Service Worker logic for Web Push Notifications on lock screen
self.addEventListener('push', function (event) {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'HeyHuman Alert', body: event.data.text() };
    }
  }

  const title = data.title || 'HeyHuman 🚨 Permission Required!';
  const options = {
    body: data.body || 'Your AI agent is waiting for your approval.',
    icon: '/logo.svg',
    badge: '/logo.svg',
    tag: data.tag || 'heyhuman-alert',
    renotify: true,
    requireInteraction: true,
    vibrate: [400, 200, 400, 200, 600],
    data: {
      url: data.url || '/'
    }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
