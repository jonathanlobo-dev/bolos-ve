# Bolitas — Ícono, Splash y APK de Android

Guía para convertir la web app en un **APK instalable** con su ícono y pantalla de carga.

## Requisitos (instalar una vez)
1. **Android Studio** → https://developer.android.com/studio
   (incluye el SDK de Android). Ábrelo una vez y deja que descargue lo que pida.
2. **JDK 17** (Android Studio suele traerlo). Verifica con `java -version`.

---

## Paso 1 — Instalar dependencias nuevas
En la carpeta del proyecto:
```bash
cd "C:/Users/Jonathan Lobo/Documents/bolitas"
npm install
```
(Esto baja `@capacitor/assets` y `sharp`, que ya agregué al package.json.)

## Paso 2 — Generar el ícono y el splash
```bash
npm run logo        # convierte assets/logo.svg -> assets/logo.png
```
Esto crea `assets/logo.png`. (Si querés otro logo, edita `assets/logo.svg` y repite.)

## Paso 3 — Crear el proyecto Android (solo la primera vez)
```bash
npm run build       # genera dist/
npx cap add android # crea la carpeta android/
```

## Paso 4 — Aplicar ícono y splash a Android
```bash
npm run assets:gen  # genera todos los tamaños de ícono + splash (fondo #121212)
```

## Paso 5 — Sincronizar y abrir en Android Studio
```bash
npm run cap:sync    # build + copia todo al proyecto Android
npm run cap:open    # abre Android Studio
```
En Android Studio:
- Espera a que termine el "Gradle sync".
- **Run ▶** con tu teléfono conectado por USB (con *Depuración USB* activada), o
- **Build → Build Bundle(s)/APK(s) → Build APK(s)** para generar el archivo `.apk`.
- El APK queda en: `android/app/build/outputs/apk/debug/app-debug.apk`
  → copialo al teléfono e instalalo.

---

## Cada vez que cambies la app (código)
```bash
npm run cap:sync    # reconstruye y copia los cambios a Android
```
Luego volvés a correr/compilar en Android Studio.

## Nombre e identificador
- Nombre visible: **Bolitas** · ID: **com.bolitas.app**
  (configurado en `capacitor.config.ts`).

## Notas
- El **banner AdMob** real solo aparece en el APK (en el navegador es un placeholder).
  Recordá poner tu Ad Unit ID real en `src/ads.ts` y cambiar `TESTING = false` antes de publicar.
- Para **publicar en Play Store** hace falta firmar un APK/AAB de release; eso es un
  paso aparte que vemos cuando llegues ahí.
