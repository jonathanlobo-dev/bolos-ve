// Pestaña Historial: gráfica de una tasa a lo largo del tiempo, con "scrub"
// (arrastras el dedo/mouse sobre la línea y ves el valor de cada día).
//
// Los datos son diarios (un cierre por día, min/max/promedio) — no hay
// resolución por hora, así que no se ofrece rango "24h" con movimiento
// intradía; el más corto disponible es 7 días.

import { fetchJson, getBackendUrl } from "./rateProvider";
import { fmt } from "./util";

interface DayPoint {
  day: string; // YYYY-MM-DD
  min: number;
  max: number;
  avg: number;
  close: number;
}

const RATES: { id: string; server: string; title: string; symbol: "$" | "€" }[] = [
  { id: "bcv_usd", server: "bcv_usd", title: "BCV Dólar", symbol: "$" },
  { id: "bcv_eur", server: "bcv_eur", title: "BCV Euro", symbol: "€" },
  { id: "binance_usd", server: "p2p_usdt", title: "P2P (USDT)", symbol: "$" },
];

let currentRate = RATES[0];
let currentDays = 30;
let loadedOnce = false;

function prettyDay(iso: string): string {
  const [, m, d] = iso.split("-");
  const meses = [
    "ene", "feb", "mar", "abr", "may", "jun",
    "jul", "ago", "sep", "oct", "nov", "dic",
  ];
  return `${parseInt(d, 10)} ${meses[parseInt(m, 10) - 1]}`;
}

async function fetchHistory(rate: string, days: number): Promise<DayPoint[]> {
  const base = getBackendUrl();
  if (!base) return [];
  try {
    const data = await fetchJson(`${base}/api/history?rate=${rate}&days=${days}`, {
      absolute: true,
      timeoutMs: 10000,
    });
    return (data?.days ?? []).filter((d: DayPoint) => d.close > 0);
  } catch (err) {
    console.warn("[historyChart] no se pudo cargar el historial:", err);
    return [];
  }
}

// ---------- Gráfica SVG (línea + relleno degradado + guía de "scrub") ----------

const W = 320;
const H = 150;
const PAD_X = 6;
const PAD_TOP = 14;
const PAD_BOTTOM = 6;

