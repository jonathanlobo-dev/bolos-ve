# 🟡 Bolitas

App Android para monitorear el **precio del dólar en Venezuela** (BCV, Euro y P2P/USDT) en tiempo real, con calculadoras y alertas. Construida con **Vite + TypeScript + Capacitor**.

## ✨ Funciones

- **Tasas en vivo**: Dólar BCV, Euro BCV y P2P (USDT) con % de cambio y valor anterior.
- **Calculadora implícita**: escribís un monto y lo ves convertido en todas las tasas a la vez ($ ↔ Bs).
- **Calculadoras**:
  - *Pago Móvil*: cuánto necesitás tener / cuánto podés enviar contando la comisión.
  - *¿Me conviene?*: si te sale mejor pagar en dólares o en bolívares.
- **Alertas de precio** + **notificación diaria** de la tasa.
- **Configurable**: mostrar/ocultar tasas, reordenar, columnas/lista, tema claro/oscuro.
- **Compartir** las tasas del día y **mantener presionado para copiar** montos.
- Funciona **offline** mostrando las últimas tasas guardadas.

## 🛠️ Stack

- **Frontend**: Vite + TypeScript (vanilla, sin framework).
- **Empaquetado Android**: Capacitor.
- **Datos** (gratis, sin API key): [DolarVzla](https://rates.dolarvzla.com) (BCV), [Yadio](https://api.yadio.io) (P2P), con DolarApi y pyDolarVenezuela como respaldo.
- **Backend opcional** (`server/`): Node/Express para datos propios (no requerido).

## 🚀 Desarrollo

```bash
npm install
npm run dev        # http://localhost:5173
```

## 📱 Build Android

```bash
npm run build
npx cap add android      # solo la primera vez
npm run logo             # genera íconos
npm run assets:gen       # aplica ícono + splash
npm run cap:sync
npm run cap:open         # abre Android Studio
```

Ver [`BUILD_ANDROID.md`](BUILD_ANDROID.md) y [`BUILD_PLAYSTORE.md`](BUILD_PLAYSTORE.md) para más detalle.

## 📂 Estructura

```
src/
  main.ts          # arranque + navegación + refresco
  rateProvider.ts  # capa de datos (fuentes + caché + redondeo)
  home.ts          # inicio: calculadora implícita + tarjetas
  calculators.ts   # ¿Me conviene? + hub de calculadoras
  pagomovil.ts     # calculadora de pago móvil
  alerts.ts        # alertas de precio
  daily.ts         # notificación diaria
  config.ts        # configuración (tasas, diseño, tema)
  amountInput.ts   # input estilo calculadora reutilizable
  share.ts         # compartir tasas
  ads.ts           # banner AdMob
  ...
server/            # backend opcional (Node)
```

---

> Las tasas se muestran con fines informativos, obtenidas de fuentes públicas.
