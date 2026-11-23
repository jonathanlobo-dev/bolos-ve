// Cartel "Instala Bolos VE" (solo PWA en el navegador).
//  - Android/escritorio (Chrome/Edge): botón que abre el diálogo nativo de instalación.
//  - iPhone/iPad: Apple no permite abrir ese diálogo desde la web, así que se
//    explican los dos toques (Compartir → Agregar a inicio).
// No aparece en la APK, si ya está instalada, ni durante el onboarding.

import { load, save } from "./storage";
import { icon, isNativeApp } from "./util";

const DISMISS_KEY = "bolitas.installDismissedAt";
const SNOOZE_MS = 7 * 24 * 3600 * 1000;

let deferred: any = null;

function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true
  );
}

function isIOS(): boolean {
  const ua = navigator.userAgent;
  // iPadOS se presenta como Mac, pero con pantalla táctil.
  return /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
}

function snoozed(): boolean {
  return Date.now() - load<number>(DISMISS_KEY, 0) < SNOOZE_MS;
}

function hide(el: HTMLElement, remember: boolean): void {
  el.remove();
  if (remember) save(DISMISS_KEY, Date.now());
}

function show(ios: boolean): void {
  if (document.getElementById("installBanner")) return;
  const el = document.createElement("div");
  el.id = "installBanner";
  el.className = "install-banner";
  el.innerHTML = ios
    ? `<div class="install-text"><b>Instala Bolos VE</b>
         <span>Toca ${icon("share")} <b>Compartir</b> y luego <b>Agregar a inicio</b>.</span></div>
       <button class="install-close" aria-label="Cerrar">✕</button>`
    : `<div class="install-text"><b>Instala Bolos VE</b>
         <span>Ábrela como app, sin buscar la pestaña.</span></div>
       <button class="install-go">Instalar</button>
       <button class="install-close" aria-label="Cerrar">✕</button>`;
  document.body.appendChild(el);

  el.querySelector(".install-close")?.addEventListener("click", () => hide(el, true));
  el.querySelector(".install-go")?.addEventListener("click", async () => {
    if (!deferred) return hide(el, false);
    deferred.prompt();
    const choice = await deferred.userChoice.catch(() => null);
    deferred = null;
    hide(el, choice?.outcome !== "accepted");
  });
}

// Espera a que el onboarding termine para no tapar uno con el otro.
function whenOnboarded(fn: () => void): void {
  if (load<boolean>("bolitas.onboarded", false)) return void setTimeout(fn, 2500);
  const t = setInterval(() => {
    if (load<boolean>("bolitas.onboarded", false)) {
      clearInterval(t);
      setTimeout(fn, 1500);
    }
  }, 1500);
}

export function initInstallPrompt(): void {
  if (isNativeApp() || isStandalone() || snoozed()) return;

  if (isIOS()) {
    whenOnboarded(() => show(true));
    return;
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e;
    whenOnboarded(() => show(false));
  });
  window.addEventListener("appinstalled", () => {
    document.getElementById("installBanner")?.remove();
  });
}
