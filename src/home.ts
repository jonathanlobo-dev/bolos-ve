// Vista Inicio: calculadora implícita (un monto arriba) + tarjetas configurables.
// El monto se ingresa estilo calculadora: arranca en 1, y al escribir se llena
// de derecha a izquierda como centavos (0,01 → 0,15 → 1,50 → 15,00).

import { calcGap, dailyHistory, type Rate, type RatesResult } from "./rateProvider";
import { getConfig, onConfigChange, visibleOrderedIds } from "./config";
import { attachAmountInput, type AmountHandle } from "./amountInput";
import { load, save } from "./storage";
import { attachHold, attachHoldToCopy, fmt } from "./util";

type Direction = "toBs" | "fromBs"; // moneda→Bs  |  Bs→moneda

let current: RatesResult | null = null;
let amount = 1;
let direction: Direction = "toBs";
let amountHandle: AmountHandle | null = null;

function visibleRates(): Rate[] {
  if (!current) return [];
  const byId = new Map(current.rates.map((r) => [r.id, r]));
  return visibleOrderedIds()
    .map((id) => byId.get(id))
    .filter((r): r is Rate => !!r);
}

function convertedValue(rate: Rate): number {
  if (direction === "toBs") return amount * rate.price;
  return rate.price ? amount / rate.price : 0;
}
function convertedText(rate: Rate): string {
  return direction === "toBs"
    ? `Bs ${fmt(convertedValue(rate))}`
    : `${rate.symbol} ${fmt(convertedValue(rate))}`;
}

// Mini-gráfico de los últimos días (necesita al menos 2 snapshots diarios).
function sparkSvg(points: number[]): string {
  if (points.length < 2) return "";
  const w = 64;
  const h = 20;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const pts = points
    .map((p, i) => `${((i / (points.length - 1)) * w).toFixed(1)},${(h - 2 - ((p - min) / span) * (h - 4)).toFixed(1)}`)
    .join(" ");
  const trend = points[points.length - 1] >= points[0] ? "up" : "down";
  return `<svg class="spark ${trend}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" /></svg>`;
}

function cardHtml(rate: Rate): string {
  const up = rate.percent > 0;
  const down = rate.percent < 0;
  const cls = up ? "up" : down ? "down" : "flat";
  const arrow = up ? "↗" : down ? "↘" : "→";
  const badge = rate.percent
    ? `${arrow} ${fmt(Math.abs(rate.change))} Bs | ${Math.abs(rate.percent).toFixed(2)}%`
    : "—";
  const unit = `1 ${rate.symbol} = Bs ${fmt(rate.price)}`;
  const antes =
    rate.previous != null
      ? `<div class="rate-prev">Antes: ${fmt(rate.previous)}</div>`
      : rate.lastUpdate.startsWith("vigente")
        ? `<div class="rate-prev">${rate.lastUpdate}</div>`
        : "";
  // Al ver una fecha pasada se muestra el rango del día en vez del cambio.
  const hasRange = rate.dayMin != null && rate.dayMax != null && rate.dayMax > rate.dayMin;
  const footer = hasRange
    ? `<div class="rate-badge flat">Mín ${fmt(rate.dayMin!)} · Máx ${fmt(rate.dayMax!)}</div>`
    : `<div class="rate-badge ${cls}">${badge}</div>`;
  return `
    <div class="rate-card" data-id="${rate.id}">
      <div class="rate-head">
        <span class="rate-title">${rate.icon} ${rate.title}</span>
        ${sparkSvg(dailyHistory(rate.id))}
      </div>
      <div class="rate-converted">${convertedText(rate)}</div>
      <div class="rate-unit">${unit}</div>
      ${antes}
      ${footer}
    </div>`;
}

function recompute(): void {
  if (!current) return;
  document.querySelectorAll<HTMLElement>(".rate-card").forEach((card) => {
    const id = card.dataset.id;
    const rate = current!.rates.find((r) => r.id === id);
    const el = card.querySelector(".rate-converted");
    if (rate && el) el.textContent = convertedText(rate);
  });
}

// ---- Mantener presionado: la tarjeta copia el monto (pegable en el banco);
// la línea "1 $ = Bs …" copia la tasa formateada para compartir por WhatsApp. ----
function attachLongPressCopy(container: HTMLElement): void {
  container.querySelectorAll<HTMLElement>(".rate-card").forEach((card) => {
    const rateOf = () => current?.rates.find((r) => r.id === card.dataset.id);
    attachHoldToCopy(
      card,
      () => {
        const rate = rateOf();
        return rate ? convertedValue(rate).toFixed(2) : null; // ej "563.29"
      },
      () => {
        const rate = rateOf();
        return `Copiado: ${rate ? convertedText(rate) : ""}`;
      },
    );
    const unitEl = card.querySelector<HTMLElement>(".rate-unit");
    if (unitEl)
      attachHoldToCopy(
        unitEl,
        () => {
          const rate = rateOf();
          return rate ? `${rate.icon} ${rate.title}: Bs ${fmt(rate.price)}` : null;
        },
        (t) => `Copiado: ${t}`,
        { stopPropagation: true },
      );
  });
}

