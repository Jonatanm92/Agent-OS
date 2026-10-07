import { $, $$, LABELS, api, clear, copyToClipboard, daysUntil, el, fillCompany, formatDate, getAdminToken, sourceText } from "./common.js";

const params = new URLSearchParams(window.location.search);
const token = params.get("t");
const isExample = params.has("exempel");
const app = $("#app");
const state = { view: null, tab: "krav", filters: { type: "ALLA", category: "ALLA", status: "ALLA", q: "" }, pollTimer: null, profileOpen: false };

const config = await fillCompany();
if (getAdminToken() && !isExample) $("#owner-bar").classList.remove("hidden");

async function load() {
  clearTimeout(state.pollTimer);
  try {
    let view;
    if (isExample) {
      view = await api("/api/exempel");
    } else {
      if (!token) throw new Error("Länken saknar rapport-id. Kontrollera att du kopierat hela länken.");
      const sessionId = params.get("session_id");
      view = await api(`/api/r/${encodeURIComponent(token)}${sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : ""}`);
      if (sessionId) {
        params.delete("session_id");
        history.replaceState(null, "", `${location.pathname}?${params.toString()}`);
        if (view.unlocked) state.justPaid = true;
      }
    }
    state.view = view;
    render();
    const busy = ["i_ko", "analyserar", "sammanstaller"].includes(view.status) || view.personalizing;
    if (busy) state.pollTimer = setTimeout(load, 2500);
  } catch (error) {
    clear(app).append(el("div", { class: "card", style: { marginTop: "40px" } }, el("h2", {}, "Rapporten kunde inte visas"), el("p", { class: "muted" }, error.message), el("a", { class: "btn btn-primary", href: "/analys.html" }, "Starta en ny analys")));
  }
}

function render() {
  const v = state.view;
  clear(app);
  if (v.status === "fel") return renderError(v);
  if (v.status !== "klar") return renderProgress(v);
  renderReport(v);
}

function renderError(v) {
  app.append(
    el("div", { class: "card", style: { marginTop: "40px" } },
      el("h2", {}, "Analysen kunde inte slutföras"),
      el("p", {}, v.error),
      el("a", { class: "btn btn-primary", href: "/analys.html" }, "Försök igen"),
    ),
  );
}

function renderProgress(v) {
  const p = v.progress ?? {};
  const pct = p.total ? Math.round((p.done / p.total) * 85) + (v.status === "sammanstaller" ? 10 : 0) : 5;
  const pages = (v.documents ?? []).reduce((s, d) => s + (d.pages ?? 0), 0);
  app.append(
    el("div", { class: "card", style: { marginTop: "40px", maxWidth: "720px", marginInline: "auto" } },
      el("div", { class: "row" }, el("div", { class: "spinner" }), el("h2", { style: { margin: 0 } }, "Analyserar upphandlingen …")),
      el("p", { class: "muted", style: { marginTop: "12px" } }, `${v.documents.length} dokument · ${pages} sidor/avsnitt. Det tar oftast 2–10 minuter. Ni kan stänga sidan och komma tillbaka via länken.`),
      el("div", { class: "progress" }, el("div", { style: { width: `${Math.min(97, pct)}%` } })),
      el("p", { class: "small", style: { marginTop: "8px" } }, p.step ? `${p.step}${p.total ? ` (${p.done}/${p.total})` : ""}` : "I kö"),
      el("div", { class: "row", style: { marginTop: "12px" } },
        el("button", { class: "btn btn-ghost btn-sm", onclick: () => copyToClipboard(location.href).then(() => flash("Länken är kopierad")) }, "Kopiera länken till rapporten"),
      ),
      ...(v.documents ?? []).filter((d) => d.warning).map((d) => el("div", { class: "alert alert-warn" }, d.warning)),
    ),
  );
}

function flash(message) {
  const note = el("div", { class: "alert alert-ok no-print", style: { position: "fixed", bottom: "16px", left: "50%", transform: "translateX(-50%)", zIndex: 60, boxShadow: "var(--shadow)" } }, message);
  document.body.append(note);
  setTimeout(() => note.remove(), 2200);
}

function gauge(score, recommendation) {
  const color = recommendation === "MER_INFO" ? "var(--brand)" : score >= 70 ? "var(--accent)" : score >= 50 ? "var(--warn)" : "var(--danger)";
  return el("div", { class: "gauge", style: { background: `conic-gradient(${color} ${score * 3.6}deg, var(--surface-2) 0)` }, role: "img", "aria-label": `Poäng ${score} av 100` },
    el("span", {}, String(score), el("small", {}, "av 100")),
  );
}

