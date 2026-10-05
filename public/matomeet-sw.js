self.addEventListener("push", (event) => {
  event.waitUntil(
    self.registration.showNotification("MatoMeet", {
      body: "新しいLINEメッセージが届きました。",
      icon: "/matomeet-icon.png",
      badge: "/matomeet-icon.png",
      tag: "matomeet-inbox",
      renotify: true,
      data: { url: "/omnibox.html" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(
    event.notification?.data?.url || "/omnibox.html",
    self.location.origin,
  ).href;

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          if ("navigate" in client) {
            return client.navigate(targetUrl).then(() => client.focus());
          }
          return client.focus();
        }
      }
      return clients.openWindow ? clients.openWindow(targetUrl) : undefined;
    }),
  );
});
