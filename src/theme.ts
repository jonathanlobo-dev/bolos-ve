// Tema claro/oscuro/sistema. Se guarda y se aplica poniendo data-theme en <html>.

import { load, save } from "./storage";

export type Theme = "system" | "light" | "dark";
const KEY = "bolitas.theme";

export function getTheme(): Theme {
  return load<Theme>(KEY, "dark");
}

function resolve(theme: Theme): "light" | "dark" {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return theme;
}

export function applyTheme(theme?: Theme): void {
  const t = theme ?? getTheme();
  save(KEY, t);
  const resolved = resolve(t);
  document.documentElement.setAttribute("data-theme", resolved);
  // color de la barra de estado del navegador/WebView
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", resolved === "dark" ? "#0f0f0f" : "#f5f5f5");
  syncSystemBars(resolved);
}

// Barras del sistema Android (navegación y estado) del color del tema,
// como hace WhatsApp. Vía puente nativo; en el navegador no hace nada.
function syncSystemBars(resolved: "light" | "dark"): void {
  try {
    const cap = (window as any).Capacitor;
    if (!cap?.isNativePlatform?.()) return;
    const color = resolved === "dark" ? "#121212" : "#f5f5f5";
    cap.Plugins?.NavigationBar?.setColor?.({ color, darkButtons: resolved === "light" });
  } catch {
    /* plugin no disponible */
  }
}

// Si está en "sistema", reaccionar a cambios del SO.
export function watchSystemTheme(): void {
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (getTheme() === "system") applyTheme("system");
  });
}
