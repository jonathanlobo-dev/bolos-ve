// Input estilo calculadora: los dígitos se llenan de derecha a izquierda como
// centavos (0,00 → 0,01 → 0,15 → 1,50 → 15,00). Guarda el valor numérico real
// en input.dataset.amount para leerlo sin problemas de formato (miles/decimales).

import { fmt } from "./util";

interface Opts {
  defaultValue?: number; // si se define (ej. 1), arranca en ese valor; si no, en 0,00
  onChange?: (value: number) => void;
}

export interface AmountHandle {
  clear: () => void;
  setValue: (v: number) => void;
  getValue: () => number;
}

export function attachAmountInput(input: HTMLInputElement, opts: Opts = {}): AmountHandle {
  const hasDefault = typeof opts.defaultValue === "number";
  let digits = "";
  let isDefault = hasDefault;

  const setNum = (v: number) => {
    input.dataset.amount = String(v);
    opts.onChange?.(v);
  };

  const showDefault = () => {
    digits = "";
    isDefault = true;
    input.value = fmt(opts.defaultValue!);
    setNum(opts.defaultValue!);
  };

  const apply = () => {
    const cents = parseInt(digits || "0", 10);
    const v = cents / 100;
    input.value = digits === "" ? "" : fmt(v);
    setNum(v);
  };

  // estado inicial
  if (hasDefault) showDefault();
  else {
    input.value = "";
    input.dataset.amount = "0";
  }

  input.addEventListener("focus", () => {
    if (isDefault) {
      digits = "";
      input.value = "";
    }
  });
  input.addEventListener("input", () => {
    digits = input.value.replace(/\D/g, "").slice(0, 12);
    isDefault = false;
    apply();
  });
  input.addEventListener("blur", () => {
    if (digits === "" && hasDefault) showDefault();
  });

  return {
    clear() {
      if (hasDefault) showDefault();
      else {
        digits = "";
        input.value = "";
        setNum(0);
      }
    },
    setValue(v: number) {
      digits = String(Math.round(v * 100));
      isDefault = false;
      apply();
    },
    getValue() {
      return parseFloat(input.dataset.amount || "0") || 0;
    },
  };
}

/** Lee el valor numérico de un input (sea estilo calculadora o normal). */
export function readAmount(id: string): number {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (!el) return NaN;
  if (el.dataset.amount != null) {
    const v = parseFloat(el.dataset.amount);
    return Number.isFinite(v) ? v : NaN;
  }
  const v = parseFloat(String(el.value).replace(",", "."));
  return Number.isFinite(v) ? v : NaN;
}
