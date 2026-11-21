// Service worker: saves the app on the phone so it opens without a network (PRD F1).
// The SOS button, danger questions and guides then work offline. Bump VERSION after changing files.
const VERSION = "aa-v1";
const APP = [
  "/", "/index.html", "/styles.css", "/manifest.webmanifest", "/icons/icon.svg", "/icons/icon-192.png",
  "/js/app.js", "/js/i18n.js", "/js/state.js", "/js/net.js", "/js/location.js", "/js/voice.js", "/js/ui.js",
  "/js/tools.js", "/js/sos.js", "/js/danger.js", "/js/chat.js", "/js/map.js",
  "/data/questions.js", "/data/guides.js", "/data/camps.js",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css", "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => Promise.all(APP.map((u) => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== "aa-tiles").map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // API: always live, except the question list which falls back to the saved copy
  if (url.origin === location.origin && url.pathname.startsWith("/api/")) {
    if (url.pathname === "/api/questions") e.respondWith(networkFirst(req));
    return;
  }
  // Map tiles: keep the ones already seen (small cache, no bulk downloads)
  if (url.hostname.endsWith("tile.openstreetmap.org")) {
    e.respondWith(caches.open("aa-tiles").then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      try { const res = await fetch(req); if (res.ok) c.put(req, res.clone()); return res; } catch { return hit || Response.error(); }
    }));
    return;
  }
  // Pages: network first so updates arrive, saved copy when offline
  if (req.mode === "navigate") { e.respondWith(networkFirst(req, "/index.html")); return; }
  // Our own files: newest from the network, saved copy when offline
  if (url.origin === location.origin) { e.respondWith(networkFirst(req)); return; }
  // Libraries from the CDN (Leaflet): saved copy at once, refreshed in the background
  e.respondWith(caches.open(VERSION).then(async (c) => {
    const hit = await c.match(req);
    const net = fetch(req).then((res) => { if (res.ok || res.type === "opaque") c.put(req, res.clone()); return res; }).catch(() => null);
    return hit || (await net) || Response.error();
  }));
});

async function networkFirst(req, fallbackUrl) {
  const c = await caches.open(VERSION);
  try {
    const res = await fetch(req);
    if (res.ok) c.put(req, res.clone());
    return res;
  } catch {
    return (await c.match(req)) || (fallbackUrl && (await c.match(fallbackUrl))) || Response.error();
  }
}
