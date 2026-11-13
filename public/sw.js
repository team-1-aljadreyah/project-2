// The site's service worker: the phone's notifications (lib/phone-notify.ts).
// - "show" from an open page that is in the background: a notification on the phone at once.
// - "push" from the server (Web Push, VAPID): the same, even with the app closed — when the backend sends them.
// - A tap on one: the app comes to the front on that page (or opens there).
// No caching here: the site keeps working online as it does.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

function show(n) {
  return self.registration.showNotification(n.title || "النهرين", {
    body: n.body || "",
    icon: "/apps/client-192.png",
    badge: "/apps/client-192.png",
    tag: n.tag,
    renotify: !!n.tag,
    dir: "rtl",
    lang: "ar",
    data: { url: n.url || "/" },
  });
}

self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "show") e.waitUntil(show(e.data));
});

self.addEventListener("push", (e) => {
  let n = {};
  try {
    n = e.data ? e.data.json() : {};
  } catch {
    n = { title: "النهرين", body: e.data ? e.data.text() : "" };
  }
  e.waitUntil(show(n));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/", self.location.origin).href;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const same = list.find((c) => c.url.startsWith(self.location.origin));
      if (same) return same.focus().then((c) => (c && "navigate" in c ? c.navigate(url) : c));
      return self.clients.openWindow(url);
    }),
  );
});
