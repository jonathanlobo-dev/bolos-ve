// Mini tutorial de 3 pasos, al abrir por primera vez (y reabrible desde ⚙️).

import { hideAdBanner, showAdBanner } from "./ads";
import { load, save } from "./storage";

const KEY = "bolitas.onboarded";

interface Step {
  icon: string;
  title: string;
  text: string;
}

const STEPS: Step[] = [
  {
    icon: "🏠",
    title: "Convierte al instante",
    text: "Escribe un monto arriba y míralo en todas las tasas a la vez. Cambia entre <b>$ → Bs</b> y <b>Bs → $</b>, usa los atajos (1/10/50/100) y <b>mantén presionada una tarjeta</b> para copiar el monto.",
  },
  {
    icon: "🧮",
    title: "Calculadoras",
    text: "<b>Pago Móvil</b>: cuánto necesitas tener o cuánto puedes enviar contando la comisión. <b>¿Me conviene?</b>: te dice si te sale mejor pagar en dólares o en bolívares.",
  },
  {
    icon: "🔔",
    title: "Alertas y ajustes",
    text: "Crea <b>alertas</b> de precio. En <b>⚙️</b> eliges qué tasas ver, el orden, el tema y la <b>notificación diaria</b>. Con <b>📤</b> compartes las tasas como imagen.",
  },
];

let idx = 0;

function render(): void {
  const content = document.getElementById("onbContent");
  const dots = document.getElementById("onbDots");
  const next = document.getElementById("onbNext");
  if (!content) return;
  const s = STEPS[idx];
  content.innerHTML = `
    <div class="onb-ico">${s.icon}</div>
    <h2 class="onb-title">${s.title}</h2>
    <p class="onb-text">${s.text}</p>`;
  if (dots) {
    dots.innerHTML = STEPS.map((_, i) => `<span class="onb-dot${i === idx ? " on" : ""}"></span>`).join("");
  }
  if (next) next.textContent = idx === STEPS.length - 1 ? "¡Empezar!" : "Siguiente";
}

function close(): void {
  document.getElementById("onboarding")?.classList.add("hidden");
  showAdBanner(); // el banner nativo vuelve al cerrar el tutorial
  save(KEY, true);
}

export function openOnboarding(): void {
  idx = 0;
  render();
  document.getElementById("onboarding")?.classList.remove("hidden");
  hideAdBanner(); // el banner flota sobre todo; lo ocultamos durante el tutorial
}

export function initOnboarding(): void {
  document.getElementById("onbNext")?.addEventListener("click", () => {
    if (idx < STEPS.length - 1) {
      idx++;
      render();
    } else {
      close();
    }
  });
  document.getElementById("onbSkip")?.addEventListener("click", close);

  // primera vez → mostrar
  if (!load<boolean>(KEY, false)) openOnboarding();
}
