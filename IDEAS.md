# Ideas pendientes

## Iconos propios en vez de emojis (v2)

Hoy toda la interfaz usa emojis (📅 🧹 📤 ⚙️ 🏛️ 👛 💶 🏠 🧮 🔔). Se ven
"amateur" y además **cambian de estilo según el teléfono**, porque cada capa de
Android trae su propio set: la app no se ve igual en un Xiaomi que en un
Samsung. Referencia de lo que se busca: Arco App usa iconos de línea, finos y
monocromos, teñidos con el color de la marca.

Plan cuando se retome:

1. Set de iconos SVG de línea con licencia libre (Lucide o Tabler, ambos MIT).
2. Inyectarlos como sprite SVG (`<symbol>` + `<use>`) o inline en el HTML, no
   como archivos sueltos: son pocos y así no se pierde tiempo de carga.
3. `fill: none; stroke: currentColor; stroke-width: 1.75` para que hereden el
   color del tema (dorado en la barra superior, atenuado en las pestañas).
4. Sustituir por pantalla: barra superior (calendario, limpiar, compartir,
   configuración) → pestañas (inicio, calculadoras, alertas) → tarjetas
   (banco, billetera, euro) → tiles de calculadoras.
5. Ojo: los emojis de las tarjetas también salen en el texto de **compartir** y
   en la **notificación diaria**. Ahí sí conviene dejarlos, porque son texto
   plano y un SVG no aplica.

Esfuerzo estimado: una sesión. No es urgente; es puramente estético.

## Gráfico de historial (v2)

Ya existe el mini-gráfico (sparkline) en las tarjetas y el servidor guarda
min/max/promedio/cierre por día desde 2024 (BCV) y enero 2026 (P2P). Falta la
pantalla grande: elegir tasa + rango (7d / 30d / 90d) y dibujar la curva con
máximo, mínimo y promedio, al estilo DolarVzla. Los datos ya están servidos por
`/api/history?rate=...&days=...`; es solo trabajo de interfaz.
