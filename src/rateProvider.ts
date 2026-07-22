// Capa de datos: obtiene tasas (USD y EUR) de Venezuela desde varias fuentes,
// las normaliza a una lista de "instrumentos" y cachea el último valor.

import { load, save } from "./storage";

export interface Rate {
  id: string; // 'bcv_usd' | 'binance_usd' | 'bcv_eur'
  title: string;
  icon: string; // emoji
  symbol: "$" | "€"; // moneda extranjera
  price: number; // Bs por 1 unidad de la moneda
  change: number; // cambio absoluto del día (Bs)
  percent: number; // % de cambio del día
  previous?: number; // valor anterior (para mostrar "Antes:")
  dayMin?: number; // mínimo del día (solo al ver una fecha pasada)
  dayMax?: number; // máximo del día (solo al ver una fecha pasada)
  lastUpdate: string;
}

export interface RatesResult {
  rates: Rate[];
  fetchedAt: number; // epoch ms
  source: string;
  stale: boolean;
}

const CACHE_KEY = "bolitas.rates.cache";

function num(v: unknown): number {
  const n = typeof v === "string" ? parseFloat(v.replace(",", ".")) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

// En Venezuela se usan máximo 2 decimales. Redondeamos las tasas para que TODOS
// los cálculos (conversión, calculadoras, copiar) usen el mismo número que se ve.
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// Definición de cada instrumento que queremos mostrar.
interface Instrument {
  id: string;
  title: string;
  icon: string;
  symbol: "$" | "€";
  path: string; // ruta del endpoint en pyDolarVenezuela (sin el host)
  keys: string[]; // posibles claves dentro de monitors
}

const PYD_HOST = "https://pydolarve.org";

// Metadata pública de las tasas disponibles (para la pantalla de Configuración).
export interface RateMeta {
  id: string;
  title: string;
  icon: string;
}

const INSTRUMENTS: Instrument[] = [
  {
    id: "bcv_usd",
    title: "BCV Dólar",
    icon: "🏛️",
    symbol: "$",
    path: "/api/v2/dollar?page=criptodolar",
    keys: ["bcv"],
  },
  {
    id: "binance_usd",
    title: "P2P (USDT)",
    icon: "👛",
    symbol: "$",
    path: "/api/v2/dollar?page=criptodolar",
    keys: ["binance"],
  },
  {
    id: "bcv_eur",
    title: "BCV Euro",
    icon: "💶",
    symbol: "€",
    path: "/api/v2/euro?page=bcv",
    keys: ["bcv", "eur", "euro", "enparalelovzla"],
  },
];

export const AVAILABLE_RATES: RateMeta[] = INSTRUMENTS.map((i) => ({
  id: i.id,
  title: i.title,
  icon: i.icon,
}));

const DOLARAPI_HOST = "https://ve.dolarapi.com";
const FX_HOST = "https://api.frankfurter.app";
const YADIO_HOST = "https://api.yadio.io";
const DVZLA_HOST = "https://rates.dolarvzla.com";
const BINANCE_HOST = "https://p2p.binance.com";

// Resuelve la URL real (nativo) según el prefijo de la ruta.
function nativeUrl(path: string): string {
  if (path.startsWith("/dolarapi")) return DOLARAPI_HOST + path.replace(/^\/dolarapi/, "");
  if (path.startsWith("/fx")) return FX_HOST + path.replace(/^\/fx/, "");
  if (path.startsWith("/yadio")) return YADIO_HOST + path.replace(/^\/yadio/, "");
  if (path.startsWith("/dvzla")) return DVZLA_HOST + path.replace(/^\/dvzla/, "");
  if (path.startsWith("/binance")) return BINANCE_HOST + path.replace(/^\/binance/, "");
  return PYD_HOST + path;
}

function webUrlFor(path: string): string {
  // DolarVzla tiene CORS abierto → lo consultamos DIRECTO (sin depender del proxy/reinicio).
  if (path.startsWith("/dvzla")) return DVZLA_HOST + path.replace(/^\/dvzla/, "");
  if (
    path.startsWith("/dolarapi") ||
    path.startsWith("/fx") ||
    path.startsWith("/yadio") ||
    path.startsWith("/binance")
  ) {
    return path; // pasan por el proxy de Vite (por si no tienen CORS)
  }
  return "/pyd" + path; // pyDolarVenezuela
}

interface FetchOpts {
  method?: "GET" | "POST";
  body?: unknown;
  timeoutMs?: number;
  absolute?: boolean; // `path` ya es una URL completa (p. ej. el backend propio)
}

// Obtiene JSON evitando CORS:
//  - En Android (Capacitor): petición nativa con CapacitorHttp (sin CORS).
//  - En navegador (dev): pasa por el proxy de Vite.
// Siempre sin caché para que los datos lleguen frescos.
export async function fetchJson(path: string, opts: FetchOpts = {}): Promise<any> {
  const { method = "GET", body, timeoutMs = 10000, absolute = false } = opts;
  const { Capacitor, CapacitorHttp } = await import("@capacitor/core");

  const headers: Record<string, string> = { Accept: "application/json" };
  if (body) headers["Content-Type"] = "application/json";

  if (Capacitor.isNativePlatform()) {
    const common = {
      url: absolute ? path : nativeUrl(path),
      headers,
      readTimeout: timeoutMs,
      connectTimeout: timeoutMs,
    };
    const res =
      method === "POST"
        ? await CapacitorHttp.post({ ...common, data: body })
        : await CapacitorHttp.get(common);
    if (res.status < 200 || res.status >= 300) throw new Error(`HTTP ${res.status}`);
    return typeof res.data === "string" ? JSON.parse(res.data) : res.data;
  }

  // navegador: cache-buster + no-store para evitar respuestas viejas
  const sep = path.includes("?") ? "&" : "?";
  const base = absolute ? path : webUrlFor(path);
  const webUrl = base + (method === "GET" ? `${sep}_=${Date.now()}` : "");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(webUrl, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

function monitorToRate(inst: Instrument, mon: any): Rate | null {
  if (!mon || mon.price == null) return null;
  return {
    id: inst.id,
    title: inst.title,
    icon: inst.icon,
    symbol: inst.symbol,
    price: num(mon.price),
    change: num(mon.change),
    percent: num(mon.percent),
    lastUpdate: String(mon.last_update ?? ""),
  };
}

// Datos de ejemplo: si NO hay internet ni caché, mostramos algo para poder
// probar la interfaz. Se marcan claramente como "ejemplo".
const SAMPLE: Rate[] = [
  { id: "bcv_usd", title: "BCV Dólar", icon: "🏛️", symbol: "$", price: 563.29, change: 2.91, percent: 0.52, lastUpdate: "ejemplo" },
  { id: "binance_usd", title: "P2P (USDT)", icon: "👛", symbol: "$", price: 747.17, change: -0.19, percent: -0.03, lastUpdate: "ejemplo" },
  { id: "bcv_eur", title: "BCV Euro", icon: "💶", symbol: "€", price: 654.87, change: 4.36, percent: 0.67, lastUpdate: "ejemplo" },
];

// --- Fuente de respaldo: DolarApi (estructura simple y muy estable) ---
function findIn(arr: any[], ...names: string[]) {
  return arr.find((it: any) => {
    const f = `${it?.fuente ?? ""} ${it?.nombre ?? ""}`.toLowerCase();
    return names.some((x) => f.includes(x));
  });
}
function buildFromDolarApi(
  it: any,
  id: string,
  title: string,
  icon: string,
  symbol: "$" | "€",
): Rate | null {
  if (!it) return null;
  const price = num(it.promedio ?? it.venta ?? it.compra);
  if (!price) return null;
  return { id, title, icon, symbol, price, change: 0, percent: 0, lastUpdate: String(it.fechaActualizacion ?? "") };
}

// --- Backend propio (opcional): la fuente más precisa, lee BCV directo + Binance ---
// La URL se configura en ⚙️ Configuración (se guarda en localStorage).
export function getBackendUrl(): string {
  return (load<string>("bolitas.backendUrl", "") || "").trim().replace(/\/$/, "");
}

async function tryBackend(): Promise<Rate[]> {
  const base = getBackendUrl();
  if (!base) return [];
  try {
    const url = `${base}/api/rates`;
    const { Capacitor, CapacitorHttp } = await import("@capacitor/core");
    let data: any;
    if (Capacitor.isNativePlatform()) {
      const res = await CapacitorHttp.get({ url, headers: { Accept: "application/json" } });
      if (res.status < 200 || res.status >= 300) throw new Error(`HTTP ${res.status}`);
      data = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
    } else {
      const res = await fetch(`${url}?_=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
    }
    const upd = String(data?.updatedAt ?? "");
    const out: Rate[] = [];
    const add = (
      price: any,
      id: string,
      title: string,
      icon: string,
      symbol: "$" | "€",
      prev?: any,
    ) => {
      const p = num(price);
      if (p <= 0) return;
      const previous = num(prev) || undefined;
      out.push({
        id,
        title,
        icon,
        symbol,
        price: p,
        change: previous != null ? p - previous : 0,
        percent: previous != null && previous ? ((p - previous) / previous) * 100 : 0,
        previous,
        lastUpdate: upd,
      });
    };
    add(data?.bcv_usd, "bcv_usd", "BCV Dólar", "🏛️", "$", data?.bcv_usd_prev);
    add(data?.p2p_usdt, "binance_usd", "P2P (USDT)", "👛", "$");
    add(data?.bcv_eur, "bcv_eur", "BCV Euro", "💶", "€", data?.bcv_eur_prev);
    return out;
  } catch (err) {
    console.warn("[rateProvider] backend propio falló:", err);
    return [];
  }
}

// --- DolarVzla: BCV USD + EUR (gratis, sin key, CORS abierto) con % y valor anterior ---
async function tryDolarVzla(): Promise<Rate[]> {
  try {
    const data = await fetchJson("/dvzla/bcv/current.json", { timeoutMs: 8000 });
    const cur = data?.current;
    const prev = data?.previous;
    const pct = data?.changePercentage;
    if (!cur) return [];
    const date = String(cur.date ?? "");
    const out: Rate[] = [];
    const mk = (id: string, title: string, icon: string, symbol: "$" | "€", c: any, p: any, pc: any) => {
      const price = num(c);
      if (!price) return;
      const previous = num(p) || undefined;
      out.push({
        id,
        title,
        icon,
        symbol,
        price,
        change: previous != null ? price - previous : 0,
        percent: num(pc),
        previous,
        lastUpdate: date,
      });
    };
    mk("bcv_usd", "BCV Dólar", "🏛️", "$", cur.usd, prev?.usd, pct?.usd);
    mk("bcv_eur", "BCV Euro", "💶", "€", cur.eur, prev?.eur, pct?.eur);
    return out;
  } catch (err) {
    console.warn("[rateProvider] DolarVzla falló:", err);
    return [];
  }
}

// --- Binance P2P: el precio REAL del mercado (fuente principal del P2P) ---
// Se consultan los anuncios donde el usuario VENDE USDT (lo que recibe en Bs) y
// se toma la mediana de los mejores, para no depender de un anuncio suelto.
// Los agregadores (Yadio, DolarApi) suelen ir 2-3% por debajo del mercado real,
// por eso Binance va primero y ellos quedan de respaldo.
async function tryBinanceP2P(): Promise<Rate | null> {
  try {
    const data = await fetchJson("/binance/bapi/c2c/v2/friendly/c2c/adv/search", {
      method: "POST",
      timeoutMs: 9000,
      body: {
        fiat: "VES",
        page: 1,
        rows: 20,
        tradeType: "SELL", // anuncios donde tú vendes USDT y recibes Bs
        asset: "USDT",
        countries: [],
        payTypes: [],
        publisherType: null,
      },
    });
    const prices: number[] = (data?.data ?? [])
      .map((a: any) => num(a?.adv?.price))
      .filter((n: number) => n > 0)
      .sort((a: number, b: number) => b - a); // mejores (más altos) primero
    if (prices.length === 0) return null;
    const top = prices.slice(0, 10);
    const price = top[Math.floor(top.length / 2)]; // mediana de los 10 mejores
    if (!(price > 0)) return null;
    return {
      id: "binance_usd",
      title: "P2P (USDT)",
      icon: "👛",
      symbol: "$",
      price,
      change: 0,
      percent: 0,
      lastUpdate: new Date().toISOString(),
    };
  } catch (err) {
    console.warn("[rateProvider] Binance P2P falló:", err);
    return null;
  }
}

// --- Yadio: respaldo del P2P si Binance no responde. ---
async function tryYadio(): Promise<Rate | null> {
  try {
    const data = await fetchJson("/yadio/rate/VES/USD", { timeoutMs: 8000 });
    const price = num(data?.rate);
    if (!price) return null;
    return {
      id: "binance_usd",
      title: "P2P (USDT)",
      icon: "👛",
      symbol: "$",
      price,
      change: 0,
      percent: 0,
      lastUpdate: data?.timestamp ? new Date(data.timestamp).toISOString() : "",
    };
  } catch (err) {
    console.warn("[rateProvider] Yadio falló:", err);
    return null;
  }
}

async function tryDolarApi(): Promise<Rate[]> {
  const out: Rate[] = [];

  // Dólares: oficial (BCV) + paralelo/cripto (P2P)
  try {
    const data = await fetchJson("/dolarapi/v1/dolares", { timeoutMs: 8000 });
    if (Array.isArray(data)) {
      const bcv = buildFromDolarApi(findIn(data, "oficial", "bcv"), "bcv_usd", "BCV Dólar", "🏛️", "$");
      // P2P: el paralelo de DolarApi (valor que ya funcionaba bien).
      const p2pItem = findIn(data, "paralelo", "binance", "bitcoin", "cripto", "usdt");
      const bin = buildFromDolarApi(p2pItem, "binance_usd", "P2P (USDT)", "👛", "$");
      if (bcv) out.push(bcv);
      if (bin) out.push(bin);
    }
  } catch (err) {
    console.warn("[rateProvider] DolarApi dólares falló:", err);
  }

  // Euro BCV (endpoint separado; puede no existir en todas las redes)
  try {
    const data = await fetchJson("/dolarapi/v1/euros", { timeoutMs: 8000 });
    if (Array.isArray(data)) {
      const eur = buildFromDolarApi(findIn(data, "oficial", "bcv"), "bcv_eur", "BCV Euro", "💶", "€");
      if (eur) out.push(eur);
    } else if (data && (data as any).promedio != null) {
      const eur = buildFromDolarApi(data, "bcv_eur", "BCV Euro", "💶", "€");
      if (eur) out.push(eur);
    }
  } catch (err) {
    console.warn("[rateProvider] DolarApi euro falló (puede no existir):", err);
  }

  return out;
}

// --- pyDolarVenezuela: devuelve las tasas que logre obtener ---
async function tryPyDolar(): Promise<Rate[]> {
  const cacheByUrl = new Map<string, any>();
  const out: Rate[] = [];
  for (const inst of INSTRUMENTS) {
    try {
      let data = cacheByUrl.get(inst.path);
      if (!data) {
        data = await fetchJson(inst.path);
        cacheByUrl.set(inst.path, data);
      }
      const monitors = data?.monitors ?? data;
      let mon: any = null;
      for (const k of inst.keys) {
        if (monitors?.[k]?.price != null) {
          mon = monitors[k];
          break;
        }
      }
      const rate = monitorToRate(inst, mon);
      if (rate) out.push(rate);
    } catch (err) {
      console.warn(`[rateProvider] pyDolar ${inst.id} falló:`, err);
    }
  }
  return out;
}

// --- Calcula el Euro BCV ≈ Dólar BCV × (USD por EUR del mercado) ---
async function computeEuro(bcvUsd: Rate | undefined): Promise<Rate | null> {
  if (!bcvUsd) return null;
  try {
    const data = await fetchJson("/fx/latest?from=EUR&to=USD", { timeoutMs: 8000 });
    const usdPerEur = num(data?.rates?.USD);
    if (!usdPerEur) return null;
    return {
      id: "bcv_eur",
      title: "BCV Euro",
      icon: "💶",
      symbol: "€",
      price: bcvUsd.price * usdPerEur,
      change: 0,
      percent: 0,
      lastUpdate: "estimado (BCV $ × EUR/USD)",
    };
  } catch (err) {
    console.warn("[rateProvider] no se pudo estimar el euro:", err);
    return null;
  }
}

// --- Cambio "en vivo" (para tasas que NO traen su propio %, ej. el P2P de Yadio) ---
// El P2P cambia a cada rato: guardamos el último valor y, cuando cambia, el viejo
// pasa a ser el "anterior" para mostrar la flecha y el % del movimiento.
const HISTORY_KEY = "bolitas.rateHistory";
interface Rec {
  value: number;
  prevValue?: number;
}

function applyLiveChange(rates: Rate[]): void {
  const hist = load<Record<string, Rec>>(HISTORY_KEY, {});
  for (const r of rates) {
    if (r.previous != null || !(r.price > 0)) continue; // ya trae su propio % (ej. DolarVzla)
    const h = hist[r.id];
    if (!h) {
      hist[r.id] = { value: r.price }; // primera vez: aún sin "anterior"
    } else if (Math.abs(h.value - r.price) > 1e-9) {
      hist[r.id] = { value: r.price, prevValue: h.value }; // cambió → guardamos el anterior
    }
    // si no cambió, mantenemos el último "anterior" para seguir mostrando el movimiento
    const rec = hist[r.id];
    if (rec.prevValue && rec.prevValue > 0) {
      r.previous = round2(rec.prevValue);
      r.change = round2(r.price - rec.prevValue);
      r.percent = round2(((r.price - rec.prevValue) / rec.prevValue) * 100);
    }
  }
  save(HISTORY_KEY, hist);
}

// --- Historial diario (para el mini-gráfico de 7 días en las tarjetas) ---
// Guardamos un precio por día y por tasa; se poda a los últimos 8 días.
const DAILY_KEY = "bolitas.rateDaily";

export interface DayStat {
  min: number;
  max: number;
  close: number;
}
type DailyStore = Record<string, Record<string, DayStat | number>>;

// Venezuela es UTC-4: el "día" se calcula con ese desfase (igual que el servidor).
function vzlaDay(ms = Date.now()): string {
  return new Date(ms - 4 * 3600 * 1000).toISOString().slice(0, 10);
}

// Formato viejo: solo el precio (número). Se sigue leyendo sin romper nada.
function asStat(v: DayStat | number): DayStat {
  return typeof v === "number" ? { min: v, max: v, close: v } : v;
}

const DAILY_KEEP = 90; // días de historial local

function recordDaily(rates: Rate[]): void {
  const day = vzlaDay();
  const hist = load<DailyStore>(DAILY_KEY, {});
  for (const r of rates) {
    if (!(r.price > 0)) continue;
    const h = (hist[r.id] ??= {});
    const prev = h[day] ? asStat(h[day]) : null;
    h[day] = prev
      ? { min: Math.min(prev.min, r.price), max: Math.max(prev.max, r.price), close: r.price }
      : { min: r.price, max: r.price, close: r.price };
    for (const k of Object.keys(h).sort().slice(0, -DAILY_KEEP)) delete h[k];
  }
  save(DAILY_KEY, hist);
}

/** Precios de cierre por día (ordenados) de una tasa, para dibujar el sparkline. */
export function dailyHistory(id: string): number[] {
  const hist = load<DailyStore>(DAILY_KEY, {});
  const h = hist[id];
  if (!h) return [];
  return Object.keys(h)
    .sort()
    .slice(-8) // el sparkline muestra la última semana
    .map((k) => asStat(h[k]).close);
}

/** Resumen local de un día concreto (respaldo cuando no hay servidor). */
export function localDay(date: string): Record<string, DayStat> {
  const hist = load<DailyStore>(DAILY_KEY, {});
  const out: Record<string, DayStat> = {};
  for (const [id, days] of Object.entries(hist)) {
    if (days[date]) out[id] = asStat(days[date]);
  }
  return out;
}

/**
 * Obtiene todas las tasas combinando fuentes y rellenando huecos.
 * Orden por tasa: pyDolarVenezuela → DolarApi → (euro) estimado. Luego caché → ejemplo.
 */
export async function getRates(): Promise<RatesResult> {
  const collected = new Map<string, Rate>();
  const sources = new Set<string>();

  // 0) Backend propio (si está configurado): la fuente más precisa.
  for (const r of await tryBackend()) {
    if (!collected.has(r.id)) {
      collected.set(r.id, r);
      sources.add("backend");
    }
  }

  // 1) DolarVzla para el BCV USD + EUR (preciso, con % y "Antes"). Como Arco.
  if (!collected.has("bcv_usd") || !collected.has("bcv_eur")) {
    for (const r of await tryDolarVzla()) {
      if (!collected.has(r.id)) {
        collected.set(r.id, r);
        sources.add("DolarVzla");
      }
    }
  }

  // 2) Binance P2P: el precio real del mercado. Fuente principal del P2P.
  if (!collected.has("binance_usd")) {
    const b = await tryBinanceP2P();
    if (b) {
      collected.set(b.id, b);
      sources.add("Binance P2P");
    }
  }

  // 2b) Yadio: respaldo del P2P si Binance no respondió.
  if (!collected.has("binance_usd")) {
    const y = await tryYadio();
    if (y) {
      collected.set(y.id, y);
      sources.add("Yadio");
    }
  }

  // 3) DolarApi: respaldo para lo que aún falte.
  if (collected.size < AVAILABLE_RATES.length) {
    for (const r of await tryDolarApi()) {
      if (!collected.has(r.id)) {
        collected.set(r.id, r);
        sources.add("DolarApi");
      }
    }
  }

  // 2) Euro estimado si DolarApi no lo trajo
  if (!collected.has("bcv_eur")) {
    const eur = await computeEuro(collected.get("bcv_usd"));
    if (eur) {
      collected.set("bcv_eur", eur);
      sources.add("estimado");
    }
  }

  // 3) pyDolarVenezuela SOLO como último recurso (si DolarApi falló del todo).
  //    En muchas redes su dominio no resuelve, por eso no es la fuente principal.
  if (collected.size === 0) {
    for (const r of await tryPyDolar()) {
      if (!collected.has(r.id)) {
        collected.set(r.id, r);
        sources.add("pyDolarVenezuela");
      }
    }
  }

  if (collected.size > 0) {
    const rates = [...collected.values()];
    // redondear a 2 decimales y recomputar cambios desde los valores redondeados
    for (const r of rates) {
      r.price = round2(r.price);
      if (r.previous != null) {
        r.previous = round2(r.previous);
        r.change = round2(r.price - r.previous);
        r.percent = r.previous ? round2(((r.price - r.previous) / r.previous) * 100) : 0;
      } else {
        r.change = round2(r.change);
      }
    }
    applyLiveChange(rates); // completa el % de las tasas que no lo traen (ej. P2P)
    recordDaily(rates); // snapshot diario para el mini-gráfico de 7 días
    const source = [...sources].join(" + ");
    console.info(`[rateProvider] OK (${source}): ${rates.length} tasas`);
    const result: RatesResult = { rates, fetchedAt: Date.now(), source, stale: false };
    save(CACHE_KEY, result);
    return result;
  }

  // caché previo
  const cached = load<RatesResult | null>(CACHE_KEY, null);
  if (cached && cached.rates.length > 0) {
    console.warn("[rateProvider] usando caché (sin conexión)");
    return { ...cached, stale: true };
  }

  // último recurso: datos de ejemplo (para poder probar la UI)
  console.warn("[rateProvider] sin conexión y sin caché → datos de EJEMPLO");
  return { rates: SAMPLE, fetchedAt: Date.now(), source: "ejemplo", stale: true };
}

/** Devuelve el último valor cacheado (sincrónico) para pintar al instante al abrir. */
export function getCachedRates(): RatesResult | null {
  const cached = load<RatesResult | null>(CACHE_KEY, null);
  return cached && cached.rates.length > 0 ? { ...cached, stale: true } : null;
}

/** Devuelve una tasa por id. */
export function rateById(result: RatesResult, id: string): Rate | undefined {
  return result.rates.find((r) => r.id === id);
}

/** Brecha % entre P2P (binance) y BCV dólar. */
export function calcGap(result: RatesResult): number | null {
  const bcv = rateById(result, "bcv_usd")?.price;
  const p2p = rateById(result, "binance_usd")?.price;
  if (!bcv || !p2p) return null;
  return ((p2p - bcv) / bcv) * 100;
}
