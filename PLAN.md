# Bolos VE — App Android (monitor de dólar Venezuela + calculadora + alertas)

> Stack: **Vite + TypeScript (vanilla) + Capacitor** → APK Android.

---

## ✅ ESTADO: MVP construido (web) — compila y hace build sin errores

Todo el código del MVP ya está escrito y verificado con `npm run build`. Falta solo
**probarlo con datos reales** (el entorno de build no tenía internet) y **generar el APK**.

### Cómo correrlo en el navegador (probar con datos reales)
```bash
cd bolitas
npm install        # ya hecho
npm run dev        # abre http://localhost:5173
```
Abrí esa URL en el navegador. Como hay internet en tu máquina, debería cargar las tasas
reales de pyDolarVenezuela. Revisá: tarjetas BCV/Binance/Paralelo, brecha %, calculadora
y crear/eliminar una alerta.

### Cómo generar el APK Android
```bash
npm run build          # genera dist/
npx cap add android    # solo la primera vez (crea carpeta android/)
npx cap sync android   # copia el build al proyecto Android
npx cap open android   # abre Android Studio → Run/Build APK
```
Requiere **Android Studio + JDK** instalados. El APK queda en
`android/app/build/outputs/apk/`.

### Qué revisar / posibles ajustes (para la sesión con Sonnet)
- **Claves del JSON de pyDolarVenezuela**: `rateProvider.ts` busca `bcv`, `binance` y
  `enparalelovzla`. Si alguna tasa sale vacía, verificar las claves reales con
  `curl "https://pydolarve.org/api/v2/dollar?page=criptodolar"` y ajustar el `map`.
- **Permiso de notificaciones**: se pide al crear la primera alerta. En APK probar que
  llegue la notificación local.
- **Ícono y splash**: aún no configurados (usar `@capacitor/assets` o Android Studio).

---

## 1. Fuente de datos

API principal (gratuita, sin API key, BCV + Binance/paralelo en una llamada):

```
GET https://pydolarve.org/api/v2/dollar?page=criptodolar
```

Devuelve JSON con `monitors.bcv`, `monitors.enparalelovzla`, `monitors.binance`,
cada uno con `price`, `change`, `percent`, `last_update`.

**Fallbacks** (intentar en orden si la principal falla):
1. `https://ve.dolarapi.com/v1/dolares` (DolarApi)
2. `https://api.cotizave.com` (Cotizave — BCV + 7 exchanges P2P)

Diseño: capa `rateProvider` que intenta principal → fallback y **normaliza**
ambas respuestas a un formato interno único. Caché local del último valor.

---

## 2. Stack técnico

```
Vite + TypeScript (vanilla)
 └─ Capacitor → empaqueta en APK Android instalable
     ├─ @capacitor/local-notifications  → alertas
     └─ @capacitor/preferences          → guardar config/alertas offline
```

---

## 3. Estructura de archivos

```
bolitas/
├─ index.html              # UI: tabs Monitor / Calculadora / Alertas
├─ src/
│  ├─ main.ts              # arranque, router de tabs, refresco
│  ├─ rateProvider.ts      # fetch + fallback + normalización + caché
│  ├─ monitor.ts           # tarjetas de tasas + brecha %
│  ├─ calculator.ts        # conversión USD/USDT <-> VES
│  ├─ alerts.ts            # crear/evaluar/disparar alertas
│  ├─ storage.ts           # wrapper de @capacitor/preferences
│  └─ styles.css
├─ capacitor.config.ts
├─ package.json
└─ vite.config.ts
```

---

## 4. Funciones del MVP

### A) Monitor en vivo
- Tarjetas: BCV, Binance/Paralelo — precio, flecha ↑↓, % de cambio del día.
- **Brecha cambiaria** destacada arriba: `(paralelo - bcv) / bcv * 100`.
- Refresco automático cada 5 min + botón manual. Mostrar hora de última actualización.
- Caché local: sin internet, mostrar último valor con aviso "desactualizado".

### B) Calculadora de conversión
- Monto + selector de tasa (BCV / Binance / Paralelo) + dirección (USD→VES o VES→USD).
- Resultado en vivo mientras se escribe. Botón copiar.

### C) Alertas y notificaciones
- Crear alerta: "avisar cuando [BCV/Binance/brecha] sea [mayor/menor] que [valor]".
- Guardar localmente. Evaluar al abrir la app + refresco; disparar notificación local.
- **Limitación conocida**: notificaciones con app cerrada (background real) son
  limitadas en Capacitor/Android. MVP dispara al abrir/refrescar. Background real = Fase 2.

---

## 5. Fase 2 (post-MVP)
- **Calculadora de inversión**: comprar X USDT a tasa A, vender a tasa B →
  ganancia/pérdida en VES y %.
- Histórico / gráfico de tasas (7 días).
- Widget de pantalla de inicio.
- Notificaciones background reales (plugin nativo).

---

## 6. Pasos de ejecución
1. `npm create vite@latest bolitas -- --template vanilla-ts` + instalar Capacitor.
2. `rateProvider.ts` con fetch + fallback (probar endpoints con `curl` primero).
3. UI con 3 tabs en `index.html`.
4. Implementar Monitor → Calculadora → Alertas (en ese orden).
5. `npx cap add android` + build APK + probar en teléfono.

---

## Fuentes de datos verificadas (2026-06)
- pyDolarVenezuela: https://docs.pydolarve.org/
- DolarApi Venezuela: https://dolarapi.com/docs/venezuela/
- Cotizave: https://cotizave.com/
