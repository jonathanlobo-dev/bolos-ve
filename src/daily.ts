// Notificación diaria con las tasas, a una hora elegida (notificación local repetida).
// Nota: el contenido se arma con las últimas tasas conocidas; se actualiza cada vez
// que la app refresca. (Para datos 100% frescos sin abrir la app haría falta push.)

import type { RatesResult } from "./rateProvider";
import { load, save } from "./storage";
import { fmt, toast } from "./util";

interface DailyCfg {
  enabled: boolean;
  time: string; // "HH:MM"
}

const KEY = "bolitas.daily";
const NOTIF_ID = 9001;

let latest: RatesResult | null = null;
let lastScheduledBody = ""; // para no reprogramar si no cambió el contenido

function getCfg(): DailyCfg {
  return load<DailyCfg>(KEY, { enabled: false, time: "08:00" });
}

function bodyText(): string {
  if (!latest || latest.rates.length === 0) return "Abre Bolitas para ver las tasas de hoy.";
  return latest.rates
    .map((r) => `${r.icon} ${r.title}: Bs ${fmt(r.price)}`)
    .join(" · ");
}

// Acceso al plugin por el puente nativo (sin importación dinámica, que se colgaba).
function getLN(): any | null {
  const cap = (window as any).Capacitor;
  if (!cap?.isNativePlatform?.()) return null; // solo dentro de la app
  return cap.Plugins?.LocalNotifications ?? null;
}

async function reschedule(): Promise<void> {
  const LN = getLN();
  if (!LN) return;
  // siempre cancelamos la anterior antes de reprogramar
  await LN.cancel({ notifications: [{ id: NOTIF_ID }] }).catch(() => {});
  const cfg = getCfg();
  if (!cfg.enabled) {
    lastScheduledBody = "";
    return;
  }
  const perm = await LN.checkPermissions();
  if (perm.display !== "granted") return; // el permiso se pide al activar desde la UI
  const body = bodyText();
  const [h, m] = cfg.time.split(":").map((x) => parseInt(x, 10));
  await LN.schedule({
    notifications: [
      {
        id: NOTIF_ID,
        title: "💱 Tasas de hoy — Bolitas",
        body,
        schedule: { on: { hour: h, minute: m }, allowWhileIdle: true },
      },
    ],
  });
  lastScheduledBody = body;
}

/**
 * Llamar en cada refresco. Solo reprograma si el contenido cambió (evita cancelar
 * y recrear la notificación nativa en cada refresco si las tasas no se movieron).
 */
export function setDailyRates(result: RatesResult): void {
  latest = result;
  if (getCfg().enabled && bodyText() !== lastScheduledBody) reschedule();
}

// Notificación de prueba ~10 segundos en el futuro (para verificar que funciona).
async function testNow(): Promise<void> {
  const LN = getLN();
  if (!LN) {
    toast("Solo funciona en la app instalada (no en el navegador).");
    return;
  }
  try {
    let perm = await LN.checkPermissions();
    if (perm.display !== "granted") perm = await LN.requestPermissions();
    if (perm.display !== "granted") {
      toast("Falta el permiso de notificaciones.");
      return;
    }
    await LN.schedule({
      notifications: [
        {
          id: 9002,
          title: "🔔 Prueba — Bolitas",
          body: bodyText() || "Notificación de prueba",
          schedule: { at: new Date(Date.now() + 5000), allowWhileIdle: true },
        },
      ],
    });
    toast("Te llegará en unos segundos 🔔");
  } catch (e: any) {
    toast(`Error: ${String(e?.message ?? e).slice(0, 70)}`);
  }
}

export function initDaily(): void {
  const cfg = getCfg();
  const toggle = document.getElementById("dailyToggle") as HTMLInputElement | null;
  const timeEl = document.getElementById("dailyTime") as HTMLInputElement | null;
  if (toggle) toggle.checked = cfg.enabled;
  if (timeEl) timeEl.value = cfg.time;

  const onChange = async () => {
    const enabled = toggle?.checked ?? false;
    const time = timeEl?.value || "08:00";
    // 1) guardar PRIMERO (así el ajuste persiste aunque el permiso falle/cancele)
    save(KEY, { enabled, time });
    // 2) al activar, pedir permiso de notificaciones (sin bloquear el guardado)
    if (enabled) {
      try {
        const LN = getLN();
        if (LN) {
          const perm = await LN.checkPermissions();
          if (perm.display !== "granted") await LN.requestPermissions();
        }
      } catch {
        /* permiso no disponible */
      }
    }
    lastScheduledBody = ""; // forzar reprogramación al cambiar ajustes
    await reschedule();
  };

  toggle?.addEventListener("change", onChange);
  timeEl?.addEventListener("change", onChange);
  document.getElementById("dailyTest")?.addEventListener("click", testNow);
}
