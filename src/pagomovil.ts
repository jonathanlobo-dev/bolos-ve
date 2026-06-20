// Vista Pago Móvil: calcula la comisión bancaria en ambos sentidos.
//
//  Modo A ("Quiero enviar X"):
//      necesitas en la cuenta = X + comisión(X) = X * (1 + tarifa)
//
//  Modo B ("Tengo X en la cuenta"):
//      máximo que puedes enviar = X / (1 + tarifa)
//      (porque enviado + comisión(enviado) = saldo)

import { attachAmountInput, readAmount } from "./amountInput";
import { load, save } from "./storage";
import { attachHoldToCopy, buzz, copyText, fmt, toast } from "./util";

const FEE_KEY = "bolitas.pmFee";
const DEFAULT_FEE = 0.3; // %

type Mode = "send" | "have";
let mode: Mode = "send";
let lastResult = 0; // último monto calculado (para copiar)

function feePct(): number {
  const el = document.getElementById("pmFee") as HTMLInputElement | null;
  const v = el ? parseFloat(el.value.replace(",", ".")) : DEFAULT_FEE;
  return Number.isFinite(v) ? v : 0;
}

function compute(): void {
  const out = document.getElementById("pmResult");
  const detail = document.getElementById("pmDetail");
  if (!out || !detail) return;

  const amount = readAmount("pmAmount");
  const rate = feePct() / 100;
  if (!Number.isFinite(amount) || amount <= 0) {
    out.textContent = "—";
    detail.textContent = "";
    lastResult = 0;
    return;
  }

  if (mode === "send") {
    // quiero que LLEGUEN `amount` Bs → cuánto necesito tener
    const fee = amount * rate;
    const needed = amount + fee;
    lastResult = needed;
    out.textContent = `Bs ${fmt(needed)}`;
    detail.textContent = `Para enviar Bs ${fmt(amount)} necesitas tener Bs ${fmt(
      needed,
    )} en la cuenta (comisión: Bs ${fmt(fee)}).`;
  } else {
    // tengo `amount` Bs → cuánto es lo máximo que puedo enviar
    const maxSend = amount / (1 + rate);
    const fee = amount - maxSend;
    lastResult = maxSend;
    out.textContent = `Bs ${fmt(maxSend)}`;
    detail.textContent = `Con Bs ${fmt(amount)} en la cuenta puedes enviar como máximo Bs ${fmt(
      maxSend,
    )} (comisión: Bs ${fmt(fee)}).`;
  }
}

export function initPagoMovil(): void {
  // cargar tarifa guardada (o default 0.30%)
  const feeEl = document.getElementById("pmFee") as HTMLInputElement | null;
  if (feeEl) {
    feeEl.value = String(load<number>(FEE_KEY, DEFAULT_FEE));
    feeEl.addEventListener("input", () => {
      save(FEE_KEY, feePct());
      compute();
    });
  }

  const pmAmountEl = document.getElementById("pmAmount") as HTMLInputElement | null;
  if (pmAmountEl) attachAmountInput(pmAmountEl, { onChange: compute });

  // mantener presionado el resultado para copiarlo
  const pmResultEl = document.getElementById("pmResult");
  if (pmResultEl)
    attachHoldToCopy(
      pmResultEl,
      () => (lastResult > 0 ? lastResult.toFixed(2) : null),
      () => `Copiado: Bs ${fmt(lastResult)}`,
    );

  document.getElementById("pmCopyBtn")?.addEventListener("click", async () => {
    if (lastResult <= 0) return;
    const ok = await copyText(lastResult.toFixed(2));
    if (ok) {
      buzz(30);
      toast(`Copiado: Bs ${fmt(lastResult)}`);
    }
  });

  const applyMode = () => {
    const label = document.getElementById("pmAmountLabel");
    const help = document.getElementById("pmModeHelp");
    if (mode === "send") {
      if (label) label.textContent = "Monto a enviar (lo que recibe la persona)";
      if (help)
        help.textContent =
          "Escribe cuánto quieres que LE LLEGUE a la persona. Te decimos cuánto necesitas tener en la cuenta (monto + comisión).";
    } else {
      if (label) label.textContent = "Saldo que tienes en la cuenta";
      if (help)
        help.textContent =
          "Escribe tu SALDO disponible. Te decimos el máximo que puedes enviar para que, con la comisión, no se pase.";
    }
  };

  document.querySelectorAll<HTMLButtonElement>(".pm-mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".pm-mode-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      mode = (btn.dataset.mode as Mode) ?? "send";
      applyMode();
      compute();
    });
  });

  applyMode();
  compute();
}
