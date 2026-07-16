// 최소 서비스워커: 웹푸시 수신 + PWA 설치 조건 충족용(오프라인 캐시는 안 함, 항상 네트워크로 전달).
self.addEventListener("fetch", (e) => {
  e.respondWith(fetch(e.request));
});

self.addEventListener("push", (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (_) {}
  e.waitUntil(
    self.registration.showNotification(data.title || "알바 정산", {
      body: data.body || "",
      icon: "/icon.png",
    })
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(clients.openWindow("/dashboard"));
});
