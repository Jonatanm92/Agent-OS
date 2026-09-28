/* Aura — vardagen i skogen.
 *
 * The everyday systems, drawn in Aura's own world. Idag answers one
 * question — what matters right now — with Klara's lantern (one action),
 * five shortcuts and a calm list of today. Everything else is one step away:
 * Min dag, Töm huvudet, Aura Pulse, Lägg till, Prata med Aura, Låg energi,
 * Kaos, Kvällsavslut, Veckan and Livet (Maja's lists).
 *
 * Who holds what:
 *  - Klara (vardagscoach): Just nu, Min dag, Töm huvudet, Låg energi, Kaos.
 *  - Maja (mönster & minnen): Livet, Kvällsavslut, Veckan, observations.
 *  - Liv and Astrid keep their own worlds (Cykel, Mystik).
 *
 * Everything here is deterministic: the engine in core/ decides, a person
 * confirms, and every change can be undone. Nothing is sent anywhere.
 */

import { commitLife, engineView, ensureLife, moduleOn, pulseToday, undoLife } from "./life.js?v=2";
import { getTodayLog, setTodayLog } from "./storage.js?v=34";

const A = globalThis.Aura;
const U = A.util, I = A.i18n, M = A.model, It = A.items, E = A.engine, P = A.planner;

let env = null;

/** app.js hands over its helpers once (importing app.js here would be circular). */
export function configure(options) {
  env = options;
}

const ui = {
  override: null,        // "Något lättare": {rec, at}
  lifeTab: "inbox",
  sheet: null,           // {name, data}
  capture: null,         // {text, result}
  talk: [],              // Prata med Aura: [{query, answer}] — kept in memory only
  confirmDelete: null,
  lastMomentId: null,
  pulse: {},
  add: { kind: "", when: "" },
  onboarding: null,      // {step, data}
  highlightNow: false,
};

/* ---------------- helpers ---------------- */

const state = () => env.state();
const esc = (value) => env.escapeHTML(value);
const icon = (name, className = "") => env.icon(name, className);
const today = (now = new Date()) => U.dateKey(now);
const view = (now = new Date()) => engineView(state(), now);
const approx = (minutes) => `ca ${I.duration(minutes)}`;
const clock = (minutes) => U.toClock(minutes);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const KIND_LABELS = { task: "Uppgift", shopping: "Handla", admin: "Ärende", chore: "Hemmet", reminder: "Påminnelse", event: "Fast tid", note: "Anteckning", idea: "Idé" };
const SHOP_LABELS = { produce: "Frukt & grönt", dairy: "Mejeri", bread: "Bröd", meat: "Kött & fisk", pantry: "Skafferi", frozen: "Fryst", drinks: "Dryck", household: "Hushåll", hygiene: "Hygien", pharmacy: "Apotek", baby: "Barn", clothing: "Kläder", pets: "Husdjur", other: "Övrigt" };
const BUCKET_LABELS = { must: "Måste", good: "Bra om det hinns", later: "Kan vänta" };
const MODE_LABELS = { "": "Automatiskt", normal: "Vanlig dag", work: "Arbetsdag", free: "Ledig dag", low: "Låg energi", chaos: "Kaos", recovery: "Återhämtning" };
const WEEKDAYS = [[1, "Mån"], [2, "Tis"], [3, "Ons"], [4, "Tor"], [5, "Fre"], [6, "Lör"], [0, "Sön"]];
const MINUTE_CHOICES = [5, 10, 15, 20, 30, 45, 60, 90, 120];
const REPEATS = [["", "Upprepas inte"], ["day", "Varje dag"], ["weekdays", "Vardagar"], ["week", "Varje vecka"], ["2week", "Varannan vecka"], ["month", "Varje månad"]];

function repeatValue(recur) {
  if (!recur) return "";
  if (recur.unit === "day") return "day";
  if (recur.unit === "month") return "month";
  if (recur.unit === "week" && recur.every === 2) return "2week";
  if (recur.unit === "week" && (recur.weekdays || []).join() === "1,2,3,4,5") return "weekdays";
  return "week";
}

function recurFrom(value, weekday) {
  switch (value) {
    case "day": return { unit: "day", every: 1, weekdays: [] };
    case "weekdays": return { unit: "week", every: 1, weekdays: [1, 2, 3, 4, 5] };
    case "week": return { unit: "week", every: 1, weekdays: weekday != null ? [weekday] : [] };
    case "2week": return { unit: "week", every: 2, weekdays: [] };
    case "month": return { unit: "month", every: 1, weekdays: [] };
    default: return null;
  }
}

function relDay(key, now = new Date()) {
  return key ? I.relativeDay(key, today(now)) : "";
}

function metaFor(item, now = new Date(), { showKind = true } = {}) {
  const key = today(now);
  const parts = [];
  if (showKind && item.kind !== "task") parts.push(KIND_LABELS[item.kind] || "");
  if (item.time) parts.push(`kl ${item.time}`);
  if (item.dueDate && item.recur) parts.push(item.dueDate <= key ? "dags nu" : `dags ${relDay(item.dueDate, now)}`);
  else if (item.dueDate) parts.push(item.dueDate < key ? `var tänkt ${relDay(item.dueDate, now)}` : `senast ${relDay(item.dueDate, now)}`);
  else if (item.date && item.date > key) parts.push(relDay(item.date, now));
  if (item.recur && !item.dueDate) parts.push(It.describeRecur(item.recur));
  if (item.kind === "shopping" && item.category && item.category !== "other") parts.push(SHOP_LABELS[item.category] || "");
  if (["task", "chore", "admin"].includes(item.kind) && item.minutes) parts.push(I.duration(item.minutes));
  if (item.forPerson) parts.push(`till ${item.forPerson}`);
  return parts.filter(Boolean).join(" · ");
}

function companion(id) {
  return env.characters[id] || env.characters.klara;
}

function rememberDone(item, now = new Date()) {
  const moment = env.rememberMoment({
    id: `life:${item.id}:${today(now)}`,
    title: item.title,
    kind: "done",
    characterId: item.kind === "shopping" || item.kind === "admin" ? "maja" : "klara",
    route: "today",
  });
  ui.lastMomentId = moment?.id || null;
}

/** Commit ops, persist, re-render and offer "Ångra". */
function commit(ops, { message = "", quiet = false, keepSheet = false, now = new Date() } = {}) {
  const result = commitLife(state(), ops, { now });
  if (!result.applied.length) {
    if (result.skipped.length) env.toast("Det gick inte — saken finns inte längre");
    return result;
  }
  env.persist();
  if (keepSheet) refreshSheet();
  else closeSheet();
  env.render();
  if (!quiet) env.toast(message || result.applied[result.applied.length - 1], { undo: true });
  return result;
}

export function undo() {
  const s = state();
  if (!undoLife(s)) return false;
  if (ui.lastMomentId) {
    s.forest = { ...(s.forest || {}), moments: (s.forest?.moments || []).filter((moment) => moment.id !== ui.lastMomentId) };
    ui.lastMomentId = null;
  }
  ui.override = null;
  env.persist();
  refreshSheet();
  env.render();
  env.toast("Ångrat");
  return true;
}

function completeItem(id, now = new Date()) {
  const item = M.itemById(state().life, id);
  if (!item) return;
  const result = commit([{ op: "item.done", id }], { message: `Klart: ${item.title}`, now, keepSheet: ui.sheet?.name === "project" });
  if (result.applied.length) {
    rememberDone(item, now);
    env.persist();
  }
  ui.override = null;
}

/* ---------------- components ---------------- */

function head(eyebrow, title, trailing = "", id = "") {
  return `<header class="a-head"><div><p class="a-eyebrow">${esc(eyebrow)}</p><h2${id ? ` id="${id}"` : ""}>${esc(title)}</h2></div>${trailing}</header>`;
}

function link(label, attrs) {
  return `<button class="a-link" type="button" ${attrs}>${esc(label)} ${icon("nav-arrow-right")}</button>`;
}

function row(item, now = new Date(), { showKind = true, bucket = "", drag = false, trailing = "", note = "", stacked = false } = {}) {
  const meta = [note, metaFor(item, now, { showKind })].filter(Boolean).join(" · ");
  return `<li class="a-row${stacked ? " is-stacked" : ""}" data-id="${esc(item.id)}" data-kind="${esc(item.kind)}"${bucket ? ` data-bucket="${bucket}"` : ""}>
    <button class="a-check" type="button" data-action="life-done" data-id="${esc(item.id)}" aria-label="Klart: ${esc(item.title)}"><span aria-hidden="true">${icon("check")}</span></button>
    <button class="a-row-main" type="button" data-action="life-open-item" data-id="${esc(item.id)}"><strong>${esc(item.title)}</strong>${meta ? `<small>${esc(meta)}</small>` : ""}</button>
    ${trailing}${drag ? `<button class="a-drag" type="button" data-drag-id="${esc(item.id)}" aria-label="Dra för att flytta ${esc(item.title)}">${icon("list")}</button>` : ""}
  </li>`;
}

function list(items, now, opts = {}) {
  return `<ul class="a-list"${opts.bucket ? ` data-bucket="${opts.bucket}"` : ""}>${items.map((item) => row(item, now, opts)).join("")}</ul>`;
}

function empty(text, { character = "", action = "" } = {}) {
  const art = character ? `<img src="${companion(character).asset}" alt="" aria-hidden="true" />` : "";
  return `<div class="a-empty${art ? " has-art" : ""}">${art}<div><p>${esc(text)}</p>${action}</div></div>`;
}

function notice(text, actions) {
  return `<div class="a-notice"><p>${esc(text)}</p><div class="a-notice-actions">${actions}</div></div>`;
}

function quiet(label, attrs) {
  return `<button class="a-quiet" type="button" ${attrs}>${esc(label)}</button>`;
}

/** A compact world header for the everyday pages (the full hero belongs to Idag). */
function worldHeader({ character = "klara", eyebrow, title, body = "", action = "" }) {
  return `<header class="world-header" data-character="${character}">
    <div class="world-header-copy"><p class="a-eyebrow">${esc(eyebrow)}</p><h1>${title}</h1>${body ? `<p>${esc(body)}</p>` : ""}${action ? `<div class="world-header-actions">${action}</div>` : ""}</div>
    <img class="world-header-art" src="${companion(character).asset}" alt="" aria-hidden="true" />
  </header>`;
}

function worldPage(pageClass, worldPath, content) {
  return `<div class="page ${pageClass} world-page everyday-page" style="--world-path:url('${worldPath}')">${content}</div>`;
}

