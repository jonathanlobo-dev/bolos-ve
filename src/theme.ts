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
}

// Si está en "sistema", reaccionar a cambios del SO.
export function watchSystemTheme(): void {
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (getTheme() === "system") applyTheme("system");
  });
}
