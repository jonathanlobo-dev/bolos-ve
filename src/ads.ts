// Banner publicitario no invasivo.
//  - En el navegador (dev): se muestra un placeholder maquetado.
//  - En Android (APK): se inicializa AdMob y se dibuja un banner real abajo.

// Ad Unit ID real de Bolos VE.
const BANNER_ID = "ca-app-pub-8302037284208937/2452997428";

// ⚠️ MODO PRUEBA: mientras desarrollamos lo dejamos en true (muestra anuncios de
// test seguros, sin riesgo de baneo). Antes de PUBLICAR, cambiar a false para
// que se muestren anuncios reales.
const TESTING = true;

let bannerShown = false; // true cuando el banner nativo está activo

async function admobModule() {
  const { Capacitor } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform()) return null;
  return import("@capacitor-community/admob");
}

export async function initAds(): Promise<void> {
  const placeholder = document.getElementById("adBanner");
  try {
    const mod = await admobModule();
    if (!mod) return; // navegador: queda el placeholder web
    const { AdMob, BannerAdSize, BannerAdPosition } = mod;
    await AdMob.initialize({});
    if (placeholder) placeholder.style.display = "none";
    await AdMob.showBanner({
      adId: BANNER_ID,
      adSize: BannerAdSize.BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
      margin: 56, // deja espacio para la barra de pestañas
      isTesting: TESTING, // true = anuncios de prueba (seguros mientras desarrollamos)
    });
    bannerShown = true;
  } catch (e) {
    console.warn("[ads] no se pudo iniciar AdMob:", e);
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