function scale(field, labels, value) {
  return `<div class="a-scale" role="group" aria-label="${esc(labels.title)}">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-action="life-pulse-pick" data-field="${field}" data-value="${n}" aria-pressed="${value === n}" aria-label="${esc(labels.title)} ${n} av 5"><strong>${n}</strong><small>${n === 1 ? esc(labels.low) : n === 5 ? esc(labels.high) : ""}</small></button>`).join("")}</div>`;
}

function chips(name, options, selected, type = "radio") {
  const isOn = (value) => (Array.isArray(selected) ? selected.includes(value) : selected === value);
  return `<div class="chip-row">${options.map(([value, label]) => `<label class="chip"><input type="${type}" name="${name}" value="${esc(value)}"${isOn(value) ? " checked" : ""} /><span>${esc(label)}</span></label>`).join("")}</div>`;
}

/* ---------------- Idag: Klara's lantern ---------------- */

function currentRec(card, life) {
  let rec = card.rec;
  const override = ui.override;
  if (override && Date.now() - override.at < 30 * 60000) {
    const still = M.itemById(life, override.rec.item.id);
    if (still && still.status === "open") rec = override.rec;
    else ui.override = null;
  }
  return rec;
}

function lantern(kind, { label = "Just nu", title, why = "", meta = [], primary = "", secondary = "", calm = false }) {
  const highlight = ui.highlightNow;
  ui.highlightNow = false;
  return `<section class="now-lantern${highlight ? " is-highlighted" : ""}" id="now-panel" data-kind="${kind}" data-calm="${calm}" aria-labelledby="now-title" aria-live="polite">
    <p class="now-label"><span class="now-glow" aria-hidden="true"></span>${esc(label)}</p>
    <h2 id="now-title">${esc(title)}</h2>
    ${why ? `<p class="now-why">${esc(why)}</p>` : ""}
    ${meta.length ? `<p class="now-meta">${meta.map((m) => `<span>${m}</span>`).join("")}</p>` : ""}
    ${primary ? `<div class="now-primary">${primary}</div>` : ""}
    ${secondary ? `<div class="now-secondary">${secondary}</div>` : ""}
  </section>`;
}

const lightButton = (label, attrs, arrow = true) => `<button class="button now-go" type="button" ${attrs}>${esc(label)}${arrow ? ` ${icon("nav-arrow-right", "button-icon")}` : ""}</button>`;
const dim = (label, attrs) => `<button class="now-dim" type="button" ${attrs}>${esc(label)}</button>`;

export function renderNowCard(now = new Date()) {
  const life = view(now);
  if (!life) return "";
  const card = E.nowCard(life, now);
  const anything = life.items.some((item) => item.status === "open" || item.status === "inbox") || life.events.length;
  switch (card.type) {
    case "focus": {
      const since = clock(U.minutesOfDay(new Date(card.startedAt)));
      return lantern("focus", {
        label: "Du gör nu",
        title: card.item.title,
        why: `Sedan ${since}. Resten väntar tills du är klar.`,
        meta: [`${icon("clock")} ${esc(approx(card.minutes))}`],
        primary: lightButton("Klart", `data-action="life-done" data-id="${esc(card.item.id)}"`, false),
        secondary: dim("Pausa", `data-action="life-pause"`),
      });
    }
    case "event":
      return lantern("event", { label: "Nu pågår", title: card.event.title, why: `Till ${clock(card.until)}. Inget annat behöver göras under tiden.`, calm: true });
    case "soon":
      return lantern("soon", { label: "Snart", title: `${card.event.title} om ${I.duration(card.startsIn)}`, why: "Ingen idé att börja på något nytt precis innan.", calm: true });
    case "leave": {
      const also = card.also;
      return lantern("leave", {
        label: "Snart iväg",
        title: card.leaveIn <= 5 ? "Dags att gå nu" : `Gå om ${I.duration(card.leaveIn)}`,
        why: `${card.event.title} börjar ${clock(card.event.start)}. Restiden är inräknad.${also ? ` Hinner du: ${also.title} (${approx(also.minutes)}).` : ""}`,
        primary: also ? lightButton("Gör det först", `data-action="life-do" data-id="${esc(also.item.id)}"`) : "",
      });
    }
    case "quiet":
      return lantern("quiet", { label: "Tyst en stund", title: "Aura håller tyst ett tag", why: "Allt finns kvar i Min dag. Nästa sak är här när du vill.", calm: true, secondary: dim("Visa nästa sak", `data-action="life-ask-next"`) });
    case "windDown":
      return lantern("windDown", {
        label: "Kvällsljus",
        title: "Dags att varva ner",
        why: "Det som inte hanns i dag får en plats i morgon eller senare.",
        calm: true,
        primary: lightButton("Kvällsavslut", `data-route="evening"`),
        secondary: card.routine ? dim(`${card.routine.routine.name} · ${plural(card.routine.remaining, "steg", "steg")}`, `data-action="life-routine-open" data-id="${esc(card.routine.routine.id)}"`) : "",
      });
    case "routine": {
      const v = card.routine;
      return lantern("routine", {
        label: "Rutin just nu",
        title: v.routine.name,
        why: v.variant === "short" ? `Kort version i dag — ${plural(v.remaining, "steg", "steg")} kvar.` : `${plural(v.remaining, "steg", "steg")} kvar.`,
        meta: [`${icon("clock")} ${esc(approx(v.minutesLeft))}`],
        primary: lightButton("Starta", `data-action="life-routine-open" data-id="${esc(v.routine.id)}"`),
        secondary: dim("Inte nu", `data-action="life-notnow"`),
      });
    }
    case "task": {
      const rec = currentRec(card, life);
      const id = esc(rec.item.id);
      const bucket = rec.tiny ? "En liten början" : rec.bucket === "must" ? "Måste i dag" : rec.bucket === "good" ? "Bra om det hinns" : "Kan vänta";
      return lantern("task", {
        title: rec.title,
        why: I.msg(rec.reason),
        meta: [`${icon("clock")} ${esc(approx(rec.minutes))}`, esc(bucket)],
        primary: lightButton("Gör det", `data-action="life-do" data-id="${id}"`),
        secondary: `${dim("Något lättare", `data-action="life-easier" data-id="${id}"`)}${dim("Något annat", `data-action="life-else" data-id="${id}"`)}${dim("Inte nu", `data-action="life-notnow" data-id="${id}"`)}`,
      });
    }
    case "rest":
      return lantern("rest", { title: "Vila är det viktigaste nu", why: "Inget måste är kvar i dag. Allt annat har en plats senare.", calm: true });
    default: {
      if (!anything) {
        return lantern("empty", { title: "Inget i planen än", why: "Skriv av dig det som snurrar — Aura sorterar det till i dag, senare eller rätt lista.", calm: true, primary: lightButton("Töm huvudet", `data-action="life-capture"`) });
      }
      const plan = card.plan;
      let why;
      if (plan.next && plan.minutesUntilNext != null) why = plan.next.away ? `Du har ${I.duration(plan.minutesUntilNext)} innan du behöver gå.` : `Du har ${I.duration(plan.minutesUntilNext)} fritt innan ${plan.next.title}.`;
      else why = plan.nowMin >= 17 * 60 ? "Kvällen är din." : "Resten av dagen är fri.";
      return lantern("free", { title: "Inget brådskar", why, calm: true });
    }
  }
}

/* ---------------- Idag: shortcuts ---------------- */

export function renderShortcuts() {
  const items = [
    { action: "life-talk", icon: "heart", label: "Prata med Aura" },
    { action: "life-capture", icon: "journal-page", label: "Töm huvudet" },
    { action: "life-add", icon: "plus", label: "Lägg till" },
    { action: "life-pulse", icon: "sparks", label: "Checka in" },
    { action: "life-whatnow", icon: "check-circle", label: "Vad nu?" },
  ];
  return `<nav class="shortcuts" aria-label="Snabbval">${items.map((item) => `<button type="button" data-action="${item.action}"><span class="shortcut-orb">${icon(item.icon)}</span><span class="shortcut-label">${item.label}</span></button>`).join("")}</nav>`;
}

/* ---------------- Idag: today ---------------- */

function renderSuggestion(life, now) {
  const notes = A.notify ? A.notify.candidates(life, now) : [];
  if (notes.length) {
    const note = notes[0];
    return notice(I.msg(note.text), note.actions.map((action, index) => quiet(I.msg(action.label), `data-action="life-notify" data-key="${esc(note.key)}" data-index="${index}"`)).join(""));
  }
  const s = E.suggestion(life, now);
  if (!s) return "";
  const no = quiet("Nej tack", `data-action="life-suggest-dismiss" data-key="${esc(s.key)}"`);
  switch (s.kind) {
    case "mode":
      return s.mode === "chaos"
        ? notice("Mycket på en gång? Vi kan ta en sak i taget och gömma resten en stund.", `${quiet("En sak i taget", `data-route="chaos"`)}${no}`)
        : notice("Lite ork i dag? Aura kan göra dagen mindre och säga exakt vad som flyttas.", `${quiet("Gör dagen mindre", `data-route="low"`)}${no}`);
    case "evening":
      return notice("Två minuter för kvällsavslut? Du bestämmer vad som händer med det som inte hanns.", `${quiet("Kvällsavslut", `data-route="evening"`)}${no}`);
    case "review":
      return notice("Veckan är slut. Vill du titta tillbaka en liten stund med Maja?", `${quiet("Veckan", `data-route="week"`)}${no}`);
    case "inbox":
      return notice(`${plural(s.n, "sak", "saker")} ligger i inkorgen. De väntar tills du vill.`, `${quiet("Titta", `data-action="life-tab" data-tab="inbox" data-go="life"`)}${no}`);
    case "pattern": {
      const obs = s.observation;
      return notice(`Maja märkte: ${I.msg(obs.text)}`, `${(obs.actions || []).map((action, index) => quiet(I.msg(action.label), `data-action="life-pattern" data-key="${esc(obs.key)}" data-index="${index}"`)).join("")}${quiet("Det stämmer inte", `data-action="life-pattern-dismiss" data-key="${esc(obs.key)}"`)}`);
    }
    default:
      return "";
  }
}

function group(bucket, items, now, { limit = 0, drag = false } = {}) {
  if (!items.length) return "";
  const shown = limit ? items.slice(0, limit) : items;
  const more = items.length - shown.length;
  return `<div class="a-group" data-bucket="${bucket}"><p class="a-group-label"><span>${BUCKET_LABELS[bucket]}</span><em>${items.length}</em></p>${list(shown, now, { bucket, drag })}${more > 0 ? `<button class="a-more" type="button" data-route="day">${plural(more, "sak till", "saker till")} ${icon("nav-arrow-right")}</button>` : ""}</div>`;
}

function laterGroup(items, now) {
  if (!items.length) return "";
  return `<details class="a-group a-later" data-bucket="later"><summary class="a-group-label"><span>Kan vänta</span><em>${items.length}</em>${icon("nav-arrow-down")}</summary>${list(items.slice(0, 12), now, { bucket: "later" })}</details>`;
}

function quickAdd(placeholder = "Lägg till… ”ring banken i morgon 10”") {
  return `<form class="a-quickadd" id="life-quick-form" autocomplete="off"><label class="sr-only" for="life-quick-input">Lägg till</label><input id="life-quick-input" name="text" maxlength="200" placeholder="${esc(placeholder)}" /><button type="submit" aria-label="Lägg till">${icon("plus")}</button></form>`;
}

function loadLine(plan) {
  const planned = plan.mustMinutes + plan.goodMinutes;
  if (!plan.buckets.must.length && !plan.buckets.good.length) return "Inget inplanerat — dagen har luft.";
  if (planned > plan.budget) return `Mer än dagen rymmer: ${I.duration(planned)} planerat, ungefär ${I.duration(plan.budget)} ryms.`;
  if (planned > plan.budget * 0.8) return "Dagen är ganska full, men det går ihop.";
  return `Det finns luft — ungefär ${I.duration(Math.max(0, plan.budget - planned))} att röra sig med.`;
}

function pulseStrip(now) {
  const pulse = pulseToday(state(), now);
  const parts = [];
  if (pulse?.energy) parts.push(`Ork ${pulse.energy}/5`);
  if (pulse?.stress) parts.push(`Stress ${pulse.stress}/5`);
  if (pulse?.mood) parts.push(`Humör ${pulse.mood}/5`);
  return `<button class="a-pulse-strip" type="button" data-action="life-pulse">${icon("sparks")}<span>${parts.length ? esc(parts.join(" · ")) : "Hur är läget? Checka in på tio sekunder"}</span>${icon("nav-arrow-right")}</button>`;
}

export function renderToday(now = new Date()) {
  const life = view(now);
  if (!life) return "";
  const plan = P.planDay(life, now);
  const b = plan.buckets;
  const key = plan.dateKey;
  const next = P.fixedFor(life, key).fixed.filter((f) => f.end > plan.nowMin && f.kind !== "work")[0];
  const done = It.dayBuckets(life, key).done.length;
  const emptyDay = !b.must.length && !b.good.length && !b.later.length;
  return `<section class="a-panel today-panel" aria-labelledby="today-title">
    ${head(`Idag${done ? ` · ${done} klart` : ""}`, "Det här ryms i dag", link("Min dag", `data-route="day"`), "today-title")}
    <p class="a-lede">${esc(loadLine(plan))}</p>
    ${pulseStrip(now)}
    ${next ? `<p class="a-next">${icon("calendar")}<span><strong>${esc(next.title)}</strong> ${clock(next.start)}${next.away ? " · restid inräknad" : ""}</span></p>` : ""}
    ${renderSuggestion(life, now)}
    ${emptyDay ? empty("Inget för i dag ännu. Skriv en sak nedanför, eller töm huvudet så sorterar Aura.", { character: "klara" }) : `${group("must", b.must, now, { limit: 4 })}${group("good", b.good, now, { limit: 4 })}${laterGroup(b.later, now)}`}
    ${quickAdd()}
  </section>`;
}

/* ---------------- Min dag ---------------- */

function modeStrip(life, key) {
  const current = M.getDay(life, key).mode || "";
  return `<div class="a-seg" role="group" aria-label="Dagens läge">${["", "work", "free", "low", "chaos", "recovery"].map((mode) => `<button type="button" data-action="life-mode" data-mode="${mode}" aria-pressed="${current === mode}">${esc(MODE_LABELS[mode])}</button>`).join("")}</div>`;
}

function eventRows(life, key) {
  const events = P.eventsOn(life, key);
  if (!events.length) return empty("Inga fasta tider i dag.");
  return `<ul class="a-list">${events.map((event) => `<li class="a-row" data-kind="event"><span class="a-time">${esc(event.start || "hela dagen")}</span><button class="a-row-main" type="button" data-action="life-event-open" data-id="${esc(event.id)}"><strong>${esc(event.title)}</strong><small>${esc([event.end ? `till ${event.end}` : "", event.recur ? "varje vecka" : "", event.away ? "utanför hemmet" : ""].filter(Boolean).join(" · "))}</small></button></li>`).join("")}</ul>`;
}

export function renderDayPage(now = new Date()) {
  const life = view(now);
  if (!life) return "";
  const plan = P.planDay(life, now);
  const key = plan.dateKey;
  const b = It.dayBuckets(life, key);
  const routines = A.routines && moduleOn(state(), "routines") ? A.routines.todays(life, now) : [];
  const date = new Intl.DateTimeFormat("sv-SE", { weekday: "long", day: "numeric", month: "long" }).format(now);
  const tight = plan.mustMinutes + plan.goodMinutes > plan.budget;
  return worldPage("day-page klara-page", env.worlds.today, `
    ${worldHeader({
      character: "klara",
      eyebrow: `Min dag · ${date}`,
      title: "Din dag, <em>i lagom storlek.</em>",
      body: tight ? "Mer än dagen rymmer. Låt Aura välja vad som får vänta." : loadLine(plan),
      action: `<button class="button button-primary" type="button" data-action="life-rebuild">Bygg om min dag ${icon("refresh-double", "button-icon")}</button>`,
    })}
    <section class="a-panel" aria-labelledby="plan-title">
      ${head("Planen", "Måste, bra om det hinns, kan vänta", "", "plan-title")}
      ${quickAdd("Lägg till… Aura förstår dag och tid")}
      ${b.must.length || b.good.length || b.later.length
        ? `${group("must", b.must, now, { drag: true })}${group("good", b.good, now, { drag: true })}${laterGroup(b.later, now)}`
        : empty("Inget här ännu. Skriv en sak ovanför — nämner du dag eller tid förstår Aura det.", { character: "klara" })}
      ${b.waiting.length ? `<div class="a-group"><p class="a-group-label"><span>Väntar på svar</span><em>${b.waiting.length}</em></p>${list(b.waiting, now)}</div>` : ""}
      ${b.must.length + b.good.length > 1 ? `<p class="a-hint">Dra i ${icon("list")} för att ändra ordning. Tryck på en sak för dag, längd eller upprepning.</p>` : ""}
    </section>
    <section class="a-panel" aria-labelledby="fixed-title">
      ${head("Fasta tider", "Det som redan har en tid", `<button class="a-link" type="button" data-action="life-event-new">${icon("plus")} Lägg till</button>`, "fixed-title")}
      ${eventRows(life, key)}
    </section>
    <section class="a-panel" aria-labelledby="mode-title">
      ${head("Dagens läge", "Hur ser dagen ut?", "", "mode-title")}
      <p class="a-lede">Aura följer din vecka av sig själv. Välj bara när dagen är annorlunda.</p>
      ${modeStrip(life, key)}
    </section>
    ${routines.length ? `<section class="a-panel" aria-labelledby="routines-title">${head("Rutiner i dag", "Små spår att följa", "", "routines-title")}<ul class="a-list">${routines.map((v) => `<li class="a-row" data-kind="routine"><span class="a-time">${v.done}/${v.total}</span><button class="a-row-main" type="button" data-action="life-routine-open" data-id="${esc(v.routine.id)}"><strong>${esc(v.routine.name)}</strong><small>${esc(v.complete ? "Klar för i dag" : `${plural(v.remaining, "steg", "steg")} kvar · ${approx(v.minutesLeft)}${v.variant === "short" ? " · kort version" : ""}`)}</small></button></li>`).join("")}</ul></section>` : ""}
    ${b.done.length ? `<details class="a-panel a-done"><summary class="a-head"><div><p class="a-eyebrow">Klart i dag · ${b.done.length}</p><h2>Skogen minns det</h2></div>${icon("nav-arrow-down")}</summary><ul class="a-list">${b.done.map((item) => `<li class="a-row is-done"><span class="a-check is-done" aria-hidden="true"><span>${icon("check")}</span></span><span class="a-row-main"><strong>${esc(item.title)}</strong></span><button class="a-link" type="button" data-action="life-reopen" data-id="${esc(item.id)}">Ångra</button></li>`).join("")}</ul></details>` : ""}
  `);
}

/* ---------------- Låg energi ---------------- */

export function renderLowPage(now = new Date()) {
  const life = view(now);
  if (!life) return "";
  const mode = M.getDay(life, today(now)).mode;
  const lowOn = mode === "low" || mode === "recovery";
  const plan = E.lowEnergyPlan(life, now);
  return worldPage("low-page klara-page", env.worlds.coach, `
    ${worldHeader({
      character: "klara",
      eyebrow: "Låg energi",
      title: lowOn ? "Dagen är <em>mindre nu.</em>" : "Vi gör dagen <em>mindre.</em>",
      body: lowOn ? "Bara det nödvändiga syns. Allt annat har en ny plats — inget är borta." : "Det som måste hända, en liten vinst, och exakt vart resten flyttar. Inget ändras förrän du säger till.",
      action: lowOn ? `<button class="button button-frost" type="button" data-action="life-mode" data-mode="">Tillbaka till vanlig dag</button>` : "",
    })}
    <section class="a-panel" aria-labelledby="low-must-title">
      ${head("Det här behöver ändå hända", "Bara det nödvändiga", "", "low-must-title")}
      ${plan.must.length ? list(plan.must, now) : empty("Inget som verkligen måste hända i dag.")}
      ${plan.tiny ? `<div class="a-feature"><p class="a-eyebrow">En liten vinst</p><h3>${esc(plan.tinyText || plan.tiny.title)}</h3><p>${esc(approx(Math.min(10, plan.tiny.minutes || 10)))} — räcker gott.</p><button class="button button-secondary" type="button" data-action="life-do" data-id="${esc(plan.tiny.id)}">Gör den</button></div>` : ""}
    </section>
    ${lowOn ? "" : `<section class="a-panel" aria-labelledby="low-move-title">
      ${head("Det här flyttar vi", "Till lugnare dagar", "", "low-move-title")}
      ${plan.moved.length ? `<ul class="a-moves">${plan.moved.map((m) => `<li><span>${esc(m.title)}</span><em>${esc(relDay(m.to, now))}</em></li>`).join("")}</ul>` : empty("Inget behöver flyttas.")}
      <div class="a-actions"><button class="button button-primary" type="button" data-action="life-low-apply">Gör dagen mindre</button><button class="button button-ghost" type="button" data-route="today">Inte nu</button></div>
    </section>`}
    <section class="a-panel a-bridge">${env.characterDialogue("klara", "Om kroppen säger stopp kan du checka in med mig om vila, mat eller lugn. Då anpassar jag rådet efter orken.", "Klara · när orken är låg")}<button class="button button-secondary" type="button" data-action="start-coach-need" data-need="rest">Checka in om vila ${icon("nav-arrow-right", "button-icon")}</button></section>
  `);
}

/* ---------------- Kaos ---------------- */

export function renderChaosPage(now = new Date()) {
  const life = view(now);
  if (!life) return "";
  const chaos = E.chaosState(life, now);
  if (chaos && chaos.current) {
    const item = chaos.current;
    const progress = chaos.total ? Math.round((chaos.doneCount / chaos.total) * 100) : 0;
    return worldPage("chaos-page klara-page", env.worlds.coach, `
      ${worldHeader({ character: "klara", eyebrow: "Kaos · en sak i taget", title: "Bara <em>den här.</em>", body: "Resten syns inte just nu. När den här är klar kommer nästa." })}
      <section class="now-lantern chaos-card" id="chaos-card" aria-labelledby="chaos-title" aria-live="polite">
        <p class="now-label"><span class="now-glow" aria-hidden="true"></span>${chaos.doneCount} av ${chaos.total} klara</p>
        <div class="chaos-progress" aria-hidden="true"><span style="width:${progress}%"></span></div>
        <h2 id="chaos-title">${esc(item.title)}</h2>
        <p class="now-why">${esc(approx(E.effort(item)))}${chaos.rest.length ? ` · ${plural(chaos.rest.length, "sak väntar", "saker väntar")}, osynliga` : " · sista saken"}</p>
        <div class="now-primary">${lightButton("Klart — nästa", `data-action="life-chaos-done" data-id="${esc(item.id)}"`)}</div>
        <div class="now-secondary">${dim("Hoppa över", `data-action="life-chaos-skip" data-id="${esc(item.id)}"`)}${dim("Avsluta kaosläget", `data-action="life-chaos-stop"`)}</div>
      </section>`);
  }
  if (chaos && !chaos.current) {
    return worldPage("chaos-page klara-page", env.worlds.coach, `
      ${worldHeader({ character: "klara", eyebrow: "Kaos · klart", title: "Du tog dig <em>igenom det.</em>", body: `${plural(chaos.total, "sak", "saker")}, en i taget. Stanna upp en stund innan du bestämmer nästa.`, action: `<button class="button button-primary" type="button" data-action="life-chaos-stop">Tillbaka till dagen</button>` })}`);
  }
  const b = It.dayBuckets(life, today(now));
  const existing = b.must.length + b.good.length;
  return worldPage("chaos-page klara-page", env.worlds.coach, `
    ${worldHeader({ character: "klara", eyebrow: "Kaos", title: "Allt på en gång? <em>Vi tar en sak.</em>", body: "Skriv allt som snurrar, i vilken ordning som helst. Aura sorterar och visar bara en sak i taget." })}
    <section class="a-panel" aria-labelledby="chaos-dump-title">
      ${head("Töm huvudet", "Skriv allt som snurrar", "", "chaos-dump-title")}
      <form id="life-chaos-form" class="a-form"><label class="sr-only" for="chaos-text">Allt på en gång</label><textarea id="chaos-text" name="text" maxlength="4000" rows="5" placeholder="t.ex. mejla skolan, tvättid, handla mjölk, ring om fakturan, städa hallen…"></textarea>
      <div class="a-actions"><button class="button button-primary" type="submit">Hjälp mig ta en sak i taget</button>${existing ? `<button class="button button-secondary" type="button" data-action="life-chaos-start">Använd dagens ${existing}</button>` : ""}</div>
      <p class="a-fine">Sorteras med Auras egna regler i telefonen. Inget skickas någonstans.</p></form>
    </section>`);
}

/* ---------------- Kvällsavslut ---------------- */

export function renderEveningPage(now = new Date()) {
  const life = view(now);
  if (!life) return "";
  const r = A.evening.eveningReset(life, now);
  const moments = (state().forest?.moments || []).filter((moment) => moment.date === r.date);
  const doneTitles = [...new Set([...r.done.map((item) => item.title), ...moments.map((moment) => moment.title)])];
  const decisions = r.unfinished.map(({ item }) => `<li class="a-decision"><div><strong>${esc(item.title)}</strong>${metaFor(item, now) ? `<small>${esc(metaFor(item, now))}</small>` : ""}</div><div class="a-choice" role="group" aria-label="Vad händer med ${esc(item.title)}?">${item.recur
    ? `<button type="button" data-action="life-evening-skip" data-id="${esc(item.id)}">Hoppa över</button>`
    : `<button type="button" data-action="life-evening-move" data-id="${esc(item.id)}" data-to="tomorrow">I morgon</button><button type="button" data-action="life-evening-move" data-id="${esc(item.id)}" data-to="later">Senare</button><button type="button" data-action="life-evening-drop" data-id="${esc(item.id)}">Släpp</button>`}</div></li>`).join("");
  const tomorrow = r.tomorrow;
  return worldPage("evening-page maja-page", env.worlds.ritual, `
    ${worldHeader({
      character: "maja",
      eyebrow: "Kvällsavslut",
      title: r.finished ? "Kvällen är <em>stängd.</em>" : "Två minuter, <em>sedan vila.</em>",
      body: doneTitles.length ? "Jag har skrivit upp det du gjorde i dag. Det räknas, även det lilla." : "Ibland handlar en dag om att ta sig igenom den. Det räcker.",
    })}
    <section class="a-panel" aria-labelledby="ev-done-title">
      ${head("Det här blev gjort", doneTitles.length ? plural(doneTitles.length, "spår i skogen", "spår i skogen") : "En dag att ta sig igenom", "", "ev-done-title")}
      ${doneTitles.length ? `<ul class="a-trail">${doneTitles.slice(0, 12).map((title) => `<li>${icon("check-circle")}<span>${esc(title)}</span></li>`).join("")}</ul>` : empty("Inget avbockat — och det är okej.")}
    </section>
    <section class="a-panel" aria-labelledby="ev-left-title">
      ${head("Det som inte hanns", "Ett beslut per sak", r.unfinished.length ? `<button class="a-link" type="button" data-action="life-evening-moveall">Flytta allt klokt</button>` : "", "ev-left-title")}
      ${r.unfinished.length ? `<p class="a-lede">I morgon, senare eller släpp. Ingen skuld.</p><ul class="a-decisions">${decisions}</ul>` : empty("Inget blev liggande.")}
    </section>
    <section class="a-panel" aria-labelledby="ev-head-title">
      ${head("Töm huvudet", "Något som snurrar inför natten?", "", "ev-head-title")}
      <form id="life-evening-form" class="a-form"><label class="sr-only" for="ev-text">Det hamnar i inkorgen till i morgon</label><textarea id="ev-text" name="text" maxlength="2000" rows="3" placeholder="Det ligger i inkorgen i morgon — t.ex. köpa present, svara Lisa"></textarea><div class="a-actions"><button class="button button-secondary" type="submit">Lägg i inkorgen</button></div></form>
    </section>
    <section class="a-panel" aria-labelledby="ev-tomorrow-title">
      ${head("I morgon", tomorrow.first ? `Först: ${tomorrow.first.title} ${tomorrow.first.at}` : "Inga fasta tider i morgon", "", "ev-tomorrow-title")}
      ${tomorrow.must.length ? list(tomorrow.must, now) : empty("Inga måsten väntar i morgon.")}
      <form id="life-intention-form" class="a-quickadd"><label class="sr-only" for="life-intention">En sak som gör morgondagen lättare</label><input id="life-intention" name="text" maxlength="200" value="${esc(r.intention)}" placeholder="En sak som gör morgondagen lättare…" /><button type="submit" aria-label="Spara">${icon("check")}</button></form>
    </section>
    <section class="a-panel a-finish">${r.finished ? env.characterDialogue("maja", "Kvällen är stängd. Allt har en plats — du behöver inte bära det i natt.", "Maja") : `<button class="button button-primary button-wide" type="button" data-action="life-evening-finish">Klart för i kväll ${icon("half-moon", "button-icon")}</button>`}</section>
  `);
}

/* ---------------- Veckan ---------------- */

export function renderWeekPage(now = new Date()) {
  const life = view(now);
  if (!life) return "";
  const r = A.review.weeklyReview(life, now);
  const upcoming = It.upcoming(life, today(now), 7).slice(0, 8);
  const observations = r.observations.filter((obs) => !life.meta.dismissedPatterns.includes(obs.key)).slice(0, 3);
  const days = Array.from({ length: 7 }, (_, i) => U.addDays(r.week, i));
  const max = Math.max(1, ...days.map((d) => r.doneByDay[d] || 0));
  return worldPage("week-page maja-page", env.worlds.insights, `
    ${worldHeader({
      character: "maja",
      eyebrow: `Veckan · ${I.shortDate(r.week)}–${I.shortDate(r.end)}`,
      title: "Titta tillbaka, <em>lätt.</em>",
      body: r.doneCount ? `${plural(r.doneCount, "sak", "saker")} blev gjorda. Jag sparar dem — du behöver inte.` : "En lugn vecka i listorna. Livet händer också utanför dem.",
    })}
    <section class="a-panel" aria-labelledby="wk-done-title">
      ${head("Det som blev av", plural(r.doneCount, "klar sak", "klara saker"), "", "wk-done-title")}
      ${r.doneCount ? `<div class="a-week" role="img" aria-label="Klara saker per dag">${days.map((d) => `<div><span style="height:${Math.max(4, Math.round(((r.doneByDay[d] || 0) / max) * 100))}%"></span><small>${esc(I.weekdayShort(U.weekday(d)))}</small><em>${r.doneByDay[d] || ""}</em></div>`).join("")}</div>` : empty("Inget avbockat den här veckan än. Det som blir gjort sparas här — du behöver inte komma ihåg det.", { character: "maja" })}
      ${r.done.length ? `<ul class="a-trail">${r.done.slice(0, 8).map((item) => `<li>${icon("check-circle")}<span>${esc(item.title)}</span></li>`).join("")}</ul>` : ""}
    </section>
    ${r.postponed.length ? `<section class="a-panel" aria-labelledby="wk-moved-title">${head("Flyttade sig ofta", "Kanske för stora, eller fel dag?", "", "wk-moved-title")}<ul class="a-decisions">${r.postponed.map((p) => `<li class="a-decision"><div><strong>${esc(p.item.title)}</strong><small>flyttad ${p.count} gånger</small></div><div class="a-choice"><button type="button" data-action="life-item-split" data-id="${esc(p.item.id)}">Gör mindre</button><button type="button" data-action="life-open-item" data-id="${esc(p.item.id)}">Ny dag</button><button type="button" data-action="life-item-drop" data-id="${esc(p.item.id)}">Släpp</button></div></li>`).join("")}</ul></section>` : ""}
    ${observations.length ? `<section class="a-panel" aria-labelledby="wk-obs-title">${head("Maja märkte", "Observationer, inte sanningar", "", "wk-obs-title")}${observations.map((obs) => notice(I.msg(obs.text), `${(obs.actions || []).map((action, index) => quiet(I.msg(action.label), `data-action="life-pattern" data-key="${esc(obs.key)}" data-index="${index}"`)).join("")}${quiet("Det stämmer inte", `data-action="life-pattern-dismiss" data-key="${esc(obs.key)}"`)}`)).join("")}</section>` : ""}
    ${r.routines.length ? `<section class="a-panel" aria-labelledby="wk-rt-title">${head("Rutiner", "Det som satt", "", "wk-rt-title")}<ul class="a-list">${r.routines.map((x) => `<li class="a-row"><span class="a-time">${x.completed}/${x.applicable}</span><span class="a-row-main"><strong>${esc(x.routine.name)}</strong><small>${esc(x.rate >= 0.7 ? "Sitter bra" : x.rate >= 0.4 ? "Ibland" : "Kanske för stor just nu — prova kort version")}</small></span></li>`).join("")}</ul></section>` : ""}
    <section class="a-panel" aria-labelledby="wk-next-title">
      ${head("Kommande sju dagar", "Det som väntar", "", "wk-next-title")}
      ${upcoming.length ? list(upcoming, now) : empty("Inga datum eller deadlines den närmaste veckan.")}
      <div class="a-actions">${r.reviewed ? `<p class="a-fine">Veckan är genomgången.</p>` : `<button class="button button-primary" type="button" data-action="life-review-done" data-week="${esc(r.week)}">Klar med veckan</button>`}</div>
    </section>
  `);
}

/* ---------------- Livet (Maja) ---------------- */

const LIFE_TABS = [
  { id: "inbox", label: "Inkorg", icon: "inbox" },
  { id: "shopping", label: "Handla", icon: "cart", module: "shopping" },
  { id: "admin", label: "Ärenden", icon: "journal-page", module: "admin" },
  { id: "home", label: "Hemmet", icon: "home", module: "home" },
  { id: "projects", label: "Projekt", icon: "folder", module: "projects" },
  { id: "routines", label: "Rutiner", icon: "repeat", module: "routines" },
];

function addForm(id, placeholder, extra = "") {
  return `<form class="a-quickadd" id="${id}" autocomplete="off"><label class="sr-only" for="${id}-input">${esc(placeholder)}</label><input id="${id}-input" name="text" maxlength="200" placeholder="${esc(placeholder)}" />${extra}<button type="submit" aria-label="Lägg till">${icon("plus")}</button></form>`;
}

function inboxTab(life, now) {
  const items = It.inbox(life);
  const choice = (item) => `<div class="a-choice"><button type="button" data-action="life-inbox-today" data-id="${esc(item.id)}">I dag</button><button type="button" data-action="life-inbox-later" data-id="${esc(item.id)}">Senare</button><button type="button" data-action="life-item-drop" data-id="${esc(item.id)}" aria-label="Släpp ${esc(item.title)}">Släpp</button></div>`;
  return `<p class="a-lede">En plats att lägga saker på — inte en lista att tömma. Sortera när det passar.</p>
    ${addForm("life-inbox-form", "Lägg i inkorgen…")}
    ${items.length ? `<ul class="a-list">${items.map((item) => `<li class="a-row is-stacked" data-kind="${esc(item.kind)}"><button class="a-row-main" type="button" data-action="life-open-item" data-id="${esc(item.id)}"><strong>${esc(item.title)}</strong><small>${esc(KIND_LABELS[item.kind] || "")} · ${esc(relDay(String(item.createdAt).slice(0, 10), now))}</small></button>${choice(item)}</li>`).join("")}</ul>` : empty("Inget i inkorgen just nu.", { character: "maja" })}`;
}

function shoppingTab(life, now) {
  const shop = It.shoppingList(life);
  return `${addForm("life-shop-form", "Lägg till varor… ”mjölk, bröd och tandkräm”")}
    ${shop.count ? shop.groups.map((g) => `<div class="a-group"><p class="a-group-label"><span>${esc(SHOP_LABELS[g.category] || "Övrigt")}</span><em>${g.items.length}</em></p>${list(g.items, now, { showKind: false })}</div>`).join("") : empty("Inköpslistan är tom.", { character: "maja" })}
    ${shop.usuals.length ? `<div class="a-usuals"><p class="a-group-label"><span>Brukar köpas</span></p><div class="chip-row">${shop.usuals.slice(0, 16).map((item) => `<button class="a-chip" type="button" data-action="life-reopen" data-id="${esc(item.id)}">${icon("plus")} ${esc(item.title)}</button>`).join("")}</div></div>` : ""}`;
}

function adminTab(life, now) {
  const a = It.adminList(life, today(now));
  const status = (item) => `<div class="a-choice is-small" role="group" aria-label="Läge för ${esc(item.title)}">${[["action", "Gör"], ["waiting", "Väntar"], ["followup", "Följ upp"]].map(([value, label]) => `<button type="button" data-action="life-admin-status" data-id="${esc(item.id)}" data-status="${value}" aria-pressed="${item.adminStatus === value}">${label}</button>`).join("")}</div>`;
  const block = (title, items) => items.length ? `<div class="a-group"><p class="a-group-label"><span>${title}</span><em>${items.length}</em></p><ul class="a-list">${items.map((item) => row(item, now, { showKind: false, trailing: status(item), stacked: true })).join("")}</ul></div>` : "";
  return `${addForm("life-admin-form", "Nytt ärende… ”betala hyran senast 30/9”")}
    ${a.action.length || a.waiting.length || a.later.length ? `${block("Behöver göras", a.action)}${block("Väntar på svar", a.waiting)}${block("Följ upp senare", a.later)}` : empty("Räkningar, blanketter, samtal och bokningar hamnar här.", { character: "maja" })}`;
}

function homeTab(life, now) {
  const chores = It.choresList(life, today(now));
  const due = (n) => (n == null ? "när det passar" : n < 0 ? `sedan ${plural(-n, "dag", "dagar")}` : n === 0 ? "i dag" : n === 1 ? "i morgon" : `om ${n} dagar`);
  const repeat = `<label class="sr-only" for="life-chore-repeat">Hur ofta</label><select id="life-chore-repeat" name="repeat"><option value="week">Varje vecka</option><option value="day">Varje dag</option><option value="2week">Varannan vecka</option><option value="month">Varje månad</option></select>`;
  return `<p class="a-lede">Aura kommer ihåg de tråkiga återkommande sakerna, så att du slipper.</p>
    ${addForm("life-chore-form", "Ny sak hemma… ”byta lakan”", repeat)}
    ${chores.length ? `<ul class="a-list">${chores.map(({ item, dueIn }) => row(item, now, { showKind: false, note: due(dueIn), trailing: dueIn != null && dueIn <= 0 ? `<span class="a-badge">dags</span>` : "" })).join("")}</ul>` : empty("Lägg till det som återkommer — tvätt, lakan, sopor — så påminner Aura i lagom takt.", { character: "maja" })}`;
}

function projectsTab(life) {
  const projects = life.projects.filter((p) => p.status !== "done");
  return `<p class="a-lede">Större saker med flera steg. Bara nästa steg når din dag.</p>
    ${addForm("life-project-form", "Nytt projekt… ”ordna sovrummet”")}
    ${projects.length ? `<ul class="a-list">${projects.map((p) => {
      const next = It.nextAction(life, p.id);
      const progress = It.projectProgress(life, p.id);
      return `<li class="a-row" data-kind="project"><span class="a-ring" style="--p:${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}" aria-hidden="true"></span><button class="a-row-main" type="button" data-action="life-project-open" data-id="${esc(p.id)}"><strong>${esc(p.title)}</strong><small>${esc(p.status === "paused" ? "Pausat" : next ? `Nästa: ${next.title}` : p.outcome || "Inget nästa steg ännu")}</small></button></li>`;
    }).join("")}</ul>` : empty("Inga projekt ännu. En resa, ett rum att ordna, något att lära sig.", { character: "maja" })}`;
}

function routinesTab(life, now) {
  const views = A.routines.todays(life, now);
  const active = new Set(life.routines.map((r) => r.kind));
  const available = A.routines.templateKinds().filter((kind) => !active.has(kind));
  return `<p class="a-lede">Rutiner anpassar sig: sent, lite ork eller ont om tid ger en kort version.</p>
    ${life.routines.length ? `<ul class="a-list">${life.routines.map((r) => {
      const v = views.find((x) => x.routine.id === r.id);
      return `<li class="a-row" data-kind="routine"><span class="a-time">${v ? `${v.done}/${v.total}` : "–"}</span><button class="a-row-main" type="button" data-action="life-routine-open" data-id="${esc(r.id)}"><strong>${esc(r.name)}</strong><small>${esc([r.start ? `${r.start}–${r.end || ""}` : "när du vill", v ? (v.complete ? "klar i dag" : `${plural(v.remaining, "steg", "steg")} kvar`) : "inte i dag"].join(" · "))}</small></button></li>`;
    }).join("")}</ul>` : empty("Inga rutiner ännu. Välj en att börja med nedanför.", { character: "maja" })}
    ${available.length ? `<div class="a-usuals"><p class="a-group-label"><span>Lägg till en rutin</span></p><div class="chip-row">${available.map((kind) => `<button class="a-chip" type="button" data-action="life-routine-add" data-kind="${kind}">${icon("plus")} ${esc(I.t(`rt.${kind}`))}</button>`).join("")}</div></div>` : ""}`;
}

export function renderLifePage(now = new Date()) {
  const life = view(now);
  if (!life) return "";
  const counts = It.counts(life, today(now));
  const tabs = LIFE_TABS.filter((tab) => !tab.module || moduleOn(state(), tab.module));
  if (!tabs.some((tab) => tab.id === ui.lifeTab)) ui.lifeTab = "inbox";
  const countFor = { inbox: counts.inbox, shopping: counts.shopping, admin: counts.adminAction, home: counts.choresDue, projects: counts.projects, routines: life.routines.length };
  const panels = { inbox: inboxTab, shopping: shoppingTab, admin: adminTab, home: homeTab, projects: projectsTab, routines: routinesTab };
  const active = tabs.find((tab) => tab.id === ui.lifeTab);
  return worldPage("life-page maja-page", env.worlds.insights, `
    ${worldHeader({
      character: "maja",
      eyebrow: "Livet · Majas anteckningar",
      title: "Allt du inte behöver <em>hålla i huvudet.</em>",
      body: counts.inbox ? `${plural(counts.inbox, "sak ligger", "saker ligger")} i inkorgen. De väntar tills du vill.` : "Allt har en plats. Bara det viktiga når din dag.",
      action: `<button class="button button-frost" type="button" data-action="life-capture">Töm huvudet ${icon("nav-arrow-right", "button-icon")}</button>`,
    })}
    <section class="a-panel life-hub" aria-labelledby="life-hub-title">
      <h2 class="sr-only" id="life-hub-title">Listor</h2>
      <div class="a-tabs" role="tablist" aria-label="Listor">${tabs.map((tab) => `<button type="button" role="tab" data-action="life-tab" data-tab="${tab.id}" aria-selected="${tab.id === ui.lifeTab}">${icon(tab.icon)}<span>${tab.label}</span>${countFor[tab.id] ? `<em>${countFor[tab.id]}</em>` : ""}</button>`).join("")}</div>
      <div class="a-tabpanel" id="life-tab-panel" role="tabpanel" aria-label="${esc(active?.label || "")}">${panels[ui.lifeTab](life, now)}</div>
    </section>
    <section class="a-panel a-links" aria-label="Mer hos Maja">
      <button type="button" data-route="insights">${icon("stats-up-square")}<span><strong>Mönster</strong><small>Det som hjälper på riktigt</small></span>${icon("nav-arrow-right")}</button>
      <button type="button" data-route="week">${icon("calendar")}<span><strong>Veckan</strong><small>Titta tillbaka och framåt</small></span>${icon("nav-arrow-right")}</button>
      <button type="button" data-route="evening">${icon("half-moon")}<span><strong>Kvällsavslut</strong><small>Två minuter, sedan vila</small></span>${icon("nav-arrow-right")}</button>
    </section>
  `);
}

/* ---------------- Prata med Aura (contextual, on Klara's page) ---------------- */

const TALK_STARTERS = ["Vad ska jag börja med?", "Jag har ingen ork i dag", "Hjälp mig reda ut dagen", "Vad har jag glömt?", "Vad kan vänta till i morgon?", "Hjälp mig få ordning hemma", "Vad har jag skjutit upp?", "Vad skulle jag köpa?"];

const matches = (query, re) => re.test(` ${U.normalize(query)} `);

/**
 * Plan-aware answers to the everyday questions, computed on the phone:
 * {text, items?, extras?, actions?}. Never invented, never presented as AI.
 */
function answer(query, now = new Date()) {
  const life = view(now);
  const key = today(now);
  if (matches(query, /(ingen ork|orkar inte|trott|trött|utmattad|slutkörd|slutkord|no energy|tired|lite energi|lite ork)/u)) {
    const plan = E.lowEnergyPlan(life, now);
    return {
      text: plan.moved.length
        ? `Då gör vi dagen mindre. ${plan.must.length ? `${plural(plan.must.length, "sak måste", "saker måste")} ändå hända` : "Inget måste hända i dag"}${plan.tiny ? `, en liten vinst kan vara ”${plan.tiny.title}”` : ""}, och ${plural(plan.moved.length, "sak", "saker")} kan flytta till lugnare dagar.`
        : "Dagen är redan liten. Ta det som känns lättast — eller vila, det räknas också.",
      items: plan.must,
      actions: [plan.moved.length ? ["Visa hur dagen blir mindre", 'data-route="low"'] : null, ["Checka in med Klara om vila", 'data-action="start-coach-need" data-need="rest"']].filter(Boolean),
    };
  }
  if (matches(query, /(reda ut|sortera dagen|ordning pa dagen|ordning på dagen|for mycket|för mycket|kaos|rorigt|rörigt|overvaldigad|överväldigad|sort today|too much|overwhelm)/u)) {
    const proposal = P.rebuild(life, now);
    return {
      text: proposal.moved.length
        ? `Dagen rymmer inte allt. Om Aura bygger om den flyttas ${plural(proposal.moved.length, "sak", "saker")} till lugnare dagar och ${plural(proposal.kept.length + proposal.must.length, "sak", "saker")} stannar.`
        : "Dagen går ihop som den är. Vill du hellre ta en sak i taget än se allt?",
      actions: [["Bygg om min dag", 'data-action="life-rebuild"'], ["En sak i taget", 'data-route="chaos"']],
    };
  }
  if (matches(query, /(hemma|lagenheten|lägenheten|stada|städa|ordning hemma|hemmet|apartment|clean)/u)) {
    const chores = It.choresList(life, key);
    const dueNow = chores.filter((c) => c.dueIn != null && c.dueIn <= 0).map((c) => c.item);
    const first = dueNow.slice().sort((a, b) => E.effort(a) - E.effort(b))[0];
    return {
      text: dueNow.length
        ? `${plural(dueNow.length, "sak hemma är", "saker hemma är")} dags. Börja med den kortaste${first ? ` — ”${first.title}”, ${approx(E.effort(first))}` : ""}. Resten tar vi en i taget.`
        : chores.length ? "Inget hemma är dags just nu. Aura säger till när det blir det." : "Lägg till det som återkommer hemma, så håller Aura koll i lagom takt.",
      items: dueNow.slice(0, 6),
      actions: [dueNow.length > 1 ? ["En sak i taget", 'data-route="chaos"'] : null, ["Öppna Hemmet", 'data-action="life-tab" data-tab="home" data-go="life"']].filter(Boolean),
    };
  }
  if (matches(query, /(ledsen|orolig|stressad|angest|ångest|ensam|nedstamd|nedstämd|sad|anxious|lonely|worried)/u)) {
    const need = matches(query, /(ensam|ledsen|nedstamd|nedstämd|lonely|sad)/u) ? "boost" : "calm";
    return { text: "Det låter mer som hur det känns än vad som står i planen. Klara kan hjälpa med ett konkret första steg för just den känslan.", actions: [["Checka in med Klara", `data-action="start-coach-need" data-need="${need}"`]] };
  }
  const r = A.search.ask(life, query, now);
  const items = r.items || [];
  const extras = [...(r.events || []).map((e) => `${U.toClock(e.start)} ${e.title}`), ...(r.projects || []).map((p) => `Projekt: ${p.title}`)];
  if (!A.search.isKnownIntent(r) && !items.length && !extras.length) {
    return { text: "Jag hittade inget om det i dina listor. Vill du lägga till det — eller prata med Klara om hur det känns?", actions: [["Lägg till", 'data-action="life-add"'], ["Checka in med Klara", 'data-action="focus-coach-form"']] };
  }
  const actions = [];
  if (r.intent === "now" && r.rec) actions.push(["Gör det", `data-action="life-do" data-id="${esc(r.rec.item.id)}"`]);
  if (r.intent === "canMove" && items.length) actions.push(["Flytta dem till i morgon", `data-action="life-move-tomorrow" data-ids="${items.map((i) => esc(i.id)).join(",")}"`]);
  return { text: items.length || extras.length ? r.title : r.empty, items, extras, actions };
}

export function renderTalkPanel(now = new Date()) {
  const life = view(now);
  if (!life) return "";
  const thread = ui.talk.slice(-4).map((t) => `<div class="talk-q"><p>${esc(t.query)}</p></div>
    <div class="talk-a"><img src="${companion("klara").asset}" alt="" aria-hidden="true" /><div><p>${esc(t.answer.text)}</p>
      ${t.answer.items?.length ? list(t.answer.items.slice(0, 8), now) : ""}
      ${t.answer.extras?.length ? `<ul class="a-plain">${t.answer.extras.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
      ${t.answer.actions?.length ? `<div class="a-notice-actions">${t.answer.actions.map(([label, attrs]) => quiet(label, attrs)).join("")}</div>` : ""}
      <small class="talk-source">Ur din plan · räknat i telefonen, ingen AI</small></div></div>`).join("");
  return `<section class="a-panel talk-panel" id="ask-panel" aria-labelledby="talk-title">
    ${head("Prata med Aura", "Vad behöver du hjälp med?", ui.talk.length ? `<button class="a-link" type="button" data-action="life-talk-clear">Rensa</button>` : "", "talk-title")}
    ${thread ? `<div class="talk-thread" id="ask-result" tabindex="-1" aria-live="polite">${thread}</div>` : `<p class="a-lede">Aura ser din dag, dina listor och hur du mår — och svarar kort, med något du kan göra direkt.</p>`}
    <form id="life-ask-form" class="a-quickadd talk-input" autocomplete="off"><label class="sr-only" for="life-ask-input">Fråga eller berätta</label><input id="life-ask-input" name="query" maxlength="200" placeholder="Fråga eller berätta…" /><button type="submit" aria-label="Skicka">${icon("nav-arrow-right")}</button></form>
    <div class="chip-row talk-starters">${TALK_STARTERS.map((text) => `<button class="a-chip" type="button" data-action="life-ask-chip" data-text="${esc(text)}">${esc(text)}</button>`).join("")}</div>
  </section>`;
}

