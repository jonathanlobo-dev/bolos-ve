// Configuración estilo Arco: qué tarjetas mostrar/ocultar, en qué orden,
// y el diseño (Columnas / Listado). Se guarda y avisa a quien escuche cambios.

import { AVAILABLE_RATES } from "./rateProvider";
import { hideAdBanner, showAdBanner } from "./ads";
import { applyTheme, getTheme, type Theme } from "./theme";
import { icon, rateIcon } from "./util";
import { openOnboarding } from "./onboarding";
import { load, save } from "./storage";

export type Layout = "columns" | "list";

export interface AppConfig {
  order: string[]; // ids de tasas en orden
  hidden: string[]; // ids ocultas
  layout: Layout;
}

const KEY = "bolitas.config";

function defaults(): AppConfig {
  return { order: AVAILABLE_RATES.map((r) => r.id), hidden: [], layout: "columns" };
}

let config: AppConfig = { ...defaults(), ...load<Partial<AppConfig>>(KEY, {}) };

// Saneamiento del config guardado:
(() => {
  // 1) tasas nuevas (versiones futuras) aparecen en el orden
  const known = new Set(config.order);
  for (const r of AVAILABLE_RATES) if (!known.has(r.id)) config.order.push(r.id);
  // 2) descartar ids ocultos que ya no existen
  const valid = new Set(AVAILABLE_RATES.map((r) => r.id));
  config.hidden = config.hidden.filter((id) => valid.has(id));
  // 3) si quedaron TODAS ocultas, mostrarlas (evita pantalla vacía sin salida)
  if (config.hidden.length >= AVAILABLE_RATES.length) config.hidden = [];
})();

const listeners: Array<() => void> = [];

export function getConfig(): AppConfig {
  return config;
}

/** ids visibles, en orden. */
export function visibleOrderedIds(): string[] {
  return config.order.filter((id) => !config.hidden.includes(id));
}

export function onConfigChange(cb: () => void): void {
  listeners.push(cb);
}

function emit(): void {
  save(KEY, config);
  listeners.forEach((f) => f());
  renderConfigList();
}

// ---------- Panel de configuración ----------
function metaById(id: string) {
  return AVAILABLE_RATES.find((r) => r.id === id);
}

function renderConfigList(): void {
  const list = document.getElementById("configList");
  if (!list) return;
  list.innerHTML = config.order
    .map((id) => {
      const m = metaById(id);
      if (!m) return "";
      const hidden = config.hidden.includes(id);
      return `
        <div class="config-row${hidden ? " off" : ""}" data-id="${id}">
          <button class="eye" data-id="${id}" aria-label="Mostrar/ocultar">${icon(hidden ? "eye-off" : "eye")}</button>
          <span class="config-name">${rateIcon(id)} ${m.title}</span>
          <span class="reorder" data-id="${id}" aria-label="Reordenar">≡</span>
        </div>`;
    })
    .join("");

  // toggle mostrar/ocultar
  list.querySelectorAll<HTMLButtonElement>(".eye").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id!;
      config.hidden = config.hidden.includes(id)
        ? config.hidden.filter((x) => x !== id)
        : [...config.hidden, id];
      emit();
    });
  });

  attachReorder(list);
}

// Reordenar arrastrando el handle ≡ con animación suave:
// la fila arrastrada sigue el dedo y las demás se desplazan; se reordena al soltar.
function attachReorder(container: HTMLElement): void {
  const GAP = 8; // debe coincidir con el gap CSS de .config-list

  container.querySelectorAll<HTMLElement>(".reorder").forEach((handle) => {
    const row = handle.closest<HTMLElement>(".config-row");
    if (!row) return;

    handle.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);

      const siblings = [...container.querySelectorAll<HTMLElement>(".config-row")];
      const fromIndex = siblings.indexOf(row);
      const rowH = row.getBoundingClientRect().height + GAP;
      const startY = e.clientY;
      let toIndex = fromIndex;

      row.classList.add("dragging");

      const onMove = (ev: PointerEvent) => {
        const dy = ev.clientY - startY;
        row.style.transform = `translateY(${dy}px)`;
        toIndex = Math.max(0, Math.min(siblings.length - 1, fromIndex + Math.round(dy / rowH)));
        siblings.forEach((s, i) => {
          if (s === row) return;
          let shift = 0;
          if (fromIndex < toIndex && i > fromIndex && i <= toIndex) shift = -rowH;
          else if (fromIndex > toIndex && i < fromIndex && i >= toIndex) shift = rowH;
          s.style.transform = shift ? `translateY(${shift}px)` : "";
        });
      };

      const onUp = () => {
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
        row.classList.remove("dragging");
        siblings.forEach((s) => (s.style.transform = ""));
        if (toIndex !== fromIndex) {
          const ids = config.order.slice();
          const [moved] = ids.splice(fromIndex, 1);
          ids.splice(toIndex, 0, moved);
          config.order = ids;
          emit(); // guarda y vuelve a renderizar (resetea transforms)
        }
      };

      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
    });
  });
}

export function initConfig(): void {
  const panel = document.getElementById("configPanel");
  const openPanel = () => {
    panel?.classList.remove("hidden");
    renderConfigList();
    hideAdBanner(); // el banner nativo flota sobre todo; lo ocultamos mientras
  };
  const closePanel = () => {
    panel?.classList.add("hidden");
    showAdBanner();
  };
  document.getElementById("configBtn")?.addEventListener("click", openPanel);
  document.getElementById("configClose")?.addEventListener("click", closePanel);
  // cerrar al tocar el fondo oscuro
  panel?.addEventListener("click", (e) => {
    if (e.target === panel) closePanel();
  });

  // botones de diseño (Columnas / Listado)
  const updateLayoutBtns = () => {
    document.querySelectorAll<HTMLButtonElement>(".layout-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.layout === config.layout);
    });
  };
  document.querySelectorAll<HTMLButtonElement>(".layout-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      config.layout = (btn.dataset.layout as Layout) ?? "columns";
      updateLayoutBtns();
      emit();
    });
  });
  updateLayoutBtns();

  // selector de tema (Sistema / Claro / Oscuro)
  const updateThemeBtns = () => {
    const cur = getTheme();
    document.querySelectorAll<HTMLButtonElement>(".theme-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.theme === cur);
    });
  };
  document.querySelectorAll<HTMLButtonElement>(".theme-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      applyTheme((btn.dataset.theme as Theme) ?? "dark");
      updateThemeBtns();
    });
  });
  updateThemeBtns();

  // reabrir el tutorial
  document.getElementById("onbReplayBtn")?.addEventListener("click", () => {
    panel?.classList.add("hidden");
    showAdBanner();
    openOnboarding();
  });

  renderConfigList();
}
