// Botón/gesto "atrás" de Android: navega hacia atrás dentro de la app
// (cerrar paneles → volver al hub de calculadoras → volver a Inicio) y solo
// cierra la app si ya estamos en Inicio sin nada abierto.

// Plugin App por el puente nativo (igual que LocalNotifications: sin import dinámico).
function getApp(): any | null {
  const cap = (window as any).Capacitor;
  if (!cap?.isNativePlatform?.()) return null;
  return cap.Plugins?.App ?? null;
}

/** Da un paso atrás dentro de la app. Devuelve false si ya no hay a dónde volver. */
function goBack(): boolean {
  // 1) tutorial abierto → cerrarlo
  const onb = document.getElementById("onboarding");
  if (onb && !onb.classList.contains("hidden")) {
    (document.getElementById("onbSkip") as HTMLButtonElement | null)?.click();
    return true;
  }
  // 2) configuración abierta → cerrarla
  const cfg = document.getElementById("configPanel");
  if (cfg && !cfg.classList.contains("hidden")) {
    (document.getElementById("configClose") as HTMLButtonElement | null)?.click();
    return true;
  }
  // 3) viendo una fecha pasada → volver a las tasas de hoy
  const histStrip = document.getElementById("histStrip");
  if (histStrip && !histStrip.classList.contains("hidden")) {
    (document.getElementById("histBack") as HTMLButtonElement | null)?.click();
    return true;
  }
  // 4) dentro de una calculadora → volver al menú de calculadoras
  const calcActive = document.getElementById("view-calc")?.classList.contains("active");
  if (calcActive) {
    const panelOpen = document.querySelector<HTMLElement>(".calc-panel:not(.hidden)");
    if (panelOpen) {
      panelOpen.querySelector<HTMLButtonElement>(".calc-back")?.click();
      return true;
    }
  }
  // 5) en otra pestaña → volver a Inicio
  const homeActive = document.getElementById("view-home")?.classList.contains("active");
  if (!homeActive) {
    document.querySelector<HTMLButtonElement>('.tab[data-view="home"]')?.click();
    return true;
  }
  // 6) en Inicio sin nada abierto → no hay más atrás
  return false;
}

export function initBackButton(): void {
  const app = getApp();
  if (!app) return; // navegador: el gesto atrás del browser sigue normal
  app.addListener("backButton", () => {
    if (!goBack()) app.exitApp();
  });
}