/** Under Klara's check-in answer: the same moment, seen from the day's plan. */
export function renderCoachBridge(need, now = new Date()) {
  const life = view(now);
  if (!life || !["structure", "rest", "calm"].includes(need)) return "";
  if (need === "structure") {
    const rec = E.whatNow(life, now);
    if (!rec) return "";
    return `<div class="coach-bridge"><p class="a-eyebrow">Från din dag</p><h3>${esc(rec.title)}</h3><p>${esc(I.msg(rec.reason))} · ${esc(approx(rec.minutes))}</p><div class="a-notice-actions">${quiet("Gör det", `data-action="life-do" data-id="${esc(rec.item.id)}"`)}${quiet("Bygg om min dag", 'data-action="life-rebuild"')}${quiet("En sak i taget", 'data-route="chaos"')}</div></div>`;
  }
  const b = It.dayBuckets(life, today(now));
  if (b.must.length + b.good.length < 3) return "";
  return `<div class="coach-bridge"><p class="a-eyebrow">Från din dag</p><h3>Dagen kan bli mindre</h3><p>Du har ${plural(b.must.length + b.good.length, "sak", "saker")} i dag. Aura kan visa vad som går att flytta.</p><div class="a-notice-actions">${quiet("Gör dagen mindre", 'data-route="low"')}</div></div>`;
}