function renderReport(v) {
  const h = v.headline ?? {};
  const s = v.synthesis ?? {};

  if (isExample) {
    app.append(el("div", { class: "alert alert-info no-print", style: { marginTop: "20px" } }, "Exempelrapport baserad på en fiktiv upphandling. ", el("a", { href: "/analys.html" }, "Analysera er egen upphandling gratis →")));
  }
  if (state.justPaid) {
    app.append(el("div", { class: "alert alert-ok", style: { marginTop: "20px" } }, "Tack för köpet! Hela rapporten är upplåst. Kvitto skickas till er e-post."));
    state.justPaid = false;
  }
  if (v.engine === "demo") {
    app.append(el("div", { class: "alert alert-warn no-print", style: { marginTop: "20px" } }, "Demoläge: rapporten är skapad med en enkel nyckelordsanalys utan AI och är inte komplett."));
  }

  // Header + verdict
  app.append(
    el("section", { class: "report-head" },
      el("p", { class: "muted small", style: { marginBottom: "4px" } }, `Analys skapad ${formatDate(v.createdAt?.slice(0, 10))} · ${v.stats.pages} sidor/avsnitt i ${v.documents.length} dokument`),
      el("h1", { style: { fontSize: "clamp(1.5rem,3.5vw,2.2rem)" } }, h.title || "Analys av upphandling"),
    ),
  );
  const verdict = el("div", { class: "card verdict" },
    gauge(h.score ?? 0, h.recommendation),
    el("div", {},
      el("div", { class: "row", style: { marginBottom: "8px" } },
        el("span", { class: `rec rec-${h.recommendation}` }, LABELS.recommendation[h.recommendation] ?? h.recommendation),
        el("span", { class: "muted small" }, h.profileUsed ? "Anpassad efter er företagsprofil" : "Generell bedömning"),
      ),
      el("p", { style: { marginBottom: "8px" } }, h.summary),
      ...(h.guards ?? []).map((g) => el("div", { class: "alert alert-warn", style: { margin: "6px 0" } }, g)),
      reasonsList(s.score_reasons ?? []),
      !h.profileUsed && !isExample ? el("button", { class: "btn btn-ghost btn-sm no-print", style: { marginTop: "8px" }, onclick: () => { state.profileOpen = true; render(); $("#profile-panel")?.scrollIntoView({ behavior: "smooth" }); } }, "Få en personlig bedömning för ert företag →") : null,
    ),
  );
  app.append(verdict);

  // Deadline
  if (v.deadline?.date) {
    const days = daysUntil(v.deadline.date);
    app.append(
      el("div", { class: "deadline", style: { marginTop: "16px" } },
        el("div", { class: "days" }, days < 0 ? "Passerad" : String(days)),
        el("div", {},
          el("strong", {}, days < 0 ? "Sista anbudsdag har passerat" : days === 1 ? "dag kvar till sista anbudsdag" : "dagar kvar till sista anbudsdag"),
          el("div", { class: "small" }, `${formatDate(v.deadline.date, v.deadline.time)} · ${sourceText(v.documents, v.deadline.document, v.deadline.page)}`),
        ),
      ),
    );
  }

  // Facts + stats
  if (h.key_facts?.length) {
    app.append(el("div", { class: "facts", style: { marginTop: "16px" } }, h.key_facts.map((f) => el("div", { class: "fact" }, el("div", { class: "k" }, f.label), el("div", { class: "v" }, f.value)))));
  }
  const a = v.stats.assessments ?? {};
  app.append(
    el("div", { class: "chips", style: { marginTop: "16px" } },
      el("span", { class: "chip" }, `${v.stats.requirements} krav totalt`),
      el("span", { class: "chip" }, `${v.stats.byType.SKA ?? 0} ska-krav`),
      el("span", { class: "chip" }, `${v.stats.byType.BOR ?? 0} bör-krav`),
      el("span", { class: "chip" }, `${v.stats.byType.UTVARDERING ?? 0} utvärderingskriterier`),
      el("span", { class: "chip" }, `${v.stats.risks} risker (${v.stats.highRisks} höga)`),
      Object.keys(a).length ? el("span", { class: "chip" }, `Mot er profil: ${a.UPPFYLLT ?? 0} uppfyllt · ${a.TROLIGEN ?? 0} troligen · ${a.OKLART ?? 0} oklart · ${a.SAKNAS ?? 0} saknas`) : null,
    ),
  );

  if (v.unlocked) app.append(exportBar(v));
  else app.append(paywall(v));

  renderTabs(v);
  if (!isExample) app.append(profilePanel(v));
}

