// Hub de Calculadoras: navegación entre Pago Móvil y "¿Me conviene?".
// (La lógica de Pago Móvil vive en pagomovil.ts; aquí va el Comparador.)

import { rateById, type Rate, type RatesResult } from "./rateProvider";
import { attachAmountInput, readAmount, type AmountHandle } from "./amountInput";
import { attachHoldToCopy, fmt } from "./util";

let rates: RatesResult | null = null;
let convBest = 0; // costo (en $) de la opción más conveniente, para copiar

// Datos del último cálculo de "¿Me conviene?", para compartirlo completo.
export interface ConvieneData {
  usd: number; // precio en efectivo/USDT
  bs: number; // el mismo precio, en bolívares
  bcvUsd: number; // ese precio en $ al BCV
  bcvEur: number; // ese precio en € al BCV
  rateLabel: string; // tasa con la que se consiguen los Bs
  ratePrice: number;
  costInUsd: number; // lo que cuesta pagar en Bs, medido en dólares
  cheaperBs: boolean;
  ahorro: number;
}
let convData: ConvieneData | null = null;

export function getConvieneData(): ConvieneData | null {
  return convData;
}

function numVal(id: string): number {
  const el = document.getElementById(id) as HTMLInputElement | null;
  const v = el ? parseFloat(el.value.replace(",", ".")) : NaN;
  return Number.isFinite(v) ? v : NaN;
}

// ---------- Navegación del hub ----------
function showHub(): void {
  document.getElementById("calcHub")?.classList.remove("hidden");
  document.querySelectorAll<HTMLElement>(".calc-panel").forEach((p) => p.classList.add("hidden"));
}
function showPanel(name: string): void {
  document.getElementById("calcHub")?.classList.add("hidden");
  document.querySelectorAll<HTMLElement>(".calc-panel").forEach((p) => {
    p.classList.toggle("hidden", p.dataset.panel !== name);
  });
}

// ---------- ¿Me conviene? ----------
function fillConvRate(): void {
  const sel = document.getElementById("convRate") as HTMLSelectElement | null;
  if (!sel || !rates) return;
  const prev = sel.value;
  const ids = ["binance_usd", "bcv_usd", "bcv_eur"]; // USDT primero (lo más común para conseguir Bs)
  const opts = ids
    .map((id) => rateById(rates!, id))
    .filter((r): r is Rate => !!r)
    .map((r) => `<option value="${r.id}">${r.title} — Bs ${fmt(r.price)}</option>`);
  opts.push(`<option value="custom">✏️ Tasa personalizada</option>`);
  sel.innerHTML = opts.join("");
  if (prev && [...sel.options].some((o) => o.value === prev)) sel.value = prev;
  updateCustomVisibility();
}

function updateCustomVisibility(): void {
  const sel = document.getElementById("convRate") as HTMLSelectElement | null;
  const custom = document.getElementById("convCustomRate");
  custom?.classList.toggle("hidden", sel?.value !== "custom");
}

