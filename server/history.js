// Historial de tasas: base de datos + relleno con el histórico OFICIAL del BCV
// + muestreo periódico (para el P2P, que no tiene fuente histórica pública).
//
// Tablas:
//   samples -> cada medición (rate, price, ts). Se podan las > 45 días.
//   daily   -> resumen por día (min, max, avg, close). Se conserva siempre.

import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import * as XLSX from "xlsx";

const DB_PATH = process.env.DB_PATH || "./data/history.db";
mkdirSync(dirname(DB_PATH), { recursive: true });
export const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS samples (
    rate TEXT NOT NULL,
    price REAL NOT NULL,
    ts INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_samples ON samples (rate, ts);
  CREATE TABLE IF NOT EXISTS daily (
    rate TEXT NOT NULL,
    day TEXT NOT NULL,
    min REAL, max REAL, avg REAL, close REAL,
    samples INTEGER,
    PRIMARY KEY (rate, day)
  );
  CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
`);

// Venezuela es UTC-4: el "día" se calcula con ese desfase, no en UTC.
export function vzlaDay(ms = Date.now()) {
  return new Date(ms - 4 * 3600 * 1000).toISOString().slice(0, 10);
}

// ---------- Escritura ----------

const insSample = db.prepare("INSERT INTO samples (rate, price, ts) VALUES (?, ?, ?)");
const upsertDaily = db.prepare(`
  INSERT INTO daily (rate, day, min, max, avg, close, samples)
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(rate, day) DO UPDATE SET
    min = excluded.min, max = excluded.max, avg = excluded.avg,
    close = excluded.close, samples = excluded.samples
`);

/** Guarda una medición y recalcula el resumen de su día. */
export function recordSample(rate, price, ts = Date.now()) {
  if (!(price > 0)) return;
  insSample.run(rate, price, ts);
  const day = vzlaDay(ts);
  const from = Date.parse(`${day}T00:00:00-04:00`);
  const to = from + 24 * 3600 * 1000;
  const a = db
    .prepare(
      `SELECT MIN(price) mn, MAX(price) mx, AVG(price) av, COUNT(*) n
       FROM samples WHERE rate = ? AND ts >= ? AND ts < ?`,
    )
    .get(rate, from, to);
  const close = db
    .prepare(
      `SELECT price FROM samples WHERE rate = ? AND ts >= ? AND ts < ?
       ORDER BY ts DESC LIMIT 1`,
    )
    .get(rate, from, to);
  upsertDaily.run(rate, day, a.mn, a.mx, a.av, close?.price ?? null, a.n);
}

/** Inserta directamente un resumen diario (para el histórico oficial del BCV). */
export function recordDailyDirect(rate, day, price) {
  if (!(price > 0)) return;
  upsertDaily.run(rate, day, price, price, price, price, 1);
}

/** Borra muestras crudas viejas; el resumen diario se conserva. */
export function prune(days = 45) {
  db.prepare("DELETE FROM samples WHERE ts < ?").run(Date.now() - days * 24 * 3600 * 1000);
}

// ---------- Histórico oficial del BCV (tipo de cambio de referencia SMC) ----------
// El BCV publica un .xls por trimestre con UNA HOJA POR DÍA (nombre DDMMYYYY).
// Dentro, la fila del código de moneda trae "Bs./M.E. Venta (ASK)", que es la
// tasa oficial que todo el mundo usa. Con esto tenemos historial real desde 2024.

const BCV_SMC_PAGE = "https://www.bcv.org.ve/estadisticas/tipo-cambio-de-referencia-smc";

async function fetchInsecure(url) {
  // El certificado del BCV suele fallar; se ignora TLS solo para su dominio.
  const prev = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  } finally {
    if (prev === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    else process.env.NODE_TLS_REJECT_UNAUTHORIZED = prev;
  }
}

async function smcFileUrls() {
  const html = (await fetchInsecure(BCV_SMC_PAGE)).toString("utf8");
  const urls = [...html.matchAll(/href="([^"]*_smc\.xlsx?)"/gi)].map((m) =>
    m[1].startsWith("http") ? m[1] : `https://www.bcv.org.ve${m[1]}`,
  );
  return [...new Set(urls)];
}

// De la hoja de un día saca { usd, eur } (columna "Venta (ASK)" en Bs.)
function ratesFromSheet(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
  const out = {};
  for (const r of rows) {
    const code = String(r?.[0] ?? "").trim().toUpperCase();
    const ask = Number(r?.[5]);
    if (!Number.isFinite(ask) || ask <= 0) continue;
    if (code === "USD") out.usd = ask;
    else if (code === "EUR") out.eur = ask;
  }
  return out;
}