function reasonsList(reasons) {
  if (!reasons.length) return null;
  const symbol = { PLUS: "+", MINUS: "−", NEUTRAL: "•" };
  const cls = { PLUS: "sev-LAG", MINUS: "sev-HOG", NEUTRAL: "muted" };
  return el("ul", { class: "list-clean small", style: { marginTop: "6px" } },
    reasons.map((r) => el("li", { style: { padding: "4px 0", border: 0 } }, el("strong", { class: cls[r.effect], style: { color: r.effect === "PLUS" ? "var(--accent)" : undefined } }, `${symbol[r.effect]} ${r.factor}: `), r.explanation)),
  );
}

function exportBar(v) {
  const base = `/api/r/${encodeURIComponent(v.token)}`;
  const download = async (path, fallbackName) => {
    if (isExample) return flash("Exportera i er egen rapport – exemplet är bara för visning.");
    try {
      const headers = getAdminToken() ? { "X-Admin-Token": getAdminToken() } : {};
      const response = await fetch(`${base}/${path}`, { headers });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? "Nedladdningen misslyckades");
      const blob = await response.blob();
      const name = /filename="([^"]+)"/.exec(response.headers.get("content-disposition") ?? "")?.[1] ?? fallbackName;
      const link = el("a", { href: URL.createObjectURL(blob), download: name });
      document.body.append(link);
      link.click();
      setTimeout(() => { URL.revokeObjectURL(link.href); link.remove(); }, 1000);
    } catch (error) {
      flash(error.message);
    }
  };
  return el("div", { class: "toolbar no-print", style: { marginTop: "20px" } },
    el("button", { class: "btn btn-primary", onclick: () => download("export.xlsx", "kravmatris.xlsx") }, "⬇ Kravmatris i Excel"),
    el("button", { class: "btn btn-ghost", onclick: () => download("export.ics", "datum.ics") }, "📅 Lägg till datum i kalendern"),
    el("button", { class: "btn btn-ghost", onclick: () => window.print() }, "🖨 Skriv ut / spara som PDF"),
    el("button", { class: "btn btn-ghost", onclick: () => copyToClipboard(location.href).then(() => flash("Länken är kopierad – dela den med kollegor")) }, "🔗 Kopiera länk"),
  );
}

function paywall(v) {
  const l = v.locked ?? {};
  const offer = v.offer;
  const box = el("div", { class: "paywall no-print", id: "paywall", style: { marginTop: "20px" } },
    el("h3", {}, "Lås upp hela rapporten"),
    el("p", { class: "muted", style: { margin: 0 } }, "Ni ser en gratis förhandsvisning. Den fullständiga rapporten innehåller:"),
    el("ul", {},
      el("li", {}, `Hela kravmatrisen: ${v.stats.requirements} krav med källa och citat (${l.requirements} till)`),
      el("li", {}, `${v.stats.risks} avtalsrisker med risknivå`),
      l.missingEvidence ? el("li", {}, `${l.missingEvidence} ${l.missingEvidence === 1 ? "underlag" : "intyg, certifikat och bilagor"} att ta fram`) : null,
      l.questions ? el("li", {}, `${l.questions} ${l.questions === 1 ? "färdig fråga" : "färdiga frågor"} att ställa till myndigheten`) : null,
      el("li", {}, "Anbudsdisposition, slutkontroll och nästa steg"),
      el("li", {}, "Export till Excel och kalender + utskrift/PDF"),
    ),
    el("div", { class: "row" },
      offer.paymentsEnabled
        ? el("button", { class: "btn btn-primary btn-lg", id: "pay-card", onclick: startCheckout }, `Lås upp nu – ${offer.priceLabel}`)
        : null,
      offer.invoiceEnabled ? el("button", { class: "btn btn-ghost btn-lg", onclick: () => invoiceModal(v) }, v.invoiceRequested ? "Fakturaförfrågan skickad ✓" : "Betala mot faktura") : null,
      !offer.paymentsEnabled && !offer.invoiceEnabled ? el("a", { class: "btn btn-primary btn-lg", href: "/#kontakt" }, "Kontakta oss för att låsa upp") : null,
    ),
    el("p", { class: "small muted", style: { marginTop: "10px", marginBottom: 0 } }, `${offer.vatNote} Engångsbetalning för den här upphandlingen – ingen prenumeration. Kortbetalning låser upp direkt.`),
  );
  if (isExample) {
    box.querySelectorAll("button").forEach((b) => (b.disabled = true));
  }
  return box;
}

