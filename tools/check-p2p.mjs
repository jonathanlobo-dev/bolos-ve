// Diagnóstico: consulta el P2P de Binance (USDT/VES) en sus dos lados y
// compara con las fuentes que usa la app hoy.
// Uso:  node tools/check-p2p.mjs
async function binance(tradeType) {
  const res = await fetch("https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fiat: "VES",
      page: 1,
      rows: 20,
      tradeType, // "BUY" = anuncios donde TÚ compras USDT | "SELL" = donde TÚ vendes
      asset: "USDT",
      countries: [],
      payTypes: [],
      publisherType: null,
    }),
  });
  const json = await res.json();
  const prices = (json?.data || [])
    .map((a) => parseFloat(a?.adv?.price))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);
  return prices;
}

const fmt = (a) =>
  a.length
    ? `min ${a[0].toFixed(2)} | mediana ${a[Math.floor(a.length / 2)].toFixed(2)} | max ${a[a.length - 1].toFixed(2)}`
    : "sin datos";

const buy = await binance("BUY");
const sell = await binance("SELL");
console.log("Binance tradeType=BUY  (tú compras USDT):", fmt(buy));
console.log("  primeros 8:", buy.slice(0, 8).map((n) => n.toFixed(2)).join(", "));
console.log("Binance tradeType=SELL (tú vendes USDT):", fmt(sell));
console.log("  primeros 8:", sell.slice(0, 8).map((n) => n.toFixed(2)).join(", "));

const yadio = await fetch("https://api.yadio.io/rate/VES/USD").then((r) => r.json());
console.log("\nYadio (lo que usa la app hoy):", yadio.rate?.toFixed(2));
const da = await fetch("https://ve.dolarapi.com/v1/dolares/paralelo").then((r) => r.json());
console.log("DolarApi paralelo:", da.promedio?.toFixed(2));
