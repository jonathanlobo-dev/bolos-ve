// Convierte el dataset histórico de USDT/VES (CSV de usdt.com.ve, CC-BY-4.0)
// en un resumen diario compacto que el servidor carga la primera vez.
//
// Uso:  node tools/seed-p2p.mjs "C:/ruta/usdt-ves-historical.csv"
//
// El CSV trae varias capturas por día; aquí se reduce a min/max/promedio/cierre
// por día usando la columna sell_rate de Binance, que es la misma referencia
// que calcula la app en vivo (mediana de los mejores anuncios de venta).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = process.argv[2];
if (!src) {
  console.error('Falta la ruta del CSV. Ej: node tools/seed-p2p.mjs "C:/.../usdt-ves-historical.csv"');
  process.exit(1);
}

// Venezuela es UTC-4 (igual criterio que el servidor y la app).
const vzlaDay = (iso) => new Date(Date.parse(iso) - 4 * 3600 * 1000).toISOString().slice(0, 10);

const lines = readFileSync(src, "utf8").split(/\r?\n/);
const byDay = new Map();

for (const line of lines) {
  if (!line || line.startsWith("#") || line.startsWith("captured_at")) continue;
  const [ts, source, , sell] = line.split(",");
  if (source !== "binance") continue; // misma fuente que usa la app
  const price = parseFloat(sell);
  if (!Number.isFinite(price) || price <= 0) continue;
  const day = vzlaDay(ts);
  const d = byDay.get(day) ?? { min: price, max: price, sum: 0, n: 0, close: price, lastTs: "" };
  d.min = Math.min(d.min, price);
  d.max = Math.max(d.max, price);
  d.sum += price;
  d.n++;
  if (ts > d.lastTs) {
    d.lastTs = ts;
    d.close = price;
  }
  byDay.set(day, d);
}

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const days = [...byDay.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([day, d]) => ({
    day,
    min: round2(d.min),
    max: round2(d.max),
    avg: round2(d.sum / d.n),
    close: round2(d.close),
  }));

const out = {
  rate: "p2p_usdt",
  fuente: "usdt.com.ve (CC-BY-4.0)",
  generado: new Date().toISOString(),
  days,
};
mkdirSync(join(root, "server", "seed"), { recursive: true });
const dest = join(root, "server", "seed", "p2p-history.json");
writeFileSync(dest, JSON.stringify(out, null, 0));

console.log(`OK: ${days.length} días (${days[0].day} → ${days[days.length - 1].day})`);
console.log(`Archivo: ${dest}`);