function renderCards(): void {
  const container = document.getElementById("cardsContainer");
  if (!container) return;
  const layout = getConfig().layout;
  container.className = `cards layout-${layout}`;

  if (!current) {
    container.innerHTML = `<p class="empty">Cargando…</p>`;
    return;
  }
  const list = visibleRates();
  if (list.length === 0) {
    container.innerHTML = `<p class="empty">No hay tarjetas para mostrar.<br/>Actívalas en ⚙️ Configuración o revisa tu conexión.</p>`;
    return;
  }
  container.innerHTML = list.map(cardHtml).join("");
  attachLongPressCopy(container);
}

function renderGap(result: RatesResult): void {
  const strip = document.getElementById("gapStrip");
  if (!strip) return;
  const gap = calcGap(result);
  if (gap == null) {
    strip.classList.add("hidden");
    return;
  }
  strip.classList.remove("hidden");
  strip.innerHTML = `📊 Brecha BCV ↔ P2P: <b>${fmt(gap)}%</b>`;
}

export function renderHome(result: RatesResult): void {
  current = result;
  renderCards();
  renderGap(result);

  const updated = document.getElementById("homeUpdated");
  if (updated) {
    if (result.source === "historial") {
      updated.textContent = "Cierre de ese día";
    } else if (result.fetchedAt === 0) {
      updated.textContent = "Sin datos. Revisa tu conexión.";
    } else {
      const time = new Date(result.fetchedAt).toLocaleTimeString("es-VE", {
        hour: "2-digit",
        minute: "2-digit",
      });
      updated.textContent = result.stale ? `⚠️ Desactualizado · ${time}` : `Actualizado ${time}`;
    }
  }
}

export function initHome(): void {
  direction = "toBs"; // siempre arranca en $ → Bs (no se recuerda entre sesiones)

  // input principal: estilo calculadora, arranca en 1
  const el = document.getElementById("calcAmount") as HTMLInputElement | null;
  if (el) {
    amountHandle = attachAmountInput(el, {
      defaultValue: 1,
      onChange: (v) => {
        amount = v;
        recompute();
      },
    });
  }

  const dirBtn = document.getElementById("dirToggle");
  const updateDirLabel = () => {
    if (dirBtn) dirBtn.textContent = direction === "toBs" ? "$ → Bs" : "Bs → $";
  };
  updateDirLabel();
  dirBtn?.addEventListener("click", () => {
    direction = direction === "toBs" ? "fromBs" : "toBs";
    updateDirLabel();
    recompute();
  });

  // limpiar (botón en la barra superior):
  //  - en Inicio → vuelve el monto al valor por defecto (1)
  //  - en Calculadoras → limpia los campos (estilo calculadora) de la vista activa
  document.getElementById("clearBtn")?.addEventListener("click", () => {
    const homeActive = document.getElementById("view-home")?.classList.contains("active");
    if (homeActive) {
      amountHandle?.clear();
      return;
    }
    document.querySelectorAll<HTMLInputElement>(".view.active input").forEach((inp) => {
      if (inp.dataset.amount == null || inp.offsetParent === null) return; // solo campos estilo calculadora visibles
      inp.value = "";
      inp.dispatchEvent(new Event("input", { bubbles: true }));
    });
  });

  // atajos de montos rápidos: tocar aplica el monto; mantener presionado lo edita
  const CHIPS_KEY = "bolitas.chips";
  const chips = [...document.querySelectorAll<HTMLButtonElement>(".chip[data-amt]")];
  const savedChips = load<number[]>(CHIPS_KEY, []);
  chips.forEach((chip, i) => {
    if (savedChips[i] > 0) {
      chip.dataset.amt = String(savedChips[i]);
      chip.textContent = fmt(savedChips[i]).replace(/,00$/, "");
    }
    chip.addEventListener("click", () => {
      if (chip.dataset.held) {
        delete chip.dataset.held; // el click posterior a un hold no aplica el monto
        return;
      }
      const v = parseFloat(chip.dataset.amt || "0");
      if (v > 0) amountHandle?.setValue(v);
    });
    attachHold(chip, () => {
      const cur = chip.dataset.amt || "";
      const raw = window.prompt("Nuevo valor para este botón:", cur);
      if (raw == null) return;
      const v = parseFloat(raw.replace(",", "."));
      if (!(v > 0)) return;
      chip.dataset.amt = String(v);
      chip.textContent = fmt(v).replace(/,00$/, "");
      const vals = chips.map((c) => parseFloat(c.dataset.amt || "0"));
      save(CHIPS_KEY, vals);
    });
  });

  onConfigChange(renderCards);
}
