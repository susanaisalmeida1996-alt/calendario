// Guarda a app no tablet para abrir mesmo sem internet (os eventos sincronizam quando a ligação voltar).
const CACHE = "calendario-v3";
const FILES = ["./", "./index.html", "./firebase-config.js", "./manifest.webmanifest", "./icon-192-v2.png", "./icon-512-v2.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Rede primeiro (para receber atualizações da app), cache se não houver ligação.
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  // Bibliotecas do Firebase e letra Montserrat: guardadas para a app abrir sem internet.
  if (["www.gstatic.com", "fonts.googleapis.com", "fonts.gstatic.com"].includes(url.hostname)) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(resp => { const copy = resp.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return resp; })));
    return;
  }
  if (url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request).then(r => r || caches.match("./index.html")))
  );
});

// Alertas enviados pelo GitHub (via Firebase): mostra a notificação mesmo com a app fechada.
self.addEventListener("push", e => {
  let p = {};
  try { p = e.data ? e.data.json() : {}; } catch { p = { data: { body: e.data ? e.data.text() : "" } }; }
  const d = p.data || {}, n = p.notification || {};
  const title = d.title || n.title || "Calendário da Família";
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || n.body || "",
    tag: d.tag || undefined,
    icon: "icon-192-v2.png",
    data: { url: d.url || "./" }
  }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(cs => {
    const c = cs.find(c => c.url.startsWith(self.registration.scope));
    return c ? c.focus() : self.clients.openWindow(e.notification.data?.url || "./");
  }));
});
