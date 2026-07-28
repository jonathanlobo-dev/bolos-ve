// Tasa personalizada: un valor (Bs por 1 $) que el usuario fija a mano, para
// una cuarta tarjeta en Inicio (ej. la tasa de su banco o de su vendedor P2P).
// Vive en su propio módulo para que Inicio y Compartir la usen sin ciclos.

import { load, save } from "./storage";

const KEY = "bolitas.customRate";

/** Bs por 1 $. Devuelve 0 si aún no se ha fijado. */
export function getCustomRate(): number {
  const v = load<number>(KEY, 0);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

export function setCustomRate(value: number): void {
  save(KEY, Number.isFinite(value) && value > 0 ? value : 0);
}