/* ---------------- Mönster: Maja's observations ---------------- */

export function renderObservations(now = new Date()) {
  const life = view(now);
  if (!life || !A.patterns) return "";
  const obs = A.patterns.observations(life, now).filter((o) => !life.meta.dismissedPatterns.includes(o.key)).slice(0, 4);
  return `<section class="a-panel observations" aria-labelledby="obs-title">
    ${head("Maja märkte · ur dina egna listor", "Observationer, inte diagnoser", "", "obs-title")}
    ${obs.length ? obs.map((o) => notice(I.msg(o.text), `${(o.actions || []).map((action, index) => quiet(I.msg(action.label), `data-action="life-pattern" data-key="${esc(o.key)}" data-index="${index}"`)).join("")}${quiet("Det stämmer inte", `data-action="life-pattern-dismiss" data-key="${esc(o.key)}"`)}`)).join("") : empty("Maja säger bara något när samma sak hänt flera gånger — till exempel att en sak ofta flyttas samma veckodag.", { character: "maja" })}
  </section>`;
}

/* ---------------- sheets ---------------- */

function sheetDialog() {
  return document.querySelector("#life-sheet");
}

function sheetHead(eyebrow, title) {
  return `<div class="sheet-grabber" aria-hidden="true"></div><div class="modal-heading"><div><p class="a-eyebrow">${esc(eyebrow)}</p><h2 id="life-sheet-title">${esc(title)}</h2></div><button class="icon-button" type="button" data-action="life-close-sheet" aria-label="Stäng">${icon("xmark")}</button></div>`;
}

function whenOptions(date, now) {
  const key = today(now);
  const known = { "": "Ingen dag", [key]: "I dag", [U.addDays(key, 1)]: "I morgon" };
  const weekend = A.apply.resolveWhen("weekend", key);
  const nextWeek = A.apply.resolveWhen("nextweek", key);
  if (!known[weekend]) known[weekend] = "I helgen";
  if (!known[nextWeek]) known[nextWeek] = "Nästa vecka";
  if (date && !known[date]) known[date] = U.capitalize(relDay(date, now));
  return Object.entries(known).map(([value, label]) => `<option value="${esc(value)}"${value === (date || "") ? " selected" : ""}>${esc(label)}</option>`).join("");
}

