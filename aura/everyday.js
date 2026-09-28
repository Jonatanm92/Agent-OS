/* Aura — vardagen i skogen.
 *
 * The everyday systems, drawn in Aura's own world: the one thing that
 * matters right now, today in three calm groups, Min dag with "Bygg om min
 * dag", Töm huvudet (brain dump), Låg energi, Kaos, Kvällsavslut, Veckan,
 * Livet (Maja's lists) and Fråga Aura.
 *
 * Who holds what:
 *  - Klara (vardagscoach) holds Just nu, Min dag, Töm huvudet, Låg energi and Kaos.
 *  - Maja (mönster & minnen) holds Livet, Kvällsavslut and Veckan.
 *  - Liv and Astrid keep their own worlds (Cykel, Mystik), untouched.
 *
 * Everything here is deterministic: the engine in core/ decides, a person
 * confirms, and every change can be undone. Nothing is sent anywhere.
 */

import { commitLife, engineView, ensureLife, moduleOn, undoLife } from "./life.js?v=1";

const A = globalThis.Aura;
const U = A.util, I = A.i18n, M = A.model, It = A.items, E = A.engine, P = A.planner;

let env = null;

/**
 * app.js hands over its helpers once. Keeping them here (instead of
 * importing app.js) avoids a circular module graph.
 */
export function configure(options) {
  env = options;
}

const ui = {
  override: null,        // "Något lättare": {rec, at}
  lifeTab: "inbox",
  sheet: null,           // {name, data}
  capture: null,         // {text, result}
  ask: null,             // {query, result}
  confirmDelete: null,   // item id waiting for a second tap
  lastMomentId: null,    // forest moment created by the last completion (undone with it)
};

/* ---------------- small helpers ---------------- */

const state = () => env.state();
const esc = (value) => env.escapeHTML(value);
const icon = (name, className = "") => env.icon(name, className);
const today = (now = new Date()) => U.dateKey(now);
const view = (now = new Date()) => engineView(state(), now);
const approx = (minutes) => `ca ${I.duration(minutes)}`;
const clock = (minutes) => U.toClock(minutes);

const KIND_LABELS = { task: "Uppgift", shopping: "Handla", admin: "Ärende", chore: "Hemmet", reminder: "Påminnelse", event: "Fast tid", note: "Anteckning", idea: "Idé" };
const SHOP_LABELS = { produce: "Frukt & grönt", dairy: "Mejeri", bread: "Bröd", meat: "Kött & fisk", pantry: "Skafferi", frozen: "Fryst", drinks: "Dryck", household: "Hushåll", hygiene: "Hygien", pharmacy: "Apotek", baby: "Barn", clothing: "Kläder", pets: "Husdjur", other: "Övrigt" };
const BUCKET_LABELS = { must: "Måste", good: "Bra om det hinns", later: "Kan vänta" };
const MODE_LABELS = { "": "Automatiskt", low: "Låg energi", chaos: "Kaos", recovery: "Återhämtning", work: "Arbetsdag", free: "Ledig dag", normal: "Vanlig dag" };
const WEEKDAYS = [[1, "Mån"], [2, "Tis"], [3, "Ons"], [4, "Tor"], [5, "Fre"], [6, "Lör"], [0, "Sön"]];
const MINUTE_CHOICES = [5, 10, 15, 20, 30, 45, 60, 90, 120];

function relDay(key, now = new Date()) {
  return key ? I.relativeDay(key, today(now)) : "";
}

