// Vista Alertas: crear reglas y disparar notificaciones cuando se cumplen.
// MVP: se evalúan al abrir la app y en cada refresco. (Background real = Fase 2.)

import { calcGap, rateById, type RatesResult } from "./rateProvider";
import { load, save } from "./storage";

type Op = "gte" | "lte";

interface Alert {
  id: string;
  metric: string; // id de tasa ('bcv_usd', etc.) o 'gap'
  op: Op;
  value: number;
  lastTriggered?: number;
}

const KEY = "bolitas.alerts";

const METRIC_LABEL: Record<string, string> = {
  bcv_usd: "BCV Dólar",
  binance_usd: "P2P (USDT)",
  bcv_eur: "BCV Euro",
  gap: "Brecha (%)",
};

let alerts: Alert[] = load<Alert[]>(KEY, []);

function persist(): void {
  save(KEY, alerts);
}

function metricValue(metric: string, result: RatesResult): number | null {
  if (metric === "gap") return calcGap(result);
  return rateById(result, metric)?.price ?? null;
}

// ---- Notificaciones: Capacitor en nativo, Web Notification en navegador ----
// Plugin de notificaciones por el puente nativo (sin importación dinámica).
function getLN(): any | null {
  const cap = (window as any).Capacitor;
  if (!cap?.isNativePlatform?.()) return null;
  return cap.Plugins?.LocalNotifications ?? null;
}

// id único para cada notificación (evita colisiones si se disparan en el mismo ms)
let notifSeq = Math.floor(Math.random() * 1_000_000);

async function notify(title: string, body: string): Promise<void> {
  const LN = getLN();
  if (LN) {
    try {
      const perm = await LN.checkPermissions();
      if (perm.display !== "granted") await LN.requestPermissions();
      await LN.schedule({ notifications: [{ id: (notifSeq++ % 2_000_000_000) + 1, title, body }] });
      return;
    } catch {
      /* cae al fallback web */
    }
  }
  if ("Notification" in window) {
    if (Notification.permission === "granted") new Notification(title, { body });
    else if (Notification.permission !== "denied") {
      const p = await Notification.requestPermission();
      if (p === "granted") new Notification(title, { body });
    }
  }
}

export async function requestNotificationPermission(): Promise<void> {
  const LN = getLN();
  if (LN) {
    try {
      await LN.requestPermissions();
      return;
    } catch {
      /* ignorar */
    }
  }
  if ("Notification" in window && Notification.permission === "default") {
    await Notification.requestPermission();
  }
}

/** Evalúa todas las alertas contra las tasas actuales y dispara las que se cumplen. */
export async function evaluateAlerts(result: RatesResult): Promise<void> {
  const now = Date.now();
  const COOLDOWN = 30 * 60 * 1000;

  for (const a of alerts) {
    const val = metricValue(a.metric, result);
    if (val == null) continue;
    const hit = a.op === "gte" ? val >= a.value : val <= a.value;
    const cooled = !a.lastTriggered || now - a.lastTriggered > COOLDOWN;
    if (hit && cooled) {
      a.lastTriggered = now;
      persist();
      const unit = a.metric === "gap" ? "%" : "Bs";
      const dir = a.op === "gte" ? "≥" : "≤";
      await notify(
        `🔔 ${METRIC_LABEL[a.metric] ?? a.metric} ${dir} ${a.value}${a.metric === "gap" ? "%" : ""}`,
        `Valor actual: ${unit} ${val.toFixed(2)}`,
      );
    }
  }
}

function render(): void {
  const list = document.getElementById("alertsList");
  if (!list) return;
  if (alerts.length === 0) {
    list.innerHTML = `<p class="empty">No tienes alertas. Crea una arriba.</p>`;
    return;
  }
  list.innerHTML = alerts
    .map((a) => {
      const op = a.op === "gte" ? "≥" : "≤";
      const unit = a.metric === "gap" ? "%" : "Bs";
      return `
        <div class="alert-item">
          <span>${METRIC_LABEL[a.metric] ?? a.metric} ${op} ${unit} ${a.value}</span>
          <button class="del-btn" data-id="${a.id}" aria-label="Eliminar">✕</button>
        </div>`;
    })
    .join("");

  list.querySelectorAll<HTMLButtonElement>(".del-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      alerts = alerts.filter((a) => a.id !== btn.dataset.id);
      persist();
      render();
    });
  });
}

export function initAlerts(): void {
  // poblar el selector de métrica
  const metricSel = document.getElementById("alertMetric") as HTMLSelectElement | null;
  if (metricSel) {
    metricSel.innerHTML = Object.entries(METRIC_LABEL)
      .map(([k, v]) => `<option value="${k}">${v}</option>`)
      .join("");
  }

  render();
  document.getElementById("addAlertBtn")?.addEventListener("click", async () => {
    const metric = (document.getElementById("alertMetric") as HTMLSelectElement).value;
    const op = (document.getElementById("alertOp") as HTMLSelectElement).value as Op;
    const valEl = document.getElementById("alertValue") as HTMLInputElement;
    const value = parseFloat(valEl.value.replace(",", "."));
    if (!Number.isFinite(value)) {
      valEl.focus();
      return;
    }
    alerts.push({ id: `${Date.now()}`, metric, op, value });
    persist();
    valEl.value = "";
    render();
    await requestNotificationPermission();
  });
}
