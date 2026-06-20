import { defineConfig, type ProxyOptions } from "vite";

// Silencia los errores del proxy en consola (p. ej. si un dominio no resuelve),
// porque la app ya maneja esos fallos con fuentes de respaldo.
function quiet(target: string, prefix: RegExp): ProxyOptions {
  return {
    target,
    changeOrigin: true,
    secure: true,
    rewrite: (path) => path.replace(prefix, ""),
    configure: (proxy) => {
      proxy.on("error", () => {
        /* ignorar: la app usa fuentes alternativas */
      });
    },
  };
}

export default defineConfig({
  // base relativo para que los assets carguen dentro del WebView de Capacitor
  base: "./",
  server: {
    port: 5173,
    host: true,
    // Proxies para evitar CORS al consultar las APIs desde el navegador en dev.
    // En el APK Android NO se usa esto: allí se usa CapacitorHttp (ver rateProvider.ts).
    proxy: {
      "/pyd": quiet("https://pydolarve.org", /^\/pyd/),
      "/dolarapi": quiet("https://ve.dolarapi.com", /^\/dolarapi/),
      "/fx": quiet("https://api.frankfurter.app", /^\/fx/),
      "/yadio": quiet("https://api.yadio.io", /^\/yadio/),
      "/dvzla": quiet("https://rates.dolarvzla.com", /^\/dvzla/),
      "/binance": quiet("https://p2p.binance.com", /^\/binance/),
    },
  },
  build: {
    outDir: "dist",
    target: "es2020",
  },
});
