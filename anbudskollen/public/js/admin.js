import { $, LABELS, api, clear, copyToClipboard, el, formatBytes, getAdminToken, getConfig, setAdminToken } from "./common.js";

const siteConfig = await getConfig();

const root = $("#admin");
const loginForm = $("#login");
const sekFormat = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  setAdminToken($("#token").value.trim());
  await refresh();
});

$("#logout").addEventListener("click", () => {
  setAdminToken("");
  location.reload();
});

function toast(message, ok = true) {
  const note = el("div", { class: `alert ${ok ? "alert-ok" : "alert-error"}`, style: { position: "fixed", bottom: "16px", right: "16px", zIndex: 60, boxShadow: "var(--shadow)" } }, message);
  document.body.append(note);
  setTimeout(() => note.remove(), 2600);
}

async function refresh() {
  if (!getAdminToken()) return;
  try {
    const data = await api("/api/admin/overview");
    $("#logout").classList.remove("hidden");
    render(data);
  } catch (error) {
    if (error.status === 401 || error.status === 503) {
      setAdminToken("");
      clear(root).append(loginForm);
      const status = $("#login-status");
      status.className = "alert alert-error";
      status.textContent = error.message;
    } else toast(error.message, false);
  }
}

function render(data) {
  clear(root);
  const s = data.stats;
  root.append(
    el("div", { class: "row" },
      el("h1", { style: { fontSize: "1.8rem", margin: 0 } }, "Översikt"),
      el("span", { class: "spacer" }),
      el("span", { class: "chip" }, data.engine === "anthropic" ? `AI: ${data.model}` : "DEMOLÄGE – ingen AI-nyckel"),
      el("span", { class: "chip" }, data.paymentsEnabled ? "Stripe aktiv" : "Kortbetalning av"),
    ),
    el("div", { class: "grid grid-4", style: { marginTop: "16px" } },
      statCard("Intäkt (betalda rapporter)", sekFormat.format(s.revenueSek)),
      statCard("Betalda rapporter", s.paidReports),
      statCard("Öppna fakturaförfrågningar", s.openInvoiceRequests),
      statCard("Analyser totalt / idag", `${s.analyses} / ${s.analysesToday}`),
      statCard("AI-kostnad totalt", `$${s.aiCostUsd}`),
    ),
  );
  root.append(newAnalysisCard());
  root.append(el("h2", { style: { marginTop: "28px" } }, "Analyser och delningslänkar"));
  root.append(el("p", { class: "muted small" }, "Varje länk har egen betalstatus. Skapa en ny länk per företag du skickar en analys till – betalar ett företag låses bara deras länk upp."));
  if (!data.analyses.length) root.append(el("div", { class: "card muted" }, "Inga analyser ännu."));
  for (const a of data.analyses) root.append(analysisCard(a));
  root.append(el("h2", { style: { marginTop: "28px" } }, "Leads och fakturaförfrågningar"));
  root.append(leadsTable(data.leads));
}

function statCard(label, value) {
  return el("div", { class: "card" }, el("div", { class: "kv" }, label), el("div", { class: "stat" }, String(value)));
}

