// Prepara las capturas del teléfono para la ficha de Play Store:
// recorta la barra de estado (arriba) y la barra de navegación (abajo),
// escala a 1920 de alto y rellena a 1080 de ancho (9:16 exacto, fondo #121212).
// Uso:  node tools/make-captures.mjs  (lee assets/photo_*.jpg → assets/store/)
import sharp from "sharp";
import { globSync } from "node:fs";
import { mkdirSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "assets", "store");
mkdirSync(outDir, { recursive: true });

// orden elegido para la ficha (mejor primero)
const ORDER = [
  "photo_4_2026-07-20_11-58-28.jpg", // Inicio con tasas y brecha
  "photo_5_2026-07-20_11-58-28.jpg", // ¿Me conviene?
  "photo_2_2026-07-20_11-58-28.jpg", // Pago Móvil
  "photo_6_2026-07-20_11-58-28.jpg", // Configuración
  "photo_1_2026-07-20_11-58-28.jpg", // Tutorial
];

const TOP_CROP = 132; // barra de estado (reloj/íconos del sistema)
const BOTTOM_CROP = 48; // barra de navegación (pastilla de gestos)

let i = 0;
for (const name of ORDER) {
  i++;
  const img = sharp(join(root, "assets", name));
  const meta = await img.metadata();
  const h = meta.height - TOP_CROP - BOTTOM_CROP;
  const cropped = await img
    .extract({ left: 0, top: TOP_CROP, width: meta.width, height: h })
    .resize({ height: 1920 })
    .png()
    .toBuffer();
  const w = (await sharp(cropped).metadata()).width;
  await sharp({ create: { width: 1080, height: 1920, channels: 4, background: "#121212" } })
    .composite([{ input: cropped, left: Math.round((1080 - w) / 2), top: 0 }])
    .png()
    .toFile(join(outDir, `captura_${i}.png`));
  console.log(`captura_${i}.png ← ${name}`);
}
console.log("OK: capturas en assets/store/ (1080x1920, listas para Play)");
