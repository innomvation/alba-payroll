// 최소 서비스워커: 앱 셸 캐시(오프라인에서도 화면은 뜨게). 데이터는 항상 네트워크.
const CACHE = "gapo-punch-v7";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon.png", "./paw-jelly.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // Supabase/CDN 요청은 항상 네트워크 (캐시하지 않음)
  if (url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request).then((r) => r || caches.match("./index.html")))
  );
});

// 마감시간 지난 미퇴근 알림 등 웹푸시 수신
self.addEventListener("push", (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (_) {}
  e.waitUntil(
    self.registration.showNotification(data.title || "가포 알바", {
      body: data.body || "",
      icon: "./icon.png",
      badge: "./icon.png",
    })
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(clients.openWindow("./"));
});
