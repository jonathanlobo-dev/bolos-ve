// Service worker de la PWA (solo web; el APK nativo no lo usa).
// - App shell: red primero, con caché de respaldo → funciona sin conexión.
// - API de tasas (Railway): siempre red, nunca se cachea → datos frescos.

const CACHE = "bolos-ve-v2";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      // borra cachés de versiones viejas del SW
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // Datos en vivo / históricos: no se cachean (queremos lo último).
  if (url.hostname.endsWith("railway.app") || url.hostname.includes("binance")) return;

  // Resto (HTML, JS, CSS, iconos): red primero; si no hay, lo último cacheado.
  e.respondWith(
    fetch(request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(request)),
  );
});
