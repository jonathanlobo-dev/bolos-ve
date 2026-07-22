// Compartir por el menú NATIVO del teléfono (WhatsApp, Telegram…).
// Se manda texto + una imagen que resume lo que estás viendo: si estás en
// Inicio van las tasas, y si estás en una calculadora, su resultado.

import { calcGap, type RatesResult } from "./rateProvider";
import { getConvieneData } from "./calculators";
import { getHistoryView, prettyDate } from "./history";
import { convertWith, getHomeAmount } from "./home";
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
  // Si se está viendo una fecha pasada, se comparte ESE día (con su fecha).
  const hist = getHistoryView();
  const result = hist?.result ?? latest;
  if (!result || result.rates.length === 0) return null;
  const gap = calcGap(result);
  const note = gap != null ? `Brecha BCV ↔ P2P: ${fmt(gap)}%` : undefined;
  const fecha = hist ? prettyDate(hist.date) : null;
  const when = fecha ? `del ${fecha}` : "de hoy";
  const sello = fecha ? `${fecha} · cierre del día` : stamp();

  // Si hay un monto escrito en Inicio se comparte convertido, y debajo las
  // tasas "peladas" como respaldo. Con 0 (o con el 1 por defecto) no aporta
  // nada convertir, así que se comparten solo las tasas.
  const { amount, toBs } = getHomeAmount();
  const withAmount = amount > 0 && amount !== 1;
  const money = (v: number, r: (typeof result.rates)[number]) =>
    toBs ? `Bs ${fmt(v)}` : `${r.symbol} ${fmt(v)}`;
  const head = toBs ? `$ ${fmt(amount)}` : `Bs ${fmt(amount)}`;

  const lines: string[] = [];
  if (withAmount) {
    lines.push(`💱 *${head} ${fecha ? `al ${fecha}` : ""} — Bolos VE*`.replace("  ", " "), "");
    for (const r of result.rates) {
      lines.push(`${r.icon} ${r.title}: ${money(convertWith(r, amount, toBs), r)}`);
    }
    lines.push("", `📊 *Tasas ${when}:*`);
  } else {
    lines.push(`💱 *Tasas ${when} — Bolos VE*`, "");
  }
  for (const r of result.rates) lines.push(`${r.icon} ${r.title}: Bs ${fmt(r.price)}`);
  if (note) lines.push("", `📊 ${note}`);
  lines.push("", `🕒 ${sello}`, "", `📲 Descarga Bolos VE: ${DOWNLOAD_URL}`);

  return {
    text: lines.join("\n"),
    card: {
      title: withAmount
        ? `${head} ${fecha ? `al ${fecha}` : "equivale a"}`
        : `Tasas ${when}`,
      rows: result.rates.map((r) => ({
        label: r.title,
        value: withAmount ? money(convertWith(r, amount, toBs), r) : `Bs ${fmt(r.price)}`,
        // Con monto, debajo va la tasa usada; sin monto, el valor anterior.
        sub: withAmount
          ? `1 ${r.symbol} = Bs ${fmt(r.price)}`
          : r.previous != null
            ? `Antes: ${fmt(r.previous)}`
            : undefined,
      })),
      note,
      stamp: sello,
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
    // Se toman los números del propio cálculo (no de la pantalla), así se
    // puede incluir el precio en bolívares y sus equivalentes al BCV.
    const d = getConvieneData();
    if (!d) return null;
    const verdict = `Te conviene pagar en ${d.cheaperBs ? "bolívares" : "dólares/USDT"} · ahorras $ ${fmt(d.ahorro)}`;
    const equiv: string[] = [];
    if (d.bcvUsd > 0) equiv.push(`$ ${fmt(d.bcvUsd)} al BCV`);
    if (d.bcvEur > 0) equiv.push(`€ ${fmt(d.bcvEur)} al BCV`);

    return {
      text: [
        "⚖️ *¿Me conviene? — Bolos VE*",
        "",
        `💵 Precio en efectivo/USDT: $ ${fmt(d.usd)}`,
        `💰 Precio en bolívares: Bs ${fmt(d.bs)}`,
        ...(equiv.length ? [`   (equivale a ${equiv.join(" · ")})`] : []),
        "",
        `Para conseguir esos Bs vendiendo $ a ${fmt(d.ratePrice)} (${d.rateLabel}) tendrías que vender: $ ${fmt(d.costInUsd)}`,
        "",
        `✅ ${verdict}`,
        "",
        `🕒 ${stamp()}`,
        "",
        `📲 Descarga Bolos VE: ${DOWNLOAD_URL}`,
      ].join("\n"),
      card: {
        title: "¿Me conviene?",
        rows: [
          { label: "Precio en efectivo / USDT", value: `$ ${fmt(d.usd)}` },
          {
            label: "Precio en bolívares",
            value: `Bs ${fmt(d.bs)}`,
            sub: equiv.length ? `= ${equiv.join(" · ")}` : undefined,
          },
          {
            label: `Vendiendo $ a ${fmt(d.ratePrice)} (${d.rateLabel})`,
            value: `$ ${fmt(d.costInUsd)}`,
            sub: `tendrías que vender esto para cubrir los Bs`,
          },
        ],
        note: verdict,
        stamp: stamp(),
      },
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