function itemSheet(data, now) {
  const life = state().life;
  const item = M.itemById(life, data.id);
  if (!item) return `${sheetHead("Saken", "Finns inte längre")}<p class="a-lede">Den kan ha tagits bort eller ångrats.</p>`;
  const bucket = It.classify(life, item, today(now));
  const isOpen = item.status === "open" || item.status === "inbox";
  const siblings = bucket && ["must", "good"].includes(bucket) ? It.dayBuckets(life, today(now))[bucket] : [];
  const index = siblings.findIndex((x) => x.id === item.id);
  const confirming = ui.confirmDelete === item.id;
  return `${sheetHead(KIND_LABELS[item.kind] || "Sak", item.title)}
    ${isOpen ? `<div class="sheet-quick">
      <button class="button button-primary" type="button" data-action="life-done" data-id="${esc(item.id)}">${icon("check-circle", "button-icon")} Klart</button>
      ${item.recur ? `<button class="button button-secondary" type="button" data-action="life-item-skip" data-id="${esc(item.id)}">Hoppa över en gång</button>`
        : `<button class="button button-secondary" type="button" data-action="life-item-when" data-id="${esc(item.id)}" data-to="tomorrow">I morgon</button><button class="button button-secondary" type="button" data-action="life-item-when" data-id="${esc(item.id)}" data-to="later">Senare</button>`}
    </div>` : `<div class="sheet-quick"><button class="button button-secondary" type="button" data-action="life-reopen" data-id="${esc(item.id)}">Öppna igen</button></div>`}
    <form id="life-item-form" class="a-form" data-id="${esc(item.id)}">
      <label class="field"><span>Vad</span><input name="title" maxlength="140" value="${esc(item.title)}" required /></label>
      <div class="field-grid">
        <label class="field"><span>Sort</span><select name="kind">${["task", "shopping", "admin", "chore", "reminder", "note", "idea"].map((k) => `<option value="${k}"${k === item.kind ? " selected" : ""}>${KIND_LABELS[k]}</option>`).join("")}</select></label>
        <label class="field"><span>När</span><select name="date">${whenOptions(item.date, now)}</select></label>
      </div>
      <fieldset class="chip-field"><legend>Hur viktigt</legend>${chips("priority", [["", "Låt Aura avgöra"], ["must", "Måste"], ["good", "Bra om det hinns"], ["later", "Kan vänta"]], item.priority || "")}</fieldset>
      <div class="field-grid">
        <label class="field"><span>Upprepas</span><select name="repeat">${REPEATS.map(([value, label]) => `<option value="${value}"${repeatValue(item.recur) === value ? " selected" : ""}>${label}</option>`).join("")}</select></label>
        <label class="field"><span>Ungefär hur länge</span><select name="minutes">${MINUTE_CHOICES.map((m) => `<option value="${m}"${m === item.minutes ? " selected" : ""}>${I.duration(m)}</option>`).join("")}${MINUTE_CHOICES.includes(item.minutes) ? "" : `<option value="${item.minutes}" selected>${I.duration(item.minutes)}</option>`}</select></label>
      </div>
      <details class="disclosure"><summary>Mer <span>deadline, klockslag, anteckning</span></summary>
        <div class="field-grid">
          <label class="field"><span>Senast</span><input type="date" name="dueDate" value="${esc(item.dueDate)}" /></label>
          <label class="field"><span>Klockslag</span><input type="time" name="time" value="${esc(item.time)}" /></label>
          ${item.kind === "shopping" ? `<label class="field"><span>Avdelning</span><select name="category">${M.SHOP_CATEGORIES.map((c) => `<option value="${c}"${c === item.category ? " selected" : ""}>${SHOP_LABELS[c]}</option>`).join("")}</select></label>` : ""}
          ${item.kind === "admin" ? `<label class="field"><span>Läge</span><select name="adminStatus">${[["action", "Behöver göras"], ["waiting", "Väntar på svar"], ["followup", "Följ upp senare"]].map(([v, l]) => `<option value="${v}"${v === item.adminStatus ? " selected" : ""}>${l}</option>`).join("")}</select></label><label class="field"><span>Följ upp</span><input type="date" name="followUp" value="${esc(item.followUp)}" /></label>` : ""}
        </div>
        ${item.kind === "shopping" ? `<label class="toggle-line"><input type="checkbox" name="staple"${item.staple ? " checked" : ""} /> <span>Brukar köpas — föreslå den igen</span></label>` : ""}
        <label class="field"><span>Anteckning</span><textarea name="note" maxlength="1000" rows="2">${esc(item.note)}</textarea></label>
      </details>
      <button class="button button-primary button-wide" type="submit">Spara ändringar</button>
    </form>
    ${isOpen ? `<div class="sheet-more">
      ${["task", "chore", "admin"].includes(item.kind) && item.minutes >= 20 ? quiet("Gör den mindre", `data-action="life-item-split" data-id="${esc(item.id)}"`) : ""}
      ${index > 0 ? quiet("Flytta upp", `data-action="life-item-move" data-id="${esc(item.id)}" data-dir="-1"`) : ""}
      ${index >= 0 && index < siblings.length - 1 ? quiet("Flytta ner", `data-action="life-item-move" data-id="${esc(item.id)}" data-dir="1"`) : ""}
      ${quiet("Släpp", `data-action="life-item-drop" data-id="${esc(item.id)}"`)}
      <button class="a-quiet is-danger" type="button" data-action="life-item-delete" data-id="${esc(item.id)}">${confirming ? "Tryck igen för att radera" : "Radera"}</button>
    </div>` : ""}`;
}

function captureSheet(now) {
  const cap = ui.capture || (ui.capture = { text: "", result: null });
  if (cap.result?.question) {
    return `${sheetHead("Töm huvudet", "Det låter som en fråga")}<p class="a-lede">Vill du att Aura svarar ur din plan i stället?</p><div class="sheet-quick"><button class="button button-primary" type="button" data-action="life-capture-ask">Prata med Aura</button><button class="button button-secondary" type="button" data-action="life-capture-anyway">Spara som anteckning</button></div>`;
  }
  if (cap.result) {
    const cands = cap.result.candidates;
    if (!cands.length) {
      return `${sheetHead("Töm huvudet", "Inget att lägga till")}<p class="a-lede">Aura hittade ingen sak i texten. Skriv lite mer, eller spara den i inkorgen som den är.</p><div class="sheet-quick"><button class="button button-secondary" type="button" data-action="life-capture-restart">Skriv om</button><button class="button button-ghost" type="button" data-action="life-capture-inbox">Spara i inkorgen</button></div>`;
    }
    const kinds = ["task", "shopping", "admin", "chore", "reminder", "event", "note", "idea"];
    return `${sheetHead("Töm huvudet", `${plural(cands.length, "sak", "saker")} — stämmer det?`)}
      <p class="a-fine">Sorterat med Auras egna regler i telefonen · ingen AI, inget skickades. Rätta det som blev fel — inget sparas förrän du trycker.</p>
      <form id="life-review-form" class="a-form">
        <ul class="cand-list">${cands.map((c) => `<li class="cand" data-review="${Boolean(c.review)}" data-temp="${esc(c.tempId)}">
          <div class="cand-top"><label class="sr-only" for="cand-${esc(c.tempId)}">Vad</label><input id="cand-${esc(c.tempId)}" name="t-${esc(c.tempId)}" maxlength="140" value="${esc(c.title)}" /><button class="icon-button" type="button" data-action="life-cand-remove" data-temp="${esc(c.tempId)}" aria-label="Ta bort ${esc(c.title)}">${icon("xmark")}</button></div>
          <div class="cand-bottom">
            <label class="sr-only" for="kind-${esc(c.tempId)}">Sort för ${esc(c.title)}</label><select id="kind-${esc(c.tempId)}" data-change="life-cand-kind" data-temp="${esc(c.tempId)}">${kinds.map((k) => `<option value="${k}"${k === c.kind ? " selected" : ""}>${KIND_LABELS[k]}</option>`).join("")}</select>
            ${c.kind === "note" || c.kind === "idea" ? "" : `<label class="sr-only" for="when-${esc(c.tempId)}">När för ${esc(c.title)}</label><select id="when-${esc(c.tempId)}" data-change="life-cand-when" data-temp="${esc(c.tempId)}">${whenOptions(c.date || c.dueDate, now)}</select>`}
            ${c.kind === "event" ? `<label class="sr-only" for="time-${esc(c.tempId)}">Klockslag</label><input id="time-${esc(c.tempId)}" type="time" value="${esc(c.time)}" data-change="life-cand-time" data-temp="${esc(c.tempId)}" />` : ""}
            ${[c.dueDate ? `senast ${relDay(c.dueDate, now)}` : "", c.recur ? It.describeRecur(c.recur) : "", c.kind === "shopping" && c.category ? SHOP_LABELS[c.category] : "", c.forPerson ? `till ${c.forPerson}` : ""].filter(Boolean).map((text) => `<span class="cand-meta">${esc(text)}</span>`).join("")}
          </div>
          ${c.review ? `<p class="cand-hint">${esc(c.kind === "event" ? "Blir en fast tid — kolla dag och klockslag." : c.kind === "reminder" ? "När? Välj en dag så påminner Aura dig." : "Osäker på sorten — ändra om det blev fel.")}</p>` : ""}
        </li>`).join("")}</ul>
        <button class="button button-primary button-wide" type="submit">Lägg in ${plural(cands.length, "sak", "saker")}</button>
      </form>
      <div class="sheet-more">${quiet("Börja om", 'data-action="life-capture-restart"')}${quiet("Allt i inkorgen i stället", 'data-action="life-capture-inbox"')}</div>`;
  }
  return `${sheetHead("Töm huvudet", "Vad snurrar i huvudet?")}
    <form id="life-capture-form" class="a-form">
      <label class="sr-only" for="capture-text">Skriv allt, i vilken ordning som helst</label>
      <textarea id="capture-text" name="text" rows="6" maxlength="4000" placeholder="Allt på en gång, i vilken ordning som helst. ”Behöver schampo och mjölk, boka tandläkaren, tvätta jackan i helgen, tandläkare torsdag 14:00”">${esc(cap.text)}</textarea>
      <p class="a-fine">Hellre prata? Tangentbordets mikrofon fungerar här. Aura sorterar i telefonen och visar allt innan något sparas.</p>
      <button class="button button-primary button-wide" type="submit">Sortera</button>
    </form>
    <div class="sheet-more">${quiet("Spara direkt i inkorgen", 'data-action="life-capture-inbox"')}</div>`;
}

function addSheet() {
  const a = ui.add;
  return `${sheetHead("Lägg till", "Vad vill du lägga till?")}
    <form id="life-add-form" class="a-form" autocomplete="off">
      <label class="sr-only" for="add-text">Vad</label><input id="add-text" name="text" maxlength="200" placeholder="t.ex. ”Ring banken i morgon 10”" required />
      <fieldset class="chip-field"><legend>Sort <small>Aura gissar om du inte väljer</small></legend>${chips("kind", [["", "Gissa"], ["task", "Uppgift"], ["shopping", "Handla"], ["admin", "Ärende"], ["chore", "Hemmet"], ["reminder", "Påminnelse"], ["event", "Fast tid"]], a.kind)}</fieldset>
      <fieldset class="chip-field"><legend>När</legend>${chips("when", [["", "Gissa"], ["today", "I dag"], ["tomorrow", "I morgon"], ["weekend", "I helgen"], ["none", "Ingen dag"]], a.when)}</fieldset>
      <button class="button button-primary button-wide" type="submit">Lägg till</button>
    </form>`;
}

function pulseSheet() {
  const v = ui.pulse;
  return `${sheetHead("Aura Pulse", "Hur är läget?")}
    <p class="a-lede">Allt är frivilligt. Tio sekunder räcker — Aura anpassar dagen och Klara råden.</p>
    <div class="pulse-grid">
      <div><p class="a-group-label"><span>Ork</span></p>${scale("energy", { title: "Ork", low: "Slut", high: "Mycket" }, v.energy)}</div>
      <div><p class="a-group-label"><span>Humör</span></p>${scale("mood", { title: "Humör", low: "Tungt", high: "Ljust" }, v.mood)}</div>
      <div><p class="a-group-label"><span>Stress</span></p>${scale("stress", { title: "Stress", low: "Lugn", high: "Mycket" }, v.stress)}</div>
      <div><p class="a-group-label"><span>Sömn i natt</span></p>${scale("sleep", { title: "Sömn", low: "Dålig", high: "Bra" }, v.sleep)}</div>
    </div>
    <form id="life-pulse-form" class="a-form"><label class="sr-only" for="pulse-note">En rad, om du vill</label><input id="pulse-note" name="note" maxlength="200" placeholder="En rad, om du vill…" /><button class="button button-primary button-wide" type="submit"${Object.keys(v).length ? "" : " disabled"}>Spara</button></form>`;
}

function rebuildSheet(data) {
  const r = data.proposal;
  const block = (label, items, suffix = () => "") => (items.length ? `<p class="a-group-label"><span>${label}</span><em>${items.length}</em></p><ul class="a-moves">${items.map((x) => `<li><span>${esc(x.title)}</span>${suffix(x) ? `<em>${esc(suffix(x))}</em>` : ""}</li>`).join("")}</ul>` : "");
  const nothing = !r.moved.length && !r.added.length;
  return `${sheetHead("Bygg om min dag", nothing ? "Dagen går ihop som den är" : "Så här blir dagen")}
    <p class="a-lede">${r.tight ? "Bara måstena tar mer tid än dagen har kvar. Kanske kan något av dem göras mindre eller flyttas?" : "Aura har vägt tid kvar, ork, fasta tider och vad som är viktigast."}</p>
    ${block("Måste — stannar", r.must)}${block("Bra om det hinns — stannar", r.kept)}${block("Flyttas", r.moved, (x) => relDay(x.to))}${block("Tas in — det finns plats", r.added)}
    <div class="sheet-quick">${nothing ? `<button class="button button-primary" type="button" data-action="life-close-sheet">Bra</button>` : `<button class="button button-primary" type="button" data-action="life-rebuild-apply">Gör så här</button><button class="button button-ghost" type="button" data-action="life-close-sheet">Behåll som det är</button>`}</div>`;
}

function eventSheet(data, now) {
  const life = state().life;
  const event = data.id ? M.eventById(life, data.id) : null;
  const e = event || { title: "", date: today(now), start: "", end: "", away: true, recur: null };
  const days = [...(e.recur?.weekdays || [])].map(String);
  return `${sheetHead("Fast tid", event ? event.title : "Ny fast tid")}
    <form id="life-event-form" class="a-form"${event ? ` data-id="${esc(event.id)}"` : ""}>
      <label class="field"><span>Vad</span><input name="title" maxlength="120" value="${esc(e.title)}" required placeholder="t.ex. Tandläkaren" /></label>
      <div class="field-grid three">
        <label class="field"><span>Dag</span><input type="date" name="date" value="${esc(e.date || today(now))}" /></label>
        <label class="field"><span>Börjar</span><input type="time" name="start" value="${esc(e.start)}" /></label>
        <label class="field"><span>Slutar</span><input type="time" name="end" value="${esc(e.end)}" /></label>
      </div>
      <label class="toggle-line"><input type="checkbox" name="away"${e.away ? " checked" : ""} /> <span>Utanför hemmet — räkna med restid</span></label>
      <fieldset class="chip-field"><legend>Varje vecka <small>frivilligt</small></legend>${chips("weekday", WEEKDAYS.map(([d, l]) => [String(d), l]), days, "checkbox")}</fieldset>
      <button class="button button-primary button-wide" type="submit">Spara</button>
    </form>
    ${event ? `<div class="sheet-more"><button class="a-quiet is-danger" type="button" data-action="life-event-delete" data-id="${esc(event.id)}">Ta bort</button></div>` : ""}`;
}

