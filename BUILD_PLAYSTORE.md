# Publicar Bolos VE en Google Play Store

Para Play Store se sube un **AAB firmado** (Android App Bundle), no un APK debug.
Esta guía te lleva desde cero hasta el archivo `app-release.aab` listo para subir.

---

## ✅ Antes de publicar (checklist)

1. **Cuenta de Google Play Console** — pago único de **$25 USD** (una sola vez, de por vida).
   https://play.google.com/console
2. **Ícono final** — el actual es un placeholder. Cuando tengas el definitivo:
   editar `assets/logo.svg` → `npm run logo` → `npm run assets:gen`.
3. **AdMob real** (si vas a monetizar desde el día 1):
   - Crear cuenta en https://admob.google.com → registrar la app → obtener el **App ID** y el **Ad Unit ID**.
   - Reemplazar el **App ID de prueba** en `android/app/src/main/AndroidManifest.xml`
     (la línea `com.google.android.gms.ads.APPLICATION_ID`).
   - Reemplazar `TEST_BANNER_ID` en `src/ads.ts` por tu Ad Unit ID real.
   - (Si no, podés publicar SIN anuncios y agregarlos después.)
4. **Política de privacidad** — Google la EXIGE (la app usa internet y AdMob). Es una
   página web simple; se puede generar gratis (ej. termsfeed.com / freeprivacypolicy.com)
   y se hostea gratis (GitHub Pages, Netlify). Necesitas su URL para el formulario de Play.
5. **Capturas de pantalla** del teléfono (mínimo 2) + un ícono 512×512 + un banner 1024×500
   (esto se sube en Play Console, no en el código).

---

## 1) Crear la llave de firma (keystore) — SOLO UNA VEZ

⚠️ **Guardá este archivo y las contraseñas en lugar MUY seguro.** Si los perdés, NO podrás
volver a actualizar la app en Play Store nunca más.

En una terminal, en una carpeta FUERA del proyecto (ej. tus Documentos):
```bash
keytool -genkey -v -keystore bolitas-release.keystore -alias bolitas -keyalg RSA -keysize 2048 -validity 10000
```
Te va a pedir: una contraseña, tu nombre, organización, ciudad, etc. Anotá:
- Contraseña del keystore
- Contraseña del alias (puede ser la misma)
- El alias: `bolitas`

> `keytool` viene con el JDK (lo tenés por Android Studio). Si no lo encuentra, está en
> `C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe`.

---

## 2) (Opcional pero recomendado) Subir la versión antes de cada release

En `android/app/build.gradle`, cada vez que publiques una actualización subí estos números:
```
versionCode 1      // súbelo de a 1 en cada release: 2, 3, 4…
versionName "1.0"  // versión visible: "1.0", "1.1", "2.0"…
```

---

## 3) Generar el AAB firmado (con Android Studio)

```bash
cd "C:/Users/Jonathan Lobo/Documents/bolitas"
npm run cap:sync
npm run cap:open
```
En Android Studio:
1. **Build → Generate Signed Bundle / APK…**
2. Elegí **Android App Bundle** → *Next*.
3. **Key store path**: seleccioná tu `bolitas-release.keystore`.
   - Poné las contraseñas y el alias (`bolitas`).
4. *Next* → elegí **release** → *Finish*.
5. Cuando termine, el archivo queda en:
   `android/app/release/app-release.aab`

---

## 4) Subir a Play Console

1. En Play Console: **Crear app** → nombre "Bolos VE", idioma español, app gratuita.
2. Completá: descripción, capturas, ícono 512×512, categoría (Finanzas), política de privacidad.
3. **Producción → Crear nueva versión** → subí el `app-release.aab`.
4. Completá los cuestionarios (contenido, anuncios, seguridad de datos).
5. Enviar a revisión. Google tarda de unas horas a unos días la primera vez.

---

## Actualizaciones futuras
1. Hacés cambios en el código.
2. Subís `versionCode` y `versionName` en `android/app/build.gradle`.
3. `npm run cap:sync` → generás un nuevo AAB firmado (mismo keystore).
4. Subís el nuevo AAB a Play Console como nueva versión.
