import { urgentCoachResponse } from "./logic.js?v=15";

const escapeHTML = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
const SAFE_PHONE_LINKS = new Set(["tel:112", "tel:1177", "tel:90101", "tel:116016"]);

function serverSafetyFallback() {
  const crisis = {
    level: "urgent",
    title: "Ta hjälp av en människa nu",
    body: "Det du skrev behöver mänskligt stöd. Ring 112 vid omedelbar fara eller 1177 för hjälp att hitta rätt vård.",
    links: [{ label: "Ring 112", href: "tel:112" }, { label: "Ring 1177", href: "tel:1177" }]
  };
  return { level: crisis.level, title: crisis.title, reflection: crisis.body, actions: [], guidance: [], followUp: null, trend: "first", crisis };
}

export function clientSafetyResponse(entry = {}, question = "", errorCode = "") {
  const combinedText = [entry.note, question].map((value) => String(value || "").trim()).filter(Boolean).join("\n").slice(0, 1200);
  const urgent = urgentCoachResponse({ ...entry, note: combinedText });
  if (urgent) return urgent;
  return errorCode === "human_support_required" ? serverSafetyFallback() : null;
}

export function renderSafetyCard(response, { id = "moment-result", label = "Mänsklig hjälp först" } = {}) {
  if (!response?.crisis) return "";
  const links = (Array.isArray(response.crisis.links) ? response.crisis.links : [])
    .filter((link) => SAFE_PHONE_LINKS.has(link?.href))
    .map((link) => `<a class="button button-danger" href="${link.href}">${escapeHTML(link.label)}</a>`)
    .join("");
  return `<section class="moment-result crisis-result" id="${escapeHTML(id)}" tabindex="-1" role="alert" aria-live="assertive" aria-atomic="true" data-level="${escapeHTML(response.level)}">
    <p class="eyebrow">${escapeHTML(label)}</p>
    <h2>${escapeHTML(response.title)}</h2>
    <p>${escapeHTML(response.reflection)}</p>
    <div class="crisis-actions">${links}</div>
    <p class="fine-print">Be om möjligt någon trygg att stanna hos dig medan du tar kontakt.</p>
  </section>`;
}