function routineSheet(data, now) {
  const life = view(now);
  const routine = M.routineById(life, data.id);
  if (!routine) return `${sheetHead("Rutin", "Finns inte längre")}`;
  if (data.edit) {
    return `${sheetHead("Ändra rutin", routine.name)}
      <form id="life-routine-form" class="a-form" data-id="${esc(routine.id)}">
        <label class="field"><span>Namn</span><input name="name" maxlength="60" value="${esc(routine.name)}" required /></label>
        <div class="field-grid"><label class="field"><span>Brukar börja</span><input type="time" name="start" value="${esc(routine.start)}" /></label><label class="field"><span>Senast</span><input type="time" name="end" value="${esc(routine.end)}" /></label></div>
        <p class="a-group-label"><span>Steg</span><em>${routine.steps.length}</em></p>
        <ul class="a-list routine-edit">${routine.steps.map((step, i) => `<li class="a-row is-stacked"><div class="routine-edit-step"><input name="step-${i}" maxlength="80" value="${esc(step.label)}" aria-label="Steg ${i + 1}" /><div class="routine-edit-meta"><label class="toggle-line"><input type="checkbox" name="optional-${i}"${step.core ? "" : " checked"} /> <span>Kan hoppas över</span></label><label class="routine-minutes"><input type="number" name="minutes-${i}" min="1" max="120" value="${step.minutes}" aria-label="Minuter för steg ${i + 1}" /> min</label><button class="a-quiet is-danger" type="button" data-action="life-routine-step-remove" data-id="${esc(routine.id)}" data-index="${i}">Ta bort</button></div></div></li>`).join("")}</ul>
        <label class="field"><span>Nytt steg</span><input name="newStep" maxlength="80" placeholder="t.ex. Vattna blommorna" /></label>
        <button class="button button-primary button-wide" type="submit">Spara rutinen</button>
      </form>
      <div class="sheet-more"><button class="a-quiet is-danger" type="button" data-action="life-routine-remove" data-id="${esc(routine.id)}">Ta bort rutinen</button></div>`;
  }
  const v = A.routines.view(life, routine, now);
  return `${sheetHead(v.variant === "short" ? "Rutin · kort version" : "Rutin", routine.name)}
    <p class="a-lede">${esc(I.t(v.reason))}</p>
    <ul class="a-list routine-steps">${v.steps.map((step) => `<li class="a-row${step.done ? " is-done" : ""}${step.skipped ? " is-skipped" : ""}"><button class="a-check${step.done ? " is-done" : ""}" type="button" data-action="life-routine-check" data-routine="${esc(routine.id)}" data-step="${esc(step.id)}" data-done="${step.done ? "false" : "true"}" aria-pressed="${step.done}" aria-label="${esc(step.label)}"><span aria-hidden="true">${icon("check")}</span></button><span class="a-row-main"><strong>${esc(step.label)}</strong><small>${I.duration(step.minutes)}${step.core ? "" : " · kan hoppas över"}${step.skipped ? " · hoppas över i dag" : ""}</small></span>${!step.done && !step.core ? `<button class="a-link" type="button" data-action="life-routine-skip" data-routine="${esc(routine.id)}" data-step="${esc(step.id)}" data-skip="${step.skipped ? "false" : "true"}">${step.skipped ? "Ta med" : "Hoppa över"}</button>` : ""}</li>`).join("")}</ul>
    <div class="sheet-more">
      ${quiet(v.variant === "short" ? "Visa hela" : "Kort version", `data-action="life-routine-variant" data-id="${esc(routine.id)}" data-variant="${v.variant === "short" ? "full" : "short"}"`)}
      ${quiet("Ändra rutinen", `data-action="life-routine-edit" data-id="${esc(routine.id)}"`)}
    </div>`;
}

function projectSheet(data, now) {
  const life = state().life;
  const project = M.projectById(life, data.id);
  if (!project) return `${sheetHead("Projekt", "Finns inte längre")}`;
  const steps = It.projectActions(life, project.id);
  const progress = It.projectProgress(life, project.id);
  return `${sheetHead(`Projekt · ${progress.done} av ${progress.total} klara`, project.title)}
    <form id="life-project-edit" class="a-form" data-id="${esc(project.id)}">
      <label class="field"><span>Vad vill du uppnå?</span><input name="outcome" maxlength="200" value="${esc(project.outcome)}" placeholder="t.ex. Ett lugnt sovrum där allt har en plats" /></label>
      <button class="button button-secondary" type="submit">Spara målet</button>
    </form>
    <p class="a-group-label"><span>Steg</span><em>${steps.length}</em></p>
    ${steps.length ? `<ul class="a-list">${steps.map((item, index) => row(item, now, { showKind: false, note: index === 0 ? "Nästa steg · syns i din dag" : "Senare steg" })).join("")}</ul>` : empty("Inga steg ännu. Vad är det allra första?")}
    <form id="life-step-form" class="a-quickadd" data-project="${esc(project.id)}"><label class="sr-only" for="life-step-input">Nytt steg</label><input id="life-step-input" name="text" maxlength="140" placeholder="Nästa steg…" /><button type="submit" aria-label="Lägg till steg">${icon("plus")}</button></form>
    <div class="sheet-more">
      ${quiet(project.status === "paused" ? "Återuppta" : "Pausa projektet", `data-action="life-project-status" data-id="${esc(project.id)}" data-status="${project.status === "paused" ? "active" : "paused"}"`)}
      ${quiet("Projektet är klart", `data-action="life-project-status" data-id="${esc(project.id)}" data-status="done"`)}
    </div>`;
}

function renderSheet(now = new Date()) {
  const sheet = ui.sheet;
  if (!sheet) return "";
  switch (sheet.name) {
    case "item": return itemSheet(sheet.data, now);
    case "capture": return captureSheet(now);
    case "add": return addSheet();
    case "pulse": return pulseSheet();
    case "rebuild": return rebuildSheet(sheet.data);
    case "event": return eventSheet(sheet.data, now);
    case "routine": return routineSheet(sheet.data, now);
    case "project": return projectSheet(sheet.data, now);
    default: return "";
  }
}

function openSheet(name, data = {}) {
  const dialog = sheetDialog();
  if (!dialog) return;
  ui.sheet = { name, data };
  ui.confirmDelete = null;
  dialog.querySelector(".modal-card").innerHTML = renderSheet();
  if (!dialog.open) dialog.showModal();
  if (["capture", "add"].includes(name)) requestAnimationFrame(() => dialog.querySelector("textarea, #add-text")?.focus({ preventScroll: true }));
}

function refreshSheet() {
  const dialog = sheetDialog();
  if (!dialog?.open || !ui.sheet) return;
  const card = dialog.querySelector(".modal-card");
  const top = card.scrollTop;
  card.innerHTML = renderSheet();
  card.scrollTop = top;
}

export function closeSheet() {
  const dialog = sheetDialog();
  ui.sheet = null;
  ui.confirmDelete = null;
  if (dialog?.open) dialog.close();
}

export function onSheetClosed() {
  ui.sheet = null;
  ui.confirmDelete = null;
}

export function sheetIsOpen() {
  return Boolean(sheetDialog()?.open);
}

function syncCandidates() {
  const form = document.querySelector("#life-review-form");
  const cands = ui.capture?.result?.candidates;
  if (!form || !cands) return;
  for (const c of cands) {
    const input = form.elements[`t-${c.tempId}`];
    if (input) c.title = input.value;
  }
}

/* ---------------- onboarding ---------------- */

const HELP_WITH = [["plan", "Planera dagen"], ["remember", "Komma ihåg saker"], ["admin", "Ärenden & papper"], ["home", "Hemmet"], ["shopping", "Handla"], ["routines", "Rutiner"], ["energy", "Ork & mående"], ["cycle", "Cykeln & kroppen"], ["reflection", "Reflektion & stjärnor"]];
const HARD_THINGS = [["head", "Allt i huvudet samtidigt"], ["start", "Svårt att komma igång"], ["energy", "Lite ork"], ["forget", "Glömmer saker"], ["irregular", "Oregelbundna dagar"], ["toomuch", "För många måsten"]];
const STEPS = ["welcome", "help", "hard", "rhythm", "pulse", "dump", "ready"];

function onboardingDialog() {
  return document.querySelector("#onboarding-dialog");
}

export function openOnboarding() {
  ui.onboarding = { step: 0, data: { name: "", helpWith: ["plan", "remember", "energy", "cycle", "reflection"], hardThings: [], wake: "07:00", sleep: "23:00", workStart: "", workEnd: "", routines: ["morning"], cycleLength: 28, periodLength: 5, pulse: {}, dump: "" } };
  renderOnboarding();
  const dialog = onboardingDialog();
  if (dialog && !dialog.open) dialog.showModal();
}

function onboardingStep() {
  const o = ui.onboarding;
  const d = o.data;
  const step = STEPS[o.step];
  const progress = `<div class="ob-progress" role="progressbar" aria-valuemin="1" aria-valuemax="5" aria-valuenow="${o.step}" aria-label="Steg ${o.step} av 5">${[1, 2, 3, 4, 5].map((i) => `<i data-on="${i <= o.step}"></i>`).join("")}</div>`;
  const nav = (primary) => `<div class="ob-nav"><button class="button button-ghost" type="button" data-action="life-ob-back">Tillbaka</button><button class="button button-primary" type="submit">${esc(primary)} ${icon("nav-arrow-right", "button-icon")}</button></div><button class="a-quiet ob-skip" type="button" data-action="life-ob-skip">Hoppa över</button>`;
  switch (step) {
    case "welcome":
      return `<div class="onboarding-art"><img src="/assets/forest-companions-mobile-deploy.jpg" alt="Tre av vännerna i Auras levande skog" /></div>
        <div class="modal-copy"><p class="a-eyebrow">En lugnare vardag</p><h1 id="onboarding-title">Välkommen till <em>Aura</em></h1><p>Aura förstår vad som spelar roll just nu och tar bort en del av tänkandet, planerandet och kommandihågandet. Klara håller i dagen, Liv i kroppen, Maja i listor och minnen, Astrid i stjärnorna.</p></div>
        <label class="field"><span>Vad vill du bli kallad?</span><input name="name" id="onboarding-name" autocomplete="given-name" maxlength="40" placeholder="Ditt namn" value="${esc(d.name)}" /></label>
        <details class="privacy-note"><summary>Så skyddar Aura dina uppgifter</summary><p><strong>Planer, listor, dagbok, cykel och tarot stannar i den här webbläsaren.</strong> Planeringen sker med Auras egna regler i telefonen. Bara när du ber Klara eller Liv om ett AI-svar skickas den aktuella incheckningen via Auras skyddade server.</p></details>
        <div class="ob-nav"><button class="button button-primary button-wide" type="submit">Kom igång ${icon("nav-arrow-right", "button-icon")}</button></div>
        <button class="a-quiet ob-skip" type="button" data-action="life-ob-finish">Hoppa över allt och börja direkt</button>`;
    case "help":
      return `${progress}<div class="modal-copy"><p class="a-eyebrow">Steg 1 av 5</p><h2 id="onboarding-title">Vad vill du att Aura hjälper till med?</h2><p>Välj så många du vill. Det styr vad som syns — resten kan slås på senare.</p></div>${chips("helpWith", HELP_WITH, d.helpWith, "checkbox")}${nav("Fortsätt")}`;
    case "hard":
      return `${progress}<div class="modal-copy"><p class="a-eyebrow">Steg 2 av 5</p><h2 id="onboarding-title">Vad gör vardagen svår?</h2><p>Aura anpassar hur mycket den lägger i dagen och hur den hjälper dig igång.</p></div>${chips("hardThings", HARD_THINGS, d.hardThings, "checkbox")}${nav("Fortsätt")}`;
    case "rhythm":
      return `${progress}<div class="modal-copy"><p class="a-eyebrow">Steg 3 av 5</p><h2 id="onboarding-title">Din rytm</h2><p>Aura planerar aldrig in något utanför dina vakna timmar och lämnar alltid luft. Okänt är okej.</p></div>
        <div class="field-grid"><label class="field"><span>Brukar vakna</span><input name="wake" type="time" value="${esc(d.wake)}" /></label><label class="field"><span>Brukar somna</span><input name="sleep" type="time" value="${esc(d.sleep)}" /></label><label class="field"><span>Jobbar från <small>om fasta tider</small></span><input name="workStart" type="time" value="${esc(d.workStart)}" /></label><label class="field"><span>Jobbar till</span><input name="workEnd" type="time" value="${esc(d.workEnd)}" /></label></div>
        <fieldset class="chip-field"><legend>Rutiner att börja med</legend>${chips("routines", [["morning", "Morgon"], ["evening", "Kväll"], ["leaving", "Gå hemifrån"], ["sunday", "Söndagsreset"]], d.routines, "checkbox")}</fieldset>
        ${d.helpWith.includes("cycle") ? `<details class="disclosure"><summary>Cykel <span>frivilligt</span></summary><div class="field-grid"><label class="field"><span>Genomsnittlig cykel</span><input name="cycleLength" type="number" min="21" max="45" value="${d.cycleLength}" inputmode="numeric" /></label><label class="field"><span>Menslängd</span><input name="periodLength" type="number" min="2" max="10" value="${d.periodLength}" inputmode="numeric" /></label></div></details>` : ""}
        ${nav("Fortsätt")}`;
    case "pulse":
      return `${progress}<div class="modal-copy"><p class="a-eyebrow">Steg 4 av 5 · Aura Pulse</p><h2 id="onboarding-title">Hur är läget just nu?</h2><p>Två tryck. Aura väljer lagom stora saker efter det.</p></div>
        <div class="pulse-grid"><div><p class="a-group-label"><span>Ork</span></p>${scale("energy", { title: "Ork", low: "Slut", high: "Mycket" }, d.pulse.energy)}</div><div><p class="a-group-label"><span>Humör</span></p>${scale("mood", { title: "Humör", low: "Tungt", high: "Ljust" }, d.pulse.mood)}</div></div>
        ${nav("Fortsätt")}`;
    case "dump":
      return `${progress}<div class="modal-copy"><p class="a-eyebrow">Steg 5 av 5 · Töm huvudet</p><h2 id="onboarding-title">Vad snurrar i huvudet?</h2><p>Skriv allt på en gång. Aura sorterar det till din första dag.</p></div>
        <label class="sr-only" for="ob-dump">Allt på en gång</label><textarea id="ob-dump" name="dump" rows="5" maxlength="4000" placeholder="”Handla mjölk, ring vårdcentralen, tvätta i helgen, betala hyran senast fredag”">${esc(d.dump)}</textarea>
        ${nav("Skapa min dag")}`;
    default: {
      const life = view();
      const b = life ? It.dayBuckets(life, today()) : { must: [], good: [] };
      const n = b.must.length + b.good.length;
      const name = String(state().profile?.name || "");
      return `<div class="modal-copy"><p class="a-eyebrow">Klart</p><h2 id="onboarding-title">${name ? `Här är din dag, <em>${esc(name)}</em>.` : "Här är din dag."}</h2><p>${n ? `${plural(n, "sak", "saker")} ligger i dag. Aura visar en i taget — resten väntar tryggt.` : "Dagen är lugn. Lägg till något när du vill — eller låt den vara."}</p></div>
        ${env.characterDialogue("klara", "Jag håller i dagen. Titta på Just nu när du undrar vad som är nästa sak.", "Klara · vardagscoach")}
        <div class="ob-nav"><button class="button button-primary button-wide" type="submit">Till Idag ${icon("nav-arrow-right", "button-icon")}</button></div>`;
    }
  }
}

function renderOnboarding() {
  const dialog = onboardingDialog();
  if (!dialog || !ui.onboarding) return;
  dialog.innerHTML = `<form method="dialog" id="life-onboarding-form" class="modal-card onboarding-card" data-step="${STEPS[ui.onboarding.step]}">${onboardingStep()}</form>`;
  if (ui.onboarding.step > 0) requestAnimationFrame(() => dialog.querySelector("#onboarding-title")?.focus?.({ preventScroll: true }));
}

function readOnboarding(form) {
  if (!form || !ui.onboarding) return;
  const d = ui.onboarding.data;
  const data = new FormData(form);
  const step = STEPS[ui.onboarding.step];
  const clockOr = (value, fallback) => (/^\d{2}:\d{2}$/.test(String(value || "")) ? String(value) : fallback);
  if (step === "welcome") d.name = String(data.get("name") || "").trim().slice(0, 40);
  if (step === "help") d.helpWith = data.getAll("helpWith").map(String);
  if (step === "hard") d.hardThings = data.getAll("hardThings").map(String);
  if (step === "rhythm") {
    d.wake = clockOr(data.get("wake"), d.wake);
    d.sleep = clockOr(data.get("sleep"), d.sleep);
    d.workStart = clockOr(data.get("workStart"), "");
    d.workEnd = clockOr(data.get("workEnd"), "");
    d.routines = data.getAll("routines").map(String);
    if (data.has("cycleLength")) d.cycleLength = Number(data.get("cycleLength")) || 28;
    if (data.has("periodLength")) d.periodLength = Number(data.get("periodLength")) || 5;
  }
  if (step === "dump") d.dump = String(data.get("dump") || "");
}

