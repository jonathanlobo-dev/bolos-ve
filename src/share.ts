// Compartir por el menú NATIVO del teléfono (WhatsApp, Telegram…).
// Se manda texto + una imagen que resume lo que estás viendo: si estás en
// Inicio van las tasas, y si estás en una calculadora, su resultado.

import { calcGap, type RatesResult } from "./rateProvider";
import { buildShareImage, type ShareCard } from "./shareImage";
import { copyText, fmt, toast } from "./util";

// Cuando publiques en Play Store, este enlace ya queda correcto (usa el appId).
const DOWNLOAD_URL = "https://play.google.com/store/apps/details?id=com.bolitas.app";

let latest: RatesResult | null = null;

export function setShareRates(result: RatesResult): void {
  latest = result;
}

function stamp(): string {
  return new Date(latest?.fetchedAt || Date.now()).toLocaleString("es-VE", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

// ---------- Qué se comparte según la pantalla ----------

interface Content {
  text: string;
  card: ShareCard | null;
}

function ratesContent(): Content | null {
  if (!latest || latest.rates.length === 0) return null;
  const lines = ["💱 *Tasas de hoy — Bolos VE*", ""];
  for (const r of latest.rates) lines.push(`${r.icon} ${r.title}: Bs ${fmt(r.price)}`);
  const gap = calcGap(latest);
  const note = gap != null ? `Brecha BCV ↔ P2P: ${fmt(gap)}%` : undefined;
  if (note) lines.push("", `📊 ${note}`);
  lines.push("", `🕒 ${stamp()}`, "", `📲 Descarga Bolos VE: ${DOWNLOAD_URL}`);
  return {
    text: lines.join("\n"),
    card: {
      title: "Tasas de hoy",
      rows: latest.rates.map((r) => ({
        label: r.title,
        value: `Bs ${fmt(r.price)}`,
        sub: r.previous != null ? `Antes: ${fmt(r.previous)}` : undefined,
      })),
      note,
      stamp: stamp(),
    },
  };
}

// Lee el resultado que ya está en pantalla de la calculadora abierta.
function calcContent(): Content | null {
  const panel = document.querySelector<HTMLElement>("#view-calc .calc-panel:not(.hidden)");
  if (!panel) return null;
  const which = panel.dataset.panel;

  if (which === "pm") {
    const value = document.getElementById("pmResult")?.textContent?.trim();
    const detail = document.getElementById("pmDetail")?.textContent?.trim();
    if (!value || value === "—") return null;
    return {
      text: [
        "💸 *Pago Móvil — Bolos VE*",
        "",
        value,
        ...(detail ? [detail] : []),
        "",
        `🕒 ${stamp()}`,
        "",
        `📲 Descarga Bolos VE: ${DOWNLOAD_URL}`,
      ].join("\n"),
      card: {
        title: "Calculadora de Pago Móvil",
        rows: [{ label: "Resultado", value, sub: detail || undefined }],
        stamp: stamp(),
      },
    };
  }

  if (which === "conviene") {
    const box = document.getElementById("convResult");
    const opts = [...(box?.querySelectorAll(".conv-opt") ?? [])];
    const verdict = box?.querySelector(".conv-verdict")?.textContent?.trim();
    if (opts.length < 2 || !verdict) return null;
    const rows = opts.map((o) => {
      // La opción es: <span>Pagar en <b>Bs</b> · Tasa<br><small>detalle</small></span><b>$ 14,55</b>
      // El monto es el <b> hijo directo (dentro del span hay otro <b> decorativo).
      const span = o.querySelector("span");
      const detail = span?.querySelector("small")?.textContent?.trim();
      const label = span?.cloneNode(true) as HTMLElement | undefined;
      label?.querySelector("small")?.remove();
      return {
        label: label?.textContent?.replace(/\s+/g, " ").trim() ?? "",
        value: o.querySelector(":scope > b")?.textContent?.trim() ?? "",
        sub: detail || undefined,
      };
    });
    return {
      text: [
        "⚖️ *¿Me conviene? — Bolos VE*",
        "",
        ...rows.map((r) => `${r.label}: ${r.value}`),
        "",
        verdict,
        "",
        `🕒 ${stamp()}`,
        "",
        `📲 Descarga Bolos VE: ${DOWNLOAD_URL}`,
      ].join("\n"),
      card: { title: "¿Me conviene?", rows, note: verdict, stamp: stamp() },
    };
  }
  return null;
}

function buildContent(): Content | null {
  const calcActive = document.getElementById("view-calc")?.classList.contains("active");
  // En Calculadoras se comparte el cálculo; si aún no hay resultado, las tasas.
  return (calcActive ? calcContent() : null) ?? ratesContent();
}

// ---------- Envío ----------

function plugin(name: string): any {
  return (window as any).Capacitor?.Plugins?.[name] ?? null;
}

/** Guarda el JPEG en la caché del teléfono y devuelve su ruta para adjuntarlo. */
async function writeImage(base64: string): Promise<string | null> {
  const fs = plugin("Filesystem");
  if (!fs?.writeFile) return null;
  try {
    const res = await fs.writeFile({
      path: `bolos-ve-${Date.now()}.jpg`,
      data: base64,
      directory: "CACHE",
    });
    return res?.uri ?? null;
  } catch (err) {
    console.warn("[share] no se pudo guardar la imagen:", err);
    return null;
  }
}

async function share(): Promise<void> {
  const content = buildContent();
  if (!content) {
    toast("Aún no hay nada que compartir");
    return;
  }
  const { text, card } = content;
  const sharePlugin = plugin("Share");

  if (sharePlugin?.share) {
    toast("Preparando…");
    // La imagen es un extra: si falla, se comparte igual solo el texto.
    let uri: string | null = null;
    if (card) {
      const base64 = await buildShareImage(card);
      if (base64) uri = await writeImage(base64);
    }
    try {
      await sharePlugin.share({
        title: "Bolos VE",
        text,
        dialogTitle: "Compartir",
        ...(uri ? { files: [uri] } : {}),
      });
    } catch {
      /* el usuario canceló */
    }
    return;
  }

  // Navegador: Web Share API y, si no, copiar al portapapeles.
  try {
    if (navigator.share) {
      await navigator.share({ title: "Bolos VE", text });
      return;
    }
  } catch {
    /* cancelado o no disponible */
  }
  const ok = await copyText(text);
  if (ok) toast("Copiado — pégalo donde quieras");
}

export function initShare(): void {
  document.getElementById("shareBtn")?.addEventListener("click", share);
}