function buildSvg(points: DayPoint[], up: boolean): string {
  const closes = points.map((p) => p.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const span = max - min || 1;
  const innerW = W - PAD_X * 2;
  const innerH = H - PAD_TOP - PAD_BOTTOM;

  const xy = (i: number, v: number) => {
    const x = points.length > 1 ? PAD_X + (i / (points.length - 1)) * innerW : PAD_X + innerW / 2;
    const y = PAD_TOP + (1 - (v - min) / span) * innerH;
    return [x, y] as const;
  };

  const linePts = points.map((p, i) => xy(i, p.close));
  const lineStr = linePts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const areaStr =
    `${PAD_X},${H - PAD_BOTTOM} ` + lineStr + ` ${W - PAD_X},${H - PAD_BOTTOM}`;
  const color = up ? "var(--up)" : "var(--down)";
  const gradId = `histGrad-${up ? "up" : "down"}`;

  return `
    <svg id="histSvg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"
         style="width:100%;height:150px;display:block;touch-action:pan-y;">
      <defs>
        <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.35" />
          <stop offset="100%" stop-color="${color}" stop-opacity="0" />
        </linearGradient>
      </defs>
      <polygon points="${areaStr}" fill="url(#${gradId})" />
      <polyline points="${lineStr}" fill="none" stroke="${color}" stroke-width="2.2"
                stroke-linecap="round" stroke-linejoin="round" />
      <line id="histScrubLine" x1="0" y1="${PAD_TOP}" x2="0" y2="${H - PAD_BOTTOM}"
            stroke="var(--text-dim)" stroke-width="1" stroke-dasharray="3,3" opacity="0" />
      <circle id="histScrubDot" r="4.5" fill="${color}" stroke="var(--bg)" stroke-width="2" opacity="0" />
    </svg>`;
}

// Convierte una posición de puntero (clientX) en el índice del punto más cercano.
function indexAtClientX(svg: SVGSVGElement, clientX: number, n: number): number {
  const rect = svg.getBoundingClientRect();
  const relX = ((clientX - rect.left) / rect.width) * W; // a coordenadas del viewBox
  const innerW = W - PAD_X * 2;
  const t = (relX - PAD_X) / innerW;
  return Math.max(0, Math.min(n - 1, Math.round(t * (n - 1))));
}

function updateHeader(point: DayPoint | null): void {
  const priceEl = document.getElementById("histChartPrice");
  const metaEl = document.getElementById("histChartMeta");
  if (!priceEl || !metaEl) return;
  if (!point) {
    priceEl.textContent = "—";
    metaEl.textContent = "Sin datos para este rango.";
    return;
  }
  priceEl.textContent = `Bs ${fmt(point.close)}`;
  metaEl.textContent = prettyDay(point.day);
}

function bindScrub(container: HTMLElement, points: DayPoint[]): void {
  const svg = container.querySelector<SVGSVGElement>("#histSvg");
  const line = container.querySelector<SVGLineElement>("#histScrubLine");
  const dot = container.querySelector<SVGCircleElement>("#histScrubDot");
  if (!svg || !line || !dot || points.length === 0) return;

  const last = points[points.length - 1];
  const first = points[0];
  const closes = points.map((p) => p.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const span = max - min || 1;
  const innerW = W - PAD_X * 2;
  const innerH = H - PAD_TOP - PAD_BOTTOM;

  const moveTo = (i: number) => {
    const p = points[i];
    const x = points.length > 1 ? PAD_X + (i / (points.length - 1)) * innerW : PAD_X + innerW / 2;
    const y = PAD_TOP + (1 - (p.close - min) / span) * innerH;
    line.setAttribute("x1", x.toFixed(1));
    line.setAttribute("x2", x.toFixed(1));
    line.setAttribute("opacity", "1");
    dot.setAttribute("cx", x.toFixed(1));
    dot.setAttribute("cy", y.toFixed(1));
    dot.setAttribute("opacity", "1");
    updateHeader(p);
  };
  const reset = () => {
    line.setAttribute("opacity", "0");
    dot.setAttribute("opacity", "0");
    updateHeader(last);
  };

  let scrubbing = false;
  svg.addEventListener("pointerdown", (e) => {
    scrubbing = true;
    svg.setPointerCapture(e.pointerId);
    moveTo(indexAtClientX(svg, e.clientX, points.length));
  });
  svg.addEventListener("pointermove", (e) => {
    if (!scrubbing) return;
    moveTo(indexAtClientX(svg, e.clientX, points.length));
  });
  const end = () => {
    scrubbing = false;
    reset();
  };
  svg.addEventListener("pointerup", end);
  svg.addEventListener("pointercancel", end);
  svg.addEventListener("pointerleave", end);

  // valor inicial: el más reciente, con su variación en el badge
  updateHeader(last);
  const changeEl = document.getElementById("histChartChange");
  if (changeEl && first.close > 0) {
    const pct = ((last.close - first.close) / first.close) * 100;
    const up = pct >= 0;
    changeEl.className = `rate-badge ${pct === 0 ? "flat" : up ? "up" : "down"}`;
    changeEl.textContent = `${up ? "↗" : "↘"} ${Math.abs(pct).toFixed(2)}%`;
  }
}

function renderStats(points: DayPoint[]): void {
  const min = Math.min(...points.map((p) => p.min));
  const max = Math.max(...points.map((p) => p.max));
  const avg = points.reduce((s, p) => s + p.avg, 0) / points.length;
  const first = points[0].close;
  const last = points[points.length - 1].close;
  const pct = first > 0 ? ((last - first) / first) * 100 : 0;

  const set = (id: string, text: string) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
  set("histStatMin", `Bs ${fmt(min)}`);
  set("histStatMax", `Bs ${fmt(max)}`);
  set("histStatAvg", `Bs ${fmt(avg)}`);
  const varEl = document.getElementById("histStatVar");
  if (varEl) {
    varEl.textContent = `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
    varEl.style.color = pct > 0 ? "var(--up)" : pct < 0 ? "var(--down)" : "var(--text)";
  }

  const fromEl = document.getElementById("histChartFrom");
  const toEl = document.getElementById("histChartTo");
  if (fromEl) fromEl.textContent = prettyDay(points[0].day);
  if (toEl) toEl.textContent = prettyDay(points[points.length - 1].day);
}

async function load(): Promise<void> {
  const holder = document.getElementById("histChartSvgHolder");
  const wrap = document.getElementById("histChartWrap");
  if (!holder || !wrap) return;

  holder.innerHTML = `<p class="empty" style="padding:40px 0;">Cargando…</p>`;
  const points = await fetchHistory(currentRate.server, currentDays);

  if (points.length < 2) {
    holder.innerHTML = `<p class="empty" style="padding:40px 0;">No hay suficientes datos para este rango.</p>`;
    updateHeader(points[0] ?? null);
    const changeEl = document.getElementById("histChartChange");
    if (changeEl) {
      changeEl.className = "rate-badge flat";
      changeEl.textContent = "—";
    }
    ["histStatMin", "histStatMax", "histStatAvg", "histStatVar"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = "—";
    });
    document.getElementById("histChartFrom")!.textContent = "";
    document.getElementById("histChartTo")!.textContent = "";
    return;
  }

  const up = points[points.length - 1].close >= points[0].close;
  holder.innerHTML = buildSvg(points, up);
  bindScrub(holder, points);
  renderStats(points);
}

export function initHistoryChart(): void {
  const rateSelect = document.getElementById("histChartRate") as HTMLSelectElement | null;
  if (rateSelect) {
    rateSelect.innerHTML = RATES.map((r) => `<option value="${r.id}">${r.title}</option>`).join("");
    rateSelect.addEventListener("change", () => {
      currentRate = RATES.find((r) => r.id === rateSelect.value) ?? RATES[0];
      load();
    });
  }

  document.querySelectorAll<HTMLButtonElement>(".hist-range-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".hist-range-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentDays = parseInt(btn.dataset.days || "30", 10);
      load();
    });
  });

  // Carga perezosa: solo la primera vez que se abre la pestaña Historial.
  document.querySelector<HTMLButtonElement>('.tab[data-view="history"]')?.addEventListener("click", () => {
    if (!loadedOnce) {
      loadedOnce = true;
      load();
    }
  });
}
