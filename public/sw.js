/* Fitwell Admin service worker.
 *
 * Push-only on purpose: it handles Web Push display + click routing but does
 * NOT cache responses. The portal is authenticated and data-heavy — caching
 * pages would risk serving one user's data to another or showing stale orders.
 * The win we want from "installable" is the home-screen app + push, not offline.
 */

// Activate immediately so push works on first install without a reload.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// A push arrived. Payload is JSON: { title, body, url, tag }.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // Non-JSON payload — fall back to raw text as the body.
    data = { body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Fitwell Portal";
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    // tag collapses duplicate alerts for the same thing (e.g. one PO).
    tag: data.tag || undefined,
    data: { url: data.url || "/dashboard" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification tapped — focus an existing portal tab if one is open, else open
// the deep-link URL in a new one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/dashboard";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          // Same-origin tab already open → focus it and navigate.
          if ("focus" in client) {
            client.focus();
            if ("navigate" in client) client.navigate(targetUrl).catch(() => {});
            return;
          }
        }
        if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
      }),
  );
});
