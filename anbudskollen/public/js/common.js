// Shared helpers. All DOM content is created through el()/text nodes so text
// coming from documents or the model can never be interpreted as HTML.

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2), value);
    else if (key === "style" && typeof value === "object") Object.assign(node.style, value);
    else node.setAttribute(key, value === true ? "" : String(value));
  }
  append(node, children);
  return node;
}

export function append(node, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

export async function api(path, { method = "GET", body, headers = {}, form } = {}) {
  const init = { method, headers: { ...headers } };
  const adminToken = getAdminToken();
  if (adminToken) init.headers["X-Admin-Token"] = adminToken;
  if (form) init.body = form;
  else if (body !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const response = await fetch(path, init);
  const isJson = (response.headers.get("content-type") ?? "").includes("application/json");
  const data = isJson ? await response.json() : null;
  if (!response.ok) {
    const error = new Error(data?.error ?? `Fel ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

let configPromise;
export function getConfig() {
  configPromise ??= fetch("/api/config").then((r) => r.json());
  return configPromise;
}

export function getAdminToken() {
  try {
    return localStorage.getItem("anbudskollen.admin") ?? "";
  } catch {
    return "";
  }
}

export function setAdminToken(value) {
  try {
    if (value) localStorage.setItem("anbudskollen.admin", value);
    else localStorage.removeItem("anbudskollen.admin");
  } catch {
    /* storage unavailable */
  }
}

const MONTHS = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

export function formatDate(iso, time) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}${time ? ` kl. ${time}` : ""}`;
}

export function todaySweden() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm" }).format(new Date());
}

export function daysUntil(iso) {
  if (!iso) return null;
  return Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${todaySweden()}T00:00:00Z`)) / 86_400_000);
}

export function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} kB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function sourceText(documents, document, page) {
  if (!document) return "";
  const unit = documents?.find((d) => d.name === document)?.unit ?? "sida";
  if (!page) return document;
  const label = unit === "sida" ? `s. ${page}` : unit === "flik" ? `del ${page}` : `avsnitt ${page}`;
  return `${document}, ${label}`;
}

export async function fillCompany() {
  const config = await getConfig();
  for (const node of $$("[data-company]")) {
    const value = config.company?.[node.dataset.company];
    if (value) node.textContent = value;
  }
  for (const node of $$("[data-config]")) {
    const value = config[node.dataset.config];
    if (value !== undefined && value !== null) node.textContent = value;
  }
  for (const node of $$("a[data-mailto]")) {
    node.href = `mailto:${config.company.email}`;
    node.textContent = config.company.email;
  }
  return config;
}

export function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const area = el("textarea", { style: { position: "fixed", opacity: "0" } }, text);
  document.body.append(area);
  area.select();
  document.execCommand("copy");
  area.remove();
  return Promise.resolve();
}

export const LABELS = {
  type: { SKA: "SKA", BOR: "BÖR", UTVARDERING: "UTVÄRD.", INFO: "INFO" },
  typeLong: { SKA: "Ska-krav", BOR: "Bör-krav", UTVARDERING: "Utvärdering", INFO: "Info" },
  category: {
    KVALIFICERING: "Kvalificering",
    UTESLUTNING: "Uteslutning",
    TJANST: "Tjänst/vara",
    AVTAL: "Avtalsvillkor",
    UTVARDERING: "Utvärdering",
    ANBUDETS_FORM: "Anbudets form",
    OVRIGT: "Övrigt",
  },
  status: { UPPFYLLT: "Uppfyllt", TROLIGEN: "Troligen", OKLART: "Oklart", SAKNAS: "Saknas" },
  severity: { HOG: "Hög", MEDEL: "Medel", LAG: "Låg" },
  recommendation: {
    GO: "GO – lämna anbud",
    GO_MED_FORBEHALL: "GO med förbehåll",
    AVSTA: "AVSTÅ",
    MER_INFO: "Avgörs av era förutsättningar",
  },
};
