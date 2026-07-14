// Arranque de la app: navegación entre tabs, refresco de datos y orquestación.

import "./styles.css";
import { getCachedRates, getRates } from "./rateProvider";
import { initAds } from "./ads";
import { initConfig } from "./config";
import { initHome, renderHome } from "./home";
import { initPagoMovil } from "./pagomovil";
import { initCalculators, setCalcRates } from "./calculators";
import { evaluateAlerts, initAlerts } from "./alerts";
import { initShare, setShareRates } from "./share";
import { applyTheme, watchSystemTheme } from "./theme";
import { initOnboarding } from "./onboarding";
import { initDaily, setDailyRates } from "./daily";
import { initBackButton } from "./back";

const REFRESH_MS = 5 * 60 * 1000; // refresco automático cada 5 min
const MIN_REFRESH_MS = 60 * 1000; // al volver a la app, no repetir si hay datos de hace <1 min
let refreshing = false;
let lastFetchAt = 0;

function setupTabs(): void {
  const tabs = document.querySelectorAll<HTMLButtonElement>(".tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const view = tab.dataset.view;
      tabs.forEach((t) => t.classList.toggle("active", t === tab));
      document.querySelectorAll(".view").forEach((v) => {
        v.classList.toggle("active", v.id === `view-${view}`);
      });
    });
  });
}

async function refresh(): Promise<void> {
  if (refreshing) return;
  refreshing = true;
  const btn = document.getElementById("refreshBtn");
  btn?.classList.add("spin");
  try {
    const result = await getRates();
    if (!result.stale) lastFetchAt = Date.now();
    renderHome(result);
    setCalcRates(result);
    setShareRates(result);
    setDailyRates(result);
    await evaluateAlerts(result);
  } finally {
    refreshing = false;
    btn?.classList.remove("spin");
  }
}

// Deslizar hacia abajo (estando arriba del todo) para actualizar.
function initPullToRefresh(): void {
  const ind = document.createElement("div");
  ind.id = "pullInd";
  ind.textContent = "⟳";
  document.body.appendChild(ind);

  const TH = 70; // distancia para disparar
  let startY = 0;
  let dist = 0;
  let active = false;

  const reset = () => {
    ind.style.transform = "translateX(-50%) translateY(0)";
    ind.style.opacity = "0";
    ind.classList.remove("ready");
  };
  reset();

  window.addEventListener(
    "touchstart",
    (e) => {
      const v = document.querySelector(".view.active") as HTMLElement | null;
      const sheetOpen = !!document.querySelector(".sheet:not(.hidden)"); // ⚙️ o tutorial
      active = !!v && !sheetOpen && v.scrollTop <= 0 && e.touches.length === 1;
      startY = e.touches[0].clientY;
      dist = 0;
    },
    { passive: true },
  );
  window.addEventListener(
    "touchmove",
    (e) => {
      if (!active) return;
      dist = e.touches[0].clientY - startY;
      if (dist > 0) {
        const d = Math.min(dist, 90);
        ind.style.transform = `translateX(-50%) translateY(${d}px)`;
        ind.style.opacity = String(Math.min(dist / TH, 1));
        ind.classList.toggle("ready", dist > TH);
      }
    },
    { passive: true },
  );
  window.addEventListener("touchend", () => {
    if (active && dist > TH) {
      ind.classList.add("spin");
      refresh().finally(() => {
        ind.classList.remove("spin");
        reset();
      });
    } else {
      reset();
    }
    active = false;
  });
}

function init(): void {
  applyTheme(); // aplica el tema guardado antes de renderizar
  watchSystemTheme();
  setupTabs();
  initConfig();
  initHome();
  initPagoMovil();
  initCalculators();
  initAlerts();
  initShare();
  initDaily();
  initAds();
  initPullToRefresh();
  initOnboarding();
  initBackButton();

  document.getElementById("refreshBtn")?.addEventListener("click", refresh);

  // pintar al instante las tasas cacheadas (si hay), antes de la red
  const cached = getCachedRates();
  if (cached) {
    renderHome(cached);
    setCalcRates(cached);
    setShareRates(cached);
  }

  refresh();
  setInterval(refresh, REFRESH_MS);

  document.addEventListener("visibilitychange", () => {
    // al volver a la app, refrescar solo si los datos ya tienen más de 1 min
    if (document.visibilityState === "visible" && Date.now() - lastFetchAt > MIN_REFRESH_MS) {
      refresh();
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