function newAnalysisCard() {
  const files = [];
  const list = el("ul", { class: "file-list" });
  const input = el("input", { type: "file", multiple: true, accept: ".pdf,.docx,.xlsx,.txt,.md,.csv" });
  const label = el("input", { type: "text", placeholder: "T.ex. 'Lokalvård Exempelstad – utskick städbolag'", "aria-label": "Etikett" });
  const status = el("div", { role: "status" });
  input.addEventListener("change", () => {
    for (const f of input.files) files.push(f);
    input.value = "";
    clear(list);
    files.forEach((f) => list.append(el("li", {}, el("span", { class: "name" }, f.name), el("span", { class: "muted small" }, formatBytes(f.size)))));
  });
  const button = el("button", { class: "btn btn-primary" }, "Starta analys");
  button.addEventListener("click", async () => {
    if (!files.length) return toast("Välj filer först", false);
    const form = new FormData();
    for (const f of files) form.append("files", f, f.name);
    form.append("label", label.value);
    button.disabled = true;
    try {
      const result = await api("/api/admin/analyses", { method: "POST", form });
      toast("Analysen startade");
      window.open(result.url, "_blank");
      refresh();
    } catch (error) {
      status.className = "alert alert-error";
      status.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
  return el("details", { class: "card", style: { marginTop: "20px" } },
    el("summary", { style: { cursor: "pointer", fontWeight: 700 } }, "+ Ny analys (utan företagsprofil – för utskick till flera företag)"),
    el("div", { class: "stack", style: { marginTop: "12px" } },
      el("p", { class: "small muted" }, "Hämta underlaget för en färsk upphandling, analysera den här och skicka sedan en personlig delningslänk till varje företag som kan vara intresserat. De ser förhandsvisningen gratis och kan låsa upp själva."),
      input, list, label, status, button,
    ),
  );
}

function analysisCard(a) {
  const origin = location.origin;
  const shareLabel = el("input", { type: "text", placeholder: "Mottagare, t.ex. 'Städproffsen AB'", "aria-label": "Mottagare", style: { maxWidth: "280px" } });
  const createShare = el("button", { class: "btn btn-ghost btn-sm" }, "+ Ny delningslänk");
  createShare.addEventListener("click", async () => {
    try {
      const r = await api(`/api/admin/analyses/${a.id}/shares`, { method: "POST", body: { label: shareLabel.value } });
      await copyToClipboard(r.url);
      toast("Ny länk skapad och kopierad");
      refresh();
    } catch (error) {
      toast(error.message, false);
    }
  });
  const remove = el("button", { class: "btn btn-danger btn-sm" }, "Radera");
  remove.addEventListener("click", async () => {
    if (!confirm("Radera analysen och alla dess länkar permanent?")) return;
    await api(`/api/admin/analyses/${a.id}`, { method: "DELETE" });
    toast("Raderad");
    refresh();
  });
  const pages = (a.documents ?? []).reduce((sum, d) => sum + (d.pages ?? 0), 0);
  return el("div", { class: "card", style: { marginTop: "12px" } },
    el("div", { class: "row" },
      el("strong", {}, a.title || (a.documents?.[0]?.name ?? "Analys")),
      a.recommendation ? el("span", { class: `rec rec-${a.recommendation}`, style: { fontSize: "0.78rem", padding: "2px 10px" } }, `${LABELS.recommendation[a.recommendation]} · ${a.score}`) : null,
      el("span", { class: "chip" }, a.status),
      el("span", { class: "spacer" }),
      remove,
    ),
    el("div", { class: "kv" }, `${new Date(a.createdAt).toLocaleString("sv-SE")} · ${a.source} · ${a.documents.length} dok · ${pages} s. · ${a.requirements} krav${a.costUsd !== null ? ` · $${a.costUsd.toFixed(2)}` : ""}${a.durationMs ? ` · ${Math.round(a.durationMs / 1000)} s` : ""}`),
    a.error ? el("div", { class: "alert alert-error" }, a.error) : null,
    ...a.shares.map((s) => shareRow(s, origin)),
    el("div", { class: "share" }, shareLabel, createShare),
  );
}

function shareRow(s, origin) {
  const url = `${origin}/rapport.html?t=${s.token}`;
  const unlock = async (via) => {
    const amount = via === "gratis" ? 0 : Number(prompt("Belopp i kr exkl. moms:", String(siteConfig.priceSek)) ?? "");
    if (via !== "gratis" && !Number.isFinite(amount)) return;
    await api(`/api/admin/access/${s.token}/unlock`, { method: "POST", body: { via, amountSek: amount } });
    toast("Upplåst");
    refresh();
  };
  return el("div", { class: "share" },
    el("span", { class: s.paid ? "status status-UPPFYLLT" : "status status-OKLART" }, s.paid ? `Betald (${s.paidVia}${s.amountSek ? `, ${s.amountSek} kr` : ""})` : "Ej betald"),
    el("strong", {}, s.label || "(ingen etikett)"),
    s.email ? el("span", { class: "muted" }, s.email) : null,
    s.invoiceRequest ? el("span", { class: "status status-TROLIGEN", title: JSON.stringify(s.invoiceRequest) }, `Faktura: ${s.invoiceRequest.company} (${s.invoiceRequest.orgNumber}) ${s.invoiceRequest.email}`) : null,
    s.personalized ? el("span", { class: "chip" }, "Profil") : null,
    el("span", { class: "spacer" }),
    el("a", { class: "btn btn-ghost btn-sm", href: url, target: "_blank" }, "Öppna"),
    el("button", { class: "btn btn-ghost btn-sm", onclick: () => copyToClipboard(url).then(() => toast("Länk kopierad")) }, "Kopiera"),
    s.paid
      ? el("button", { class: "btn btn-ghost btn-sm", onclick: async () => { await api(`/api/admin/access/${s.token}/lock`, { method: "POST", body: {} }); refresh(); } }, "Lås")
      : el("span", { class: "row", style: { gap: "6px" } },
          el("button", { class: "btn btn-ghost btn-sm", onclick: () => unlock("faktura") }, "Lås upp (faktura)"),
          el("button", { class: "btn btn-ghost btn-sm", onclick: () => unlock("gratis") }, "Lås upp gratis"),
        ),
  );
}

function leadsTable(leads) {
  if (!leads.length) return el("div", { class: "card muted" }, "Inga leads ännu.");
  return el("div", { class: "table-wrap" },
    el("table", {},
      el("thead", {}, el("tr", {}, el("th", {}, "Datum"), el("th", {}, "Typ"), el("th", {}, "Företag / namn"), el("th", {}, "Kontakt"), el("th", {}, "Detaljer"))),
      el("tbody", {}, leads.map((l) => el("tr", {},
        el("td", {}, new Date(l.createdAt).toLocaleString("sv-SE")),
        el("td", {}, l.kind),
        el("td", {}, l.company || "", l.orgNumber ? el("div", { class: "src" }, l.orgNumber) : null, l.name ? el("div", { class: "src" }, l.name) : null),
        el("td", {}, l.email || "", l.phone ? el("div", { class: "src" }, l.phone) : null),
        el("td", { class: "small" }, l.message || l.title || "", l.reference ? el("div", { class: "src" }, `Ref: ${l.reference}`) : null, l.invoiceAddress ? el("div", { class: "src" }, l.invoiceAddress) : null),
      ))),
    ),
  );
}

if (getAdminToken()) refresh();
