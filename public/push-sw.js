// Web-Push für Alarme: wird vom generierten Service Worker per importScripts geladen.
self.addEventListener('push', (event) => {
  let msg = { title: 'Stockdeck', body: '', url: '/' }
  try {
    msg = { ...msg, ...event.data.json() }
  } catch {
    if (event.data) msg.body = event.data.text()
  }
  event.waitUntil(
    self.registration.showNotification(msg.title, {
      body: msg.body,
      tag: msg.tag,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: msg.url },
    }),
  )
})

// Klick öffnet die Detailseite: offenes Fenster wiederverwenden, sonst neues
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const win = wins.find((w) => w.url.startsWith(self.location.origin))
      if (win) return win.navigate(url).then((w) => (w || win).focus())
      return self.clients.openWindow(url)
    }),
  )
})
