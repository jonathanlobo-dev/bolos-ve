// Limpia el logo: el JPEG incrustado en assets/logo.svg trae un patrón de
// cuadritos (checkerboard) pintado como fondo. Este script convierte esos
// píxeles grises/blancos de baja saturación en transparencia real y guarda
// assets/logo-clean.png (1024x1024, moneda dorada sobre fondo transparente).
// Uso:  node tools/clean-logo.mjs
import sharp from "sharp";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const svg = readFileSync(join(root, "assets", "logo.svg"), "utf8");
const b64 = svg.match(/data:image\/jpeg;base64,([^"]+)/)[1];

const img = sharp(Buffer.from(b64, "base64")).resize(1024, 1024);
const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });

const out = Buffer.alloc(info.width * info.height * 4);
for (let i = 0, j = 0; i < data.length; i += info.channels, j += 4) {
  const r = data[i], g = data[i + 1], b = data[i + 2];
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const sat = max === 0 ? 0 : (max - min) / max;
  // El dorado tiene saturación alta; el checkerboard es gris/blanco (sat ~0).
  // Rampa suave para no serruchar los bordes anti-aliased.
  const alpha = Math.max(0, Math.min(1, (sat - 0.12) / 0.18));
  out[j] = r;
  out[j + 1] = g;
  out[j + 2] = b;
  out[j + 3] = Math.round(alpha * 255);
}

await sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
  .png()
  .toFile(join(root, "assets", "logo-clean.png"));

console.log("OK: assets/logo-clean.png generado (fondo transparente real).");
