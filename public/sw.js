const OFFLINE_CACHE = "mastani-offline-v1";
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(OFFLINE_CACHE).then((cache) => cache.add("/offline.html")),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith("mastani-offline-") && key !== OFFLINE_CACHE,
            )
            .map((key) => caches.delete(key)),
        ),
      ),
  );
});
self.addEventListener("fetch", (event) => {
  if (
    event.request.method !== "GET" ||
    event.request.mode !== "navigate" ||
    new URL(event.request.url).origin !== self.location.origin
  )
    return;
  event.respondWith(
    fetch(event.request).catch(async () => {
      const fallback = await caches.match("/offline.html");
      return (
        fallback ||
        new Response("You are offline. Reconnect to open the team hub.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        })
      );
    }),
  );
});
function safeUrl(value) {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  )
    return "/home";
  try {
    const url = new URL(value, self.location.origin);
    const allowed = [
      "/home",
      "/announcements",
      "/todos",
      "/payments",
      "/calendar",
      "/roster",
      "/segments",
      "/admin",
    ];
    const validPath =
      allowed.includes(url.pathname) ||
      /^\/(?:segments|announcements|todos|payments|roster)\/[0-9a-f-]{36}$/i.test(url.pathname);
    return url.origin === self.location.origin && validPath
      ? url.pathname + url.search + url.hash
      : "/home";
  } catch {
    return "/home";
  }
}
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data?.json() || {};
  } catch {
    /* Show a generic visible notification. */
  }
  if (!data || typeof data !== "object") data = {};
  event.waitUntil(
    self.registration.showNotification(
      typeof data.title === "string" ? data.title : "AKH Mastani",
      {
        body:
          typeof data.body === "string"
            ? data.body
            : "Open the team hub for an update.",
        icon: "/icon-192.png",
        tag: typeof data.tag === "string" ? data.tag : undefined,
        data: { url: safeUrl(data.url) },
      },
    ),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(
    safeUrl(event.notification.data?.url),
    self.location.origin,
  ).href;
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async (windows) => {
        const existing = windows.find(
          (client) => new URL(client.url).origin === self.location.origin,
        );
        if (existing) {
          await existing.navigate(url);
          return existing.focus();
        }
        return self.clients.openWindow(url);
      }),
  );
});
