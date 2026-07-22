// Backend de Bolos VE
// Lee la tasa oficial del BCV (bcv.org.ve) y el precio P2P de Binance (USDT/VES),
// los cachea unos minutos y los sirve como JSON con CORS abierto.
//
// Endpoints:
//   GET /            -> estado
//   GET /api/rates   -> { bcv_usd, bcv_eur, p2p_usdt, updatedAt }

import express from "express";
import cors from "cors";
import * as cheerio from "cheerio";
import { Agent } from "undici";
import {
  backfillBCV,
  dayOf,
  historyOf,
  prune,
  rangeOf,
  recordSample,
} from "./history.js";

const app = express();
app.use(cors());

// El certificado de bcv.org.ve a veces es inválido/expirado: ignoramos TLS solo para ese fetch.
const insecure = new Agent({ connect: { rejectUnauthorized: false } });

const TTL_MS = 5 * 60 * 1000; // cache de 5 minutos
let cache = { data: null, ts: 0 };

function parseNum(text) {
  // "1.234,56" o "567,68000000" -> 1234.56 / 567.68
  return parseFloat(String(text).trim().replace(/\./g, "").replace(",", "."));
}

// BCV vía DolarVzla (preciso, sin key). Devuelve también el valor anterior y el %.
async function bcvFromDolarVzla() {
  const res = await fetch("https://rates.dolarvzla.com/bcv/current.json");
  const j = await res.json();
  const usd = parseFloat(j?.current?.usd);
  const eur = parseFloat(j?.current?.eur);
  return {
    usd: Number.isFinite(usd) ? usd : null,
    eur: Number.isFinite(eur) ? eur : null,
    prevUsd: parseFloat(j?.previous?.usd) || null,
    prevEur: parseFloat(j?.previous?.eur) || null,
  };
}

// Respaldo: scraping directo de bcv.org.ve por si DolarVzla falla.
async function scrapeBCV() {
  const res = await fetch("https://www.bcv.org.ve/", {
    dispatcher: insecure,
    headers: { "User-Agent": "Mozilla/5.0 (Bolos VEBot)" },
  });
  const html = await res.text();
  const $ = cheerio.load(html);
  const rate = (id) => parseNum($(`#${id}`).find("strong").first().text());
  const usd = rate("dolar");
  const eur = rate("euro");
  return {
    usd: Number.isFinite(usd) ? usd : null,
    eur: Number.isFinite(eur) ? eur : null,
    prevUsd: null,
    prevEur: null,
  };
}

async function getBCV() {
  try {
    const r = await bcvFromDolarVzla();
    if (r.usd) return r;
  } catch (e) {
    console.warn("DolarVzla falló:", e.message);
  }
  return scrapeBCV();
}

// P2P del USDT/VES vía Yadio (gratis, sin key, preciso). Es lo que usa Arco.
async function yadioP2P() {
  const res = await fetch("https://api.yadio.io/rate/VES/USD");
  const json = await res.json();
  const rate = parseFloat(json?.rate);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

// Respaldo: Binance P2P directo (mediana de los más baratos) por si Yadio falla.
async function binanceP2P(tradeType = "SELL") {
  const res = await fetch("https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fiat: "VES",
      page: 1,
      rows: 20,
      tradeType,
      asset: "USDT",
      countries: [],
      payTypes: [],
      publisherType: null,
    }),
  });
  const json = await res.json();
  const prices = (json?.data || [])
    .map((a) => parseFloat(a?.adv?.price))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => b - a); // mejores (más altos) primero, igual que en la app
  if (prices.length === 0) return null;
  const slice = prices.slice(0, 10);
  return slice[Math.floor(slice.length / 2)];
}

// Binance primero: los agregadores (Yadio) suelen ir 2-3% por debajo del mercado real.
async function getP2P() {
  const b = await binanceP2P().catch(() => null);
  if (b) return b;
  return yadioP2P().catch(() => null);
}

async function buildRates() {
  const [bcv, p2p] = await Promise.all([
    getBCV().catch((e) => {
      console.warn("BCV falló:", e.message);
      return null;
    }),
    getP2P(),
  ]);
  return {
    bcv_usd: bcv?.usd ?? null,
    bcv_eur: bcv?.eur ?? null,
    bcv_usd_prev: bcv?.prevUsd ?? null,
    bcv_eur_prev: bcv?.prevEur ?? null,
    p2p_usdt: p2p ?? null,
    updatedAt: new Date().toISOString(),
  };
}

app.get("/api/rates", async (_req, res) => {
  try {
    if (!cache.data || Date.now() - cache.ts > TTL_MS) {
      cache = { data: await buildRates(), ts: Date.now() };
    }
    res.json(cache.data);
  } catch (e) {
    // El detalle interno va al log, no al cliente (evita filtrar rutas/stack)
    console.error("rates falló:", e);
    res.status(500).json({ error: "No se pudieron obtener las tasas. Intenta de nuevo." });
  }
});

// ---------- Historial ----------

app.get("/api/history", (req, res) => {
  const rate = String(req.query.rate || "bcv_usd");
  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 400);
  try {
    res.json({ rate, days: historyOf(rate, days) });
  } catch (e) {
    console.error("history falló:", e);
    res.status(500).json({ error: "No se pudo leer el historial." });
  }
});

app.get("/api/day", (req, res) => {
  const date = String(req.query.date || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: "Fecha inválida. Usa AAAA-MM-DD." });
  }
  try {
    res.json({ date, rates: dayOf(date) });
  } catch (e) {
    console.error("day falló:", e);
    res.status(500).json({ error: "No se pudo leer ese día." });
  }
});

app.get("/api/history/range", (_req, res) => {
  try {
    res.json(rangeOf());
  } catch (e) {
    console.error("range falló:", e);
    res.status(500).json({ error: "No se pudo leer el rango." });
  }
});

// ---------- Muestreo periódico ----------
// El BCV histórico viene de sus archivos oficiales; el P2P no tiene fuente
// histórica pública, así que se acumula desde aquí.

const SAMPLE_MS = parseInt(process.env.SAMPLE_MS, 10) || 15 * 60 * 1000;

async function sample() {
  try {
    const r = await buildRates();
    const now = Date.now();
    if (r.p2p_usdt) recordSample("p2p_usdt", r.p2p_usdt, now);
    // El BCV también se muestrea: cubre el día de hoy antes de que el archivo
    // oficial lo publique, y sirve de respaldo si el BCV cambia su web.
    if (r.bcv_usd) recordSample("bcv_usd_live", r.bcv_usd, now);
    if (r.bcv_eur) recordSample("bcv_eur_live", r.bcv_eur, now);
    prune();
  } catch (e) {
    console.warn("[history] muestreo falló:", e.message);
  }
}

app.get("/", (_req, res) => res.send("Bolos VE backend OK. Ver /api/rates"));

const port = process.env.PORT || 3000;
app.listen(port, async () => {
  console.log(`Bolos VE backend escuchando en :${port}`);
  await backfillBCV(); // histórico oficial del BCV (solo la primera vez)
  sample();
  setInterval(sample, SAMPLE_MS);
});
