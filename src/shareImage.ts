// Genera la imagen que acompaña al compartir (WhatsApp la manda como foto con
// el texto de pie). Se dibuja en un canvas 1080×1080 y se exporta en JPEG:
// pesa mucho menos que PNG y por eso sale rápido.

export interface ShareRow {
  label: string;
  value: string;
  sub?: string; // línea pequeña bajo el valor (ej. "Antes: 736,93")
}

export interface ShareCard {
  title: string; // "Tasas de hoy"
  rows: ShareRow[];
  note?: string; // franja destacada (ej. la brecha)
  stamp: string; // fecha/hora
}

const W = 1080;
const BG = "#121212";
const SURFACE = "#1e1e1e";
const GOLD = "#ffc400";
const TEXT = "#f5f5f5";
const DIM = "#9e9e9e";

// El logo se carga una sola vez y se reutiliza en cada imagen.
let logoPromise: Promise<HTMLImageElement | null> | null = null;
function loadLogo(): Promise<HTMLImageElement | null> {
  logoPromise ??= new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = "logo.png";
  });
  return logoPromise;
}

/** Recorta el texto con "…" para que quepa en `max` píxeles. */
function fitText(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Dibuja la tarjeta y devuelve la imagen en JPEG (base64, sin encabezado). */
export async function buildShareImage(card: ShareCard): Promise<string | null> {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = W;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, W);

    // --- Encabezado: logo + marca ---
    const logo = await loadLogo();
    const pad = 64;
    let y = pad;
    if (logo) ctx.drawImage(logo, pad, y, 84, 84);
    ctx.fillStyle = GOLD;
    ctx.font = "700 58px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText("Bolos VE", pad + (logo ? 104 : 0), y + 44);

    ctx.fillStyle = DIM;
    ctx.font = "400 30px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(card.stamp, W - pad, y + 44);
    ctx.textAlign = "left";

    // --- Título ---
    y += 84 + 56;
    ctx.fillStyle = TEXT;
    ctx.font = "700 46px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    ctx.fillText(fitText(ctx, card.title, W - pad * 2), pad, y);

    // --- Filas ---
    // Se limitan a 5 para que la nota y el pie de marca siempre quepan.
    y += 56;
    const rows = card.rows.slice(0, 5);
    const rowH = rows.length > 3 ? 112 : 138;
    for (const row of rows) {
      ctx.fillStyle = SURFACE;
      roundRect(ctx, pad, y, W - pad * 2, rowH - 16, 24);
      ctx.fill();

      const cy = y + (rowH - 16) / 2;
      const left = pad + 32;
      const right = W - pad - 32;

      // El valor manda: se mide primero y la etiqueta usa lo que sobre,
      // así nunca se montan uno encima del otro.
      ctx.font = "700 46px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
      const valueW = ctx.measureText(row.value).width;
      const labelMax = right - left - valueW - 24;

      ctx.fillStyle = DIM;
      ctx.font = "600 32px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
      ctx.fillText(fitText(ctx, row.label, labelMax), left, row.sub ? cy - 20 : cy);
      if (row.sub) {
        ctx.fillStyle = "#7a7a7a";
        ctx.font = "400 26px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
        ctx.fillText(fitText(ctx, row.sub, labelMax), left, cy + 22);
      }

      ctx.fillStyle = TEXT;
      ctx.font = "700 46px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(row.value, right, cy);
      ctx.textAlign = "left";

      y += rowH;
    }

    // --- Nota (ej. la brecha) ---
    if (card.note) {
      y += 8;
      ctx.fillStyle = "rgba(255,196,0,0.12)";
      roundRect(ctx, pad, y, W - pad * 2, 76, 22);
      ctx.fill();
      ctx.fillStyle = GOLD;
      ctx.font = "600 32px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(fitText(ctx, card.note, W - pad * 2 - 48), W / 2, y + 38);
      ctx.textAlign = "left";
    }

    // --- Pie de marca ---
    ctx.textAlign = "center";
    ctx.fillStyle = GOLD;
    ctx.font = "700 40px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    ctx.fillText("Bolos VE · Tu app de cambio", W / 2, W - 120);
    ctx.fillStyle = DIM;
    ctx.font = "400 30px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    ctx.fillText("Descárgala gratis en Google Play", W / 2, W - 70);
    ctx.textAlign = "left";

    // JPEG: pesa ~5 veces menos que PNG, y así el compartir es rápido.
    return canvas.toDataURL("image/jpeg", 0.86).split(",")[1] ?? null;
  } catch (err) {
    console.warn("[share] no se pudo generar la imagen:", err);
    return null;
  }
}
