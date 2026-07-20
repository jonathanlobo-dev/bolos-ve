// Genera los PNG fuente que usa @capacitor/assets a partir de
// assets/logo-clean.png (moneda con transparencia real; ver tools/clean-logo.mjs).
// Uso:  npm run logo
import sharp from "sharp";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "assets", "logo-clean.png");

// logo.png: la moneda con fondo transparente (1024x1024)
await sharp(src)
  .resize(1024, 1024, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toFile(join(root, "assets", "logo.png"));

// logo-dark.png: igual (mismo logo sirve para claro y oscuro)
await sharp(src)
  .resize(1024, 1024, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toFile(join(root, "assets", "logo-dark.png"));

// --- Materiales para Play Store ---

// Ícono 512×512 (Play exige SIN transparencia): moneda recortada (sin márgenes
// internos) llenando ~88% del lienzo, sobre fondo oscuro con resplandor dorado.
const trimmed = await sharp(src).trim().png().toBuffer();
const coin = await sharp(trimmed)
  .resize(450, 450, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();
const glow = Buffer.from(
  `<svg width="512" height="512"><defs><radialGradient id="g" cx="50%" cy="46%" r="62%">` +
    `<stop offset="0%" stop-color="#3a2f00"/><stop offset="55%" stop-color="#1d1a0a"/>` +
    `<stop offset="100%" stop-color="#121212"/></radialGradient></defs>` +
    `<rect width="512" height="512" fill="url(#g)"/></svg>`,
);
await sharp(glow)
  .composite([{ input: coin, gravity: "centre" }])
  .png()
  .toFile(join(root, "assets", "playstore-icon-512.png"));

// Gráfico destacado 1024×500: moneda real a la izquierda + textos
const fgCoin = await sharp(trimmed)
  .resize(340, 340, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();
const fgBg = Buffer.from(
  `<svg width="1024" height="500" xmlns="http://www.w3.org/2000/svg">` +
    `<defs><radialGradient id="g" cx="24%" cy="50%" r="55%">` +
    `<stop offset="0%" stop-color="#332a00"/><stop offset="100%" stop-color="#121212"/>` +
    `</radialGradient></defs>` +
    `<rect width="1024" height="500" fill="url(#g)"/>` +
    `<text x="450" y="215" font-family="Arial, Helvetica, sans-serif" font-size="92" font-weight="800" fill="#FFC400">Bolos VE</text>` +
    `<text x="452" y="280" font-family="Arial, Helvetica, sans-serif" font-size="36" font-weight="600" fill="#F5F5F5">Tu app de cambio</text>` +
    `<text x="452" y="335" font-family="Arial, Helvetica, sans-serif" font-size="30" fill="#9E9E9E">Dólar BCV · Euro · P2P en vivo</text>` +
    `</svg>`,
);
await sharp(fgBg)
  .composite([{ input: fgCoin, left: 70, top: 80 }])
  .png()
  .toFile(join(root, "assets", "feature-graphic-1024x500.png"));

console.log(
  "OK: logo.png, logo-dark.png, playstore-icon-512.png y feature-graphic-1024x500.png generados.",
);
