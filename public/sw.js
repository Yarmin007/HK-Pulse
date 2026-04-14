// public/sw.js

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

// --- 1. YOUR EXISTING SERVER PUSH LOGIC ---
self.addEventListener('push', function (event) {
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      vibrate: [200, 100, 200],
      data: {
        url: data.url || '/requests'
      }
    };
    event.waitUntil(self.registration.showNotification(data.title, options));
  }
});

// --- 2. NEW LOCAL BACKGROUND TIMER LOGIC FOR CLEANING TASKS ---
const activeTimers = {};

self.addEventListener('message', (event) => {
    if (!event.data) return;

    if (event.data.type === 'SCHEDULE_TIMER') {
        const { villa, delay } = event.data;
        
        // Clear any existing timer for this villa just in case
        if (activeTimers[villa]) clearTimeout(activeTimers[villa]);

        // Start a strict background timer
        activeTimers[villa] = setTimeout(() => {
            const title = "⏰ Service Time Alert";
            const options = {
                body: `Villa ${villa} timer has been running. Did you forget to finish it?`,
                icon: '/icon-192.png',
                badge: '/icon-192.png',
                vibrate: [500, 250, 500, 250, 500, 250, 500], // Aggressive vibration
                data: { url: '/my-tasks' },
                requireInteraction: true
            };
            
            self.registration.showNotification(title, options);
            delete activeTimers[villa];
        }, delay);
        
    } else if (event.data.type === 'CLEAR_TIMER') {
        const { villa } = event.data;
        if (activeTimers[villa]) {
            clearTimeout(activeTimers[villa]);
            delete activeTimers[villa];
        }
    }
});

// --- 3. SMART NOTIFICATION CLICK ROUTING ---
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
        // Check if the app is already open in a tab
        for (let i = 0; i < windowClients.length; i++) {
            let client = windowClients[i];
            if (client.url.includes(urlToOpen) && 'focus' in client) {
                return client.focus();
            }
        }
        // If not, open it
        if (clients.openWindow) {
            return clients.openWindow(urlToOpen);
        }
    })
  );
});