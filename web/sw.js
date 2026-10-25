// Service worker du QG : affiche les notifications système avec boutons d'action et exécute l'action choisie.
// Aucune mise en cache : il ne sert qu'aux notifications.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

async function fenetres() {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true });
}

async function ouvrirSite(data, message) {
  const liste = await fenetres();
  for (const c of liste) {
    if (message) c.postMessage(message);
    if ('focus' in c) return c.focus();
  }
  if (self.clients.openWindow) return self.clients.openWindow(data.url || '/');
  return null;
}

self.addEventListener('notificationclick', (event) => {
  const n = event.notification;
  const data = n.data || {};
  n.close();
  event.waitUntil(
    (async () => {
      const action = event.action && data.actions ? data.actions[event.action] : null;
      if (action && action.route) {
        // En maquette, c'est la page qui simule le serveur : on lui transmet l'action.
        if (data.mock) {
          const liste = await fenetres();
          if (liste.length) {
            liste[0].postMessage({ type: 'qg-action', route: action.route, corps: action.corps || {} });
            return;
          }
        } else {
          try {
            const r = await fetch(action.route, {
              method: 'POST',
              credentials: 'same-origin',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(action.corps || {}),
            });
            if (r.ok) return;
          } catch {
            /* on ouvre le site ci-dessous */
          }
        }
      }
      await ouvrirSite(data, { type: 'qg-ouvrir', id: data.id, action: event.action || null });
    })(),
  );
});
