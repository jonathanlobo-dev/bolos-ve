# Seguridad — Bolos VE

Última auditoría: 2026-07-13. La app es de bajo riesgo por diseño: el backend
(`server/index.js`, Render) es un proxy de SOLO LECTURA de tasas públicas
(BCV, Yadio, Binance P2P), sin base de datos, sin cuentas y sin secretos.

## Invariantes (NO romper)

1. **El backend no guarda ni recibe datos de usuarios.** Si algún día se
   agrega un endpoint que reciba datos (alertas server-side, etc.), ese día
   nacen las obligaciones de auth/validación — no improvisar.
2. **Caché con TTL delante de las fuentes** (`cache` + `TTL_MS`): protege de
   que un cliente martillando `/api/rates` nos haga martillar a dolarvzla/
   Yadio/Binance (baneos de IP y quema de horas de Render). No quitarla.
3. **Errores genéricos al cliente**: el detalle (stack, URLs internas) va al
   log, nunca en la respuesta JSON.
4. **Sin secretos en el repo**: hoy no hay ninguno; si aparece una API key
   (ej. fuente de tasas paga), va en env var de Render y `.env` ya está en
   `.gitignore`.
5. **AdMob**: los IDs de app/bloque son públicos por naturaleza (van en el
   APK) — lo que NUNCA se versiona son credenciales de la cuenta. `TESTING`
   debe ir en `false` solo en builds de producción.
6. **CORS abierto es correcto aquí** (API pública de solo lectura, sin
   cookies). Revisar si se agrega cualquier endpoint de escritura.

## Riesgos aceptados

- Las tasas dependen de scraping/APIs de terceros que pueden cambiar o caer:
  el fallback en cadena (Yadio → Binance) y el `null` explícito por campo son
  el mecanismo de degradación — la app cliente debe tolerar campos null.
