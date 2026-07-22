# Plan: Historial de tasas (selector de fecha + acumulación en servidor)

> Objetivo: que el usuario toque un botón de calendario, elija una fecha, y las
> 3 tarjetas de Inicio muestren las tasas de ESE día (cierre, mínimo y máximo),
> con un aviso "Viendo el 15/07/2026 · Volver a hoy".

## Contexto (leído antes de tocar nada)

- App: Vite + TypeScript vanilla + Capacitor 6. Sin framework. Un módulo por
  función en `src/`. Datos en `src/rateProvider.ts` (fuentes con fallback).
- Backend: `server/index.js` (Express). Endpoints: `/` y `/api/rates`.
  Lee BCV de DolarVzla (respaldo: scraping bcv.org.ve) y P2P de Binance
  (respaldo: Yadio). La app puede apuntar a este backend desde ⚙️ (se guarda
  como `bolitas.backendUrl`; ver `getBackendUrl()` en rateProvider.ts).
- Se desplegará en Railway (plan Hobby ya pagado, convive con otro servicio).
- **Hallazgo clave**: NO existe API pública gratuita con histórico del dólar
  venezolano (Yadio no lo expone, DolarApi no tiene, pydolarve pide token y su
  DNS falla, CriptoYa devuelve 403). DolarVzla y AlCambio acumulan el suyo.
  Por eso: acumulamos nosotros. El historial empieza a existir desde el deploy.
- La app ya guarda localmente 1 precio/día (clave `bolitas.rateDaily`, 8 días)
  para los sparklines de las tarjetas. Eso NO se toca; esto es aparte.

## Reglas del repo (OBLIGATORIAS)

- Commits en español, autor Jonathan Lobo (config ya presente).
- Español neutro en textos de UI (tú: "elige", "vuelve"; jamás voseo).
- Redondeo: 2 decimales (usar `round2` existente en rateProvider / `fmt` en util).
- Tras cambios web: `npm run build` debe pasar. Subir `versionCode` en
  `android/app/build.gradle` solo si se genera nueva versión para Play.

---

## Fase 1 — Servidor: acumular y servir historial

Archivo: `server/index.js` (mismo proceso Express; sin frameworks nuevos).

### 1.1 Almacenamiento
- Usar **better-sqlite3** (agregar a `server/package.json`).
- Ruta del archivo: `process.env.DB_PATH || "./data/history.db"`.
  En Railway se montará un **volume** en `/data` (documentarlo en server/README.md:
  Settings → Volumes → mount path `/data`, y variable `DB_PATH=/data/history.db`).
- Tabla `samples`: `id INTEGER PK, rate TEXT, price REAL, ts INTEGER` (epoch ms).
  Índice por `(rate, ts)`.
- Tabla `daily`: `rate TEXT, day TEXT (YYYY-MM-DD), min REAL, max REAL,
  avg REAL, close REAL, samples INTEGER, PRIMARY KEY (rate, day)`.

### 1.2 Muestreo
- Cada **15 min** (setInterval + una corrida al arrancar): obtener
  `bcv_usd`, `bcv_eur` (getBCV existente) y `p2p_usdt` (getP2P existente),
  insertar en `samples` (solo valores > 0).
- Tras cada muestreo, **upsert** del agregado del día en `daily`
  (min/max/avg/close calculados con SQL sobre las samples del día).
- Podar `samples` de más de 45 días (el agregado diario queda para siempre).
- Zona horaria: Venezuela (UTC-4). Calcular el `day` con
  `new Date(Date.now() - 4*3600*1000).toISOString().slice(0,10)` y comentarlo.

### 1.3 Endpoints nuevos
- `GET /api/history?rate=bcv_usd&days=30` →
  `{ rate, days: [{ day, min, max, avg, close }] }` (ordenado ascendente).
- `GET /api/day?date=2026-07-15` →
  `{ date, rates: { bcv_usd: {min,max,avg,close}, bcv_eur: {...}, p2p_usdt: {...} } }`
  (las que existan; objeto vacío si no hay datos de ese día).
