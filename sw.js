// Guarda a app no tablet para abrir mesmo sem internet (os eventos sincronizam quando a ligação voltar).
const CACHE = "calendario-v1";
const FILES = ["./", "./index.html", "./firebase-config.js", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];

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
