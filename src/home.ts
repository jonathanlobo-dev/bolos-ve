// Vista Inicio: calculadora implícita (un monto arriba) + tarjetas configurables.
// El monto se ingresa estilo calculadora: arranca en 1, y al escribir se llena
// de derecha a izquierda como centavos (0,01 → 0,15 → 1,50 → 15,00).

import type { Rate, RatesResult } from "./rateProvider";
import { getConfig, onConfigChange, visibleOrderedIds } from "./config";
import { attachAmountInput, type AmountHandle } from "./amountInput";
import { buzz, copyText, fmt, toast } from "./util";

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
    rate.previous != null ? `<div class="rate-prev">Antes: ${fmt(rate.previous)}</div>` : "";
  return `
    <div class="rate-card" data-id="${rate.id}">
      <div class="rate-head">
        <span class="rate-title">${rate.icon} ${rate.title}</span>
      </div>
      <div class="rate-converted">${convertedText(rate)}</div>
      <div class="rate-unit">${unit}</div>
      ${antes}
      <div class="rate-badge ${cls}">${badge}</div>
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

// ---- Copiar el monto al mantener presionada una tarjeta ----
function attachLongPressCopy(container: HTMLElement): void {
  container.querySelectorAll<HTMLElement>(".rate-card").forEach((card) => {
    let timer: number | undefined;
    let sx = 0;
    let sy = 0;
    const start = (e: PointerEvent) => {
      sx = e.clientX;
      sy = e.clientY;
      timer = window.setTimeout(() => {
        const id = card.dataset.id;
        const rate = current?.rates.find((r) => r.id === id);
        if (!rate) return;
        const plain = convertedValue(rate).toFixed(2); // ej "563.29" (pegable en banco)
        copyText(plain);
        buzz(30);
        card.classList.add("copied");
        setTimeout(() => card.classList.remove("copied"), 350);
        toast(`Copiado: ${convertedText(rate)}`);
      }, 450);
    };
    const cancel = () => {
      if (timer) clearTimeout(timer);
    };
    const move = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - sx, e.clientY - sy) > 10) cancel();
    };
    card.addEventListener("pointerdown", start);
    card.addEventListener("pointerup", cancel);
    card.addEventListener("pointercancel", cancel);
    card.addEventListener("pointermove", move);
    card.addEventListener("pointerleave", cancel);
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

export function renderHome(result: RatesResult): void {
  current = result;
  renderCards();

  const updated = document.getElementById("homeUpdated");
  if (updated) {
    if (result.fetchedAt === 0) {
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

  // atajos de montos rápidos
  document.querySelectorAll<HTMLButtonElement>(".chip[data-amt]").forEach((chip) => {
    chip.addEventListener("click", () => {
      const v = parseFloat(chip.dataset.amt || "0");
      if (v > 0) amountHandle?.setValue(v);
    });
  });

  onConfigChange(renderCards);
}