- `GET /api/history/range` → `{ first: "YYYY-MM-DD" | null, last: ... }`
  (para que la app sepa desde cuándo hay datos y limite el calendario).
- CORS ya está abierto; mantenerlo.

### 1.4 Pruebas locales
- `cd server && npm install && npm start`; esperar 2 muestreos (bajar el
  intervalo por env `SAMPLE_MS` para probar), verificar los 3 endpoints con curl.

---

## Fase 2 — App: selector de fecha que sobreescribe las tarjetas

### 2.1 UI (index.html + styles.css)
- Botón 📅 en la topbar (id `histBtn`, clase `icon-btn`), entre 🧹 y 📤.
- `<input type="date" id="histDate" class="hidden-date">` (invisible; el botón
  hace `showPicker()` — el picker nativo de Android se ve como el de AlCambio).
- Franja de aviso bajo los chips (id `histStrip`, oculta por defecto):
  `📅 Viendo el 15/07/2026 · <button id="histBack">Volver a hoy</button>`.

### 2.2 Módulo nuevo `src/history.ts`
- `initHistory()`: listeners del botón/input/volver.
- Al elegir fecha: `fetchJson` al backend `/api/day?date=...`
  (usar `getBackendUrl()`; si no hay backend configurado o falla → fallback
  local: buscar el día en `bolitas.rateDaily`; si tampoco → toast
  "No hay datos de ese día").
- Con datos: construir un `RatesResult` con `price = close`, `previous`
  omitido, `lastUpdate = fecha`, `source = "historial"`, y llamar
  `renderHome(...)` para sobreescribir las tarjetas. Mostrar `histStrip`.
- En modo historial: **pausar** el auto-refresh visual (guardar un flag
  exportado `isViewingHistory()`; en `main.ts`, `refresh()` no repinta Inicio
  si está activo — las demás vistas siguen normal). "Volver a hoy" limpia el
  flag y repinta con `getCachedRates()` + dispara `refresh()`.
- En la tarjeta, bajo el precio, mostrar `Mín 736,10 · Máx 739,00` si vienen
  min/max (agregar campo opcional al Rate o render específico — elegir lo
  más simple sin romper `cardHtml`).
- Limitar el input: `max` = hoy; `min` = `first` de `/api/history/range`
  (si el backend responde).

### 2.3 Ampliar snapshots locales (fallback y futuro gráfico)
- En `rateProvider.ts`: `recordDaily` pasa de guardar solo el precio a
  `{ min, max, close }` del día (actualizando min/max en cada refresh) y de
  8 → **90 días**. Mantener compatibilidad: si el valor guardado es un número
  (formato viejo), tratarlo como close. `dailyHistory()` (sparkline) sigue
  devolviendo la serie de closes.

### 2.4 Config
- En ⚙️ ya existe el campo "Servidor de datos". Cuando el backend esté en
  Railway, la URL por defecto debe quedar **hardcodeada** como constante
  `DEFAULT_BACKEND` en rateProvider.ts (el campo de ⚙️ la puede sobreescribir).
  Dejar `const DEFAULT_BACKEND = ""` con un TODO claro para pegar la URL real
  tras el deploy.

### 2.5 Verificación
- `npm run build` limpio.
- Probar en navegador (vite + proxy): elegir fecha con datos, sin datos,
  volver a hoy, refresh automático no pisa el modo historial, clear/limpiar
  no rompe. Revisar consola sin errores.

---

## Fase 3 — Deploy (la hace Jonathan, guiado)
1. Railway → New service desde el repo (root `server/`), volume en `/data`,
   `DB_PATH=/data/history.db`.
2. Verificar `/api/rates` y que `daily` acumule tras unas horas.
3. Pegar la URL en `DEFAULT_BACKEND`, `npm run build`, `cap sync`, AAB nuevo.

## Qué NO hacer
- No intentar "backfillear" datos históricos de terceros (no hay fuente viable;
  el historial crece desde el deploy, igual que les pasó a AlCambio y DolarVzla).
- No añadir pantalla de gráfico grande todavía (fase futura; los sparklines ya
  existen). No tocar alertas, AdMob ni el flujo de Play.
