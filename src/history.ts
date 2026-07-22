// Ver las tasas de una fecha pasada: el 📅 de la barra superior abre el
// calendario y, al elegir un día, las tarjetas de Inicio muestran ESE día.
//
// Los datos salen del backend propio (/api/day). Si no hay backend configurado
// o no responde, se usa el historial que la app guarda en el teléfono.

import { fetchJson, getBackendUrl, localDay, type Rate, type RatesResult } from "./rateProvider";
import { renderHome } from "./home";
import { toast } from "./util";

// Nombres de las tasas (el historial solo trae id + números).
const META: Record<string, { title: string; icon: string; symbol: "$" | "€" }> = {
  bcv_usd: { title: "BCV Dólar", icon: "🏛️", symbol: "$" },
  binance_usd: { title: "P2P (USDT)", icon: "👛", symbol: "$" },
  bcv_eur: { title: "BCV Euro", icon: "💶", symbol: "€" },
};

// El servidor guarda el P2P como "p2p_usdt"; en la app la tasa se llama
// "binance_usd". Se traducen los ids al leer.
const ID_FROM_SERVER: Record<string, string> = {
  bcv_usd: "bcv_usd",
  bcv_eur: "bcv_eur",
  p2p_usdt: "binance_usd",
  bcv_usd_live: "bcv_usd",
  bcv_eur_live: "bcv_eur",
};

interface DayStat {
  min: number;
  max: number;
  close: number;
  desde?: string; // si la tasa se arrastró (BCV no publica fines de semana)
}

let viewing: string | null = null; // fecha que se está viendo (null = hoy)

/** true si Inicio está mostrando una fecha pasada (el refresco no debe pisarla). */
export function isViewingHistory(): boolean {
  return viewing !== null;
}

function vzlaToday(): string {
  return new Date(Date.now() - 4 * 3600 * 1000).toISOString().slice(0, 10);
}

function prettyDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function toResult(date: string, stats: Record<string, DayStat>): RatesResult {
  const rates: Rate[] = [];
  for (const [id, s] of Object.entries(stats)) {
    const meta = META[id];
    if (!meta || !(s.close > 0)) continue;
    rates.push({
      id,
      title: meta.title,
      icon: meta.icon,
      symbol: meta.symbol,
      price: s.close,
      change: 0,
      percent: 0,
      dayMin: s.min,
      dayMax: s.max,
      // El BCV no publica fines de semana: se indica de qué día viene la tasa.
      lastUpdate: s.desde ? `vigente desde el ${prettyDate(s.desde)}` : date,
    });
  }
  return { rates, fetchedAt: Date.parse(`${date}T12:00:00-04:00`), source: "historial", stale: false };
}

async function fromBackend(date: string): Promise<Record<string, DayStat> | null> {
  const base = getBackendUrl();
  if (!base) return null;
  try {
    const data = await fetchJson(`${base}/api/day?date=${date}`, { absolute: true, timeoutMs: 9000 });
    const out: Record<string, DayStat> = {};
    for (const [serverId, s] of Object.entries((data?.rates ?? {}) as Record<string, DayStat>)) {
      const id = ID_FROM_SERVER[serverId];
      // "…_live" solo se usa si esa tasa no vino del histórico oficial
      if (!id || (serverId.endsWith("_live") && out[id])) continue;
      if (s?.close > 0) out[id] = s;
    }
    return Object.keys(out).length ? out : null;
  } catch (err) {
    console.warn("[history] backend no respondió:", err);
    return null;
  }
}

function showStrip(date: string | null): void {
  const strip = document.getElementById("histStrip");
  const label = document.getElementById("histLabel");
  if (!strip || !label) return;
  strip.classList.toggle("hidden", !date);
  if (date) label.textContent = `📅 Viendo el ${prettyDate(date)}`;
}

async function openDate(date: string): Promise<void> {
  const stats = (await fromBackend(date)) ?? localDay(date);
  if (!stats || Object.keys(stats).length === 0) {
    toast("No hay datos guardados de ese día");
    return;
  }
  viewing = date;
  showStrip(date);
  renderHome(toResult(date, stats));
}

/** Vuelve a las tasas de hoy. `refreshNow` repinta con los datos en vivo. */
export function backToToday(refreshNow: () => void): void {
  viewing = null;
  showStrip(null);
  refreshNow();
}

export function initHistory(refreshNow: () => void): void {
  const btn = document.getElementById("histBtn");
  const input = document.getElementById("histDate") as HTMLInputElement | null;
  if (!btn || !input) return;

  input.max = vzlaToday();
  // Límite inferior: desde cuándo hay datos en el servidor (si responde).
  const base = getBackendUrl();
  if (base) {
    fetchJson(`${base}/api/history/range`, { absolute: true, timeoutMs: 8000 })
      .then((r) => {
        if (r?.first) input.min = r.first;
      })
      .catch(() => {
        /* sin límite si no responde */
      });
  }

  btn.addEventListener("click", () => {
    input.value = viewing ?? vzlaToday();
    // showPicker abre el calendario nativo de Android; si no existe, focus.
    if (typeof (input as any).showPicker === "function") (input as any).showPicker();
    else input.focus();
  });
  input.addEventListener("change", () => {
    if (input.value) openDate(input.value);
  });
  document.getElementById("histBack")?.addEventListener("click", () => backToToday(refreshNow));
}
