// Hub de Calculadoras: navegación entre Pago Móvil y "¿Me conviene?".
// (La lógica de Pago Móvil vive en pagomovil.ts; aquí va el Comparador.)

import { rateById, type Rate, type RatesResult } from "./rateProvider";
import { attachAmountInput, readAmount } from "./amountInput";
import { attachHoldToCopy, fmt } from "./util";

let rates: RatesResult | null = null;
let convBest = 0; // costo (en $) de la opción más conveniente, para copiar
let ganProfit = 0; // ganancia en Bs de la calculadora de USDT, para copiar

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
    return;
  }
  const costBsInUsd = bs / ratePrice; // lo que te cuesta en $ pagar el precio en Bs
  const cheaperBs = costBsInUsd < usd;
  convBest = Math.min(usd, costBsInUsd);
  const ahorro = Math.abs(usd - costBsInUsd);
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

// ---------- Ganancia USDT ----------
// Compro X USDT pagando Bs a la tasa A; los vendo a la tasa B → ganancia en Bs y %.
function computeGanancia(): void {
  const box = document.getElementById("ganResult");
  if (!box) return;
  const qty = readAmount("ganQty");
  const buy = numVal("ganBuy");
  const sell = numVal("ganSell");

  if (!(qty > 0) || !(buy > 0) || !(sell > 0)) {
    box.innerHTML = `<p class="pm-detail">Escribe la cantidad de USDT, la tasa de compra y la de venta.</p>`;
    ganProfit = 0;
    return;
  }
  const invested = qty * buy;
  const received = qty * sell;
  const profit = received - invested;
  const pct = ((sell - buy) / buy) * 100;
  ganProfit = profit;
  const gain = profit >= 0;
  box.innerHTML = `
    <div class="conv-opt">
      <span>Inviertes (${fmt(qty)} × ${fmt(buy)})</span>
      <b>Bs ${fmt(invested)}</b>
    </div>
    <div class="conv-opt">
      <span>Recibes (${fmt(qty)} × ${fmt(sell)})</span>
      <b>Bs ${fmt(received)}</b>
    </div>
    <p class="conv-verdict">${gain ? "Ganas" : "Pierdes"} <b>Bs ${fmt(Math.abs(profit))}</b> (${
      gain ? "+" : "−"
    }${fmt(Math.abs(pct))}%)</p>`;
}

// Sugiere el P2P actual como tasa de venta (solo como placeholder, no pisa lo escrito).
function fillGanPlaceholders(): void {
  const sellEl = document.getElementById("ganSell") as HTMLInputElement | null;
  const p2p = rates ? rateById(rates, "binance_usd") : undefined;
  if (sellEl && p2p) sellEl.placeholder = `Ej: ${p2p.price.toFixed(2)} (P2P actual)`;
}

// ---------- Inicialización ----------
export function setCalcRates(result: RatesResult): void {
  rates = result;
  fillConvRate();
  computeConviene();
  fillGanPlaceholders();
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
  const convBsEl = document.getElementById("convBs") as HTMLInputElement | null;
  if (convUsdEl) attachAmountInput(convUsdEl, { onChange: computeConviene });
  if (convBsEl) attachAmountInput(convBsEl, { onChange: computeConviene });
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

  // Ganancia USDT
  const ganQtyEl = document.getElementById("ganQty") as HTMLInputElement | null;
  if (ganQtyEl) attachAmountInput(ganQtyEl, { onChange: computeGanancia });
  document.getElementById("ganBuy")?.addEventListener("input", computeGanancia);
  document.getElementById("ganSell")?.addEventListener("input", computeGanancia);
  const ganBox = document.getElementById("ganResult");
  if (ganBox)
    attachHoldToCopy(
      ganBox,
      () => (ganProfit !== 0 ? ganProfit.toFixed(2) : null),
      (t) => `Copiado: Bs ${t}`,
    );
  computeGanancia();

  showHub();
}