async function startCheckout(event) {
  const button = event.currentTarget;
  button.disabled = true;
  button.textContent = "Öppnar betalning …";
  try {
    const result = await api(`/api/r/${encodeURIComponent(token)}/checkout`, { method: "POST", body: {} });
    if (result.alreadyPaid) return load();
    window.location.href = result.url;
  } catch (error) {
    flash(error.message);
    button.disabled = false;
    button.textContent = `Lås upp nu – ${state.view.offer.priceLabel}`;
  }
}

function invoiceModal(v) {
  const status = el("div", { role: "status" });
  const form = el("form", { class: "card modal", novalidate: true },
    el("h3", {}, "Betala mot faktura"),
    el("p", { class: "muted small" }, `Vi låser upp rapporten och skickar en faktura på ${v.offer.priceLabel} med 30 dagars betalningsvillkor. Upplåsning sker normalt inom några timmar under vardagar.`),
    field("Företag *", "company", "text", "organization"),
    field("Organisationsnummer *", "orgNumber", "text"),
    field("Er referens", "reference", "text", "name"),
    field("E-post för faktura och rapport *", "email", "email", "email"),
    field("Fakturaadress (om annan än registrerad)", "invoiceAddress", "text", "street-address"),
    status,
    el("div", { class: "row" },
      el("button", { class: "btn btn-primary", type: "submit" }, "Skicka förfrågan"),
      el("button", { class: "btn btn-ghost", type: "button", onclick: () => backdrop.remove() }, "Avbryt"),
    ),
  );
  const backdrop = el("div", { class: "modal-backdrop", onclick: (e) => { if (e.target === backdrop) backdrop.remove(); } }, form);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api(`/api/r/${encodeURIComponent(token)}/invoice`, { method: "POST", body: Object.fromEntries(new FormData(form).entries()) });
      clear(form).append(el("h3", {}, "Tack!"), el("p", {}, "Vi har tagit emot er förfrågan och återkommer med faktura och upplåst rapport. Spara länken till den här sidan."), el("button", { class: "btn btn-primary", type: "button", onclick: () => { backdrop.remove(); load(); } }, "Stäng"));
    } catch (error) {
      status.className = "alert alert-error";
      status.textContent = error.message;
    }
  });
  document.body.append(backdrop);
  form.querySelector("input")?.focus();
}

function field(label, name, type = "text", autocomplete) {
  const id = `f-${name}`;
  return el("div", { class: "field" }, el("label", { for: id }, label), el("input", { id, name, type, autocomplete }));
}

// ---------- Tabs ----------
function renderTabs(v) {
  const s = v.synthesis ?? {};
  const l = v.locked ?? {};
  const tabs = [
    ["krav", "Kravmatris", v.stats.requirements],
    ["datum", "Datum", v.unlocked ? v.dates.length : v.dates.length + (l.dates ?? 0)],
    ["risker", "Risker", v.stats.risks],
    ["underlag", "Underlag att ta fram", v.unlocked ? s.missing_evidence?.length ?? 0 : l.missingEvidence],
    ["fragor", "Frågor till myndigheten", v.unlocked ? s.questions?.length ?? 0 : l.questions],
    ["struktur", "Anbudsstruktur", v.unlocked ? s.bid_outline?.length ?? 0 : l.bidOutline],
    ["kontroll", "Slutkontroll", v.unlocked ? s.final_checklist?.length ?? 0 : l.checklist],
    ["dokument", "Dokument", v.documents.length],
  ];
  const bar = el("div", { class: "tabs", role: "tablist" },
    tabs.map(([id, label, count]) => el("button", { class: `tab${state.tab === id ? " on" : ""}`, role: "tab", "aria-selected": String(state.tab === id), onclick: () => { state.tab = id; render(); } }, label, count !== undefined ? el("span", { class: "count" }, String(count ?? 0)) : null)),
  );
  app.append(bar);
  const panels = {
    krav: requirementsPanel,
    datum: datesPanel,
    risker: risksPanel,
    underlag: evidencePanel,
    fragor: questionsPanel,
    struktur: outlinePanel,
    kontroll: checklistPanel,
    dokument: documentsPanel,
  };
  for (const [id] of tabs) {
    const panel = el("section", { class: `tab-panel${state.tab === id ? "" : " hidden"}`, "aria-label": id });
    panels[id](panel, v);
    app.append(panel);
  }
}