function computeConviene(): void {
  const box = document.getElementById("convResult");
  const sel = document.getElementById("convRate") as HTMLSelectElement | null;
  if (!box || !sel) return;
  const usd = readAmount("convUsd");
  const bs = readAmount("convBs");

  // tasa: personalizada o una de las fuentes
  let ratePrice: number;
  let rateLabel: string;
  if (sel.value === "custom") {
    ratePrice = numVal("convCustomRate");
    rateLabel = "Personalizada";
  } else {
    const r = rates ? rateById(rates, sel.value) : undefined;
    ratePrice = r ? r.price : NaN;
    rateLabel = r ? r.title : "";
  }

  if (!(usd > 0) || !(bs > 0) || !(ratePrice > 0)) {
    box.innerHTML = `<p class="pm-detail">Escribe el precio en $, el precio en Bs y la tasa para comparar.</p>`;
    convBest = 0;
    convData = null;
    return;
  }
  const costBsInUsd = bs / ratePrice; // lo que te cuesta en $ pagar el precio en Bs
  const cheaperBs = costBsInUsd < usd;
  convBest = Math.min(usd, costBsInUsd);
  const ahorro = Math.abs(usd - costBsInUsd);

  // Se guarda el cálculo completo (incluye los equivalentes al BCV) para que
  // al compartir no falte el precio en bolívares.
  const bcvUsdRate = rates ? (rateById(rates, "bcv_usd")?.price ?? 0) : 0;
  const bcvEurRate = rates ? (rateById(rates, "bcv_eur")?.price ?? 0) : 0;
  convData = {
    usd,
    bs,
    bcvUsd: bcvUsdRate > 0 ? bs / bcvUsdRate : 0,
    bcvEur: bcvEurRate > 0 ? bs / bcvEurRate : 0,
    rateLabel,
    ratePrice,
    costInUsd: costBsInUsd,
    cheaperBs,
    ahorro,
  };
  box.innerHTML = `
    <div class="conv-opt ${cheaperBs ? "" : "win"}">
      <span>Pagar en <b>$</b> (efectivo/USDT)</span>
      <b>$ ${fmt(usd)}</b>
    </div>
    <div class="conv-opt ${cheaperBs ? "win" : ""}">
      <span>Pagar en <b>Bs</b> · ${rateLabel}<br /><small>Bs ${fmt(bs)} ÷ ${fmt(
        ratePrice,
      )}</small></span>
      <b>$ ${fmt(costBsInUsd)}</b>
    </div>
    <p class="conv-verdict">Te conviene pagar en <b>${
      cheaperBs ? "bolívares" : "dólares/USDT"
    }</b> · ahorras $ ${fmt(ahorro)}</p>`;
}

// ---------- Inicialización ----------
export function setCalcRates(result: RatesResult): void {
  rates = result;
  fillConvRate();
  computeConviene();
}

export function initCalculators(): void {
  document.querySelectorAll<HTMLButtonElement>(".calc-tile").forEach((tile) => {
    tile.addEventListener("click", () => showPanel(tile.dataset.panel!));
  });
  document.querySelectorAll<HTMLButtonElement>(".calc-back").forEach((b) => {
    b.addEventListener("click", showHub);
  });
  document.querySelector('.tab[data-view="calc"]')?.addEventListener("click", showHub);

  const convUsdEl = document.getElementById("convUsd") as HTMLInputElement | null;
  if (convUsdEl) attachAmountInput(convUsdEl, { onChange: computeConviene });

  // Campos enlazados del precio en bolívares: Bs, $ al BCV y € al BCV.
  // Todo se normaliza a bolívares (valor × tasa) y se reparte a los demás.
  // El flag `syncing` evita que se llamen entre sí en bucle.
  const LINKED: { id: string; rateId: string | null }[] = [
    { id: "convBs", rateId: null }, // ya está en bolívares
    { id: "convBcvUsd", rateId: "bcv_usd" },
    { id: "convBcvEur", rateId: "bcv_eur" },
  ];
  const handles: Record<string, AmountHandle> = {};
  let syncing = false;
  const rateFor = (rateId: string | null): number =>
    rateId === null ? 1 : rates ? (rateById(rates, rateId)?.price ?? 0) : 0;

  for (const field of LINKED) {
    const el = document.getElementById(field.id) as HTMLInputElement | null;
    if (!el) continue;
    handles[field.id] = attachAmountInput(el, {
      onChange: (v) => {
        if (!syncing) {
          syncing = true;
          const own = rateFor(field.rateId);
          const bs = v * own; // el monto llevado a bolívares
          for (const other of LINKED) {
            if (other.id === field.id) continue;
            const h = handles[other.id];
            const r = rateFor(other.rateId);
            if (!h) continue;
            if (v > 0 && own > 0 && r > 0) h.setValue(bs / r);
            else h.clear();
          }
          syncing = false;
        }
        computeConviene();
      },
    });
  }
  document.getElementById("convCustomRate")?.addEventListener("input", computeConviene);

  // mantener presionado el resultado para copiar el costo más conveniente
  const convBox = document.getElementById("convResult");
  if (convBox)
    attachHoldToCopy(
      convBox,
      () => (convBest > 0 ? convBest.toFixed(2) : null),
      (t) => `Copiado: $ ${t}`,
    );
  document.getElementById("convRate")?.addEventListener("change", () => {
    updateCustomVisibility();
    computeConviene();
  });

  showHub();
}
