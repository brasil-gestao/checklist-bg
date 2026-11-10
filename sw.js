// Service worker do Checklist BG: guarda as telas no celular para abrir sem internet.
// Regra: atualizar o programa NUNCA apaga a fila de envio (ela fica no IndexedDB, fora deste cache).
const VERSAO = "checklist-bg-0.5.0";
const ARQUIVOS = ["./", "index.html", "app.js", "manifest.json", "logo.png", "icone-192.png", "icone-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSAO).then(c => c.addAll(ARQUIVOS)));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k)))));
  self.clients.claim();
});

// A versão nova só assume quando o app manda (nenhum checklist aberto).
self.addEventListener("message", e => { if (e.data === "atualizar") self.skipWaiting(); });

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return; // envios e planilha: direto na rede
  e.respondWith(
    fetch(e.request).then(r => { const copia = r.clone(); caches.open(VERSAO).then(c => c.put(e.request, copia)); return r; })
      .catch(() => caches.match(e.request).then(r => r || caches.match("index.html")))
  );
});