function lockedTeaser(text) {
  return el("div", { class: "card center", style: { margin: "12px 0" } },
    el("p", { style: { marginBottom: "10px" } }, "🔒 ", text),
    el("button", { class: "btn btn-primary", onclick: () => $("#paywall")?.scrollIntoView({ behavior: "smooth", block: "center" }) }, "Lås upp hela rapporten"),
  );
}

function requirementsPanel(panel, v) {
  const assessments = new Map((v.synthesis?.assessments ?? []).map((a) => [a.id, a]));
  const hasAssess = assessments.size > 0;
  const f = state.filters;
  const toolbar = el("div", { class: "toolbar no-print" },
    ...["ALLA", "SKA", "BOR", "UTVARDERING"].map((t) =>
      el("button", { class: `chip${f.type === t ? " on" : ""}`, onclick: () => { f.type = t; render(); } }, t === "ALLA" ? "Alla" : LABELS.typeLong[t]),
    ),
    select("Kategori", Object.entries(LABELS.category), f.category, (val) => { f.category = val; render(); }),
    hasAssess ? select("Bedömning", Object.entries(LABELS.status), f.status, (val) => { f.status = val; render(); }) : null,
    el("input", { type: "search", placeholder: "Sök i kraven …", value: f.q, "aria-label": "Sök i kraven", oninput: (e) => { f.q = e.target.value; updateRows(); } }),
  );
  panel.append(toolbar);
  const tbody = el("tbody");
  const table = el("div", { class: "table-wrap" },
    el("table", {},
      el("thead", {}, el("tr", {}, el("th", {}, "ID"), el("th", {}, "Typ"), el("th", {}, "Krav och bevis"), el("th", {}, "Källa"), hasAssess ? el("th", {}, "Mot er profil") : null)),
      tbody,
    ),
  );
  panel.append(table);

  function updateRows() {
    clear(tbody);
    const q = f.q.trim().toLowerCase();
    const rows = v.requirements.filter((r) =>
      (f.type === "ALLA" || r.type === f.type) &&
      (f.category === "ALLA" || r.category === f.category) &&
      (f.status === "ALLA" || assessments.get(r.id)?.status === f.status) &&
      (!q || `${r.id} ${r.ref} ${r.text} ${r.evidence} ${r.quote}`.toLowerCase().includes(q)),
    );
    for (const r of rows) {
      const a = assessments.get(r.id);
      tbody.append(
        el("tr", {},
          el("td", {}, el("strong", {}, r.id), r.ref ? el("div", { class: "src" }, r.ref) : null),
          el("td", {}, el("span", { class: `type type-${r.type}` }, LABELS.type[r.type]), el("div", { class: "src" }, LABELS.category[r.category])),
          el("td", {}, r.text, r.evidence ? el("div", { class: "small", style: { marginTop: "4px" } }, el("strong", {}, "Bevis: "), r.evidence) : null, r.quote ? el("span", { class: "quote" }, `”${r.quote}”`) : null),
          el("td", { class: "src" }, sourceText(v.documents, r.document, r.page), (r.alsoAt ?? []).length ? el("div", {}, `+ ${r.alsoAt.length} ställen till`) : null),
          hasAssess ? el("td", {}, a ? el("span", { class: `status status-${a.status}` }, LABELS.status[a.status]) : "", a?.comment ? el("div", { class: "small muted", style: { marginTop: "4px" } }, a.comment) : null) : null,
        ),
      );
    }
    if (!rows.length) tbody.append(el("tr", {}, el("td", { colspan: hasAssess ? 5 : 4, class: "muted" }, v.unlocked ? "Inga krav matchar filtret." : "Lås upp för att filtrera alla krav.")));
  }
  updateRows();

  if (!v.unlocked) {
    const ghosts = el("div", { class: "locked-rows", "aria-hidden": "true" },
      Array.from({ length: Math.min(5, v.locked.requirements) }, (_, i) =>
        el("div", { class: "ghost-row" }, el("span", { style: { width: "6%" } }), el("span", { style: { width: "8%" } }), el("span", { style: { width: `${48 + ((i * 17) % 30)}%` } }), el("span", { style: { width: "16%" } })),
      ),
    );
    table.append(ghosts);
    panel.append(lockedTeaser(`${v.locked.requirements} krav till finns i den fullständiga rapporten – inklusive kvalificeringskrav, avtalsvillkor och utvärderingskriterier.`));
  }
}

