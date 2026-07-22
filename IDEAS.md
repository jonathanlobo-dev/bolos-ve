# Ideas pendientes

## ✅ Iconos propios (hecho)

La interfaz usa iconos de línea SVG (estilo Lucide, MIT) en vez de emojis. Van
como sprite `<symbol>` embebido en `index.html` y se pintan con
`<svg class="ic"><use href="#ic-nombre"/></svg>`; heredan el color con
`stroke: currentColor`. En TypeScript se usan los helpers `icon()` y
`rateIcon()` de `util.ts`.

Los emojis se conservan a propósito en el texto de **compartir**, la
**notificación diaria** y las **alertas**: ahí es texto plano y un SVG no se
puede pintar.

Si se agrega una tasa nueva, hay que sumarla al mapa `RATE_ICONS` de `util.ts`
(si no, cae en el icono del banco).

## Gráfico de historial (v2)

Ya existe el mini-gráfico (sparkline) en las tarjetas y el servidor guarda
min/max/promedio/cierre por día desde 2024 (BCV) y enero 2026 (P2P). Falta la
pantalla grande: elegir tasa + rango (7d / 30d / 90d) y dibujar la curva con
máximo, mínimo y promedio, al estilo DolarVzla. Los datos ya están servidos por
`/api/history?rate=...&days=...`; es solo trabajo de interfaz.
