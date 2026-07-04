/**
 * SW 알림 클릭 핸들러 — workbox generateSW의 importScripts로 sw.js에 포함됨.
 *
 * 안드로이드 Chrome은 페이지 컨텍스트 new Notification()이 금지라
 * (Illegal constructor) reg.showNotification()으로 표시하는데, 그 클릭
 * 이동은 SW에서만 처리 가능. data.path로 방 경로를 받아 이미 열린 창이
 * 있으면 focus+navigate, 없으면 새 창.
 */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = (event.notification.data && event.notification.data.path) || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if ("focus" in client) {
            client.focus();
            if ("navigate" in client) return client.navigate(path);
            return undefined;
          }
        }
        return self.clients.openWindow(path);
      }),
  );
});