function select(label, entries, value, onChange) {
  return el("select", { "aria-label": label, onchange: (e) => onChange(e.target.value), style: { width: "auto" } },
    el("option", { value: "ALLA" }, `${label}: alla`),
    entries.map(([k, text]) => el("option", { value: k, selected: value === k }, text)),
  );
}

function datesPanel(panel, v) {
  const list = el("ul", { class: "list-clean card" });
  for (const d of v.dates) {
    const days = d.date ? daysUntil(d.date) : null;
    list.append(
      el("li", {},
        el("div", { class: "row" },
          el("strong", { style: { minWidth: "150px" } }, d.date ? formatDate(d.date, d.time) : "Utan fast datum"),
          el("span", {}, d.label),
          days !== null ? el("span", { class: "muted small" }, days < 0 ? "passerat" : `om ${days} dagar`) : null,
        ),
        el("div", { class: "src" }, sourceText(v.documents, d.document, d.page)),
        d.quote ? el("span", { class: "quote" }, `”${d.quote}”`) : null,
      ),
    );
  }
  if (!v.dates.length) list.append(el("li", { class: "muted" }, "Inga datum hittades."));
  panel.append(list);
  if (!v.unlocked && v.locked.dates) panel.append(lockedTeaser(`${v.locked.dates} datum till, t.ex. giltighetstid, visning och tilldelning – plus kalenderfil med påminnelser.`));
}

function risksPanel(panel, v) {
  const list = el("ul", { class: "list-clean card" });
  for (const r of v.risks) {
    list.append(
      el("li", {},
        el("div", { class: "row" }, el("span", { class: `sev-${r.severity}` }, LABELS.severity[r.severity].toUpperCase()), el("strong", {}, r.title)),
        el("p", { style: { margin: "4px 0" } }, r.description),
        el("div", { class: "src" }, sourceText(v.documents, r.document, r.page)),
        r.quote ? el("span", { class: "quote" }, `”${r.quote}”`) : null,
      ),
    );
  }
  if (!v.risks.length) list.append(el("li", { class: "muted" }, "Inga särskilda avtalsrisker identifierades."));
  panel.append(list);
  if (!v.unlocked && v.locked.risks) panel.append(lockedTeaser(`${v.locked.risks} risker till med beskrivning och källa.`));
}

function evidencePanel(panel, v) {
  if (!v.unlocked) return panel.append(lockedTeaser(`${v.locked.missingEvidence} intyg, certifikat, referenser och bilagor som behöver tas fram – med koppling till kraven.`));
  const items = v.synthesis?.missing_evidence ?? [];
  panel.append(el("ul", { class: "list-clean card" }, items.length ? items.map((m) => el("li", {}, el("strong", {}, m.item), el("div", { class: "small muted" }, m.why), m.requirement_ids.length ? el("div", { class: "src" }, `Krav: ${m.requirement_ids.join(", ")}`) : null)) : el("li", { class: "muted" }, "Inget särskilt underlag identifierat.")));
}

function questionsPanel(panel, v) {
  if (!v.unlocked) return panel.append(lockedTeaser(`${v.locked.questions} färdigformulerade frågor att ställa före sista frågedag.`));
  const items = v.synthesis?.questions ?? [];
  const amb = v.ambiguities ?? [];
  panel.append(el("ul", { class: "list-clean card" }, items.length ? items.map((q) => el("li", {}, el("strong", {}, q.question), el("div", { class: "small muted" }, q.reason), q.requirement_ids.length ? el("div", { class: "src" }, `Krav: ${q.requirement_ids.join(", ")}`) : null)) : el("li", { class: "muted" }, "Inga frågor föreslås.")));
  if (amb.length) {
    panel.append(el("h3", { style: { marginTop: "20px" } }, "Oklarheter i underlaget"), el("ul", { class: "list-clean card" }, amb.map((a) => el("li", {}, a.issue, el("div", { class: "src" }, sourceText(v.documents, a.document, a.page))))));
  }
}

