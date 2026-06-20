// Convierte assets/logo.svg en los PNG fuente que usa @capacitor/assets.
// Uso:  npm run logo
import sharp from "sharp";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const svg = readFileSync(join(root, "assets", "logo.svg"));

// logo.png: la moneda con fondo transparente (1024x1024)
await sharp(svg, { density: 384 })
  .resize(1024, 1024, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toFile(join(root, "assets", "logo.png"));

// logo-dark.png: igual (mismo logo sirve para claro y oscuro)
await sharp(svg, { density: 384 })
  .resize(1024, 1024, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toFile(join(root, "assets", "logo-dark.png"));

// --- Materiales para Play Store ---

// Ícono 512×512 (Play exige SIN transparencia): moneda centrada sobre fondo oscuro.
const coin = await sharp(svg, { density: 384 })
  .resize(430, 430, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: "#121212" } })
  .composite([{ input: coin, gravity: "centre" }])
  .png()
  .toFile(join(root, "assets", "playstore-icon-512.png"));

// Gráfico destacado 1024×500
const fg = readFileSync(join(root, "assets", "feature-graphic.svg"));
await sharp(fg, { density: 200 })
  .resize(1024, 500)
  .png()
  .toFile(join(root, "assets", "feature-graphic-1024x500.png"));

console.log(
  "OK: logo.png, logo-dark.png, playstore-icon-512.png y feature-graphic-1024x500.png generados.",
);