/** Everything gathered, applied once: profile, preferences, routines, pulse and the first dump. */
function finishOnboarding() {
  const s = state();
  const d = ui.onboarding?.data || {};
  const now = new Date();
  const key = today(now);
  ensureLife(s, now);
  const light = (d.hardThings || []).some((h) => ["energy", "toomuch"].includes(h));
  const helpWith = d.helpWith || [];
  const patch = { wake: d.wake || "07:00", sleep: d.sleep || "23:00", workStart: d.workStart || "", workEnd: d.workEnd || "", helpWith, hardThings: d.hardThings || [], density: light ? "light" : "balanced", modules: { cycle: helpWith.includes("cycle"), reflection: helpWith.includes("reflection") } };
  const ops = [{ op: "prefs.set", patch }];
  for (const kind of d.routines || []) {
    const template = A.routines.template(kind);
    if (template && !s.life.routines.some((r) => r.kind === kind)) ops.push({ op: "routine.add", routine: template });
  }
  if (d.dump && d.dump.trim()) {
    for (const c of A.parse.parse(view(now), d.dump, now).candidates) {
      const cand = { ...c };
      if (cand.kind === "event" && !cand.time) cand.kind = "task";
      if (!cand.date && !cand.dueDate && ["task", "admin", "reminder"].includes(cand.kind) && !cand.recur) cand.date = key;
      ops.push(A.parse.toOp(cand, { today: key, source: "onboarding" }));
    }
  }
  commitLife(s, ops, { now, system: true });
  if (d.pulse && Object.keys(d.pulse).length) savePulse(d.pulse, "", now);
  env.finishOnboarding({ name: d.name || "", cycleLength: d.cycleLength || 28, periodLength: d.periodLength || 5 });
}

/* ---------------- pulse ---------------- */

function savePulse(values, note = "", now = new Date()) {
  const s = state();
  const log = getTodayLog(s, now);
  const pulse = { at: now.toISOString() };
  for (const field of ["energy", "mood", "stress", "sleep"]) if (values[field]) pulse[field] = values[field];
  if (note) pulse.note = note.slice(0, 200);
  const patch = { pulse, pulses: [...(Array.isArray(log.pulses) ? log.pulses : []), pulse].slice(-12) };
  if (pulse.energy) patch.energy = pulse.energy * 2;
  if (pulse.mood) patch.mood = pulse.mood;
  if (pulse.stress) patch.stress = pulse.stress;
  if (pulse.sleep) patch.sleepQuality = pulse.sleep <= 1 ? "rough" : pulse.sleep === 2 ? "restless" : pulse.sleep === 3 ? "okay" : "good";
  setTodayLog(s, patch, now);
  return pulse;
}

/* ---------------- drag to reorder (Min dag) ---------------- */

export function handlePointerDown(event) {
  const handle = event.target.closest?.(".a-drag");
  if (!handle) return false;
  const rowEl = handle.closest(".a-row");
  const listEl = rowEl?.parentElement;
  if (!rowEl || !listEl) return false;
  event.preventDefault();
  const rows = [...listEl.children];
  const from = rows.indexOf(rowEl);
  const rects = rows.map((r) => r.getBoundingClientRect());
  const startY = event.clientY;
  let to = from;
  rowEl.classList.add("is-dragging");
  listEl.classList.add("is-sorting");
  try { handle.setPointerCapture(event.pointerId); } catch { /* not every browser allows it */ }
  const move = (e) => {
    const dy = e.clientY - startY;
    rowEl.style.transform = `translateY(${dy}px)`;
    const center = rects[from].top + rects[from].height / 2 + dy;
    let index = rects.findIndex((r) => center < r.top + r.height / 2);
    if (index === -1) index = rows.length;
    to = index > from ? index - 1 : index;
    rows.forEach((r, i) => {
      if (r === rowEl) return;
      const h = rects[from].height;
      const shift = from < to && i > from && i <= to ? -h : from > to && i >= to && i < from ? h : 0;
      r.style.transform = shift ? `translateY(${shift}px)` : "";
    });
  };
  const end = () => {
    handle.removeEventListener("pointermove", move);
    rows.forEach((r) => { r.style.transform = ""; });
    rowEl.classList.remove("is-dragging");
    listEl.classList.remove("is-sorting");
    if (to !== from) {
      const ids = rows.map((r) => r.dataset.id);
      const [moved] = ids.splice(from, 1);
      ids.splice(to, 0, moved);
      commit([{ op: "item.reorder", ids }], { quiet: true });
    }
  };
  handle.addEventListener("pointermove", move);
  handle.addEventListener("pointerup", end, { once: true });
  handle.addEventListener("pointercancel", end, { once: true });
  return true;
}

/* ---------------- actions ---------------- */

function go(route) {
  closeSheet();
  env.go(route);
}

function scrollTo(selector) {
  requestAnimationFrame(() => document.querySelector(selector)?.scrollIntoView({ behavior: "smooth", block: "start" }));
}

function ask(query, now = new Date()) {
  ui.talk = [...ui.talk, { query, answer: answer(query, now) }].slice(-6);
}

function runPatternAction(key, index, now) {
  const obs = A.patterns.observations(view(now), now).find((o) => o.key === key);
  const action = obs?.actions?.[index];
  if (action) commit([...(action.ops || []), { op: "pattern.dismiss", key }], { message: "Maja kommer ihåg det" });
}

