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
    icon: '/logo.png',
    badge: '/icon.png',
    tag: data.tag || `heyhuman-${Date.now()}`,
    renotify: true,
    requireInteraction: true,
    vibrate: [400, 200, 400, 200, 600],
    data: {
      url: data.url || '/',
      id: data.tag || '',
      room: data.room || ''
    },
    actions: [
      { action: 'approve', title: '✅ Approve (y)' },
      { action: 'reject', title: '❌ Reject (n)' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const action = event.action;
  const notifData = event.notification.data || {};
  const targetUrl = notifData.url || '/';

  // Handle direct lock screen / notification card action buttons
  if (action === 'approve' || action === 'reject') {
    const roomParam = notifData.room || 'default';
    const actionPayload = {
      action: action,
      id: notifData.id,
      input: action === 'approve' ? 'y' : 'n'
    };

    event.waitUntil(
      fetch(`/api/alert?room=${encodeURIComponent(roomParam)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(actionPayload)
      })
    );
    return;
  }

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
