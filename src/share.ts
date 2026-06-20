// Compartir las tasas del día por el menú NATIVO del teléfono (WhatsApp, Telegram…).
// Solo texto + enlace de descarga: liviano e instantáneo.

import type { RatesResult } from "./rateProvider";
import { copyText, fmt, toast } from "./util";

// Cuando publiques en Play Store, este enlace ya queda correcto (usa el appId).
const DOWNLOAD_URL = "https://play.google.com/store/apps/details?id=com.bolitas.app";

let latest: RatesResult | null = null;

export function setShareRates(result: RatesResult): void {
  latest = result;
}

function buildText(): string {
  if (!latest || latest.rates.length === 0) return "";
  const lines = ["💱 *Tasas de hoy — Bolitas*", ""];
  for (const r of latest.rates) lines.push(`${r.icon} ${r.title}: Bs ${fmt(r.price)}`);
  const time = new Date(latest.fetchedAt || Date.now()).toLocaleString("es-VE", {
    dateStyle: "short",
    timeStyle: "short",
  });
  lines.push("", `🕒 ${time}`, "", `📲 Descarga Bolitas: ${DOWNLOAD_URL}`);
  return lines.join("\n");
}

// Plugin nativo de Capacitor (sin import: se accede por el puente en runtime).
function nativeSharePlugin(): any {
  return (window as any).Capacitor?.Plugins?.Share ?? null;
}

async function share(): Promise<void> {
  const text = buildText();
  if (!text) {
    toast("Aún no hay tasas para compartir");
    return;
  }

  // 1) Compartir nativo de Capacitor (lo ideal en el APK)
  const plugin = nativeSharePlugin();
  if (plugin?.share) {
    try {
      await plugin.share({ title: "Bolitas — Tasas de hoy", text, dialogTitle: "Compartir tasas" });
    } catch {
      /* el usuario canceló */
    }
    return;
  }

  // 2) Web Share API (navegador compatible)
  try {
    if (navigator.share) {
      await navigator.share({ title: "Bolitas — Tasas de hoy", text });
      return;
    }
  } catch {
    /* cancelado o no disponible */
  }

  // 3) Último recurso: copiar el texto
  const ok = await copyText(text);
  if (ok) toast("Tasas copiadas — pégalas donde quieras");
}

export function initShare(): void {
  document.getElementById("shareBtn")?.addEventListener("click", share);
}