/** Returns true when the click was an everyday action. */
export function handleClick(target) {
  const action = target.dataset.action || "";
  if (!action.startsWith("life-")) return false;
  const now = new Date();
  const s = state();
  ensureLife(s, now);
  const id = target.dataset.id;
  const key = today(now);
  switch (action) {
    case "life-undo": undo(); return true;
    case "life-close-sheet": closeSheet(); return true;
    case "life-done": {
      const rowEl = target.closest(".a-row");
      if (rowEl?.classList.contains("is-completing")) return true;
      if (rowEl && !target.closest("dialog")) {
        rowEl.classList.add("is-completing");
        setTimeout(() => completeItem(id), 360);
      } else completeItem(id, now);
      return true;
    }
    case "life-reopen": commit([{ op: "item.reopen", id }], { keepSheet: ui.sheet?.name === "item", message: "Tillbaka på listan" }); return true;
    case "life-open-item": openSheet("item", { id }); return true;
    case "life-do":
      ui.override = null;
      commit([{ op: "day.focus", date: key, itemId: id }], { quiet: true });
      if (env.route() !== "today") go("today");
      scrollTo("#now-panel");
      return true;
    case "life-pause": commit([{ op: "day.focus", date: key, itemId: null }], { quiet: true }); return true;
    case "life-else": ui.override = null; commit([{ op: "day.decline", date: key, itemId: id }], { quiet: true }); return true;
    case "life-easier": {
      const rec = E.whatNow(view(now), now, { easierThan: id });
      if (!rec) { env.toast("Det här är redan det lättaste just nu"); return true; }
      if (!rec.tiny) commitLife(s, [{ op: "day.decline", date: key, itemId: id }], { now });
      ui.override = { rec, at: Date.now() };
      env.persist();
      env.render();
      return true;
    }
    case "life-notnow": {
      ui.override = null;
      const ops = [{ op: "day.quiet", date: key, until: U.minutesOfDay(now) + 45 }];
      if (id) ops.unshift({ op: "day.decline", date: key, itemId: id });
      commit(ops, { quiet: true });
      env.toast("Aura är tyst en stund. Allt finns i Min dag.");
      return true;
    }
    case "life-ask-next": commit([{ op: "day.quiet", date: key, until: null }], { quiet: true }); return true;
    case "life-whatnow": {
      const day = M.getDay(s.life, key);
      if (day.quietUntil != null) commitLife(s, [{ op: "day.quiet", date: key, until: null }], { now, system: true });
      ui.override = null;
      ui.highlightNow = true;
      env.persist();
      if (env.route() !== "today") env.go("today");
      else env.render();
      scrollTo("#now-panel");
      return true;
    }
    case "life-talk": go("coach"); requestAnimationFrame(() => { scrollTo("#ask-panel"); document.querySelector("#life-ask-input")?.focus({ preventScroll: true }); }); return true;
    case "life-talk-clear": ui.talk = []; env.render(); return true;
    case "life-capture": ui.capture = { text: "", result: null }; openSheet("capture"); return true;
    case "life-add": ui.add = { kind: "", when: "" }; openSheet("add"); return true;
    case "life-pulse": {
      const p = pulseToday(s, now);
      ui.pulse = {};
      if (p) for (const f of ["energy", "mood", "stress", "sleep"]) if (p[f]) ui.pulse[f] = p[f];
      openSheet("pulse");
      return true;
    }
    case "life-pulse-pick": {
      const field = target.dataset.field;
      const value = Number(target.dataset.value);
      if (ui.onboarding && onboardingDialog()?.open) {
        const pulse = ui.onboarding.data.pulse;
        if (pulse[field] === value) delete pulse[field];
        else pulse[field] = value;
        renderOnboarding();
        return true;
      }
      if (ui.pulse[field] === value) delete ui.pulse[field];
      else ui.pulse[field] = value;
      const note = document.querySelector("#pulse-note")?.value || "";
      refreshSheet();
      const input = document.querySelector("#pulse-note");
      if (input) input.value = note;
      return true;
    }
    case "life-capture-restart": ui.capture = { text: ui.capture?.text || "", result: null }; refreshSheet(); return true;
    case "life-capture-inbox": {
      const text = (document.querySelector("#capture-text")?.value || ui.capture?.text || "").trim();
      if (!text) { env.toast("Skriv något först"); return true; }
      commit([{ op: "item.add", item: { kind: "note", title: text.slice(0, 140), note: text.length > 140 ? text : "", status: "inbox", source: "dump" } }], { message: "Sparat i inkorgen" });
      ui.capture = null;
      return true;
    }
    case "life-capture-anyway":
      commit([{ op: "item.add", item: { kind: "note", title: (ui.capture?.text || "").slice(0, 140), status: "inbox", source: "dump" } }], { message: "Sparat i inkorgen" });
      ui.capture = null;
      return true;
    case "life-capture-ask": {
      const query = ui.capture?.text || "";
      ui.capture = null;
      ask(query, now);
      go("coach");
      scrollTo("#ask-panel");
      return true;
    }
    case "life-cand-remove":
      syncCandidates();
      if (ui.capture?.result) ui.capture.result.candidates = ui.capture.result.candidates.filter((c) => c.tempId !== target.dataset.temp);
      refreshSheet();
      return true;
    case "life-item-when": {
      const item = M.itemById(s.life, id);
      commit([{ op: "item.postpone", id, to: target.dataset.to }], { message: item ? `${item.title} → ${target.dataset.to === "later" ? "senare" : "i morgon"}` : "" });
      return true;
    }
    case "life-move-tomorrow": {
      const ids = String(target.dataset.ids || "").split(",").filter(Boolean);
      commit(ids.map((x) => ({ op: "item.postpone", id: x, to: "tomorrow" })), { message: `${plural(ids.length, "sak", "saker")} flyttade till i morgon` });
      ui.talk = [];
      env.render();
      return true;
    }
    case "life-item-drop": commit([{ op: "item.drop", id }], { message: "Släppt — den kommer inte tillbaka" }); return true;
    case "life-item-delete":
      if (ui.confirmDelete !== id) { ui.confirmDelete = id; refreshSheet(); return true; }
      ui.confirmDelete = null;
      commit([{ op: "item.delete", id }], { message: "Raderad" });
      return true;
    case "life-item-skip": commit([{ op: "item.skip", id }], { message: "Hoppas över den här gången" }); return true;
    case "life-item-split": {
      const item = M.itemById(s.life, id);
      if (item) commit([{ op: "item.split", id, first: `Börja på: ${item.title}`, minutes: Math.max(5, Math.round(item.minutes / 3)) }], { message: "En mindre första bit ligger först i dag" });
      return true;
    }
    case "life-item-move": {
      const item = M.itemById(s.life, id);
      const bucket = item ? It.classify(s.life, item, key) : null;
      const siblings = bucket ? It.dayBuckets(s.life, key)[bucket] || [] : [];
      const index = siblings.findIndex((x) => x.id === id);
      const to = index + Number(target.dataset.dir || 0);
      if (index < 0 || to < 0 || to >= siblings.length) return true;
      const ids = siblings.map((x) => x.id);
      [ids[index], ids[to]] = [ids[to], ids[index]];
      commit([{ op: "item.reorder", ids }], { keepSheet: true, quiet: true });
      return true;
    }
    case "life-admin-status": {
      const status = target.dataset.status;
      const patch = { adminStatus: status };
      if (status === "followup") patch.followUp = U.addDays(key, 3);
      commit([{ op: "item.update", id, patch }], { message: status === "waiting" ? "Väntar på svar" : status === "followup" ? "Följ upp om tre dagar" : "Behöver göras" });
      return true;
    }
    case "life-rebuild": openSheet("rebuild", { proposal: P.rebuild(view(now), now) }); return true;
    case "life-rebuild-apply": {
      const proposal = ui.sheet?.data?.proposal;
      if (!proposal?.ops?.length) { closeSheet(); return true; }
      const result = commit(proposal.ops, { message: `Dagen är ombyggd · ${proposal.moved.length} flyttade, ${proposal.added.length} intagna` });
      if (result.applied.length && proposal.moved.length) env.animal(`Jag flyttade ${plural(proposal.moved.length, "sak", "saker")} till lugnare dagar. Det som är kvar ryms.`, "Klara");
      return true;
    }
    case "life-mode": {
      const mode = target.dataset.mode || "";
      if (mode === "low" && M.getDay(s.life, key).mode !== "low") { go("low"); return true; }
      if (mode === "chaos") { go("chaos"); return true; }
      commit([{ op: "day.mode", date: key, mode }], { message: mode ? `Läge: ${MODE_LABELS[mode]}` : "Aura följer din vecka igen" });
      if (!mode && env.route() === "low") go("today");
      return true;
    }
    case "life-low-apply": {
      const plan = E.lowEnergyPlan(view(now), now);
      const result = commit(plan.ops, { message: `Dagen är mindre · ${plural(plan.moved.length, "sak", "saker")} flyttade` });
      if (result.applied.length) env.animal("Nu syns bara det nödvändiga. Allt annat har en ny plats — inget är borta.", "Klara");
      return true;
    }
    case "life-chaos-start": {
      const queue = E.chaosQueue(view(now), now);
      if (!queue.length) { env.toast("Inget att ta tag i just nu"); return true; }
      commit([{ op: "day.chaos", date: key, queue }], { quiet: true });
      return true;
    }
    case "life-chaos-done": completeItem(id, now); return true;
    case "life-chaos-skip": {
      const queue = (M.getDay(s.life, key).chaos?.queue || []).filter((x) => x !== id);
      commit([{ op: "day.chaos", date: key, queue: [...queue, id] }], { quiet: true });
      return true;
    }
    case "life-chaos-stop": commit([{ op: "day.chaos", date: key, queue: null }], { quiet: true }); go("today"); return true;
    case "life-evening-move": commit([{ op: "item.postpone", id, to: target.dataset.to === "later" ? "later" : "tomorrow" }]); return true;
    case "life-evening-skip": commit([{ op: "item.skip", id }]); return true;
    case "life-evening-drop": commit([{ op: "item.drop", id }]); return true;
    case "life-evening-moveall": {
      const ops = A.evening.moveAllOps(view(now), now);
      commit(ops, { message: `${plural(ops.length, "sak har", "saker har")} fått en ny dag` });
      return true;
    }
    case "life-evening-finish": {
      const result = commit([{ op: "day.evening", date: key, done: true }], { quiet: true });
      if (result.applied.length) {
        env.rememberMoment({ id: `evening:${key}`, title: "Kvällen är stängd", kind: "reflection", characterId: "maja", route: "insights" });
        env.persist();
        env.render();
        env.animal("Kvällen är stängd. Allt har en plats — du behöver inte bära det i natt.", "Maja");
      }
      return true;
    }
    case "life-review-done": commit([{ op: "meta.review", week: target.dataset.week }], { quiet: true }); env.animal("Veckan är genomgången. Jag sparar det som hände — du kan släppa det.", "Maja"); return true;
    case "life-suggest-dismiss": commit([{ op: "day.dismiss", date: key, key: target.dataset.key }], { quiet: true }); return true;
    case "life-notify": {
      const note = A.notify.candidates(view(now), now).find((n) => n.key === target.dataset.key);
      const chosen = note?.actions?.[Number(target.dataset.index)];
      if (!chosen) return true;
      if (chosen.ops) commit([...chosen.ops, { op: "day.dismiss", date: key, key: note.key }]);
      else if (chosen.dismiss) commit([{ op: "day.dismiss", date: key, key: note.key }], { quiet: true });
      if (chosen.nav) go(chosen.nav.view === "evening" ? "evening" : "life");
      return true;
    }
    case "life-pattern": runPatternAction(target.dataset.key, Number(target.dataset.index), now); return true;
    case "life-pattern-dismiss": commit([{ op: "pattern.dismiss", key: target.dataset.key }, { op: "day.dismiss", date: key, key: "pattern" }], { message: "Maja släpper det" }); return true;
    case "life-tab":
      ui.lifeTab = target.dataset.tab || "inbox";
      if (target.dataset.go === "life" && env.route() !== "life") go("life");
      else env.render();
      return true;
    case "life-inbox-today": commit([{ op: "item.process", id, patch: { date: key } }], { message: "Flyttad till i dag" }); return true;
    case "life-inbox-later": commit([{ op: "item.process", id, patch: { date: "" } }], { message: "Sparad till senare" }); return true;
    case "life-routine-open": openSheet("routine", { id }); return true;
    case "life-routine-edit": openSheet("routine", { id, edit: true }); return true;
    case "life-routine-check": commit([{ op: "routine.check", routineId: target.dataset.routine, stepId: target.dataset.step, date: key, done: target.dataset.done === "true" }], { keepSheet: true, quiet: true }); return true;
    case "life-routine-skip": commit([{ op: "routine.skip", routineId: target.dataset.routine, stepId: target.dataset.step, date: key, skip: target.dataset.skip === "true" }], { keepSheet: true, quiet: true }); return true;
    case "life-routine-variant": commit([{ op: "routine.variant", routineId: id, date: key, variant: target.dataset.variant }], { keepSheet: true, quiet: true }); return true;
    case "life-routine-step-remove": {
      const routine = M.routineById(s.life, id);
      if (routine) commit([{ op: "routine.update", id, patch: { steps: routine.steps.filter((_, i) => i !== Number(target.dataset.index)) } }], { keepSheet: true, quiet: true });
      return true;
    }
    case "life-routine-add": {
      const template = A.routines.template(target.dataset.kind);
      if (template) commit([{ op: "routine.add", routine: template }], { message: `Rutinen ${template.name} är tillagd` });
      return true;
    }
    case "life-routine-remove": commit([{ op: "routine.delete", id }], { message: "Rutinen är borttagen" }); return true;
    case "life-project-open": openSheet("project", { id }); return true;
    case "life-project-status": commit([{ op: "project.update", id, patch: { status: target.dataset.status } }], { keepSheet: target.dataset.status !== "done", message: target.dataset.status === "done" ? "Projektet är klart" : target.dataset.status === "paused" ? "Pausat" : "Återupptaget" }); return true;
    case "life-event-new": openSheet("event", {}); return true;
    case "life-event-open": openSheet("event", { id }); return true;
    case "life-event-delete": commit([{ op: "event.delete", id }], { message: "Borttagen" }); return true;
    case "life-ask-chip":
      ask(target.dataset.text || "", now);
      env.render();
      requestAnimationFrame(() => document.querySelector("#ask-result")?.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
      return true;
    case "life-ob-back":
      readOnboarding(target.closest("form"));
      ui.onboarding.step = Math.max(0, ui.onboarding.step - 1);
      renderOnboarding();
      return true;
    case "life-ob-skip": {
      readOnboarding(target.closest("form"));
      if (STEPS[ui.onboarding.step] === "dump") ui.onboarding.data.dump = "";
      ui.onboarding.step += 1;
      if (STEPS[ui.onboarding.step] === "ready") finishOnboarding();
      renderOnboarding();
      return true;
    }
    case "life-ob-finish":
      readOnboarding(target.closest("form"));
      // Skipping everything means nothing is presumed: no routines, no plan.
      if (ui.onboarding.step === 0) ui.onboarding.data.routines = [];
      finishOnboarding();
      ui.onboarding = null;
      onboardingDialog()?.close();
      env.render({ scroll: "top" });
      return true;
    default:
      return false;
  }
}

/** select/time changes inside the capture review. */
export function handleChange(target) {
  const kind = target.dataset.change || "";
  if (!kind.startsWith("life-cand")) return false;
  const c = ui.capture?.result?.candidates?.find((x) => x.tempId === target.dataset.temp);
  if (!c) return true;
  syncCandidates();
  if (kind === "life-cand-kind") {
    c.kind = target.value;
    c.review = c.kind === "event" ? !c.time : c.kind === "reminder" && !c.date && !c.dueDate;
    if (c.kind === "shopping" && !c.category) c.category = A.parse.productCategory(c.title) || "other";
    if (c.kind === "admin") c.adminStatus = "action";
    if (c.kind === "chore" && !c.recur) c.recur = { unit: "week", every: 1, weekdays: [] };
    refreshSheet();
  } else if (kind === "life-cand-when") {
    c.date = target.value;
    if (c.kind === "reminder" && c.date) c.review = false;
    refreshSheet();
  } else if (kind === "life-cand-time") {
    c.time = target.value;
    if (c.kind === "event" && c.time) c.review = false;
  }
  return true;
}

function addParsed(text, { forceKind = "", inbox = false, defaultToday = false, when = "", message = "" } = {}, now = new Date()) {
  const key = today(now);
  const life = view(now);
  let cands = A.parse.parse(life, text, now).candidates;
  if (!cands.length || (forceKind && forceKind !== "shopping" && cands.length > 1)) cands = [A.parse.quick(life, text, now)];
  const ops = cands.map((c) => {
    const cand = { ...c };
    if (forceKind) {
      cand.kind = forceKind;
      if (forceKind === "shopping" && !cand.category) cand.category = A.parse.productCategory(cand.title) || "other";
      if (forceKind === "admin") cand.adminStatus = cand.adminStatus || "action";
      if (forceKind === "chore" && !cand.recur) cand.recur = { unit: "week", every: 1, weekdays: [] };
    }
    if (when === "none") cand.date = "";
    else if (when) cand.date = A.apply.resolveWhen(when, key);
    else if (defaultToday && !cand.date && !cand.dueDate && !["note", "idea", "shopping", "event"].includes(cand.kind) && !cand.recur) cand.date = key;
    if (cand.kind === "event" && !cand.time) cand.kind = "task";
    return A.parse.toOp(cand, { today: key, inbox, source: "quick" });
  });
  const titles = cands.map((c) => c.title);
  commit(ops, { message: message || (titles.length === 1 ? `Tillagd: ${titles[0]}` : `${titles.length} saker tillagda`), keepSheet: ui.sheet?.name === "project", now });
}

/** Returns true when the form was an everyday form. */
export function handleSubmit(form, data) {
  const id = form.id || "";
  if (!id.startsWith("life-")) return false;
  const now = new Date();
  const s = state();
  ensureLife(s, now);
  const key = today(now);
  const text = String(data.get("text") || "").trim();
  switch (id) {
    case "life-quick-form": if (text) addParsed(text, { defaultToday: true }, now); return true;
    case "life-inbox-form": if (text) addParsed(text, { inbox: true, message: "Sparat i inkorgen" }, now); return true;
    case "life-shop-form": if (text) addParsed(text, { forceKind: "shopping" }, now); return true;
    case "life-admin-form": if (text) addParsed(text, { forceKind: "admin" }, now); return true;
    case "life-add-form": {
      if (!text) return true;
      const kind = String(data.get("kind") || "");
      const when = String(data.get("when") || "");
      if (kind === "event") {
        const c = A.parse.quick(view(now), text, now);
        if (!c.time) { env.toast("En fast tid behöver ett klockslag — t.ex. ”tandläkare torsdag 14:00”"); return true; }
        const date = when && when !== "none" ? A.apply.resolveWhen(when, key) : c.date || key;
        commit([A.parse.toOp({ ...c, kind: "event", date }, { today: key, source: "quick" })], { message: `${c.title} är inlagd` });
        return true;
      }
      addParsed(text, { forceKind: kind, when, defaultToday: !when }, now);
      return true;
    }
    case "life-chore-form": {
      if (!text) return true;
      commit([{ op: "item.add", item: { kind: "chore", title: A.parse.cleanTitle(text), recur: recurFrom(String(data.get("repeat") || "week")), dueDate: key, category: "home", minutes: 20, source: "manual" } }], { message: `Aura påminner om ${text}` });
      return true;
    }
    case "life-project-form": if (text) commit([{ op: "project.add", project: { title: text } }], { message: `Projektet ${text} är skapat` }); return true;
    case "life-project-edit": commit([{ op: "project.update", id: form.dataset.id, patch: { outcome: String(data.get("outcome") || "") } }], { keepSheet: true, message: "Målet är sparat" }); return true;
    case "life-step-form": {
      const projectId = form.dataset.project;
      if (text && projectId) commit([{ op: "item.add", item: { kind: "task", title: text, projectId, source: "manual" } }], { keepSheet: true, message: "Steget är tillagt" });
      return true;
    }
    case "life-capture-form":
      if (!text) { env.toast("Skriv något först"); return true; }
      ui.capture = { text, result: A.parse.parse(view(now), text, now) };
      refreshSheet();
      return true;
    case "life-review-form": {
      syncCandidates();
      const ops = (ui.capture?.result?.candidates || []).filter((c) => String(c.title || "").trim()).map((c) => {
        const cand = { ...c, title: c.title.trim() };
        if (cand.kind === "event" && !cand.time) cand.kind = "task";
        return A.parse.toOp(cand, { today: key, source: "dump" });
      });
      if (!ops.length) { closeSheet(); return true; }
      commit(ops, { message: `${plural(ops.length, "sak", "saker")} på plats` });
      ui.capture = null;
      env.animal(ops.length > 3 ? "Allt är sorterat. Du behöver inte hålla det i huvudet längre." : "Sparat. Jag säger till när det blir aktuellt.", "Klara");
      return true;
    }
    case "life-pulse-form": {
      const pulse = savePulse(ui.pulse, String(data.get("note") || "").trim(), now);
      ui.pulse = {};
      env.persist();
      closeSheet();
      env.render();
      if (pulse.energy && pulse.energy <= 2) env.animal("Tack för att du sa det. Vill du göra dagen mindre? Förslaget ligger under Idag — jag säger exakt vad som flyttas.", "Klara");
      else env.toast("Pulse sparad — dagen anpassar sig");
      return true;
    }
    case "life-item-form": {
      const itemId = form.dataset.id;
      const item = M.itemById(s.life, itemId);
      if (!item) return true;
      const date = String(data.get("date") || "");
      const patch = {
        title: String(data.get("title") || item.title).trim().slice(0, 140) || item.title,
        kind: String(data.get("kind") || item.kind),
        date,
        priority: String(data.get("priority") || ""),
        dueDate: String(data.get("dueDate") || ""),
        time: String(data.get("time") || ""),
        minutes: Number(data.get("minutes") || item.minutes),
        note: String(data.get("note") || "").slice(0, 1000),
      };
      const repeat = String(data.get("repeat") || "");
      if (repeat !== repeatValue(item.recur)) {
        const anchor = date || item.dueDate || key;
        patch.recur = recurFrom(repeat, U.weekday(anchor));
        if (patch.recur && !patch.dueDate) patch.dueDate = anchor;
      }
      if (data.has("category")) patch.category = String(data.get("category"));
      if (data.has("adminStatus")) { patch.adminStatus = String(data.get("adminStatus")); patch.followUp = String(data.get("followUp") || ""); }
      if (item.kind === "shopping") patch.staple = data.get("staple") === "on";
      if (patch.kind === "admin" && !patch.adminStatus) patch.adminStatus = "action";
      commit([{ op: item.status === "inbox" ? "item.process" : "item.update", id: itemId, patch }], { message: "Sparat" });
      return true;
    }
    case "life-event-form": {
      const title = String(data.get("title") || "").trim();
      if (!title) return true;
      const weekdays = data.getAll("weekday").map(Number);
      const event = { title, date: String(data.get("date") || key), start: String(data.get("start") || ""), end: String(data.get("end") || ""), away: data.get("away") === "on", recur: weekdays.length ? { weekdays } : null };
      if (!event.end && event.start) event.end = U.toClock((U.toMinutes(event.start) ?? 0) + 60);
      commit(form.dataset.id ? [{ op: "event.update", id: form.dataset.id, patch: event }] : [{ op: "event.add", event: { ...event, source: "manual" } }], { message: `${title} är inlagd` });
      return true;
    }
    case "life-routine-form": {
      const routine = M.routineById(s.life, form.dataset.id);
      if (!routine) return true;
      const steps = routine.steps.map((step, i) => ({ id: step.id, label: String(data.get(`step-${i}`) || step.label).trim() || step.label, minutes: Number(data.get(`minutes-${i}`)) || step.minutes, core: data.get(`optional-${i}`) !== "on" }));
      const extra = String(data.get("newStep") || "").trim();
      if (extra) steps.push({ label: extra, minutes: 5, core: true });
      commit([{ op: "routine.update", id: routine.id, patch: { name: String(data.get("name") || routine.name).trim() || routine.name, start: String(data.get("start") || ""), end: String(data.get("end") || ""), steps } }], { message: "Rutinen är sparad" });
      return true;
    }
    case "life-ask-form": {
      const query = String(data.get("query") || "").trim();
      if (!query) return true;
      ask(query, now);
      env.render();
      requestAnimationFrame(() => {
        document.querySelector("#ask-result")?.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        document.querySelector("#life-ask-input")?.focus({ preventScroll: true });
      });
      return true;
    }
    case "life-chaos-form": {
      const life = view(now);
      const cands = text ? A.parse.parse(life, text, now).candidates : [];
      const ops = cands.map((c) => {
        const cand = { ...c };
        if (cand.kind === "event" && !cand.time) cand.kind = "task";
        if (!cand.date && !cand.dueDate && ["task", "admin", "chore", "reminder"].includes(cand.kind) && !cand.recur) cand.date = key;
        return A.parse.toOp(cand, { today: key, source: "chaos" });
      });
      const added = ops.length ? commitLife(s, ops, { now }) : { ids: [] };
      const queue = E.chaosQueue(view(now), now, added.ids.length ? [...added.ids, ...It.dayBuckets(s.life, key).must.map((item) => item.id)] : undefined);
      if (!queue.length) { env.persist(); env.render(); env.toast(ops.length ? "Allt sparat — inget att göra i dag" : "Skriv något först"); return true; }
      commit([{ op: "day.chaos", date: key, queue }], { quiet: true });
      return true;
    }
    case "life-evening-form": {
      if (!text) return true;
      const life = view(now);
      const cands = A.parse.parse(life, text, now).candidates;
      const ops = (cands.length ? cands : [A.parse.quick(life, text, now)]).map((c) => A.parse.toOp({ ...c, kind: c.kind === "event" && !c.time ? "task" : c.kind }, { today: key, inbox: true, source: "evening" }));
      commit(ops, { message: `${plural(ops.length, "sak", "saker")} i inkorgen till i morgon` });
      return true;
    }
    case "life-intention-form": commit([{ op: "day.intention", date: U.addDays(key, 1), text }], { message: text ? "Sparat till i morgon" : "Borttaget" }); return true;
    case "life-onboarding-form": {
      readOnboarding(form);
      const step = STEPS[ui.onboarding.step];
      if (step === "ready") { ui.onboarding = null; onboardingDialog()?.close(); env.render({ scroll: "top" }); return true; }
      ui.onboarding.step += 1;
      if (STEPS[ui.onboarding.step] === "ready") finishOnboarding();
      renderOnboarding();
      return true;
    }
    default:
      return false;
  }
}