function outlinePanel(panel, v) {
  if (!v.unlocked) return panel.append(lockedTeaser("En disposition för anbudet i den ordning myndigheten efterfrågar, med vad varje avsnitt ska innehålla."));
  const items = v.synthesis?.bid_outline ?? [];
  panel.append(el("ul", { class: "list-clean card" }, items.map((b) => el("li", {}, el("strong", {}, b.section), el("div", { class: "small" }, b.contents)))));
  const steps = v.synthesis?.next_steps ?? [];
  if (steps.length) panel.append(el("h3", { style: { marginTop: "20px" } }, "Nästa steg"), el("ol", { class: "card" }, steps.map((s) => el("li", { style: { margin: "6px 0" } }, s))));
}

function checklistPanel(panel, v) {
  if (!v.unlocked) return panel.append(lockedTeaser("En konkret checklista att gå igenom innan ni lämnar in anbudet."));
  const items = v.synthesis?.final_checklist ?? [];
  panel.append(el("div", { class: "card" }, items.map((c, i) => el("label", { class: "check", style: { margin: "8px 0" } }, el("input", { type: "checkbox", id: `c${i}` }), el("span", {}, c)))));
}

function documentsPanel(panel, v) {
  panel.append(
    el("ul", { class: "list-clean card" },
      v.documents.map((d) => el("li", {}, el("strong", {}, d.name), el("span", { class: "muted small" }, ` · ${d.pages} ${d.unit === "sida" ? "sidor" : "avsnitt"}`), d.warning ? el("div", { class: "alert alert-warn" }, d.warning) : null)),
    ),
    el("p", { class: "small muted" }, "Dokumenten raderades direkt efter analysen. Endast resultatet sparas."),
  );
}

// ---------- Personalisation ----------
const PROFILE_FIELDS = [
  ["companyName", "Företag", "text"],
  ["region", "Geografisk täckning", "text"],
  ["employees", "Antal anställda", "text"],
  ["turnover", "Årsomsättning senaste året", "text"],
  ["services", "Vad levererar ni?", "textarea"],
  ["certifications", "Certifieringar, försäkringar och avtal", "text"],
  ["references", "Liknande uppdrag/referenser", "textarea"],
  ["other", "Övrigt som påverkar beslutet", "text"],
];

function profilePanel(v) {
  const panel = el("section", { class: "card no-print", id: "profile-panel", style: { marginTop: "28px" } });
  if (v.personalizing) {
    panel.append(el("div", { class: "row" }, el("div", { class: "spinner" }), el("strong", {}, "Anpassar bedömningen efter er profil … (ca 1–2 minuter)")));
    return panel;
  }
  if (v.personalizeError) panel.append(el("div", { class: "alert alert-error" }, v.personalizeError));
  panel.append(
    el("h3", {}, v.hasProfile ? "Bedömningen är anpassad efter er profil" : "Få en personlig go/avstå för ert företag"),
    el("p", { class: "muted small" }, "Beskriv ert företag kort så bedömer vi varje skall-krav mot era förutsättningar och räknar om rekommendationen. Gratis att testa."),
  );
  if (!state.profileOpen) {
    panel.append(el("button", { class: "btn btn-dark", onclick: () => { state.profileOpen = true; render(); $("#profile-panel")?.scrollIntoView({ behavior: "smooth" }); } }, v.hasProfile ? "Uppdatera profilen" : "Fyll i företagsprofil"));
    return panel;
  }
  const status = el("div", { role: "status" });
  const form = el("form", { novalidate: true },
    el("div", { class: "grid grid-2" },
      PROFILE_FIELDS.map(([name, label, type]) => {
        const id = `pp-${name}`;
        return el("div", { class: "field" }, el("label", { for: id }, label), type === "textarea" ? el("textarea", { id, name }) : el("input", { id, name, type: "text" }));
      }),
    ),
    status,
    el("button", { class: "btn btn-primary", type: "submit" }, "Anpassa bedömningen"),
  );
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api(`/api/r/${encodeURIComponent(token)}/profile`, { method: "POST", body: Object.fromEntries(new FormData(form).entries()) });
      state.profileOpen = false;
      load();
    } catch (error) {
      status.className = "alert alert-error";
      status.textContent = error.message;
    }
  });
  panel.append(form);
  return panel;
}

void config;
load();
