# Backend de Bolos VE

Lee la tasa **oficial del BCV** (directo de `bcv.org.ve`) y el **P2P de Binance** (USDT/VES),
y los sirve como JSON. Es lo que hace que los datos sean tan precisos como los de apps tipo Arco.

## Qué entrega

```
GET /api/rates
{
  "bcv_usd": 567.68,
  "bcv_eur": 655.38,
  "p2p_usdt": 756.5,
  "updatedAt": "2026-06-09T13:00:00.000Z"
}
```

---

## 1) Probarlo en tu PC primero (recomendado)

En una terminal **tuya** (con internet):

```bash
cd "C:/Users/Jonathan Lobo/Documents/bolitas/server"
npm install
npm start
```

Abrí en el navegador: **http://localhost:3000/api/rates**
Deberías ver el JSON con el BCV correcto (ej. 567.68).

Para probar la app contra este backend local:
1. Abrí Bolos VE (`http://localhost:5173`).
2. ⚙️ Configuración → "Servidor de datos" → escribí `http://localhost:3000` → **Guardar servidor**.
3. La app recarga y muestra los datos del backend (BCV exacto).

> Si el BCV sale `null`, avisame: el BCV cambió algo en su web y ajusto el scraping
> en `index.js` (en `scrapeBCV`, los `id` `dolar`/`euro`).

---

## 2) Subirlo gratis a Render (para que funcione siempre, también en el celular)

1. Subí la carpeta `server/` a un repo de GitHub (puede ser un repo aparte).
2. Entrá a **https://render.com** → *New* → *Web Service* → conectá el repo.
3. Configuración:
   - **Root Directory**: `server` (si subiste todo el proyecto) o vacío (si subiste solo server).
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free
4. Deploy. Te queda una URL tipo `https://bolitas-backend.onrender.com`.
5. En la app: ⚙️ → "Servidor de datos" → pegá esa URL → **Guardar servidor**.

> Nota: el plan Free de Render "duerme" el servicio tras inactividad; la primera
> carga del día puede tardar ~30s en despertar. Para algo más constante, Railway
> o Fly.io son alternativas. La app igual usa fuentes públicas como respaldo si el
> backend no responde.

---

## Ajustes que se hacen SOLO en el servidor (sin actualizar la app)

- **Cálculo del P2P**: en `binanceP2P()` se usa la mediana de los 10 anuncios más baratos.
  Si querés que se parezca más a otra referencia, se ajusta ahí.
- **Frecuencia de actualización**: `TTL_MS` (por defecto 5 minutos).

Esta es la gran ventaja del backend: si una fuente cambia, lo arreglás acá y
**todos los usuarios lo reciben sin actualizar la app**.
