// Utilidades compartidas: formato de número, copiar al portapapeles + toast.

/** Formatea un número al estilo Venezuela: miles con "." y 2 decimales con ",". */
export const fmt = (n: number) =>
  n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Devuelve el `<svg>` de un icono del sprite (ver index.html).
 * Se usa para la interfaz; en textos (compartir, notificaciones) van emojis.
 */
export const icon = (name: string): string =>
  `<svg class="ic" aria-hidden="true"><use href="#ic-${name}" /></svg>`;

// Cada tasa tiene su icono; si aparece una nueva, cae en el del banco.
const RATE_ICONS: Record<string, string> = {
  bcv_usd: "bank",
  binance_usd: "wallet",
  bcv_eur: "euro",
};

/** Icono de una tasa por su id. */
export const rateIcon = (id: string): string => icon(RATE_ICONS[id] ?? "bank");

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback para contextos sin permiso de portapapeles
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

export function toast(message: string): void {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add("show");
  const anyEl = el as HTMLElement & { _t?: number };
  if (anyEl._t) clearTimeout(anyEl._t);
  anyEl._t = window.setTimeout(() => el?.classList.remove("show"), 1400);
}

/** Vibración corta de feedback (si el dispositivo lo soporta). */
export function buzz(ms = 30): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* no soportado */
  }
}

export interface HoldOpts {
  ms?: number; // umbral en ms (por defecto 450)
  stopPropagation?: boolean; // para elementos anidados dentro de otro con hold
}

/**
 * Detecta "mantener presionado" (~0.45s sin mover el dedo) y llama `onHold`.
 * Marca el elemento con dataset.held="1" para que un click posterior pueda ignorarse.
 */
export function attachHold(el: HTMLElement, onHold: () => void, opts: HoldOpts = {}): void {
  const ms = opts.ms ?? 450;
  let timer: number | undefined;
  let sx = 0;
  let sy = 0;
  const start = (e: PointerEvent) => {
    if (opts.stopPropagation) e.stopPropagation();
    delete el.dataset.held;
    sx = e.clientX;
    sy = e.clientY;
    timer = window.setTimeout(() => {
      el.dataset.held = "1";
      onHold();
    }, ms);
  };
  const cancel = () => {
    if (timer) clearTimeout(timer);
  };
  const move = (e: PointerEvent) => {
    if (Math.hypot(e.clientX - sx, e.clientY - sy) > 10) cancel();
  };
  el.addEventListener("pointerdown", start);
  el.addEventListener("pointerup", cancel);
  el.addEventListener("pointercancel", cancel);
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerleave", cancel);
}

/**
 * Mantener presionado un elemento (~0.45s) para copiar.
 * `getText` devuelve el texto a copiar (o null si no hay nada).
 * `label` arma el mensaje del toast.
 */
export function attachHoldToCopy(
  el: HTMLElement,
  getText: () => string | null,
  label: (t: string) => string = (t) => `Copiado: ${t}`,
  opts: HoldOpts = {},
): void {
  attachHold(
    el,
    () => {
      const text = getText();
      if (!text) return;
      copyText(text);
      buzz(30);
      el.classList.add("copied");
      setTimeout(() => el.classList.remove("copied"), 350);
      toast(label(text));
    },
    opts,
  );
}