function metaFor(item, now = new Date(), { showKind = true } = {}) {
  const key = today(now);
  const parts = [];
  if (showKind && item.kind !== "task") parts.push(KIND_LABELS[item.kind] || "");
  if (item.time) parts.push(`kl ${item.time}`);
  if (item.dueDate && item.recur) parts.push(item.dueDate <= key ? "dags nu" : `dags ${relDay(item.dueDate, now)}`);
  else if (item.dueDate) parts.push(item.dueDate < key ? `skulle ha varit klart ${relDay(item.dueDate, now)}` : `senast ${relDay(item.dueDate, now)}`);
  else if (item.date && item.date > key) parts.push(relDay(item.date, now));
  if (item.recur) parts.push(It.describeRecur(item.recur));
  if (item.kind === "shopping" && item.category && item.category !== "other") parts.push(SHOP_LABELS[item.category] || "");
  if (["task", "chore", "admin"].includes(item.kind) && item.minutes) parts.push(I.duration(item.minutes));
  if (item.forPerson) parts.push(`till ${item.forPerson}`);
  return parts.filter(Boolean).join(" · ");
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

/**
 * Commit ops, persist, re-render, and offer "Ångra". `quiet` skips the toast
 * (for actions whose result is plainly visible, like Gör det).
 */
function commit(ops, { message = "", quiet = false, keepSheet = false, now = new Date() } = {}) {
  const result = commitLife(state(), ops, { now });
  if (!result.applied.length) {
    if (result.skipped.length) env.toast("Det gick inte att ändra — saken finns inte längre");
    return result;
  }
  env.persist();
  if (!keepSheet) closeSheet();
  else refreshSheet();
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
  const result = commit([{ op: "item.done", id }], { message: `Klart: ${item.title}`, now });
  if (result.applied.length) {
    rememberDone(item, now);
    env.persist();
  }
  ui.override = null;
}

function itemRow(item, now = new Date(), { showKind = true, bucket = "" } = {}) {
  const meta = metaFor(item, now, { showKind });
  return `<li class="life-row" data-kind="${esc(item.kind)}"${bucket ? ` data-bucket="${bucket}"` : ""}>
    <button class="life-check" type="button" data-action="life-done" data-id="${esc(item.id)}" aria-label="Klart: ${esc(item.title)}">${icon("check-circle")}</button>
    <button class="life-row-main" type="button" data-action="life-open-item" data-id="${esc(item.id)}"><strong>${esc(item.title)}</strong>${meta ? `<small>${esc(meta)}</small>` : ""}</button>
  </li>`;
}

function emptyLine(text) {
  return `<p class="life-empty">${esc(text)}</p>`;
}

function guide(characterId, text, label) {
  return env.characterDialogue(characterId, text, label);
}

function worldPage(pageClass, worldPath, content) {
  return `<div class="page ${pageClass} world-page" style="--world-path:url('${worldPath}')">${content}</div>`;
}

/* ---------------- Idag: Just nu ---------------- */

function nowActions(rec) {
  const id = esc(rec.item.id);
  return `<div class="now-actions">
    <button class="button button-primary" type="button" data-action="life-do" data-id="${id}">Gör det ${icon("nav-arrow-right", "button-icon")}</button>
    <button class="button button-secondary" type="button" data-action="life-easier" data-id="${id}">Något lättare</button>
    <button class="button button-secondary" type="button" data-action="life-else" data-id="${id}">Något annat</button>
    <button class="button button-ghost" type="button" data-action="life-notnow" data-id="${id}">Inte nu</button>
  </div>`;
}

function nowShell(kind, { eyebrow, title, why = "", time = "", actions = "", calm = false, guideLine = "" }) {
  const klara = env.characters.klara;
  const energy = nowOptions.energy;
  return `<section class="forest-panel now-panel" id="now-panel" data-kind="${kind}" data-calm="${calm}" aria-labelledby="now-title" aria-live="polite">
    <div class="now-guide"><span class="now-guide-art" aria-hidden="true"><img src="${klara.asset}" alt="" /></span><span><strong>Klara · just nu</strong><small>${esc(guideLine || "En sak i taget. Resten väntar tryggt.")}</small></span></div>
    <div class="now-card light-clearing">
      <p class="eyebrow">${esc(eyebrow)}</p>
      <h2 id="now-title">${esc(title)}</h2>
      ${why ? `<p class="now-why">${esc(why)}</p>` : ""}
      ${time ? `<span class="now-time">${icon("clock")} ${esc(time)}</span>` : ""}
      ${actions}
    </div>
    <div class="now-energy"><p id="energy-title">Ork just nu <small>ett tryck räcker — dagen och Klaras råd anpassar sig</small></p>${energyOptions(energy)}</div>
  </section>`;
}

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

let nowOptions = {};

export function renderNowPanel(now = new Date(), options = {}) {
  nowOptions = options;
  const life = view(now);
  if (!life) return "";
  const card = E.nowCard(life, now);
  const hasAnything = life.items.some((item) => item.status === "open" || item.status === "inbox") || life.events.length;
  switch (card.type) {
    case "focus": {
      const since = clock(U.minutesOfDay(new Date(card.startedAt)));
      return nowShell("focus", {
        eyebrow: "Du gör nu",
        title: card.item.title,
        why: `Sedan ${since}. Stanna när den är klar — resten får vänta.`,
        time: approx(card.minutes),
        guideLine: "Jag håller resten åt dig.",
        actions: `<div class="now-actions"><button class="button button-primary" type="button" data-action="life-done" data-id="${esc(card.item.id)}">${icon("check-circle", "button-icon")} Klart</button><button class="button button-secondary" type="button" data-action="life-pause">Pausa</button></div>`,
      });
    }
    case "event":
      return nowShell("event", { eyebrow: "Nu pågår", title: card.event.title, why: `Till ${clock(card.until)}. Inget annat behöver göras under tiden.`, calm: true });
    case "soon":
      return nowShell("soon", { eyebrow: "Snart", title: `${card.event.title} om ${I.duration(card.startsIn)}`, why: "Ingen idé att börja på något nytt precis innan.", calm: true });
    case "leave": {
      const title = card.leaveIn <= 5 ? "Dags att gå nu" : `Du behöver gå om ${I.duration(card.leaveIn)}`;
      const also = card.also
        ? `<div class="now-also"><span>Hinner du: <strong>${esc(card.also.title)}</strong> · ${esc(approx(card.also.minutes))}</span><button class="button button-secondary" type="button" data-action="life-do" data-id="${esc(card.also.item.id)}">Gör det</button></div>`
        : "";
      return nowShell("leave", { eyebrow: "Snart iväg", title, why: `${card.event.title} börjar ${clock(card.event.start)}. Restiden är inräknad.`, actions: also });
    }
    case "quiet":
      return nowShell("quiet", {
        eyebrow: "Tyst en stund",
        title: "Aura håller tyst ett tag",
        why: "Du sa inte nu. När du vill ha nästa sak är den här.",
        calm: true,
        actions: `<div class="now-actions"><button class="button button-secondary" type="button" data-action="life-ask-next">Visa nästa sak</button></div>`,
      });
    case "windDown":
      return nowShell("windDown", {
        eyebrow: "Kvällsljus",
        title: "Dags att varva ner",
        why: "Det som inte blev gjort i dag får en plats i morgon eller senare.",
        calm: true,
        guideLine: "Resten tar vi i morgon.",
        actions: `<div class="now-actions">${card.routine ? `<button class="button button-secondary" type="button" data-action="life-routine-open" data-id="${esc(card.routine.routine.id)}">${esc(card.routine.routine.name)} · ${card.routine.remaining} steg</button>` : ""}<button class="button button-secondary" type="button" data-route="evening">Kvällsavslut</button></div>`,
      });
    case "routine": {
      const v = card.routine;
      return nowShell("routine", {
        eyebrow: "Rutin just nu",
        title: v.routine.name,
        why: v.variant === "short" ? `Kort version i dag · ${v.remaining} steg kvar` : `${v.remaining} steg kvar`,
        time: approx(v.minutesLeft),
        actions: `<div class="now-actions"><button class="button button-primary" type="button" data-action="life-routine-open" data-id="${esc(v.routine.id)}">Starta ${icon("nav-arrow-right", "button-icon")}</button><button class="button button-ghost" type="button" data-action="life-notnow">Inte nu</button></div>`,
      });
    }
    case "task": {
      const rec = currentRec(card, life);
      return nowShell("task", {
        eyebrow: rec.tiny ? "En liten början" : rec.bucket === "must" ? "Gör härnäst" : "Om du vill göra något",
        title: rec.title,
        why: I.msg(rec.reason),
        time: approx(rec.minutes),
        actions: nowActions(rec),
      });
    }
    case "rest":
      return nowShell("rest", { eyebrow: "Just nu", title: "Vila är det viktigaste nu", why: "Inget måste är kvar i dag. Allt annat har en plats senare.", calm: true, guideLine: "Du behöver inte fylla tiden." });
    default: {
      if (!hasAnything) {
        return nowShell("empty", {
          eyebrow: "Just nu",
          title: "Inget i planen än",
          why: "Skriv av dig det som snurrar, så sorterar Aura det till i dag, senare eller en lista.",
          calm: true,
          actions: `<div class="now-actions"><button class="button button-primary" type="button" data-action="life-capture">Töm huvudet ${icon("nav-arrow-right", "button-icon")}</button></div>`,
        });
      }
      const plan = card.plan;
      let why;
      if (plan.next && plan.minutesUntilNext != null) {
        why = plan.next.away ? `Du har ${I.duration(plan.minutesUntilNext)} innan du behöver gå.` : `Du har ${I.duration(plan.minutesUntilNext)} fritt innan ${plan.next.title}.`;
      } else {
        why = plan.nowMin >= 17 * 60 ? "Kvällen är din." : "Resten av dagen är fri.";
      }
      return nowShell("free", { eyebrow: "Just nu", title: "Inget brådskar", why, calm: true, guideLine: "Det är okej att bara vara." });
    }
  }
}

/* ---------------- Idag: suggestion and nudges ---------------- */

function renderSuggestion(life, now) {
  const notes = A.notify ? A.notify.candidates(life, now) : [];
  if (notes.length) {
    const note = notes[0];
    const buttons = note.actions.map((action, index) => `<button class="button ${index ? "button-ghost" : "button-secondary"}" type="button" data-action="life-notify" data-key="${esc(note.key)}" data-index="${index}">${esc(I.msg(action.label))}</button>`).join("");
    return `<section class="life-suggest light-clearing" aria-label="Att ta ställning till"><p>${esc(I.msg(note.text))}</p><div class="life-suggest-actions">${buttons}</div></section>`;
  }
  const s = E.suggestion(life, now);
  if (!s) return "";
  const dismiss = `<button class="button button-ghost" type="button" data-action="life-suggest-dismiss" data-key="${esc(s.key)}">Nej tack</button>`;
  const line = (text, primary) => `<section class="life-suggest light-clearing" aria-label="Förslag"><p>${esc(text)}</p><div class="life-suggest-actions">${primary}${dismiss}</div></section>`;
  switch (s.kind) {
    case "mode":
      return s.mode === "chaos"
        ? line("Mycket på en gång? Vi kan ta en sak i taget och gömma resten en stund.", `<button class="button button-secondary" type="button" data-route="chaos">Ta en sak i taget</button>`)
        : line("Lite ork i dag? Vi kan göra dagen mindre och säga exakt vad som flyttas.", `<button class="button button-secondary" type="button" data-route="low">Gör dagen mindre</button>`);
    case "evening":
      return line("Två minuter för kvällsavslut? Du bestämmer vad som händer med det som inte hanns.", `<button class="button button-secondary" type="button" data-route="evening">Kvällsavslut</button>`);
    case "review":
      return line("Veckan är slut. Vill du titta tillbaka en liten stund med Maja?", `<button class="button button-secondary" type="button" data-route="week">Veckan</button>`);
    case "inbox":
      return line(`${s.n} saker ligger i inkorgen. De väntar tills du vill.`, `<button class="button button-secondary" type="button" data-action="life-tab" data-tab="inbox" data-go="life">Titta</button>`);
    case "pattern": {
      const obs = s.observation;
      const actions = (obs.actions || []).map((action, index) => `<button class="button button-secondary" type="button" data-action="life-pattern" data-key="${esc(obs.key)}" data-index="${index}">${esc(I.msg(action.label))}</button>`).join("");
      return `<section class="life-suggest light-clearing" aria-label="Maja märkte något"><p><strong>Maja märkte något.</strong> ${esc(I.msg(obs.text))}</p><div class="life-suggest-actions">${actions}<button class="button button-ghost" type="button" data-action="life-pattern-dismiss" data-key="${esc(obs.key)}">Det stämmer inte</button></div></section>`;
    }
    default:
      return "";
  }
}

/* ---------------- Idag: today at a glance ---------------- */

function bucketBlock(bucket, items, now, limit) {
  if (!items.length) return "";
  const shown = limit ? items.slice(0, limit) : items;
  const more = items.length - shown.length;
  return `<div class="bucket" data-bucket="${bucket}"><div class="bucket-head"><h3>${BUCKET_LABELS[bucket]}</h3><span>${items.length}</span></div><ul class="life-list">${shown.map((item) => itemRow(item, now, { bucket })).join("")}</ul>${more > 0 ? `<button class="text-button life-more" type="button" data-route="day">+ ${more} till ${icon("nav-arrow-right")}</button>` : ""}</div>`;
}

function quickAddForm(placeholder = "Lägg till något i dag…") {
  return `<form class="quick-add" id="life-quick-form" autocomplete="off"><label class="sr-only" for="life-quick-input">Lägg till</label><input id="life-quick-input" name="text" maxlength="200" placeholder="${esc(placeholder)}" /><button class="button button-primary" type="submit" aria-label="Lägg till">${icon("plus", "button-icon")}</button></form>`;
}

function loadLine(plan) {
  const planned = plan.mustMinutes + plan.goodMinutes;
  if (!plan.buckets.must.length && !plan.buckets.good.length) return "Inget inplanerat — dagen har luft.";
  if (planned > plan.budget) return `Mer än dagen rymmer (${I.duration(planned)} planerat, ungefär ${I.duration(plan.budget)} ryms). Bygg om dagen så väljer Aura.`;
  if (planned > plan.budget * 0.8) return "Dagen är ganska full, men det går ihop.";
  return `Det finns luft kvar · ungefär ${I.duration(Math.max(0, plan.budget - planned))} att röra sig med.`;
}

export function renderTodayGlance(now = new Date()) {
  const life = view(now);
  if (!life) return "";
  const plan = P.planDay(life, now);
  const b = plan.buckets;
  const key = plan.dateKey;
  const fixed = P.fixedFor(life, key).fixed.filter((f) => f.end > plan.nowMin && f.kind !== "work");
  const next = fixed[0];
  const doneCount = It.dayBuckets(life, key).done.length;
  const empty = !b.must.length && !b.good.length && !b.later.length;
  return `<section class="forest-panel glance-panel" aria-labelledby="glance-title">
    <div class="section-heading"><div><p class="eyebrow">Idag${doneCount ? ` · ${doneCount} klart` : ""}</p><h2 id="glance-title">Det här ryms i dag</h2></div><button class="text-button" type="button" data-route="day">Hela dagen ${icon("nav-arrow-right")}</button></div>
    <p class="glance-load">${esc(loadLine(plan))}</p>
    ${next ? `<p class="glance-next">${icon("calendar")} <span><strong>${esc(next.title)}</strong> ${clock(next.start)}${next.away ? " · restid inräknad" : ""}</span></p>` : ""}
    ${renderSuggestion(life, now)}
    ${empty ? emptyLine("Inget för i dag ännu. Lägg till en sak nedanför eller töm huvudet.") : `<div class="glance-buckets">${bucketBlock("must", b.must, now, 3)}${bucketBlock("good", b.good, now, 3)}${bucketBlock("later", b.later, now, 2)}</div>`}
    ${quickAddForm()}
  </section>`;
}

export function renderQuickActions(now = new Date()) {
  const life = view(now);
  const hour = now.getHours();
  const weekday = now.getDay();
  const items = [
    { action: "life-capture", icon: "journal-page", title: "Töm huvudet", detail: "Skriv allt, Aura sorterar" },
    { route: "low", icon: "battery", title: "Låg energi", detail: "Gör dagen mindre" },
    { route: "chaos", icon: "wind", title: "Allt på en gång", detail: "En sak i taget" },
    hour >= 16
      ? { route: "evening", icon: "half-moon", title: "Kvällsavslut", detail: "Två minuter, sedan vila" }
      : { route: "day", icon: "sun-light", title: "Min dag", detail: "Bygg om om det behövs" },
    weekday === 0 || weekday === 1
      ? { route: "week", icon: "stats-up-square", title: "Veckan", detail: "Titta tillbaka en stund" }
      : { action: "life-open-ask", icon: "search", title: "Fråga Aura", detail: "Svar ur din egen plan" },
  ];
  const mode = life ? M.getDay(life, today(now)).mode : "";
  return `<section class="forest-panel quick-panel" aria-labelledby="quick-title">
    <div class="section-heading"><div><p class="eyebrow">Snabbval${mode ? ` · ${esc(MODE_LABELS[mode] || "")} på` : ""}</p><h2 id="quick-title">Vad hjälper nu?</h2></div></div>
    <div class="quick-actions">${items.map((item) => `<button class="quick-action" type="button" ${item.route ? `data-route="${item.route}"` : `data-action="${item.action}"`}>${icon(item.icon)}<span><strong>${item.title}</strong><small>${item.detail}</small></span></button>`).join("")}</div>
  </section>`;
}

/* ---------------- Min dag ---------------- */

function modeStrip(life, key) {
  const day = M.getDay(life, key);
  const current = day.mode || "";
  const modes = ["", "work", "free", "low", "chaos", "recovery"];
  return `<div class="life-tabs mode-strip" role="group" aria-label="Dagens läge">${modes.map((mode) => `<button type="button" data-action="life-mode" data-mode="${mode}" aria-pressed="${current === mode}">${esc(MODE_LABELS[mode])}</button>`).join("")}</div>`;
}

function eventRows(life, key, now) {
  const events = P.eventsOn ? P.eventsOn(life, key) : life.events.filter((event) => event.date === key);
  if (!events.length) return emptyLine("Inga fasta tider i dag.");
  return `<ul class="life-list event-list">${events.map((event) => `<li class="life-row" data-kind="event"><span class="life-time">${esc(event.start || "hela dagen")}</span><button class="life-row-main" type="button" data-action="life-event-open" data-id="${esc(event.id)}"><strong>${esc(event.title)}</strong><small>${esc([event.end ? `till ${event.end}` : "", event.recur ? "återkommande" : "", event.away ? "utanför hemmet" : ""].filter(Boolean).join(" · "))}</small></button></li>`).join("")}</ul>`;
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
  return worldPage("day-page", env.worlds.today, `
    ${env.renderWorldHero({
      world: "coach",
      eyebrow: `Min dag · ${esc(date)}`,
      title: "Din dag, <em>i lagom storlek.</em>",
      body: esc(loadLine(plan)),
      guideName: "Klara · vardagscoach",
      guide: tight ? "Det är mer än dagen rymmer. Vill du att jag väljer vad som får vänta?" : "Måste först, sedan det som är bra om det hinns. Resten väntar tryggt.",
      actions: `<button class="button button-primary" type="button" data-action="life-rebuild">Bygg om min dag ${icon("refresh-double", "button-icon")}</button>`,
    })}
    <section class="forest-panel day-mode-panel" aria-labelledby="mode-title"><div class="section-heading"><div><p class="eyebrow">Dagens läge</p><h2 id="mode-title">Hur ser dagen ut?</h2></div><p>Aura följer din vecka av sig själv. Välj själv när dagen är annorlunda.</p></div>${modeStrip(life, key)}</section>
    <section class="forest-panel day-fixed" aria-labelledby="fixed-title"><div class="section-heading"><div><p class="eyebrow">Fasta tider</p><h2 id="fixed-title">Det som redan har en tid</h2></div><button class="text-button" type="button" data-action="life-event-new">${icon("plus")} Lägg till</button></div>${eventRows(life, key, now)}</section>
    <section class="forest-panel day-buckets" aria-labelledby="day-buckets-title">
      <div class="section-heading"><div><p class="eyebrow">Planen</p><h2 id="day-buckets-title">Måste, bra om det hinns, kan vänta</h2></div></div>
      ${quickAddForm("Lägg till… t.ex. ”ring vårdcentralen i morgon 10”")}
      ${b.must.length || b.good.length || b.later.length ? `${bucketBlock("must", b.must, now)}${bucketBlock("good", b.good, now)}${bucketBlock("later", b.later, now, 8)}` : emptyLine("Inget här ännu. Skriv en sak ovanför — Aura gissar dag och tid om du nämner dem.")}
      ${b.waiting.length ? `<div class="bucket" data-bucket="waiting"><div class="bucket-head"><h3>Väntar på svar</h3><span>${b.waiting.length}</span></div><ul class="life-list">${b.waiting.map((item) => itemRow(item, now)).join("")}</ul></div>` : ""}
    </section>
    ${routines.length ? `<section class="forest-panel day-routines" aria-labelledby="routines-title"><div class="section-heading"><div><p class="eyebrow">Rutiner i dag</p><h2 id="routines-title">Små spår att följa</h2></div></div><ul class="life-list">${routines.map((v) => `<li class="life-row" data-kind="routine"><span class="life-progress">${v.done}/${v.total}</span><button class="life-row-main" type="button" data-action="life-routine-open" data-id="${esc(v.routine.id)}"><strong>${esc(v.routine.name)}</strong><small>${v.complete ? "Klar för i dag" : `${v.remaining} steg kvar · ${approx(v.minutesLeft)}${v.variant === "short" ? " · kort version" : ""}`}</small></button></li>`).join("")}</ul></section>` : ""}
    ${b.done.length ? `<details class="forest-panel day-done"><summary><span><strong>Klart i dag</strong><small>${b.done.length} saker · skogen minns dem</small></span><span aria-hidden="true">+</span></summary><ul class="life-list is-done">${b.done.map((item) => `<li class="life-row is-done"><span class="life-check is-done" aria-hidden="true">${icon("check-circle")}</span><span class="life-row-main"><strong>${esc(item.title)}</strong></span><button class="text-button" type="button" data-action="life-reopen" data-id="${esc(item.id)}">Ångra</button></li>`).join("")}</ul></details>` : ""}
  `);
}

/* ---------------- Låg energi ---------------- */

export function renderLowPage(now = new Date()) {
  const life = view(now);
  if (!life) return "";
  const key = today(now);
  const mode = M.getDay(life, key).mode;
  const lowOn = mode === "low" || mode === "recovery";
  const plan = E.lowEnergyPlan(life, now);
  const hero = env.renderWorldHero({
    world: "coach",
    eyebrow: "Låg energi · Klara",
    title: lowOn ? "Dagen är <em>mindre nu.</em>" : "Vi gör dagen <em>mindre.</em>",
    body: lowOn ? "Bara det nödvändiga syns. Allt annat har en ny plats — inget är borta." : "Aura behåller det som verkligen måste hända, föreslår en liten vinst och säger exakt vart resten flyttar.",
    guideName: "Klara",
    guide: "Att göra mindre är också att ta hand om dagen.",
    actions: lowOn ? `<button class="button button-frost" type="button" data-action="life-mode" data-mode="">Tillbaka till vanlig dag</button>` : "",
  });
  const mustList = plan.must.length ? `<ul class="life-list">${plan.must.map((item) => itemRow(item, now)).join("")}</ul>` : emptyLine("Inget som verkligen måste hända i dag.");
  const tiny = plan.tiny
    ? `<article class="light-clearing low-tiny"><p class="eyebrow">En liten vinst</p><h3>${esc(plan.tinyText || plan.tiny.title)}</h3><p>${esc(approx(Math.min(10, plan.tiny.minutes || 10)))} · räcker gott.</p><button class="button button-secondary" type="button" data-action="life-do" data-id="${esc(plan.tiny.id)}">Gör den</button></article>`
    : "";
  const moved = plan.moved.length
    ? `<ul class="low-moved">${plan.moved.map((m) => `<li><span>${esc(m.title)}</span><small>${esc(relDay(m.to, now))}</small></li>`).join("")}</ul>`
    : emptyLine("Inget behöver flyttas.");
  return worldPage("low-page klara-page", env.worlds.coach, `
    ${hero}
    <section class="forest-panel low-panel" aria-labelledby="low-must-title"><div class="section-heading"><div><p class="eyebrow">Det här behöver ändå hända</p><h2 id="low-must-title">Bara det nödvändiga</h2></div></div>${mustList}${tiny}</section>
    ${lowOn ? "" : `<section class="forest-panel low-panel" aria-labelledby="low-move-title"><div class="section-heading"><div><p class="eyebrow">Det här flyttar vi</p><h2 id="low-move-title">Till lugnare dagar</h2></div><p>Du ser allt innan något ändras.</p></div>${moved}<div class="low-actions"><button class="button button-primary" type="button" data-action="life-low-apply">Gör dagen mindre</button><button class="button button-ghost" type="button" data-route="today">Inte nu</button></div></section>`}
    <section class="forest-panel low-panel">${guide("klara", "Om kroppen säger stopp kan du checka in med mig om vila, mat eller lugn. Då anpassar jag rådet efter orken.", "Klara · när orken är låg")}<button class="button button-secondary" type="button" data-action="start-coach-need" data-need="rest">Checka in om vila ${icon("nav-arrow-right", "button-icon")}</button></section>
  `);
}

/* ---------------- Kaos ---------------- */

export function renderChaosPage(now = new Date()) {
  const life = view(now);
  if (!life) return "";
  const chaos = E.chaosState(life, now);
  const hero = env.renderWorldHero({
    world: "coach",
    eyebrow: "Kaos · en sak i taget",
    title: chaos ? "Bara <em>den här.</em>" : "Allt på en gång? <em>Vi tar en sak.</em>",
    body: chaos ? "Resten syns inte just nu. När den här är klar kommer nästa." : "Skriv allt som snurrar, i vilken ordning som helst. Aura sorterar och visar bara en sak i taget.",
    guideName: "Klara",
    guide: chaos ? "Du behöver inte hålla resten i huvudet. Jag har det." : "Ingen ordning behövs. Skriv som det kommer.",
  });
  if (chaos && chaos.current) {
    const item = chaos.current;
    return worldPage("chaos-page klara-page", env.worlds.coach, `${hero}
      <section class="forest-panel chaos-panel" aria-labelledby="chaos-title" aria-live="polite">
        <article class="light-clearing chaos-card"><p class="eyebrow">Gör bara det här · ${chaos.doneCount} av ${chaos.total} klara</p><h2 id="chaos-title">${esc(item.title)}</h2><p>${esc(approx(E.effort(item)))}${chaos.rest.length ? ` · ${chaos.rest.length} till väntar, osynliga` : " · sista saken"}</p>
        <div class="now-actions"><button class="button button-primary" type="button" data-action="life-chaos-done" data-id="${esc(item.id)}">${icon("check-circle", "button-icon")} Klart — nästa</button><button class="button button-secondary" type="button" data-action="life-chaos-skip" data-id="${esc(item.id)}">Hoppa över</button></div></article>
        <button class="text-button" type="button" data-action="life-chaos-stop">Avsluta kaosläget</button>
      </section>`);
  }
  if (chaos && !chaos.current) {
    return worldPage("chaos-page klara-page", env.worlds.coach, `${hero}
      <section class="forest-panel chaos-panel">${guide("klara", `Du tog dig igenom ${chaos.total} saker, en i taget. Stanna upp en stund innan du bestämmer nästa.`, "Klara · allt i kön är klart")}<div class="now-actions"><button class="button button-primary" type="button" data-action="life-chaos-stop">Tillbaka till dagen</button></div></section>`);
  }
  const b = It.dayBuckets(life, today(now));
  const existing = b.must.length + b.good.length;
  return worldPage("chaos-page klara-page", env.worlds.coach, `${hero}
    <section class="forest-panel chaos-panel" aria-labelledby="chaos-dump-title">
      <div class="section-heading"><div><p class="eyebrow">Töm huvudet</p><h2 id="chaos-dump-title">Skriv allt som snurrar</h2></div></div>
      <form id="life-chaos-form" class="life-form"><label class="field"><span>Allt på en gång</span><textarea name="text" maxlength="4000" rows="6" placeholder="t.ex. mejla skolan, tvättid, handla mjölk, ring om fakturan, städa hallen…"></textarea></label>
      <div class="now-actions"><button class="button button-primary" type="submit">Hjälp mig ta en sak i taget</button>${existing ? `<button class="button button-secondary" type="button" data-action="life-chaos-start">Använd dagens ${existing} saker</button>` : ""}</div>
      <p class="fine-print">Sorteras med Auras egna regler i den här webbläsaren. Inget skickas någonstans.</p></form>
    </section>`);
}

/* ---------------- Kvällsavslut ---------------- */

export function renderEveningPage(now = new Date()) {
  const life = view(now);
  if (!life) return "";
  const r = A.evening.eveningReset(life, now);
  const moments = (state().forest?.moments || []).filter((moment) => moment.date === r.date);
  const doneTitles = [...new Set([...r.done.map((item) => item.title), ...moments.map((moment) => moment.title)])];
  const unfinished = r.unfinished.length
    ? `<ul class="life-list decision-list">${r.unfinished.map(({ item }) => `<li class="decision-row"><div><strong>${esc(item.title)}</strong>${metaFor(item, now) ? `<small>${esc(metaFor(item, now))}</small>` : ""}</div><div class="decision-buttons" role="group" aria-label="Vad händer med ${esc(item.title)}?">${item.recur
      ? `<button type="button" data-action="life-evening-skip" data-id="${esc(item.id)}">Hoppa över</button>`
      : `<button type="button" data-action="life-evening-move" data-id="${esc(item.id)}" data-to="tomorrow">I morgon</button><button type="button" data-action="life-evening-move" data-id="${esc(item.id)}" data-to="later">Senare</button><button type="button" data-action="life-evening-drop" data-id="${esc(item.id)}">Släpp</button>`}</div></li>`).join("")}</ul>
      <button class="button button-secondary" type="button" data-action="life-evening-moveall">Flytta allt klokt</button>`
    : emptyLine("Inget blev liggande. Det är inte vanligt — njut av det.");
  const tomorrow = r.tomorrow;
  return worldPage("evening-page insights-page", env.worlds.ritual, `
    ${env.renderWorldHero({
      world: "insights",
      eyebrow: "Kvällsavslut · Maja",
      title: r.finished ? "Kvällen är <em>stängd.</em>" : "Två minuter, <em>sedan vila.</em>",
      body: "Det som blev gjort, ett beslut om det som inte hanns, och en blick på i morgon.",
      guideName: "Maja",
      guide: doneTitles.length ? "Jag har skrivit upp det du gjorde i dag. Det räknas, även det lilla." : "Ibland handlar en dag om att ta sig igenom den. Det räcker.",
    })}
    <section class="forest-panel evening-panel" aria-labelledby="ev-done-title"><div class="section-heading"><div><p class="eyebrow">Det här blev gjort</p><h2 id="ev-done-title">${doneTitles.length ? `${doneTitles.length} spår i skogen i dag` : "En dag att ta sig igenom"}</h2></div></div>${doneTitles.length ? `<ul class="evening-done">${doneTitles.slice(0, 12).map((title) => `<li>${icon("check-circle")} ${esc(title)}</li>`).join("")}</ul>` : emptyLine("Inget avbockat — och det är okej.")}</section>
    <section class="forest-panel evening-panel" aria-labelledby="ev-left-title"><div class="section-heading"><div><p class="eyebrow">Det som inte hanns</p><h2 id="ev-left-title">Ett beslut per sak</h2></div><p>I morgon, senare eller släpp. Ingen skuld.</p></div>${unfinished}</section>
    <section class="forest-panel evening-panel" aria-labelledby="ev-head-title"><div class="section-heading"><div><p class="eyebrow">Töm huvudet</p><h2 id="ev-head-title">Något som snurrar inför natten?</h2></div></div>
      <form id="life-evening-form" class="life-form"><label class="field"><span>Skriv det här, så ligger det i inkorgen i morgon</span><textarea name="text" maxlength="2000" rows="3" placeholder="t.ex. köpa present, svara Lisa, boka tvättid"></textarea></label><button class="button button-secondary" type="submit">Lägg i inkorgen</button></form></section>
    <section class="forest-panel evening-panel" aria-labelledby="ev-tomorrow-title"><div class="section-heading"><div><p class="eyebrow">I morgon</p><h2 id="ev-tomorrow-title">${tomorrow.first ? `Första fasta tiden: ${esc(tomorrow.first.title)} ${esc(tomorrow.first.at)}` : "Inga fasta tider i morgon"}</h2></div></div>
      ${tomorrow.must.length ? `<ul class="life-list">${tomorrow.must.map((item) => itemRow(item, now)).join("")}</ul>` : emptyLine("Inga måsten väntar i morgon.")}
      <form id="life-intention-form" class="quick-add"><label class="sr-only" for="life-intention">En sak som gör morgondagen lättare</label><input id="life-intention" name="text" maxlength="200" value="${esc(r.intention)}" placeholder="En sak som gör morgondagen lättare…" /><button class="button button-secondary" type="submit">Spara</button></form>
    </section>
    <section class="forest-panel evening-panel evening-finish">${r.finished ? guide("maja", "Kvällen är stängd. Allt har en plats. Sov gott.", "Maja") : `<button class="button button-primary button-wide" type="button" data-action="life-evening-finish">Klart för i kväll ${icon("half-moon", "button-icon")}</button>`}</section>
  `);
}

/* ---------------- Veckan ---------------- */

export function renderWeekPage(now = new Date()) {
  const life = view(now);
  if (!life) return "";
  const r = A.review.weeklyReview(life, now);
  const days = Object.entries(r.doneByDay).sort(([a], [b]) => a.localeCompare(b));
  const upcoming = It.upcoming(life, today(now), 7).slice(0, 8);
  const observations = r.observations.filter((obs) => !life.meta.dismissedPatterns.includes(obs.key)).slice(0, 3);
  return worldPage("week-page insights-page", env.worlds.insights, `
    ${env.renderWorldHero({
      world: "insights",
      eyebrow: `Veckan · ${esc(I.shortDate(r.week))}–${esc(I.shortDate(r.end))}`,
      title: "Titta tillbaka, <em>lätt.</em>",
      body: "Vad som blev av, vad som flyttade sig ofta och vad som väntar. Inga betyg.",
      guideName: "Maja",
      guide: r.doneCount ? `${r.doneCount} saker blev gjorda. Jag sparar dem, du behöver inte.` : "En lugn vecka i listorna. Livet händer också utanför dem.",
    })}
    <section class="forest-panel week-panel" aria-labelledby="wk-done-title"><div class="section-heading"><div><p class="eyebrow">Det som blev av</p><h2 id="wk-done-title">${r.doneCount} klara saker</h2></div></div>
      ${days.length ? `<ul class="week-days">${days.map(([date, n]) => `<li><span>${esc(U.capitalize(I.dayName(date)))}</span><strong>${n}</strong></li>`).join("")}</ul>` : emptyLine("Inget avbockat i Aura den här veckan.")}
      ${r.done.length ? `<ul class="evening-done">${r.done.slice(0, 10).map((item) => `<li>${icon("check-circle")} ${esc(item.title)}</li>`).join("")}</ul>` : ""}</section>
    ${r.postponed.length ? `<section class="forest-panel week-panel" aria-labelledby="wk-moved-title"><div class="section-heading"><div><p class="eyebrow">Flyttade sig ofta</p><h2 id="wk-moved-title">Kanske för stora, eller fel dag?</h2></div><p>Dela upp, välj en ny dag eller släpp.</p></div><ul class="life-list">${r.postponed.map((p) => itemRow(p.item, now)).join("")}</ul></section>` : ""}
    ${r.routines.length ? `<section class="forest-panel week-panel" aria-labelledby="wk-rt-title"><div class="section-heading"><div><p class="eyebrow">Rutiner</p><h2 id="wk-rt-title">Vad som satt</h2></div></div><ul class="week-days">${r.routines.map((x) => `<li><span>${esc(x.routine.name)}</span><strong>${x.completed}/${x.applicable}</strong></li>`).join("")}</ul></section>` : ""}
    ${observations.length ? `<section class="forest-panel week-panel" aria-labelledby="wk-obs-title"><div class="section-heading"><div><p class="eyebrow">Maja märkte</p><h2 id="wk-obs-title">Observationer, inte sanningar</h2></div></div>${observations.map((obs) => `<article class="light-clearing week-obs"><p>${esc(I.msg(obs.text))}</p><div class="life-suggest-actions">${(obs.actions || []).map((action, index) => `<button class="button button-secondary" type="button" data-action="life-pattern" data-key="${esc(obs.key)}" data-index="${index}">${esc(I.msg(action.label))}</button>`).join("")}<button class="button button-ghost" type="button" data-action="life-pattern-dismiss" data-key="${esc(obs.key)}">Det stämmer inte</button></div></article>`).join("")}</section>` : ""}
    <section class="forest-panel week-panel" aria-labelledby="wk-next-title"><div class="section-heading"><div><p class="eyebrow">Kommande sju dagar</p><h2 id="wk-next-title">Det som väntar</h2></div></div>${upcoming.length ? `<ul class="life-list">${upcoming.map((item) => itemRow(item, now)).join("")}</ul>` : emptyLine("Inga datum eller deadlines den närmaste veckan.")}
      ${r.reviewed ? `<p class="fine-print">Veckan är genomgången.</p>` : `<button class="button button-primary" type="button" data-action="life-review-done" data-week="${esc(r.week)}">Klar med veckan</button>`}</section>
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

function tabsFor() {
  return LIFE_TABS.filter((tab) => !tab.module || moduleOn(state(), tab.module));
}

function lifeAddForm(id, placeholder, extra = "") {
  return `<form class="quick-add" id="${id}" autocomplete="off"><label class="sr-only" for="${id}-input">${esc(placeholder)}</label><input id="${id}-input" name="text" maxlength="200" placeholder="${esc(placeholder)}" />${extra}<button class="button button-primary" type="submit" aria-label="Lägg till">${icon("plus", "button-icon")}</button></form>`;
}

function renderInboxTab(life, now) {
  const items = It.inbox(life);
  return `<p class="life-note">Inkorgen är en plats att lägga saker på, inte en lista att tömma. Sortera när du vill.</p>
    ${lifeAddForm("life-inbox-form", "Lägg i inkorgen…")}
    ${items.length ? `<ul class="life-list">${items.map((item) => `<li class="life-row inbox-row"><button class="life-row-main" type="button" data-action="life-open-item" data-id="${esc(item.id)}"><strong>${esc(item.title)}</strong><small>${esc(KIND_LABELS[item.kind] || "")} · ${esc(relDay(String(item.createdAt).slice(0, 10), now))}</small></button><div class="inbox-actions"><button type="button" data-action="life-inbox-today" data-id="${esc(item.id)}">I dag</button><button type="button" data-action="life-inbox-later" data-id="${esc(item.id)}">Senare</button><button type="button" data-action="life-item-drop" data-id="${esc(item.id)}" aria-label="Släpp ${esc(item.title)}">Släpp</button></div></li>`).join("")}</ul>` : emptyLine("Inget i inkorgen just nu.")}`;
}

function renderShoppingTab(life, now) {
  const list = It.shoppingList(life);
  return `${lifeAddForm("life-shop-form", "Lägg till varor… t.ex. ”mjölk, bröd och tandkräm”")}
    ${list.count ? list.groups.map((group) => `<div class="bucket"><div class="bucket-head"><h3>${esc(SHOP_LABELS[group.category] || "Övrigt")}</h3><span>${group.items.length}</span></div><ul class="life-list">${group.items.map((item) => itemRow(item, now, { showKind: false })).join("")}</ul></div>`).join("") : emptyLine("Inköpslistan är tom.")}
    ${list.usuals.length ? `<div class="usuals"><p class="eyebrow">Vanliga varor</p><div class="chip-row">${list.usuals.slice(0, 16).map((item) => `<button class="symptom-chip" type="button" data-action="life-reopen" data-id="${esc(item.id)}">${icon("plus")} ${esc(item.title)}</button>`).join("")}</div></div>` : ""}`;
}

function renderAdminTab(life, now) {
  const list = It.adminList(life, today(now));
  const block = (title, items) => items.length ? `<div class="bucket"><div class="bucket-head"><h3>${title}</h3><span>${items.length}</span></div><ul class="life-list">${items.map((item) => itemRow(item, now, { showKind: false })).join("")}</ul></div>` : "";
  const empty = !list.action.length && !list.waiting.length && !list.later.length;
  return `${lifeAddForm("life-admin-form", "Nytt ärende… t.ex. ”betala hyran senast 30/9”")}
    ${empty ? emptyLine("Inga ärenden. Räkningar, blanketter, samtal och bokningar hamnar här.") : `${block("Behöver göras", list.action)}${block("Väntar på svar", list.waiting)}${block("Följ upp senare", list.later)}`}`;
}

function renderHomeTab(life, now) {
  const chores = It.choresList(life, today(now));
  const dueText = (dueIn) => dueIn == null ? "när det passar" : dueIn < 0 ? `sedan ${-dueIn} ${-dueIn === 1 ? "dag" : "dagar"}` : dueIn === 0 ? "i dag" : dueIn === 1 ? "i morgon" : `om ${dueIn} dagar`;
  const repeat = `<label class="sr-only" for="life-chore-repeat">Hur ofta</label><select id="life-chore-repeat" name="repeat"><option value="week">Varje vecka</option><option value="day">Varje dag</option><option value="2week">Varannan vecka</option><option value="month">Varje månad</option></select>`;
  return `<p class="life-note">Aura kommer ihåg när det är dags — du behöver inte.</p>
    ${lifeAddForm("life-chore-form", "Ny sak hemma… t.ex. ”byta lakan”", repeat)}
    ${chores.length ? `<ul class="life-list">${chores.map(({ item, dueIn }) => `<li class="life-row" data-kind="chore"><button class="life-check" type="button" data-action="life-done" data-id="${esc(item.id)}" aria-label="Klart: ${esc(item.title)}">${icon("check-circle")}</button><button class="life-row-main" type="button" data-action="life-open-item" data-id="${esc(item.id)}"><strong>${esc(item.title)}</strong><small>${esc([dueText(dueIn), item.recur ? It.describeRecur(item.recur) : ""].filter(Boolean).join(" · "))}</small></button></li>`).join("")}</ul>` : emptyLine("Inga hemsysslor ännu. Lägg till det som återkommer, så påminner Aura i lagom takt.")}`;
}

function renderProjectsTab(life) {
  const projects = life.projects.filter((project) => project.status !== "done");
  return `<p class="life-note">Ett projekt syns bara som sitt nästa steg i din dag.</p>
    ${lifeAddForm("life-project-form", "Nytt projekt… t.ex. ”renovera sovrummet”")}
    ${projects.length ? `<ul class="life-list">${projects.map((project) => {
      const next = It.nextAction(life, project.id);
      const progress = It.projectProgress(life, project.id);
      return `<li class="life-row" data-kind="project"><span class="life-progress">${progress.done}/${progress.total}</span><button class="life-row-main" type="button" data-action="life-project-open" data-id="${esc(project.id)}"><strong>${esc(project.title)}</strong><small>${esc(project.status === "paused" ? "Pausat" : next ? `Nästa: ${next.title}` : "Inget nästa steg ännu")}</small></button></li>`;
    }).join("")}</ul>` : emptyLine("Inga projekt. Större saker med flera steg passar här.")}`;
}

function renderRoutinesTab(life, now) {
  const views = A.routines.todays(life, now);
  const active = new Set(life.routines.map((routine) => routine.kind));
  const available = A.routines.templateKinds().filter((kind) => !active.has(kind));
  return `<p class="life-note">Rutiner anpassar sig: sent, lite ork eller ont om tid ger en kort version.</p>
    ${life.routines.length ? `<ul class="life-list">${life.routines.map((routine) => {
      const v = views.find((item) => item.routine.id === routine.id);
      return `<li class="life-row" data-kind="routine"><span class="life-progress">${v ? `${v.done}/${v.total}` : "–"}</span><button class="life-row-main" type="button" data-action="life-routine-open" data-id="${esc(routine.id)}"><strong>${esc(routine.name)}</strong><small>${esc([routine.start ? `${routine.start}–${routine.end || ""}` : "när du vill", v ? (v.complete ? "klar i dag" : `${v.remaining} steg kvar`) : "inte i dag"].join(" · "))}</small></button></li>`;
    }).join("")}</ul>` : emptyLine("Inga rutiner ännu.")}
    ${available.length ? `<div class="usuals"><p class="eyebrow">Lägg till en rutin</p><div class="chip-row">${available.map((kind) => `<button class="symptom-chip" type="button" data-action="life-routine-add" data-kind="${kind}">${icon("plus")} ${esc(I.t(`rt.${kind}`))}</button>`).join("")}</div></div>` : ""}`;
}

export function renderLifePage(now = new Date()) {
  const life = view(now);
  if (!life) return "";
  const key = today(now);
  const counts = It.counts(life, key);
  const tabs = tabsFor();
  if (!tabs.some((tab) => tab.id === ui.lifeTab)) ui.lifeTab = "inbox";
  const countFor = { inbox: counts.inbox, shopping: counts.shopping, admin: counts.adminAction, home: counts.choresDue, projects: counts.projects, routines: life.routines.length };
  const panels = { inbox: renderInboxTab, shopping: renderShoppingTab, admin: renderAdminTab, home: renderHomeTab, projects: renderProjectsTab, routines: renderRoutinesTab };
  const active = tabs.find((tab) => tab.id === ui.lifeTab);
  return worldPage("life-page insights-page", env.worlds.insights, `
    ${env.renderWorldHero({
      world: "insights",
      eyebrow: "Livet · Majas anteckningar",
      title: "Allt du inte behöver <em>hålla i huvudet.</em>",
      body: "Inkorg, handla, ärenden, hemmet, projekt och rutiner — Maja håller ordning så att bara det viktiga når din dag.",
      guideName: "Maja · mönster & minnen",
      guide: counts.inbox ? `${counts.inbox} saker ligger i inkorgen. De väntar tills du vill.` : "Allt har en plats. Jag säger till när något behöver dig.",
      actions: `<button class="button button-frost" type="button" data-action="life-capture">Töm huvudet ${icon("nav-arrow-right", "button-icon")}</button>`,
    })}
    <section class="forest-panel life-hub" aria-labelledby="life-hub-title">
      <h2 class="sr-only" id="life-hub-title">Listor</h2>
      <div class="life-tiles" role="group" aria-label="Välj lista">${tabs.map((tab) => `<button class="life-tile" type="button" data-action="life-tab" data-tab="${tab.id}" aria-pressed="${tab.id === ui.lifeTab}">${icon(tab.icon)}<strong>${tab.label}</strong><small>${countFor[tab.id] || 0}</small></button>`).join("")}</div>
      <div class="life-tab-panel" id="life-tab-panel" aria-label="${esc(active?.label || "")}">${panels[ui.lifeTab](life, now)}</div>
    </section>
    <section class="forest-panel life-links" aria-label="Mer hos Maja">
      <button class="guide-link" type="button" data-route="insights">${icon("stats-up-square")}<span><strong>Mönster</strong><small>Det som hjälper på riktigt</small></span>${icon("nav-arrow-right")}</button>
      <button class="guide-link" type="button" data-route="week">${icon("calendar")}<span><strong>Veckan</strong><small>Titta tillbaka och framåt</small></span>${icon("nav-arrow-right")}</button>
      <button class="guide-link" type="button" data-route="evening">${icon("half-moon")}<span><strong>Kvällsavslut</strong><small>Två minuter, sedan vila</small></span>${icon("nav-arrow-right")}</button>
    </section>
  `);
}

/* ---------------- Fråga Aura (on Klara's coach page) ---------------- */

const ASK_EXAMPLES = ["Vad skulle jag köpa?", "Vad har jag skjutit upp?", "Vad väntar jag på?", "Vad ska jag göra nu?", "Vad har jag i morgon?"];

export function renderAskPanel(now = new Date()) {
  const life = view(now);
  if (!life) return "";
  const result = ui.ask?.result;
  let answer = "";
  if (result) {
    const items = result.items || [];
    const extras = [];
    if (result.events?.length) extras.push(`<ul class="life-list">${result.events.map((event) => `<li class="life-row" data-kind="event"><span class="life-time">${esc(U.toClock(event.start))}</span><span class="life-row-main"><strong>${esc(event.title)}</strong></span></li>`).join("")}</ul>`);
    if (result.projects?.length) extras.push(`<ul class="life-list">${result.projects.map((project) => `<li class="life-row" data-kind="project"><button class="life-row-main" type="button" data-action="life-project-open" data-id="${esc(project.id)}"><strong>${esc(project.title)}</strong></button></li>`).join("")}</ul>`);
    const known = A.search.isKnownIntent(result);
    answer = `<article class="light-clearing ask-result" id="ask-result" tabindex="-1" aria-live="polite"><p class="eyebrow">Svar ur din plan · ingen AI</p><h3>${esc(items.length || extras.length ? result.title : result.empty)}</h3>
      ${items.length ? `<ul class="life-list">${items.slice(0, 12).map((item) => itemRow(item, now)).join("")}</ul>` : ""}${extras.join("")}
      ${!known && !items.length ? `<p>Frågan handlar kanske om hur det känns snarare än vad som står i planen. Då kan Klara hjälpa — checka in nedanför.</p>` : ""}</article>`;
  }
  return `<section class="forest-panel ask-panel" id="ask-panel" aria-labelledby="ask-title">
    <div class="section-heading"><div><p class="eyebrow">Fråga Aura</p><h2 id="ask-title">Vad står i din plan?</h2></div><p>Exakta svar ur dina egna listor, direkt i telefonen.</p></div>
    <form id="life-ask-form" class="quick-add" autocomplete="off"><label class="sr-only" for="life-ask-input">Fråga om din dag</label><input id="life-ask-input" name="query" maxlength="200" value="${esc(ui.ask?.query || "")}" placeholder="t.ex. ”Vad behöver bli klart före fredag?”" /><button class="button button-primary" type="submit" aria-label="Fråga">${icon("search", "button-icon")}</button></form>
    <div class="chip-row ask-chips">${ASK_EXAMPLES.map((text) => `<button class="symptom-chip" type="button" data-action="life-ask-chip" data-text="${esc(text)}">${esc(text)}</button>`).join("")}</div>
    ${answer}
  </section>`;
}

/* ---------------- sheets ---------------- */

function sheetDialog() {
  return document.querySelector("#life-sheet");
}

function sheetHead(eyebrow, title) {
  return `<div class="modal-heading"><div><p class="eyebrow">${esc(eyebrow)}</p><h2 id="life-sheet-title">${esc(title)}</h2></div><button class="icon-button" type="button" data-action="life-close-sheet" aria-label="Stäng">${icon("xmark")}</button></div>`;
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

function renderItemSheet(data, now) {
  const life = state().life;
  const item = M.itemById(life, data.id);
  if (!item) return `${sheetHead("Saken", "Finns inte längre")}<p>Den kan ha tagits bort eller ångrats.</p>`;
  const bucket = It.classify(life, item, today(now));
  const isOpen = item.status === "open" || item.status === "inbox";
  const siblings = bucket && ["must", "good"].includes(bucket) ? It.dayBuckets(life, today(now))[bucket] : [];
  const index = siblings.findIndex((x) => x.id === item.id);
  const kinds = ["task", "shopping", "admin", "chore", "reminder", "note", "idea"];
  const confirming = ui.confirmDelete === item.id;
  return `${sheetHead(KIND_LABELS[item.kind] || "Sak", item.title)}
    <form id="life-item-form" class="life-form" data-id="${esc(item.id)}">
      <label class="field"><span>Vad</span><input name="title" maxlength="140" value="${esc(item.title)}" required /></label>
      <div class="field-grid">
        <label class="field"><span>Sort</span><select name="kind">${kinds.map((kind) => `<option value="${kind}"${kind === item.kind ? " selected" : ""}>${KIND_LABELS[kind]}</option>`).join("")}</select></label>
        <label class="field"><span>När</span><select name="date">${whenOptions(item.date, now)}</select></label>
      </div>
      <fieldset class="chip-field"><legend>Hur viktigt</legend><div class="chip-row">${[["", "Låt Aura avgöra"], ["must", "Måste"], ["good", "Bra om det hinns"], ["later", "Kan vänta"]].map(([value, label]) => `<label class="chip"><input type="radio" name="priority" value="${value}"${(item.priority || "") === value ? " checked" : ""} /><span>${label}</span></label>`).join("")}</div></fieldset>
      <details class="disclosure"><summary>Mer <span>deadline, tid, längd, anteckning</span></summary>
        <div class="field-grid">
          <label class="field"><span>Senast</span><input type="date" name="dueDate" value="${esc(item.dueDate)}" /></label>
          <label class="field"><span>Klockslag</span><input type="time" name="time" value="${esc(item.time)}" /></label>
          <label class="field"><span>Ungefär hur länge</span><select name="minutes">${MINUTE_CHOICES.map((m) => `<option value="${m}"${m === item.minutes ? " selected" : ""}>${I.duration(m)}</option>`).join("")}${MINUTE_CHOICES.includes(item.minutes) ? "" : `<option value="${item.minutes}" selected>${I.duration(item.minutes)}</option>`}</select></label>
          ${item.kind === "shopping" ? `<label class="field"><span>Avdelning</span><select name="category">${M.SHOP_CATEGORIES.map((cat) => `<option value="${cat}"${cat === item.category ? " selected" : ""}>${SHOP_LABELS[cat]}</option>`).join("")}</select></label>` : ""}
          ${item.kind === "admin" ? `<label class="field"><span>Läge</span><select name="adminStatus">${[["action", "Behöver göras"], ["waiting", "Väntar på svar"], ["followup", "Följ upp senare"]].map(([value, label]) => `<option value="${value}"${value === item.adminStatus ? " selected" : ""}>${label}</option>`).join("")}</select></label><label class="field"><span>Följ upp</span><input type="date" name="followUp" value="${esc(item.followUp)}" /></label>` : ""}
        </div>
        ${item.kind === "shopping" ? `<label class="toggle-line"><input type="checkbox" name="staple"${item.staple ? " checked" : ""} /> <span>Vanlig vara — föreslå den igen när den är köpt</span></label>` : ""}
        <label class="field"><span>Anteckning</span><textarea name="note" maxlength="1000" rows="2">${esc(item.note)}</textarea></label>
      </details>
      <button class="button button-primary button-wide" type="submit">Spara</button>
    </form>
    ${isOpen ? `<div class="sheet-actions">
      <button class="button button-secondary" type="button" data-action="life-done" data-id="${esc(item.id)}">${icon("check-circle", "button-icon")} Klart</button>
      ${item.recur ? `<button class="button button-secondary" type="button" data-action="life-item-skip" data-id="${esc(item.id)}">Hoppa över den här gången</button><button class="button button-ghost" type="button" data-action="life-item-stoprepeat" data-id="${esc(item.id)}">Sluta upprepa</button>`
        : `<button class="button button-secondary" type="button" data-action="life-item-when" data-id="${esc(item.id)}" data-to="tomorrow">I morgon</button><button class="button button-secondary" type="button" data-action="life-item-when" data-id="${esc(item.id)}" data-to="later">Senare</button>`}
      ${["task", "chore", "admin"].includes(item.kind) && item.minutes >= 20 ? `<button class="button button-ghost" type="button" data-action="life-item-split" data-id="${esc(item.id)}">Gör den mindre</button>` : ""}
      ${index > 0 ? `<button class="button button-ghost" type="button" data-action="life-item-move" data-id="${esc(item.id)}" data-dir="-1">${icon("nav-arrow-up", "button-icon")} Flytta upp</button>` : ""}
      ${index >= 0 && index < siblings.length - 1 ? `<button class="button button-ghost" type="button" data-action="life-item-move" data-id="${esc(item.id)}" data-dir="1">${icon("nav-arrow-down", "button-icon")} Flytta ner</button>` : ""}
      <button class="button button-ghost" type="button" data-action="life-item-drop" data-id="${esc(item.id)}">Släpp</button>
      <button class="button button-danger" type="button" data-action="life-item-delete" data-id="${esc(item.id)}">${confirming ? "Tryck igen för att radera" : "Radera"}</button>
    </div>` : `<div class="sheet-actions"><button class="button button-secondary" type="button" data-action="life-reopen" data-id="${esc(item.id)}">Öppna igen</button></div>`}`;
}

function renderCaptureSheet(now) {
  const cap = ui.capture || (ui.capture = { text: "", result: null });
  if (cap.result?.question) {
    return `${sheetHead("Töm huvudet", "Det låter som en fråga")}<p>Vill du att Aura letar i din plan i stället?</p><div class="sheet-actions"><button class="button button-primary" type="button" data-action="life-capture-ask">Fråga Aura</button><button class="button button-secondary" type="button" data-action="life-capture-anyway">Spara som anteckning</button></div>`;
  }
  if (cap.result) {
    const cands = cap.result.candidates;
    if (!cands.length) {
      return `${sheetHead("Töm huvudet", "Inget att lägga till")}<p>Aura hittade ingen sak i texten. Skriv lite mer, eller spara den i inkorgen som den är.</p><div class="sheet-actions"><button class="button button-secondary" type="button" data-action="life-capture-restart">Skriv om</button><button class="button button-ghost" type="button" data-action="life-capture-inbox">Spara i inkorgen</button></div>`;
    }
    const kinds = ["task", "shopping", "admin", "chore", "reminder", "event", "note", "idea"];
    return `${sheetHead("Töm huvudet", `Aura hittade ${cands.length} ${cands.length === 1 ? "sak" : "saker"}`)}
      <p class="fine-print">Sorterat med Auras egna regler i den här webbläsaren · ingen AI, inget skickades. Rätta det som blev fel — inget skapas förrän du trycker.</p>
      <form id="life-review-form" class="life-form">
        <ul class="cand-list">${cands.map((c) => `<li class="cand" data-review="${Boolean(c.review)}" data-temp="${esc(c.tempId)}">
          <div class="cand-top"><label class="sr-only" for="cand-${esc(c.tempId)}">Vad</label><input id="cand-${esc(c.tempId)}" name="t-${esc(c.tempId)}" maxlength="140" value="${esc(c.title)}" /><button class="icon-button" type="button" data-action="life-cand-remove" data-temp="${esc(c.tempId)}" aria-label="Ta bort ${esc(c.title)}">${icon("xmark")}</button></div>
          <div class="cand-bottom">
            <label class="sr-only" for="kind-${esc(c.tempId)}">Sort för ${esc(c.title)}</label><select id="kind-${esc(c.tempId)}" data-change="life-cand-kind" data-temp="${esc(c.tempId)}">${kinds.map((kind) => `<option value="${kind}"${kind === c.kind ? " selected" : ""}>${KIND_LABELS[kind]}</option>`).join("")}</select>
            ${c.kind === "note" || c.kind === "idea" ? "" : `<label class="sr-only" for="when-${esc(c.tempId)}">När för ${esc(c.title)}</label><select id="when-${esc(c.tempId)}" data-change="life-cand-when" data-temp="${esc(c.tempId)}">${whenOptions(c.date || c.dueDate, now)}</select>`}
            ${c.kind === "event" ? `<label class="sr-only" for="time-${esc(c.tempId)}">Klockslag</label><input id="time-${esc(c.tempId)}" type="time" value="${esc(c.time)}" data-change="life-cand-time" data-temp="${esc(c.tempId)}" />` : ""}
            ${[c.dueDate ? `senast ${relDay(c.dueDate, now)}` : "", c.recur ? It.describeRecur(c.recur) : "", c.kind === "shopping" && c.category ? SHOP_LABELS[c.category] : "", c.forPerson ? `till ${c.forPerson}` : ""].filter(Boolean).map((text) => `<span class="cand-meta">${esc(text)}</span>`).join("")}
          </div>
          ${c.review ? `<p class="cand-hint">${esc(c.kind === "event" ? "Blir en fast tid i din dag — kolla dag och klockslag." : c.kind === "reminder" ? "När? Välj en dag så påminner Aura dig." : "Osäker på sorten — ändra om det blev fel.")}</p>` : ""}
        </li>`).join("")}</ul>
        <button class="button button-primary button-wide" type="submit">Lägg in ${cands.length} ${cands.length === 1 ? "sak" : "saker"}</button>
      </form>
      <div class="sheet-actions"><button class="button button-ghost" type="button" data-action="life-capture-restart">Börja om</button><button class="button button-ghost" type="button" data-action="life-capture-inbox">Lägg allt i inkorgen i stället</button></div>`;
  }
  return `${sheetHead("Töm huvudet", "Vad snurrar i huvudet?")}
    <form id="life-capture-form" class="life-form">
      <label class="field"><span>Skriv allt, i vilken ordning som helst</span><textarea name="text" rows="6" maxlength="4000" placeholder="t.ex. ”Behöver schampo och mjölk, boka tandläkaren, tvätta jackan i helgen och tandläkare torsdag 14:00”">${esc(cap.text)}</textarea></label>
      <p class="fine-print">Tips: tangentbordets mikrofon fungerar här om du hellre pratar. Aura sorterar med egna regler i telefonen och visar allt innan något sparas.</p>
      <button class="button button-primary button-wide" type="submit">Sortera</button>
    </form>
    <div class="sheet-actions"><button class="button button-ghost" type="button" data-action="life-capture-inbox">Spara direkt i inkorgen</button></div>`;
}

function renderRebuildSheet(data) {
  const r = data.proposal;
  const list = (items, suffix = () => "") => `<ul class="low-moved">${items.map((x) => `<li><span>${esc(x.title)}</span>${suffix(x) ? `<small>${esc(suffix(x))}</small>` : ""}</li>`).join("")}</ul>`;
  const nothing = !r.moved.length && !r.added.length;
  return `${sheetHead("Bygg om min dag", nothing ? "Dagen går ihop som den är" : "Så här blir dagen")}
    ${r.tight ? `<p class="life-note">Bara måstena tar mer tid än dagen har kvar. Kanske kan något av dem göras mindre eller flyttas?</p>` : ""}
    ${r.must.length ? `<p class="eyebrow">Måste · stannar</p>${list(r.must)}` : ""}
    ${r.kept.length ? `<p class="eyebrow">Bra om det hinns · stannar</p>${list(r.kept)}` : ""}
    ${r.moved.length ? `<p class="eyebrow">Flyttas</p>${list(r.moved, (x) => relDay(x.to))}` : ""}
    ${r.added.length ? `<p class="eyebrow">Tas in i dag — det finns plats</p>${list(r.added)}` : ""}
    <div class="sheet-actions">${nothing ? `<button class="button button-primary" type="button" data-action="life-close-sheet">Bra</button>` : `<button class="button button-primary" type="button" data-action="life-rebuild-apply">Gör så här</button><button class="button button-ghost" type="button" data-action="life-close-sheet">Behåll som det är</button>`}</div>`;
}

function renderEventSheet(data, now) {
  const life = state().life;
  const event = data.id ? M.eventById(life, data.id) : null;
  const e = event || { title: "", date: today(now), start: "", end: "", away: true, recur: null };
  const weekdays = new Set(e.recur?.weekdays || []);
  return `${sheetHead("Fast tid", event ? event.title : "Ny fast tid")}
    <form id="life-event-form" class="life-form"${event ? ` data-id="${esc(event.id)}"` : ""}>
      <label class="field"><span>Vad</span><input name="title" maxlength="120" value="${esc(e.title)}" required placeholder="t.ex. Tandläkaren" /></label>
      <div class="field-grid">
        <label class="field"><span>Dag</span><input type="date" name="date" value="${esc(e.date || today(now))}" /></label>
        <label class="field"><span>Börjar</span><input type="time" name="start" value="${esc(e.start)}" /></label>
        <label class="field"><span>Slutar</span><input type="time" name="end" value="${esc(e.end)}" /></label>
      </div>
      <label class="toggle-line"><input type="checkbox" name="away"${e.away ? " checked" : ""} /> <span>Utanför hemmet — räkna med restid</span></label>
      <fieldset class="chip-field"><legend>Upprepa varje vecka <small>frivilligt</small></legend><div class="chip-row">${WEEKDAYS.map(([day, label]) => `<label class="chip"><input type="checkbox" name="weekday" value="${day}"${weekdays.has(day) ? " checked" : ""} /><span>${label}</span></label>`).join("")}</div></fieldset>
      <button class="button button-primary button-wide" type="submit">Spara</button>
    </form>
    ${event ? `<div class="sheet-actions"><button class="button button-danger" type="button" data-action="life-event-delete" data-id="${esc(event.id)}">Ta bort</button></div>` : ""}`;
}

function renderRoutineSheet(data, now) {
  const life = view(now);
  const routine = M.routineById(life, data.id);
  if (!routine) return `${sheetHead("Rutin", "Finns inte längre")}`;
  const v = A.routines.view(life, routine, now);
  return `${sheetHead(v.variant === "short" ? "Rutin · kort version" : "Rutin", routine.name)}
    <p class="life-note">${esc(I.t(v.reason))}</p>
    <ul class="life-list routine-steps">${v.steps.map((step) => `<li class="life-row${step.done ? " is-done" : ""}"><button class="life-check${step.done ? " is-done" : ""}" type="button" data-action="life-routine-check" data-routine="${esc(routine.id)}" data-step="${esc(step.id)}" data-done="${step.done ? "false" : "true"}" aria-pressed="${step.done}" aria-label="${esc(step.label)}">${icon("check-circle")}</button><span class="life-row-main"><strong>${esc(step.label)}</strong><small>${I.duration(step.minutes)}${step.core ? "" : " · kan hoppas över"}</small></span></li>`).join("")}</ul>
    <div class="sheet-actions">
      <button class="button button-secondary" type="button" data-action="life-routine-variant" data-id="${esc(routine.id)}" data-variant="${v.variant === "short" ? "full" : "short"}">${v.variant === "short" ? "Visa hela" : "Kort version"}</button>
      <button class="button button-ghost" type="button" data-action="life-routine-remove" data-id="${esc(routine.id)}">Ta bort rutinen</button>
    </div>`;
}

function renderProjectSheet(data) {
  const life = state().life;
  const project = M.projectById(life, data.id);
  if (!project) return `${sheetHead("Projekt", "Finns inte längre")}`;
  const steps = It.projectActions(life, project.id);
  const progress = It.projectProgress(life, project.id);
  return `${sheetHead(`Projekt · ${progress.done} av ${progress.total} klara`, project.title)}
    ${project.outcome ? `<p class="life-note">${esc(project.outcome)}</p>` : ""}
    ${steps.length ? `<ul class="life-list">${steps.map((item, index) => `<li class="life-row"><button class="life-check" type="button" data-action="life-done" data-id="${esc(item.id)}" aria-label="Klart: ${esc(item.title)}">${icon("check-circle")}</button><span class="life-row-main"><strong>${esc(item.title)}</strong><small>${index === 0 ? "Nästa steg · syns i din dag" : "Senare steg"}</small></span></li>`).join("")}</ul>` : emptyLine("Inga steg ännu. Vad är det allra första?")}
    <form id="life-step-form" class="quick-add" data-project="${esc(project.id)}"><label class="sr-only" for="life-step-input">Nytt steg</label><input id="life-step-input" name="text" maxlength="140" placeholder="Nästa steg…" /><button class="button button-primary" type="submit" aria-label="Lägg till steg">${icon("plus", "button-icon")}</button></form>
    <div class="sheet-actions">
      <button class="button button-secondary" type="button" data-action="life-project-status" data-id="${esc(project.id)}" data-status="${project.status === "paused" ? "active" : "paused"}">${project.status === "paused" ? "Återuppta" : "Pausa projektet"}</button>
      <button class="button button-ghost" type="button" data-action="life-project-status" data-id="${esc(project.id)}" data-status="done">Projektet är klart</button>
    </div>`;
}

function renderSheet(now = new Date()) {
  const sheet = ui.sheet;
  if (!sheet) return "";
  switch (sheet.name) {
    case "item": return renderItemSheet(sheet.data, now);
    case "capture": return renderCaptureSheet(now);
    case "rebuild": return renderRebuildSheet(sheet.data);
    case "event": return renderEventSheet(sheet.data, now);
    case "routine": return renderRoutineSheet(sheet.data, now);
    case "project": return renderProjectSheet(sheet.data);
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
  requestAnimationFrame(() => dialog.querySelector("textarea, input:not([type=hidden]):not([type=radio]):not([type=checkbox])")?.focus({ preventScroll: true }));
}

function refreshSheet() {
  const dialog = sheetDialog();
  if (!dialog?.open || !ui.sheet) return;
  const scroller = dialog.querySelector(".modal-card");
  const top = scroller.scrollTop;
  scroller.innerHTML = renderSheet();
  scroller.scrollTop = top;
}

export function closeSheet() {
  const dialog = sheetDialog();
  ui.sheet = null;
  ui.confirmDelete = null;
  if (dialog?.open) dialog.close();
}

/** Keep typed candidate titles when the review list re-renders. */
function syncCandidates() {
  const form = document.querySelector("#life-review-form");
  const cands = ui.capture?.result?.candidates;
  if (!form || !cands) return;
  for (const c of cands) {
    const input = form.elements[`t-${c.tempId}`];
    if (input) c.title = input.value;
  }
}

/* ---------------- actions ---------------- */

function go(route) {
  closeSheet();
  env.go(route);
}

function runPatternAction(key, index, now) {
  const life = view(now);
  const obs = A.patterns.observations(life, now).find((o) => o.key === key);
  const action = obs?.actions?.[index];
  if (!action) return;
  commit([...(action.ops || []), { op: "pattern.dismiss", key }], { message: "Maja kommer ihåg det" });
}

/** Returns true when the click was an everyday action. */
export function handleClick(target) {
  const action = target.dataset.action || "";
  if (!action.startsWith("life-") && action !== "life") return false;
  const now = new Date();
  const s = state();
  ensureLife(s, now);
  const id = target.dataset.id;
  const key = today(now);
  switch (action) {
    case "life-undo": undo(); return true;
    case "life-close-sheet": closeSheet(); return true;
    case "life-done": completeItem(id, now); return true;
    case "life-reopen": commit([{ op: "item.reopen", id }], { keepSheet: ui.sheet?.name === "item" }); return true;
    case "life-open-item": openSheet("item", { id }); return true;
    case "life-do": ui.override = null; commit([{ op: "day.focus", date: key, itemId: id }], { quiet: true }); if (env.route() !== "today") go("today"); return true;
    case "life-pause": commit([{ op: "day.focus", date: key, itemId: null }], { quiet: true }); return true;
    case "life-else": ui.override = null; commit([{ op: "day.decline", date: key, itemId: id }], { quiet: true }); return true;
    case "life-easier": {
      const rec = E.whatNow(view(now), now, { easierThan: id });
      if (!rec) { env.toast("Det här är redan det lättaste just nu"); return true; }
      if (!rec.tiny) commitLife(s, [{ op: "day.decline", date: key, itemId: id }], { now });
      ui.override = { rec, at: Date.now() };
      env.persist(); env.render();
      return true;
    }
    case "life-notnow": {
      ui.override = null;
      const ops = [{ op: "day.quiet", date: key, until: U.minutesOfDay(now) + 45 }];
      if (id) ops.unshift({ op: "day.decline", date: key, itemId: id });
      commit(ops, { quiet: true });
      env.toast("Aura är tyst en stund. Du hittar allt i Min dag.");
      return true;
    }
    case "life-ask-next": commit([{ op: "day.quiet", date: key, until: null }], { quiet: true }); return true;
    case "life-capture": ui.capture = { text: "", result: null }; openSheet("capture"); return true;
    case "life-capture-restart": ui.capture = { text: ui.capture?.text || "", result: null }; refreshSheet(); return true;
    case "life-capture-inbox": {
      const text = (document.querySelector("#life-capture-form textarea")?.value || ui.capture?.text || "").trim();
      if (!text) { env.toast("Skriv något först"); return true; }
      commit([{ op: "item.add", item: { kind: "note", title: text.slice(0, 140), note: text.length > 140 ? text : "", status: "inbox", source: "dump" } }], { message: "Sparat i inkorgen" });
      ui.capture = null;
      return true;
    }
    case "life-capture-anyway": {
      const text = ui.capture?.text || "";
      commit([{ op: "item.add", item: { kind: "note", title: text.slice(0, 140), status: "inbox", source: "dump" } }], { message: "Sparat i inkorgen" });
      ui.capture = null;
      return true;
    }
    case "life-capture-ask": {
      const query = ui.capture?.text || "";
      ui.ask = { query, result: A.search.ask(view(now), query, now) };
      ui.capture = null;
      go("coach");
      requestAnimationFrame(() => document.querySelector("#ask-panel")?.scrollIntoView({ block: "start" }));
      return true;
    }
    case "life-cand-remove": {
      syncCandidates();
      if (ui.capture?.result) ui.capture.result.candidates = ui.capture.result.candidates.filter((c) => c.tempId !== target.dataset.temp);
      refreshSheet();
      return true;
    }
    case "life-item-when": {
      const item = M.itemById(s.life, id);
      commit([{ op: "item.postpone", id, to: target.dataset.to }], { message: item ? `${item.title} → ${target.dataset.to === "later" ? "senare" : "i morgon"}` : "" });
      return true;
    }
    case "life-item-drop": commit([{ op: "item.drop", id }]); return true;
    case "life-item-delete": {
      if (ui.confirmDelete !== id) { ui.confirmDelete = id; refreshSheet(); ui.confirmDelete = id; return true; }
      ui.confirmDelete = null;
      commit([{ op: "item.delete", id }]);
      return true;
    }
    case "life-item-skip": commit([{ op: "item.skip", id }]); return true;
    case "life-item-stoprepeat": commit([{ op: "item.update", id, patch: { recur: null } }], { keepSheet: true, message: "Upprepas inte längre" }); return true;
    case "life-item-split": {
      const item = M.itemById(s.life, id);
      if (!item) return true;
      commit([{ op: "item.split", id, first: `Börja på: ${item.title}`, minutes: Math.max(5, Math.round(item.minutes / 3)) }], { message: "En mindre första bit ligger först i dag" });
      return true;
    }
    case "life-item-move": {
      const life = s.life;
      const item = M.itemById(life, id);
      const bucket = item ? It.classify(life, item, key) : null;
      const list = bucket ? It.dayBuckets(life, key)[bucket] || [] : [];
      const index = list.findIndex((x) => x.id === id);
      const to = index + Number(target.dataset.dir || 0);
      if (index < 0 || to < 0 || to >= list.length) return true;
      const ids = list.map((x) => x.id);
      [ids[index], ids[to]] = [ids[to], ids[index]];
      commit([{ op: "item.reorder", ids }], { keepSheet: true, quiet: true });
      return true;
    }
    case "life-rebuild": openSheet("rebuild", { proposal: P.rebuild(view(now), now) }); return true;
    case "life-rebuild-apply": {
      const proposal = ui.sheet?.data?.proposal;
      if (!proposal?.ops?.length) { closeSheet(); return true; }
      const result = commit(proposal.ops, { message: `Dagen är ombyggd · ${proposal.moved.length} flyttade, ${proposal.added.length} intagna` });
      if (result.applied.length && proposal.moved.length) env.animal(`Jag flyttade ${proposal.moved.length} ${proposal.moved.length === 1 ? "sak" : "saker"} till lugnare dagar. Det som är kvar ryms.`, "Klara");
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
      const result = commit(plan.ops, { message: `Dagen är mindre · ${plan.moved.length} saker flyttade` });
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
      const day = M.getDay(s.life, key);
      const queue = (day.chaos?.queue || []).filter((x) => x !== id);
      commit([{ op: "day.chaos", date: key, queue: [...queue, id] }], { quiet: true });
      return true;
    }
    case "life-chaos-stop": commit([{ op: "day.chaos", date: key, queue: null }], { quiet: true }); go("today"); return true;
    case "life-evening-move": {
      const to = target.dataset.to === "later" ? "later" : "tomorrow";
      commit([{ op: "item.postpone", id, to }]);
      return true;
    }
    case "life-evening-skip": commit([{ op: "item.skip", id }]); return true;
    case "life-evening-drop": commit([{ op: "item.drop", id }]); return true;
    case "life-evening-moveall": {
      const ops = A.evening.moveAllOps(view(now), now);
      commit(ops, { message: `${ops.length} saker har fått en ny dag` });
      return true;
    }
    case "life-evening-finish": {
      const result = commit([{ op: "day.evening", date: key, done: true }], { quiet: true });
      if (result.applied.length) {
        env.rememberMoment({ id: `evening:${key}`, title: "Kvällen är stängd", kind: "reflection", characterId: "maja", route: "insights" });
        env.persist();
        env.render();
        env.animal("Kvällen är stängd. Allt har en plats, du behöver inte bära det i natt.", "Maja");
      }
      return true;
    }
    case "life-review-done": {
      commit([{ op: "meta.review", week: target.dataset.week }], { quiet: true });
      env.animal("Veckan är genomgången. Jag sparar det som hände, du kan släppa det.", "Maja");
      return true;
    }
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
    case "life-tab": {
      ui.lifeTab = target.dataset.tab || "inbox";
      if (target.dataset.go === "life" && env.route() !== "life") go("life");
      else env.render();
      return true;
    }
    case "life-inbox-today": commit([{ op: "item.process", id, patch: { date: key } }], { message: "Flyttad till i dag" }); return true;
    case "life-inbox-later": commit([{ op: "item.process", id, patch: { date: "" } }], { message: "Sparad till senare" }); return true;
    case "life-routine-open": openSheet("routine", { id }); return true;
    case "life-routine-check": commit([{ op: "routine.check", routineId: target.dataset.routine, stepId: target.dataset.step, date: key, done: target.dataset.done === "true" }], { keepSheet: true, quiet: true }); return true;
    case "life-routine-variant": commit([{ op: "routine.variant", routineId: id, date: key, variant: target.dataset.variant }], { keepSheet: true, quiet: true }); return true;
    case "life-routine-add": {
      const template = A.routines.template(target.dataset.kind);
      if (template) commit([{ op: "routine.add", routine: template }], { message: `Rutinen ${template.name} är tillagd` });
      return true;
    }
    case "life-routine-remove": commit([{ op: "routine.delete", id }]); return true;
    case "life-project-open": openSheet("project", { id }); return true;
    case "life-project-status": commit([{ op: "project.update", id, patch: { status: target.dataset.status } }], { keepSheet: target.dataset.status !== "done" }); return true;
    case "life-event-new": openSheet("event", {}); return true;
    case "life-event-open": openSheet("event", { id }); return true;
    case "life-event-delete": commit([{ op: "event.delete", id }]); return true;
    case "life-open-ask": go("coach"); requestAnimationFrame(() => { document.querySelector("#ask-panel")?.scrollIntoView({ block: "start" }); document.querySelector("#life-ask-input")?.focus({ preventScroll: true }); }); return true;
    case "life-ask-chip": {
      const query = target.dataset.text || "";
      ui.ask = { query, result: A.search.ask(view(now), query, now) };
      env.render();
      requestAnimationFrame(() => document.querySelector("#ask-result")?.focus({ preventScroll: true }));
      return true;
    }
    default:
      return false;
  }
}

/** select/time changes inside the capture review. */
export function handleChange(target) {
  const kind = target.dataset.change || "";
  if (!kind.startsWith("life-cand")) return false;
  const cands = ui.capture?.result?.candidates;
  const c = cands?.find((x) => x.tempId === target.dataset.temp);
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

function addParsed(text, { forceKind = "", inbox = false, defaultToday = false, message = "" } = {}, now = new Date()) {
  const s = state();
  const key = today(now);
  const life = view(now);
  const result = A.parse.parse(life, text, now);
  let cands = result.candidates;
  if (!cands.length) cands = [A.parse.quick(life, text, now)];
  const ops = cands.map((c) => {
    const cand = { ...c };
    if (forceKind) {
      cand.kind = forceKind;
      if (forceKind === "shopping" && !cand.category) cand.category = A.parse.productCategory(cand.title) || "other";
      if (forceKind === "admin") cand.adminStatus = cand.adminStatus || "action";
    }
    if (cand.kind === "event" && !cand.time) cand.kind = "task";
    if (defaultToday && !cand.date && !cand.dueDate && !["note", "idea", "shopping", "event"].includes(cand.kind) && !cand.recur) cand.date = key;
    return A.parse.toOp(cand, { today: key, inbox, source: "quick" });
  });
  const titles = cands.map((c) => c.title);
  commit(ops, { message: message || (titles.length === 1 ? `Tillagd: ${titles[0]}` : `${titles.length} saker tillagda`), keepSheet: Boolean(ui.sheet && ui.sheet.name === "project"), now });
  return s;
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
    case "life-quick-form":
      if (text) addParsed(text, { defaultToday: true }, now);
      return true;
    case "life-inbox-form":
      if (text) addParsed(text, { inbox: true, message: "Sparat i inkorgen" }, now);
      return true;
    case "life-shop-form":
      if (text) addParsed(text, { forceKind: "shopping" }, now);
      return true;
    case "life-admin-form":
      if (text) addParsed(text, { forceKind: "admin" }, now);
      return true;
    case "life-chore-form": {
      if (!text) return true;
      const repeat = String(data.get("repeat") || "week");
      const recur = repeat === "day" ? { unit: "day", every: 1, weekdays: [] } : repeat === "2week" ? { unit: "week", every: 2, weekdays: [] } : repeat === "month" ? { unit: "month", every: 1, weekdays: [] } : { unit: "week", every: 1, weekdays: [] };
      commit([{ op: "item.add", item: { kind: "chore", title: A.parse.cleanTitle(text), recur, dueDate: key, category: "home", minutes: 20, source: "manual" } }], { message: `Aura påminner om ${text}` });
      return true;
    }
    case "life-project-form":
      if (text) commit([{ op: "project.add", project: { title: text } }], { message: `Projektet ${text} är skapat` });
      return true;
    case "life-step-form": {
      const projectId = form.dataset.project;
      if (text && projectId) commit([{ op: "item.add", item: { kind: "task", title: text, projectId, source: "manual" } }], { keepSheet: true, message: "Steget är tillagt" });
      return true;
    }
    case "life-capture-form": {
      if (!text) { env.toast("Skriv något först"); return true; }
      ui.capture = { text, result: A.parse.parse(view(now), text, now) };
      refreshSheet();
      return true;
    }
    case "life-review-form": {
      syncCandidates();
      const cands = ui.capture?.result?.candidates || [];
      const ops = cands.filter((c) => String(c.title || "").trim()).map((c) => {
        const cand = { ...c, title: c.title.trim() };
        if (cand.kind === "event" && !cand.time) cand.kind = "task";
        return A.parse.toOp(cand, { today: key, source: "dump" });
      });
      if (!ops.length) { closeSheet(); return true; }
      commit(ops, { message: `${ops.length} ${ops.length === 1 ? "sak" : "saker"} på plats` });
      ui.capture = null;
      env.animal(ops.length > 3 ? "Allt är sorterat. Du behöver inte hålla det i huvudet längre." : "Sparat. Jag säger till när det blir aktuellt.", "Klara");
      return true;
    }
    case "life-item-form": {
      const itemId = form.dataset.id;
      const item = M.itemById(s.life, itemId);
      if (!item) return true;
      const patch = {
        title: String(data.get("title") || item.title).trim().slice(0, 140) || item.title,
        kind: String(data.get("kind") || item.kind),
        date: String(data.get("date") || ""),
        priority: String(data.get("priority") || ""),
        dueDate: String(data.get("dueDate") || ""),
        time: String(data.get("time") || ""),
        minutes: Number(data.get("minutes") || item.minutes),
        note: String(data.get("note") || "").slice(0, 1000),
      };
      if (data.has("category")) patch.category = String(data.get("category"));
      if (data.has("adminStatus")) { patch.adminStatus = String(data.get("adminStatus")); patch.followUp = String(data.get("followUp") || ""); }
      if (item.kind === "shopping") patch.staple = data.get("staple") === "on";
      if (patch.kind === "admin" && !patch.adminStatus) patch.adminStatus = "action";
      const ops = [{ op: item.status === "inbox" ? "item.process" : "item.update", id: itemId, patch }];
      commit(ops, { message: "Sparat" });
      return true;
    }
    case "life-event-form": {
      const title = String(data.get("title") || "").trim();
      if (!title) return true;
      const weekdays = data.getAll("weekday").map(Number);
      const event = {
        title,
        date: String(data.get("date") || key),
        start: String(data.get("start") || ""),
        end: String(data.get("end") || ""),
        away: data.get("away") === "on",
        recur: weekdays.length ? { weekdays } : null,
      };
      if (!event.end && event.start) event.end = U.toClock((U.toMinutes(event.start) ?? 0) + 60);
      commit(form.dataset.id ? [{ op: "event.update", id: form.dataset.id, patch: event }] : [{ op: "event.add", event: { ...event, source: "manual" } }], { message: `${title} är inlagd` });
      return true;
    }
    case "life-ask-form": {
      const query = String(data.get("query") || "").trim();
      if (!query) return true;
      ui.ask = { query, result: A.search.ask(view(now), query, now) };
      env.render();
      requestAnimationFrame(() => document.querySelector("#ask-result")?.focus({ preventScroll: true }));
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
      commit(ops, { message: `${ops.length} ${ops.length === 1 ? "sak" : "saker"} i inkorgen till i morgon` });
      return true;
    }
    case "life-intention-form": {
      commit([{ op: "day.intention", date: U.addDays(key, 1), text }], { message: text ? "Sparat till i morgon" : "Borttaget" });
      return true;
    }
    default:
      return false;
  }
}

/** One-tap energy from Idag: writes the day's pulse where the coach reads it too. */
export function energyOptions(current) {
  const labels = [[1, "Slut"], [2, "Lite"], [3, "Okej"], [4, "Bra"], [5, "Mycket"]];
  return `<div class="energy-tap" role="group" aria-labelledby="energy-title">${labels.map(([value, label]) => `<button type="button" data-action="set-energy" data-energy="${value}" aria-pressed="${current === value}"><strong>${value}</strong><small>${label}</small></button>`).join("")}</div>`;
}

export function sheetIsOpen() {
  return Boolean(sheetDialog()?.open);
}

export function onSheetClosed() {
  ui.sheet = null;
  ui.confirmDelete = null;
}