/**
 * Descarga los .xls del BCV y guarda el histórico diario de USD y EUR.
 * Se ejecuta una sola vez (queda marcado en `meta`) salvo que se fuerce.
 */
export async function backfillBCV({ force = false } = {}) {
  const doneKey = "bcv_backfill_v1";
  const done = db.prepare("SELECT v FROM meta WHERE k = ?").get(doneKey);
  if (done && !force) return { skipped: true };

  let files = [];
  try {
    files = await smcFileUrls();
  } catch (e) {
    console.warn("[history] no se pudo listar los archivos del BCV:", e.message);
    return { error: e.message };
  }

  let dias = 0;
  for (const url of files) {
    try {
      const wb = XLSX.read(await fetchInsecure(url), { type: "buffer" });
      for (const name of wb.SheetNames) {
        // nombre de hoja = DDMMYYYY
        const m = /^(\d{2})(\d{2})(\d{4})$/.exec(name.trim());
        if (!m) continue;
        const day = `${m[3]}-${m[2]}-${m[1]}`;
        const { usd, eur } = ratesFromSheet(wb.Sheets[name]);
        if (usd) recordDailyDirect("bcv_usd", day, usd);
        if (eur) recordDailyDirect("bcv_eur", day, eur);
        if (usd || eur) dias++;
      }
    } catch (e) {
      console.warn(`[history] fallo al leer ${url}:`, e.message);
    }
  }
  db.prepare("INSERT OR REPLACE INTO meta (k, v) VALUES (?, ?)").run(doneKey, String(Date.now()));
  console.log(`[history] histórico del BCV cargado: ${dias} días`);
  return { dias, archivos: files.length };
}

// ---------- Semilla del P2P (dataset histórico de usdt.com.ve, CC-BY-4.0) ----------
// El P2P no tiene API histórica pública, pero usdt.com.ve publica su dataset con
// licencia abierta. Se carga una vez (resumido por día en seed/p2p-history.json,
// generado con tools/seed-p2p.mjs) y de ahí en adelante acumulamos nosotros.

const upsertDailyFull = db.prepare(`
  INSERT INTO daily (rate, day, min, max, avg, close, samples)
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(rate, day) DO NOTHING
`);

export function seedP2P({ force = false } = {}) {
  const doneKey = "p2p_seed_v1";
  const done = db.prepare("SELECT v FROM meta WHERE k = ?").get(doneKey);
  if (done && !force) return { skipped: true };

  const file = new URL("./seed/p2p-history.json", import.meta.url);
  let data;
  try {
    data = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return { skipped: true, motivo: "sin archivo de semilla" };
  }
  // No pisa lo que ya midió el servidor: ON CONFLICT DO NOTHING.
  for (const d of data.days ?? []) {
    if (d?.day && d.close > 0) {
      upsertDailyFull.run("p2p_usdt", d.day, d.min, d.max, d.avg, d.close, 0);
    }
  }
  db.prepare("INSERT OR REPLACE INTO meta (k, v) VALUES (?, ?)").run(doneKey, String(Date.now()));
  console.log(`[history] semilla del P2P cargada: ${data.days?.length ?? 0} días (${data.fuente})`);
  return { dias: data.days?.length ?? 0 };
}

// ---------- Lectura (para los endpoints) ----------

export function historyOf(rate, days = 30) {
  return db
    .prepare(
      `SELECT day, min, max, avg, close FROM daily
       WHERE rate = ? ORDER BY day DESC LIMIT ?`,
    )
    .all(rate, days)
    .reverse();
}

// El BCV no publica fines de semana ni feriados, pero su tasa sigue vigente
// hasta el siguiente día hábil: si falta ese día, se arrastra la última.
const CARRY_FORWARD = ["bcv_usd", "bcv_eur"];

const lastBefore = db.prepare(
  `SELECT day, min, max, avg, close FROM daily
   WHERE rate = ? AND day <= ? ORDER BY day DESC LIMIT 1`,
);

export function dayOf(date) {
  const rows = db
    .prepare("SELECT rate, min, max, avg, close FROM daily WHERE day = ?")
    .all(date);
  const rates = {};
  for (const r of rows) {
    rates[r.rate] = { min: r.min, max: r.max, avg: r.avg, close: r.close };
  }
  for (const id of CARRY_FORWARD) {
    if (rates[id]) continue;
    const prev = lastBefore.get(id, date);
    if (prev) {
      rates[id] = {
        min: prev.min,
        max: prev.max,
        avg: prev.avg,
        close: prev.close,
        desde: prev.day, // día en que se publicó realmente
      };
    }
  }
  return rates;
}

export function rangeOf() {
  const r = db.prepare("SELECT MIN(day) first, MAX(day) last FROM daily").get();
  return { first: r?.first ?? null, last: r?.last ?? null };
}
