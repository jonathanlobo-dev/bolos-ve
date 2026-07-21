// Banner publicitario no invasivo.
//  - En el navegador (dev): se muestra un placeholder maquetado.
//  - En Android (APK): se inicializa AdMob y se dibuja un banner real abajo.

// Ad Unit ID real de Bolos VE.
const BANNER_ID = "ca-app-pub-8302037284208937/2452997428";

// MODO PRUEBA: en compilaciones de desarrollo (`npm run dev`) se piden anuncios
// de test, que son seguros. En el build de producción (el AAB que va a Play) se
// piden anuncios reales.
// ⚠️ NUNCA hagas clic en tus propios anuncios reales: AdMob lo detecta como
// fraude de clics y suspende la cuenta.
const TESTING = import.meta.env.DEV;

// DISPOSITIVOS DEL DESARROLLADOR: en estos IDs la app NO muestra publicidad,
// automáticamente y sin gestos. Para conocer el ID de un dispositivo:
// mantener presionado el logo del header ~3s (lo muestra y lo copia).
const ADMIN_DEVICE_IDS: string[] = [
  "6083d16526271b5f", // POCO F8 Pro de Jonathan
];

// ID del dispositivo vía puente nativo (Device.getId → identifier).
export async function getDeviceId(): Promise<string> {
  try {
    const cap = (window as any).Capacitor;
    if (!cap?.isNativePlatform?.()) return "web";
    const res = await cap.Plugins?.Device?.getId?.();
    return String(res?.identifier ?? "");
  } catch {
    return "";
  }
}

export async function adsDisabled(): Promise<boolean> {
  const id = await getDeviceId();
  return !!id && ADMIN_DEVICE_IDS.includes(id);
}

let bannerShown = false; // true cuando el banner nativo está activo

async function admobModule() {
  const { Capacitor } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform()) return null;
  return import("@capacitor-community/admob");
}

// El div #adBanner (debajo de la barra de pestañas) reserva el hueco del
// banner nativo. "spacer" = hueco del banner (50dp + safe-area, en CSS);
// "gone" = sin publicidad (solo el safe-area).
function setSpacer(mode: "spacer" | "gone"): void {
  const el = document.getElementById("adBanner");
  if (!el) return;
  el.classList.remove("spacer", "gone");
  el.classList.add(mode);
}

// Alto de la barra de navegación del sistema (safe-area inferior) en px CSS ≈ dp.
// En Android 15 (edge-to-edge) la ventana llega hasta abajo del todo y el banner
// debe subirse exactamente esto para no tapar los botones/gesto del sistema.
function safeAreaBottom(): number {
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;bottom:0;width:0;height:env(safe-area-inset-bottom,0px);visibility:hidden;";
  document.body.appendChild(probe);
  const h = Math.round(probe.getBoundingClientRect().height);
  probe.remove();
  return h;
}

export async function initAds(): Promise<void> {
  if (await adsDisabled()) {
    setSpacer("gone");
    return;
  }
  try {
    const mod = await admobModule();
    if (!mod) return; // navegador: queda el placeholder web
    const { AdMob, BannerAdSize, BannerAdPosition } = mod;
    await AdMob.initialize({});

    // Si no llega anuncio, el hueco se colapsa para no dejar espacio muerto.
    AdMob.addListener("bannerAdFailedToLoad" as any, () => setSpacer("gone"));
    AdMob.addListener("bannerAdLoaded" as any, () => setSpacer("spacer"));

    setSpacer("spacer"); // reserva el hueco mientras carga (banner fijo de 50dp)
    await AdMob.showBanner({
      adId: BANNER_ID,
      adSize: BannerAdSize.BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
      margin: safeAreaBottom(), // sobre la barra de navegación del sistema
      isTesting: TESTING, // true = anuncios de prueba (seguros mientras desarrollamos)
    });
    bannerShown = true;
  } catch (e) {
    console.warn("[ads] no se pudo iniciar AdMob:", e);
    setSpacer("gone");
  }
}

// Ocultar/mostrar el banner (p. ej. mientras se abre un panel que estorba).
export async function hideAdBanner(): Promise<void> {
  if (!bannerShown) return;
  try {
    const mod = await admobModule();
    await mod?.AdMob.hideBanner();
  } catch {
    /* sin efecto en web */
  }
}

export async function showAdBanner(): Promise<void> {
  if (!bannerShown) return;
  try {
    const mod = await admobModule();
    await mod?.AdMob.resumeBanner();
  } catch {
    /* sin efecto en web */
  }
}

