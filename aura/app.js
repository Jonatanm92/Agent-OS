import {
  clamp,
  cycleEstimate,
  dailyCard,
  dayPhase,
  detectSafetyLevel,
  drawTarotSpread,
  forestVisit,
  formatShortDate,
  localDateKey,
  momentCoach,
  mulberry32,
  weeklyInsights
} from "./logic.js?v=31";
import { TAROT_CARDS, SPREAD_LABELS } from "./tarot-data.js?v=15";
import { JOURNAL_PROMPTS, MOODS, SOURCES, SYMPTOMS } from "./wellness-data.js?v=30.1";
import { appendCheckIn, clearAll, createInitialState, forestMomentsForDate, getTodayLog, loadState, rememberForestMoment, saveState, setCheckInAI, setCheckInFeedback, setTodayLog } from "./storage.js?v=34";
import { dailyStarReading, moonPhase, zodiacSign } from "./mystic-data.js?v=15";
import { getAmbientLabel, setAmbientEnabled, setAmbientRoute, setAmbientVolume } from "./audio-scapes.js?v=33";
import { experimentProgress, getActiveExperiment, markExperimentDay, personalInsights } from "./insights-engine.js?v=33";
import { clientSafetyResponse, renderSafetyCard } from "./client-safety.js?v=16";
import { buildCoachPriorTurns, coachTranscriptPatch, coachTranscriptView } from "./coach-transcript.js?v=15";
import { PANTRY_GOALS, PANTRY_ITEMS, buildPantrySuggestion, collectDueReminders, createAuraReminder, minutesUntilReminder, nextPendingReminder, saveHelpfulTool } from "./care-tools.js?v=27.5";
import { commitLife, ensureLife, housekeepLife, moduleOn, resetHistory } from "./life.js?v=2";
import * as everyday from "./everyday.js?v=2";

const main = document.querySelector("#main-content");
const toastElement = document.querySelector("#toast");
const breathingDialog = document.querySelector("#breathing-dialog");
const settingsDialog = document.querySelector("#settings-dialog");
const resetDialog = document.querySelector("#reset-dialog");
const reminderDialog = document.querySelector("#reminder-dialog");
const reminderDraftCopy = document.querySelector("#reminder-draft-copy");
const routePill = document.querySelector("#route-pill");
const animalResponse = document.querySelector("#animal-response");
const soundButton = document.querySelector('[data-action="toggle-audio"]');
const lifeSheet = document.querySelector("#life-sheet");

let state = loadState();
ensureLife(state);
if (housekeepLife(state)) {
  try { saveState(state); } catch { /* persist() reports storage problems on the first real change */ }
}
setAmbientVolume(state.preferences.audioVolume);
let route = "today";
let lastRenderedRoute = null;
let dailyRevealed = false;
let currentSpread = null;
let spreadRevealCount = 0;
let toastTimer = null;
let animalTimer = null;
let breathing = { active: false, elapsed: 0, interval: null };
let coachStepIndex = 0;
let coachStepSimple = false;
let coachSequenceDone = false;
let mysticMode = "today";
let ritualMinutes = 3;
let ritualTimer = { remaining: 0, interval: null };
let audioActive = false;
let dailyDrawOffset = 0;
let aiCoachLoadingId = null;
let aiCoachErrorId = null;
let aiCoachErrorCode = null;
let aiRequestSerial = 0;
let lastFailedAIRequest = null;
let coachPrefill = null;
let coachCheckinStep = 0;
let coachEditing = false;
let insightsRange = 28;
let cycleMode = "today";
let reminderDraft = null;
let reminderTimer = null;
let settingsVolumeBeforeOpen = null;

const ROUTE_LABELS = { today: "Idag", coach: "Coach", cycle: "Cykel", ritual: "Mystik", insights: "Mönster", life: "Livet", day: "Min dag", low: "Låg energi", chaos: "Kaos", evening: "Kvällen", week: "Veckan" };
const ROUTES = Object.keys(ROUTE_LABELS);
// Everyday pages borrow the palette, light and sound of the world they belong to…
const ROUTE_THEME = { day: "today", low: "coach", chaos: "coach", life: "insights", evening: "insights", week: "insights" };
// …and light up the tab of the companion who holds them.
const ROUTE_TAB = { day: "today", low: "today", chaos: "today", insights: "life", evening: "life", week: "life" };

const COACH_NEEDS = [
  { value: "food", label: "Mat & energi", detail: "Jag behöver äta eller få jämnare ork", icon: "heart" },
  { value: "calm", label: "Lugnare i kroppen", detail: "Jag känner stress, oro eller för mycket påslag", icon: "half-moon" },
  { value: "structure", label: "Få överblick", detail: "Jag vet inte vad jag ska börja med", icon: "check-circle" },
  { value: "cycle", label: "PMS & kropp", detail: "Mens, PMS eller andra kroppsliga besvär", icon: "half-moon" },
  { value: "rest", label: "Vila & sömn", detail: "Jag är trött eller har sovit dåligt", icon: "home" },
  { value: "boost", label: "Pepp & sällskap", detail: "Jag känner mig låg, ensam eller behöver medvind", icon: "sparks" }
];

const COACH_FOLLOWUPS = {
  food: ["Gör matsteget ännu enklare", "Vad kan jag äta av det jag har?", "Ge mig ett annat matförslag"],
  calm: ["Hjälp mig lugna tankarna", "Gör steget ännu enklare", "Ge mig ett annat sätt"],
  structure: ["Vilken sak börjar jag med?", "Gör steget mindre", "Ge mig ett annat upplägg"],
  cycle: ["Vad kan hjälpa just i dag?", "Förklara varför", "Ge mig ett annat alternativ"],
  rest: ["Vad kan jag göra redan nu?", "Gör steget enklare", "Hjälp mig med kvällen"],
  boost: ["Peppa mig lite mer", "Föreslå något som kan ge medvind", "Ge mig ett annat spår"]
};

const COMPANION_ASSETS = {
  bunny: "/assets/companions/klara-coach.webp",
  cycle: "/assets/companions/klara-cycle-v11.webp",
  owl: "/assets/companions/astrid-mystic.webp",
  owlMotion: "/assets/companions/astrid-mystic-motion.webp",
  hamster: "/assets/companions/maja-journal.webp"
};

const CHARACTERS = {
  klara: { name: "Klara", role: "Vardagscoach", asset: COMPANION_ASSETS.bunny, route: "coach", line: "Jag gör stunden tydlig och hittar mat, vila, pepp eller ett praktiskt nästa steg." },
  liv: { name: "Liv", role: "PMS- & cykelguide", asset: COMPANION_ASSETS.cycle, route: "cycle", line: "Jag hjälper dig med dagens symtom direkt — cykeldata är frivillig och gör bara kartan smartare." },
  maja: { name: "Maja", role: "Mönsterkompis", asset: COMPANION_ASSETS.hamster, route: "insights", line: "Jag samlar det som hjälpte, små vinster och sådant du vill minnas." },
  astrid: { name: "Astrid", role: "Mystikguide", asset: COMPANION_ASSETS.owl, route: "ritual", line: "Jag håller i tarot, stjärnhimmel och stilla reflektion vid nattsjön." }
};

const WORLD_ASSETS = {
  ritual: "/assets/worlds/mystic-enchanted-v35.webp",
  ritualUI: "/assets/worlds/mystic-ui-veil.webp"
};

const WORLD_PATH_ASSETS = {
  today: "/assets/worlds/today-enchanted-v35.webp",
  coach: "/assets/worlds/coach-enchanted-v35.webp",
  cycle: "/assets/worlds/cycle-enchanted-v35.webp",
  insights: "/assets/worlds/insights-enchanted-v35.webp"
};

function escapeHTML(value = "") {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

function coachNeedLabel(value) {
  return COACH_NEEDS.find((item) => item.value === value)?.label || "Stöd just nu";
}

function coachNotePlaceholder(need) {
  return ({
    food: "Till exempel: Jag har knäckebröd och ägg hemma, men ingen ork att laga något.",
    calm: "Till exempel: Jag kan inte släppa tankarna efter samtalet.",
    structure: "Till exempel: Jag har tre saker att göra och vet inte var jag ska börja.",
    cycle: "Till exempel: Jag har kramper och blir lättirriterad i dag.",
    rest: "Till exempel: Jag sov oroligt och behöver ändå få vardagen att fungera.",
    boost: "Till exempel: Jag känner mig ensam i kväll och behöver lite medvind."
  })[need] || "Skriv det som tar mest plats just nu…";
}

function wantsFoodSupport(entry = {}) {
  const text = `${entry.note || ""} ${entry.aiCoach?.headline || ""}`.toLocaleLowerCase("sv-SE");
  return entry.need === "food"
    || entry.source === "pantry"
    || /\b(?:mat|äta|äter|ätit|hungr|frukost|lunch|middag|mellanmål|knäckebröd|ägg)\w*/u.test(text);
}

let storageFailing = false;
function persist() {
  try {
    saveState(state);
    storageFailing = false;
  } catch {
    // Private windows and full storage refuse writes. Never let a toast suggest it was saved.
    storageFailing = true;
    toast("Kunde inte spara i webbläsaren — ändringen finns bara tills sidan stängs");
  }
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 11) return "God morgon";
  if (hour < 17) return "Hej mitt på dagen";
  if (hour < 22) return "God kväll";
  return "Hej nattuggla";
}

function dayPhaseLabel(phase = dayPhase()) {
  return ({ dawn: "morgonljus", day: "dagsljus", dusk: "kvällsljus", night: "nattskog" })[phase] || "skogen";
}

function forestGrowthState(moments = []) {
  if (!moments.length) return "quiet";
  return moments.length === 1 ? "glowing" : "blooming";
}

function rememberMoment(moment, date = new Date()) {
  return rememberForestMoment(state, moment, date);
}

function forestMomentTime(moment) {
  const date = new Date(moment?.createdAt || "");
  return Number.isNaN(date.getTime()) ? "i dag" : new Intl.DateTimeFormat("sv-SE", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function formattedToday() {
  const label = new Intl.DateTimeFormat("sv-SE", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function icon(path, className = "") {
  return `<img class="${className}" src="/assets/icons/${path}.svg" alt="" aria-hidden="true" />`;
}

function actionIcon(id) {
  const asset = ({ safety: "heart", ground: "home", breathe: "half-moon", fuel: "heart", water: "half-moon", daylight: "sparks", simplify: "check-circle", sleep: "half-moon", connect: "heart", celebrate: "sparks", tinyJoy: "sparks", confidence: "stats-up-square", orient: "home", fourCheck: "half-moon", nextVisible: "check-circle", listen: "heart", separationPause: "half-moon", pmsMargin: "half-moon", simpleMeal: "heart", rehydrate: "half-moon", careBleeding: "heart", carePain: "heart", careNavigate: "nav-arrow-right", contraceptionReview: "journal-page" })[id] || "sparks";
  return icon(asset);
}

function companion(animal, _legacyIcon, name, text) {
  const asset = COMPANION_ASSETS[animal] || COMPANION_ASSETS.bunny;
  return `<div class="companion" data-animal="${animal}"><div class="companion-avatar" aria-hidden="true"><img src="${asset}" alt="" /></div><p><strong>${escapeHTML(name)}</strong>${text}</p></div>`;
}

function characterDialogue(characterId, text, label) {
  const character = CHARACTERS[characterId] || CHARACTERS.klara;
  return `<div class="character-dialogue" data-character="${characterId}"><div class="character-dialogue-art"><img src="${character.asset}" alt="${escapeHTML(character.name)}" /></div><div class="character-speech"><strong>${escapeHTML(label || `${character.name} · ${character.role}`)}</strong><p>${escapeHTML(text)}</p></div></div>`;
}

function renderGuideTeam() {
  return `<section class="guide-team" aria-labelledby="guide-team-title"><div class="section-heading"><div><p class="eyebrow">Ditt levande peppteam</p><h2 id="guide-team-title">Fyra vänner, fyra tydliga roller</h2></div><p>Tryck på den som passar stunden.</p></div><div class="guide-team-grid">${Object.entries(CHARACTERS).map(([id, character]) => `<button class="guide-team-card" type="button" data-route="${character.route}" data-character="${id}"><span class="guide-team-art"><img src="${character.asset}" alt="" /></span><span><strong>${character.name}</strong><small>${character.role}</small><em>${character.line}</em></span>${icon("nav-arrow-right")}</button>`).join("")}</div></section>`;
}

function renderForestVisit(latestCheckIn, forestMoments = []) {
  const latestForestMoment = forestMoments[0] || null;
  const visit = forestVisit({ latestCheckIn, latestForestMoment });
  if (!visit) return "";
  const character = CHARACTERS[visit.characterId] || CHARACTERS.klara;
  const memoryRibbon = latestForestMoment
    ? `<div class="forest-memory-ribbon">${icon("sparks")}<span><strong>${forestMoments.length === 1 ? "Ett spår från i dag" : `${forestMoments.length} spår från i dag`}</strong><small>Senast ${forestMomentTime(latestForestMoment)} · ${escapeHTML(latestForestMoment.title)}</small></span></div>`
    : "";
  return `<section class="section forest-visit" data-phase="${visit.phase}" data-growth="${forestGrowthState(forestMoments)}" aria-labelledby="forest-visit-title">
    <div class="forest-visit-art" data-character="${visit.characterId}" aria-hidden="true"><img src="${character.asset}" alt="" /></div>
    <div class="forest-visit-copy"><p class="eyebrow">${escapeHTML(visit.eyebrow)}</p><h2 id="forest-visit-title">${escapeHTML(visit.title)}</h2><p>${escapeHTML(visit.body)}</p>${memoryRibbon}<button class="button button-secondary" type="button" data-action="open-forest-visit" data-target-route="${visit.route}" data-need="${escapeHTML(visit.need || "")}">${escapeHTML(visit.actionLabel)} ${icon("nav-arrow-right", "button-icon")}</button></div>
    <span class="forest-visit-name">${escapeHTML(character.name)} · ${escapeHTML(character.role)}</span>
  </section>`;
}

function renderForestTrail(moments = []) {
  if (!moments.length) return "";
  return `<section class="forest-panel forest-trail" aria-labelledby="forest-trail-title">
    <div class="forest-trail-art" aria-hidden="true"><img src="${CHARACTERS.maja.asset}" alt="" /></div>
    <div class="forest-trail-copy"><p class="eyebrow">Dagens spår · inga streaks</p><h2 id="forest-trail-title">Skogen minns det som blev gjort</h2><p>Det här är små ledtrådar för nästa liknande stund, inte en lista att hinna ikapp.</p><ol>${moments.slice(0, 3).map((moment) => `<li>${icon(moment.kind === "helped" ? "heart" : "check-circle")}<span><strong>${escapeHTML(moment.title)}</strong><small>${moment.kind === "helped" ? "hjälpte lite" : moment.kind === "reflection" ? "sparad reflektion" : "gjort"} · ${forestMomentTime(moment)}</small></span></li>`).join("")}</ol></div>
  </section>`;
}

function renderWorldHero({ world, eyebrow, title, body, guide, guideName, actions = "", compact = false }) {
  const character = world === "ritual"
    ? COMPANION_ASSETS.owl
    : world === "insights"
      ? COMPANION_ASSETS.hamster
    : world === "cycle"
      ? COMPANION_ASSETS.cycle
      : world === "coach"
        ? COMPANION_ASSETS.bunny
        : COMPANION_ASSETS.bunny;
  const portraits = world === "today"
    ? `<div class="world-guide-portraits is-team"><img class="team-character team-klara" src="${COMPANION_ASSETS.bunny}" alt="Klara" /><img class="team-character team-liv" src="${COMPANION_ASSETS.cycle}" alt="Liv" /><img class="team-character team-astrid" src="${COMPANION_ASSETS.owl}" alt="Astrid" /><img class="team-character team-maja" src="${COMPANION_ASSETS.hamster}" alt="Maja" /></div>`
    : `<div class="world-guide-portraits"><img class="guide-primary" src="${character}" alt="${guideName}" />${world === "ritual" ? `<img class="guide-motion" src="${COMPANION_ASSETS.owlMotion}" alt="" aria-hidden="true" />` : ""}</div>`;
  const sceneLabel = getAmbientLabel(world);
  return `<section class="world-hero world-${world}${compact ? " is-compact" : ""}">
    <div class="world-scrim" aria-hidden="true"></div>
    <div class="world-copy"><p class="eyebrow">${eyebrow}</p><h1>${title}</h1><p>${body}</p>${actions ? `<div class="world-actions">${actions}</div>` : ""}<button class="world-sound-invite" type="button" data-action="toggle-audio" aria-pressed="${audioActive}">${icon(audioActive ? "sound-high" : "sound-off")}<span><strong>${audioActive ? `${sceneLabel} är på` : `Slå på ${sceneLabel.toLocaleLowerCase("sv-SE")}`}</strong><small>${audioActive ? "Tryck för att stänga av" : "Lugn bakgrund · du styr själv"}</small></span></button></div>
    <div class="world-guide"><div class="world-speech"><strong>${guideName}</strong><span>${guide}</span></div>${portraits}</div>
  </section>`;
}

function renderActions(actions) {
  const isSequence = actions.length === 3 && actions.map((action) => action.id).join(",") === "orient,fourCheck,nextVisible";
  const item = (action) => `<${isSequence ? "li" : "article"} class="coach-action" data-tone="${action.tone}"><div class="coach-action-icon" aria-hidden="true">${actionIcon(action.id)}</div><div><p class="eyebrow">${action.eyebrow}</p><h3>${action.title}</h3><p>${action.body}</p></div><span class="time">${action.minutes}</span></${isSequence ? "li" : "article"}>`;
  return `<${isSequence ? "ol" : "div"} class="coach-list${isSequence ? " is-sequence" : ""}">${actions.map(item).join("")}</${isSequence ? "ol" : "div"}>`;
}

function formatCheckInTime(value) {
  return new Intl.DateTimeFormat("sv-SE", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function situationLabel(value) {
  return ({ general: "Allmänt", overwhelmed: "Virrig eller överväldigad", spark: "Något att se fram emot", confidence: "Självkänsla", separation: "Separation", pms: "PMS eller mens", lonely: "Ensamhet", conflict: "Konflikt", sleep: "Sömn", body: "Kropp och ork" })[value] || "Allmänt";
}

function renderGuidance(guidance) {
  if (!guidance.length) return "";
  return `<div class="guidance-grid">${guidance.map((item) => `<article class="guidance-card"><p class="eyebrow">Bra att veta</p><h3>${item.title}</h3><p>${item.body}</p><details class="guidance-source"><summary>Källa & fördjupning</summary><a href="${item.url}" target="_blank" rel="noreferrer">${item.sourceLabel} ${icon("nav-arrow-right")}</a></details></article>`).join("")}</div>`;
}

function renderCrisisResponse(response, entry) {
  return renderSafetyCard(response, { id: "moment-result", label: `Mänsklig hjälp först · ${formatCheckInTime(entry.createdAt)}` });
}

const SIMPLE_COACH_ACTIONS = {
  orient: { title: "Sänk ljudet", body: "Lägg mobilen med skärmen nedåt och stäng av ett ljud omkring dig. Stanna där.", minutes: "20 sek" },
  fourCheck: { title: "Välj ett grundbehov", body: "Välj bara ett: lite mat, ett glas vatten, toaletten eller fem minuters vila. Ordna det och stanna.", minutes: "2 min" },
  nextVisible: { title: "Gör en sak", body: "Välj den sak som gör nästa timme enklast. Gör bara den och stanna när den är klar.", minutes: "5 min" },
  breathe: { title: "Gör en lång utandning", body: "Andas in som vanligt. Andas sedan ut långsamt medan du räknar till sex. Klart efter en utandning.", minutes: "20 sek" },
  ground: { title: "Nämn tre saker du ser", body: "Titta rakt fram och säg namnet på tre synliga föremål. Stanna efter föremål nummer tre.", minutes: "30 sek" },
  water: { title: "Ta en klunk vatten", body: "Häll upp lite vatten, ta en klunk och ställ glaset där du ser det. Klart efter klunken.", minutes: "1 min" },
  fuel: { title: "Ta fram ett enkelt mellanmål", body: "Lägg en frukt, yoghurt eller smörgås framför dig. Du behöver inte äta färdigt nu. Klart när maten står framme.", minutes: "2 min" },
  simpleMeal: { title: "Lägg fram två saker", body: "Lägg fram bröd och ett pålägg, eller yoghurt och havre. Stanna när de två sakerna står framför dig.", minutes: "2 min" },
  connect: { title: "Skicka en enda rad", body: "Skicka till en trygg person: ‘Har du fem minuter att vara med mig?’ Stanna när meddelandet är skickat.", minutes: "1 min" },
  listen: { title: "Skriv en enda mening", body: "Öppna Anteckningar och skriv: ‘Just nu känner jag …’. Sätt punkt efter första meningen och stanna.", minutes: "1 min" },
  simplify: { title: "Stryk två saker", body: "Skriv tre saker du funderar på. Stryk de två som får vänta och behåll bara en rad. Stanna där.", minutes: "2 min" },
  separationPause: { title: "Lägg meddelandet i utkast", body: "Skriv meddelandet i Anteckningar i stället för chatten. Sätt en timer på tio minuter och stanna tills den ringer.", minutes: "10 min" }
};

function simplerCoachAction(action) {
  return { ...action, ...(SIMPLE_COACH_ACTIONS[action.id] || { title: "Gör bara första minuten", body: `Sätt en timer på en minut. Börja med handlingen “${action.title.toLocaleLowerCase("sv-SE")}” och stanna direkt när timern ringer.`, minutes: "1 min" }) };
}

function toolFromAction(action, source = "Klara") {
  if (!action?.title || !action?.body) return null;
  return { title: action.title, body: action.body, why: action.why || "", minutes: action.minutes || "några minuter", source };
}

function latestCoachTool(origin = "coach") {
  if (origin === "pantry") {
    const plan = state.preferences?.pantryPlan;
    return plan ? { title: plan.title, body: plan.steps?.join(" ") || "", why: `${plan.why || ""} ${plan.goalNote || ""}`.trim(), minutes: plan.minutes, source: "Klaras matkompass" } : null;
  }
  const log = getTodayLog(state);
  const latest = log.checkIns?.[0];
  if (!latest) return null;
  if (origin === "ai") return toolFromAction(latest.aiCoach?.firstStep, latest.persona === "liv" ? "Liv AI" : "Klara AI");
  const actions = momentCoach(latest, log.checkIns?.[1] || null).actions || [];
  const action = actions.length ? actions[coachStepIndex % actions.length] : null;
  return toolFromAction(coachStepSimple && action ? simplerCoachAction(action) : action, latest.persona === "liv" ? "Liv" : "Klara");
}

function lastHelpedTool(log) {
  const checkIns = Array.isArray(log.checkIns) ? log.checkIns : [];
  const index = checkIns.findIndex((entry) => entry.feedback === "better");
  if (index < 0) return null;
  const entry = checkIns[index];
  const fromAI = toolFromAction(entry.aiCoach?.firstStep, entry.persona === "liv" ? "Liv AI" : "Klara AI");
  if (fromAI) return fromAI;
  const action = momentCoach(entry, checkIns[index + 1] || null).actions?.[0];
  return toolFromAction(action, entry.persona === "liv" ? "Liv" : "Klara");
}

function toolActionButtons(origin, { id = "", allowSave = true } = {}) {
  const identity = id ? ` data-id="${escapeHTML(id)}"` : "";
  return `<div class="keep-tool-actions">${allowSave ? `<button class="text-button" type="button" data-action="save-current-tool" data-origin="${origin}"${identity}>${icon("journal-page")} Spara i hjälplådan</button>` : ""}<button class="text-button" type="button" data-action="open-reminder" data-origin="${origin}"${identity}>${icon("calendar")} Påminn mig</button></div>`;
}

function renderPantryCompass() {
  const selected = new Set(Array.isArray(state.preferences?.pantryItems) ? state.preferences.pantryItems : []);
  const goal = PANTRY_GOALS.some((item) => item.id === state.preferences?.pantryGoal) ? state.preferences.pantryGoal : "quick";
  const plan = state.preferences?.pantryPlan;
  return `<section class="pantry-compass forest-panel" aria-labelledby="pantry-title">
    <div class="pantry-heading">${companion("bunny", "", "Klara öppnar skafferiet", "Markera det som faktiskt finns. Jag gör ett litet förslag utan inköpslista eller perfektion.")}<div><p class="eyebrow">Ny · matkompassen</p><h2 id="pantry-title">Vad kan jag äta av det jag har?</h2></div></div>
    <form id="pantry-form" class="pantry-form">
      <fieldset><legend>Det här finns hemma</legend><div class="pantry-chips">${PANTRY_ITEMS.map((item) => `<label class="pantry-chip"><input type="checkbox" name="ingredient" value="${item.id}" ${selected.has(item.id) ? "checked" : ""} /><span>${escapeHTML(item.label)}</span></label>`).join("")}</div></fieldset>
      <fieldset><legend>Vad ska det hjälpa med?</legend><div class="pantry-goals">${PANTRY_GOALS.map((item) => `<label><input type="radio" name="goal" value="${item.id}" ${item.id === goal ? "checked" : ""} /><span>${escapeHTML(item.label)}</span></label>`).join("")}</div></fieldset>
      <button class="button button-primary" type="submit">Gör ett matförslag ${icon("nav-arrow-right", "button-icon")}</button>
    </form>
    ${plan?.title ? `<article class="pantry-result light-clearing" tabindex="-1" id="pantry-result"><div class="pantry-result-top"><div><p class="eyebrow">Klaras förslag · ${escapeHTML(plan.minutes)}</p><h3>${escapeHTML(plan.title)}</h3></div><span class="soft-badge">${escapeHTML(plan.goalLabel)}</span></div><ol>${(plan.steps || []).map((step) => `<li>${escapeHTML(step)}</li>`).join("")}</ol><p class="pantry-why"><strong>Varför det kan hjälpa</strong>${escapeHTML(plan.why)} ${escapeHTML(plan.goalNote)}</p><div class="pantry-result-actions"><button class="button button-secondary" type="button" data-action="pantry-ai">Gör den personlig med AI ${icon("sparks", "button-icon")}</button>${toolActionButtons("pantry")}</div></article>` : ""}
  </section>`;
}

function renderReminderBanner() {
  const reminder = nextPendingReminder(state.reminders, new Date());
  if (!reminder) return "";
  const minutes = minutesUntilReminder(reminder, new Date());
  const timeLabel = minutes >= 60 ? "om ungefär en timme" : minutes <= 1 ? "alldeles strax" : `om ${minutes} minuter`;
  return `<section class="soft-reminder-banner" aria-label="Aktiv påminnelse"><span class="reminder-glow" aria-hidden="true"></span><div><p class="eyebrow">Klara kommer tillbaka ${timeLabel}</p><strong>${escapeHTML(reminder.title)}</strong><small>${escapeHTML(reminder.body)}</small></div><button class="text-button" type="button" data-action="cancel-reminder" data-id="${escapeHTML(reminder.id)}">Ta bort</button></section>`;
}

function renderTodayExperiment() {
  const progress = experimentProgress(state.preferences.activeExperiment);
  if (!progress) return "";
  const lastResult = Array.isArray(state.preferences.experimentHistory) ? state.preferences.experimentHistory[0] : null;
  const progressLabel = progress.readyForFeedback
    ? "Tre försök klara — nu räcker det"
    : progress.doneToday
      ? `Dagens försök sparat · ${progress.completed} av ${progress.days}`
      : `${progress.remaining} ${progress.remaining === 1 ? "försök" : "försök"} kvar`;
  const dots = Array.from({ length: progress.days }, (_, index) => `<span class="${index < progress.completed ? "is-done" : ""}" aria-hidden="true"></span>`).join("");
  return `<section class="section forest-panel today-experiment" aria-labelledby="today-experiment-title">
    <div class="today-experiment-art" aria-hidden="true"><img src="${CHARACTERS.maja.asset}" alt="" /></div>
    <div class="today-experiment-copy"><p class="eyebrow">Majas lilla test · inga streaks</p><h2 id="today-experiment-title">${escapeHTML(progress.title)}</h2><p>${escapeHTML(progress.body)}</p><strong class="experiment-measure">Följ: ${escapeHTML(progress.measure)}</strong>
      <div class="experiment-progress" aria-label="${escapeHTML(progressLabel)}">${dots}<small>${escapeHTML(progressLabel)}</small></div>
      ${progress.readyForFeedback ? `<div class="experiment-feedback" role="group" aria-label="Hjälpte det lilla testet?"><button class="button button-primary" type="button" data-action="finish-insight-experiment" data-outcome="helped">Ja, lite</button><button class="button button-secondary" type="button" data-action="finish-insight-experiment" data-outcome="unclear">Ingen tydlig skillnad</button></div>` : `<div class="experiment-actions"><button class="button button-primary" type="button" data-action="mark-insight-experiment" ${progress.doneToday ? "disabled" : ""}>${progress.doneToday ? "Sparat för i dag" : "Jag gjorde det i dag"}</button><button class="text-button is-muted" type="button" data-action="stop-insight-experiment">Avsluta testet</button></div>`}
      ${lastResult ? `<p class="experiment-memory">Maja minns förra testet: ${lastResult.outcome === "helped" ? "det hjälpte lite" : "ingen tydlig skillnad ännu"}.</p>` : ""}
    </div>
  </section>`;
}

function renderToolbox(log) {
  const saved = Array.isArray(state.toolbox) ? state.toolbox.slice(0, 3) : [];
  const helped = lastHelpedTool(log);
  const helpedIsSaved = helped && saved.some((item) => item.title.trim().toLocaleLowerCase("sv-SE") === helped.title.trim().toLocaleLowerCase("sv-SE"));
  return `<section class="section forest-panel helpful-toolbox" aria-labelledby="toolbox-title">
    <div class="section-heading"><div><p class="eyebrow">Min hjälplåda</p><h2 id="toolbox-title">Saker värda att hitta tillbaka till</h2></div><p>Inga streaks — bara sådant som var användbart.</p></div>
    ${helped ? `<article class="last-helped light-clearing"><span class="helped-spark">${icon("sparks")}</span><div><p class="eyebrow">Senast du svarade “lite bättre”</p><h3>${escapeHTML(helped.title)}</h3><p>${escapeHTML(helped.body)}</p></div>${helpedIsSaved ? `<span class="soft-badge">sparad</span>` : `<button class="button button-secondary" type="button" data-action="save-current-tool" data-origin="helped">Spara</button>`}</article>` : saved.length ? "" : `<div class="toolbox-empty">${companion("hamster", "", "Maja håller platsen varm", "När du markerar ‘lite bättre’ eller sparar ett bra tips hamnar det här, lätt att hitta igen.")}</div>`}
    ${saved.length ? `<div class="saved-tool-list">${saved.map((tool) => `<article><div><span>${escapeHTML(tool.source || "Aura")} · ${escapeHTML(tool.minutes || "några minuter")}</span><h3>${escapeHTML(tool.title)}</h3><p>${escapeHTML(tool.body)}</p></div><div class="saved-tool-actions"><button class="button button-secondary" type="button" data-action="do-saved-tool" data-id="${escapeHTML(tool.id)}">Gör nu</button>${toolActionButtons("toolbox", { id: tool.id, allowSave: false })}<button class="text-button is-muted" type="button" data-action="remove-saved-tool" data-id="${escapeHTML(tool.id)}">Ta bort</button></div></article>`).join("")}</div>` : ""}
  </section>`;
}

function renderCoachStep(action, index, total) {
  const shown = coachStepSimple ? simplerCoachAction(action) : action;
  return `<article class="coach-focus-card" data-tone="${shown.tone}">
    <div class="coach-focus-top"><span class="coach-action-icon" aria-hidden="true">${actionIcon(shown.id)}</span><span class="soft-badge">steg ${index + 1} av ${total}</span></div>
    <p class="eyebrow">${escapeHTML(shown.eyebrow)}</p>
    <h2>${escapeHTML(shown.title)}</h2>
    <p class="coach-focus-body">${escapeHTML(shown.body)}</p>
    ${shown.why ? `<p class="coach-why"><strong>Varför det kan hjälpa</strong>${escapeHTML(shown.why)}</p>` : ""}
    <span class="time">${escapeHTML(shown.minutes)}</span>
    <div class="coach-step-actions">
      <button class="button button-primary" type="button" data-action="complete-coach-step">${icon("check-circle", "button-icon")} Klart</button>
      <button class="button button-secondary" type="button" data-action="simplify-coach-step">Gör det enklare</button>
      <button class="button button-ghost" type="button" data-action="swap-coach-step">Byt spår</button>
    </div>
    ${toolActionButtons("coach")}
  </article>`;
}

function renderCheckInFeedback(latest, label = "Hur känns det efter det första lilla steget?") {
  return `<div class="follow-up"><div><strong>${escapeHTML(label)}</strong><small>Det hjälper nästa svar att följa hur stunden förändras.</small></div><div class="feedback-buttons" role="group" aria-label="Hur känns det efter steget?">${[
    ["better", "Lite bättre"], ["same", "Oförändrat"], ["worse", "Sämre"]
  ].map(([value, text]) => `<button type="button" data-action="checkin-feedback" data-id="${latest.id}" data-feedback="${value}" aria-pressed="${latest.feedback === value}">${text}</button>`).join("")}</div></div>`;
}

function actionForCheckIn(entry, preferredIndex = 0) {
  if (!entry) return null;
  if (entry.aiCoach?.firstStep?.title && entry.aiCoach?.firstStep?.body) return entry.aiCoach.firstStep;
  const checkIns = getTodayLog(state).checkIns || [];
  const entryIndex = checkIns.findIndex((item) => item.id === entry.id);
  const previous = entryIndex >= 0 ? checkIns[entryIndex + 1] || null : null;
  const actions = momentCoach(entry, previous).actions || [];
  if (!actions.length) return null;
  return actions[Math.max(0, Number(preferredIndex) || 0) % actions.length];
}

function rememberCheckInAction(entry, action, { kind = "done", suffix = "step" } = {}) {
  if (!entry || !action?.title) return null;
  const persona = entry.persona === "liv" ? "liv" : "klara";
  return rememberMoment({
    id: `coach:${entry.id}:${suffix}`,
    title: action.title,
    kind,
    characterId: persona,
    route: persona === "liv" ? "cycle" : "coach"
  });
}

function renderAICoachResponse(entry, { personaName = "Klara", compact = false } = {}) {
  const ai = entry.aiCoach;
  const isFollowup = ai.mode === "followup";
  const isFallback = Boolean(ai.fallback || ai.model === "local-fallback");
  const failedQuestion = aiCoachErrorId === entry.id && lastFailedAIRequest?.entryId === entry.id
    ? String(lastFailedAIRequest.question || "")
    : "";
  const transcript = coachTranscriptView(entry);
  const transcriptHTML = isFollowup && (transcript.opening || transcript.previousTurns.length || transcript.currentUser)
    ? `<div class="ai-chat-thread" aria-label="Samtalet hittills">
        ${transcript.opening ? `<div class="chat-message is-guide is-opening"><span>${escapeHTML(personaName)} · första svaret</span><p>${escapeHTML(transcript.opening)}</p></div>` : ""}
        ${transcript.previousTurns.map((turn) => `<div class="chat-message is-user"><span>Du</span><p>${escapeHTML(turn.user)}</p></div><div class="chat-message is-guide"><span>${escapeHTML(personaName)}</span><p>${escapeHTML(turn.assistant)}</p></div>`).join("")}
        ${transcript.currentUser ? `<div class="chat-message is-user"><span>Du</span><p>${escapeHTML(transcript.currentUser)}</p></div>` : ""}
      </div>`
    : "";
  const replyChips = personaName === "Liv"
    ? COACH_FOLLOWUPS.cycle
    : COACH_FOLLOWUPS[entry.need] || ["Gör steget enklare", "Förklara varför", "Ge mig ett annat spår"];
  const showFoodSupport = wantsFoodSupport(entry);
  const aiStepMomentId = `coach:${entry.id}:ai-first`;
  const aiStepDone = forestMomentsForDate(state).some((moment) => moment.id === aiStepMomentId);
  return `<div class="ai-coach-response ${compact ? "is-compact" : ""}" data-level="${escapeHTML(ai.level || "everyday")}" data-fallback="${isFallback}">
    <div class="ai-coach-heading"><span class="ai-live-badge"><span aria-hidden="true"></span>${isFallback ? `${escapeHTML(personaName)} · direkt i Aura` : `${escapeHTML(personaName)} AI · Gemini`}</span><small>${isFallback ? "Gemini kan fördjupa svaret" : isFollowup ? "svar på din senaste rad" : "skapad för den här incheckningen"}</small></div>
    ${isFallback ? `<div class="ai-fallback-note">${icon("refresh-double")}<p><strong>${escapeHTML(personaName)} har redan ett användbart svar</strong>Aura växlade till sitt lokala coachstöd när Gemini dröjde. Följ rådet nu eller be Gemini göra det mer personligt.</p><button class="button button-secondary" type="button" data-action="retry-ai">Fördjupa med Gemini</button></div>` : ""}
    ${transcriptHTML}
    <div class="ai-current-reply"><p class="eyebrow">${isFollowup ? "Svar på det du skrev" : `${personaName} svarar`}</p><h2>${escapeHTML(ai.headline)}</h2><p class="ai-reflection">${escapeHTML(ai.reflection)}</p><p class="ai-encouragement">${escapeHTML(ai.encouragement)}</p></div>
    <article class="ai-first-step"><p class="eyebrow">Första steget</p><h3>${escapeHTML(ai.firstStep?.title)}</h3><p>${escapeHTML(ai.firstStep?.body)}</p>${ai.firstStep?.why ? `<p class="ai-why"><strong>Varför:</strong> ${escapeHTML(ai.firstStep.why)}</p>` : ""}<span>${escapeHTML(ai.firstStep?.minutes)}</span><div class="ai-first-step-actions"><button class="button button-frost" type="button" data-action="complete-ai-step" data-id="${escapeHTML(entry.id)}" ${aiStepDone ? "disabled" : ""}>${icon("check-circle", "button-icon")} ${aiStepDone ? "Sparat i skogen" : "Jag gjorde det"}</button>${toolActionButtons("ai")}</div></article>
    ${(ai.alternatives || []).length ? `<details class="ai-more-paths"><summary>Visa två andra spår</summary><div class="ai-alternatives">${ai.alternatives.map((action) => `<article><div><h3>${escapeHTML(action.title)}</h3><p>${escapeHTML(action.body)}</p>${action.why ? `<p class="ai-why"><strong>Varför:</strong> ${escapeHTML(action.why)}</p>` : ""}</div><span>${escapeHTML(action.minutes)}</span></article>`).join("")}</div></details>` : ""}
    ${showFoodSupport && ai.foodTip ? `<details class="ai-food-tip"><summary>${icon("heart")} Mer om mat & energi</summary><div><h3>${escapeHTML(ai.foodTip.title)}</h3><p>${escapeHTML(ai.foodTip.body)}</p>${ai.foodTip.why ? `<p class="ai-why"><strong>Varför:</strong> ${escapeHTML(ai.foodTip.why)}</p>` : ""}</div></details>` : ""}
    <div class="ai-quick-replies" aria-label="Snabba följdfrågor">${replyChips.map((text) => `<button type="button" data-action="fill-followup" data-text="${escapeHTML(text)}">${escapeHTML(text)}</button>`).join("")}</div>
    <form class="ai-followup-form" id="coach-followup-form" data-checkin-id="${entry.id}" data-persona="${personaName === "Liv" ? "liv" : "klara"}"><label class="field"><span>Fortsätt samtalet med ${escapeHTML(personaName)}</span><textarea name="question" maxlength="500" placeholder="${escapeHTML(coachNotePlaceholder(entry.need))}" required>${escapeHTML(failedQuestion)}</textarea></label><button class="button button-primary" type="submit">Skicka ${icon("nav-arrow-right", "button-icon")}</button></form>
    <p class="ai-checkback">${escapeHTML(ai.checkBack)}</p>
  </div>`;
}

function renderAILoading(personaName = "Klara") {
  return `<div class="ai-coach-loading" role="status" aria-live="polite"><span class="ai-orb" aria-hidden="true"></span><div><p class="eyebrow">${escapeHTML(personaName)} läser in stunden</p><h2>Ett personligt svar växer fram…</h2><p>${personaName === "Liv" ? "Hon väger ihop dagens symtom och det du vill ha hjälp med — även om ingen cykel är ifylld." : "Hon använder bara svaren som hör till det du valde och anpassar stegets storlek efter hur mycket ork du har."}</p></div></div>`;
}

function renderFoodSupport(foodSupport) {
  if (!foodSupport) return "";
  return `<aside class="food-support"><div class="food-support-heading">${icon("heart")}<div><p class="eyebrow">Mat som går att göra</p><h3>${escapeHTML(foodSupport.title)}</h3></div></div><p class="food-support-why"><strong>Varför det kan hjälpa</strong>${escapeHTML(foodSupport.why)}</p><ul>${foodSupport.options.map((option) => `<li>${escapeHTML(option)}</li>`).join("")}</ul></aside>`;
}

async function requestAICoach(entry, previous, question = "", persona = "klara") {
  const requestSerial = ++aiRequestSerial;
  const activeEntry = getTodayLog(state).checkIns.find((item) => item.id === entry.id) || entry;
  const localSafety = clientSafetyResponse(activeEntry, question);
  if (localSafety) {
    setCheckInAI(state, entry.id, { clientSafety: localSafety });
    persist();
    aiCoachLoadingId = null;
    aiCoachErrorId = null;
    aiCoachErrorCode = null;
    lastFailedAIRequest = null;
    hideAnimalResponse();
    toastElement.classList.remove("show");
    render();
    requestAnimationFrame(() => document.querySelector("#cycle-safety-result, #moment-result")?.focus({ preventScroll: true }));
    return;
  }
  aiCoachLoadingId = entry.id;
  aiCoachErrorId = null;
  aiCoachErrorCode = null;
  render();
  try {
    const response = await fetch("/api/coach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profileName: state.profile.name,
        checkIn: activeEntry,
        previous,
        question,
        persona,
        priorTurns: buildCoachPriorTurns(activeEntry)
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `http_${response.status}`);
    if (!data || typeof data.reflection !== "string" || !data.firstStep?.title || !data.firstStep?.body) throw new Error("invalid_ai_response");
    if (requestSerial !== aiRequestSerial) return;
    const transcriptPatch = coachTranscriptPatch(activeEntry, data, question);
    setCheckInAI(state, entry.id, { aiCoach: data, clientSafety: null, ...transcriptPatch });
    persist();
    aiCoachLoadingId = null;
    lastFailedAIRequest = data.fallback ? { entryId: entry.id, previous, question, persona } : null;
    render();
    const personaName = persona === "liv" ? "Liv" : "Klara";
    toast(data.fallback ? `${personaName} svarar direkt — Gemini kan fördjupa` : `${personaName}s personliga AI-svar är redo`);
    showAnimalResponse(data.animalLine || "Jag har läst in stunden. Börja med den minsta saken som känns rimlig.", personaName);
    requestAnimationFrame(() => document.querySelector("#moment-result")?.focus({ preventScroll: true }));
  } catch (error) {
    if (requestSerial !== aiRequestSerial) return;
    const errorCode = error instanceof Error ? error.message : "ai_unavailable";
    const serverSafety = clientSafetyResponse(activeEntry, question, errorCode);
    if (serverSafety) {
      setCheckInAI(state, entry.id, { clientSafety: serverSafety });
      persist();
      aiCoachLoadingId = null;
      aiCoachErrorId = null;
      aiCoachErrorCode = null;
      lastFailedAIRequest = null;
      hideAnimalResponse();
      toastElement.classList.remove("show");
      render();
      requestAnimationFrame(() => document.querySelector("#cycle-safety-result, #moment-result")?.focus({ preventScroll: true }));
      return;
    }
    aiCoachLoadingId = null;
    aiCoachErrorId = entry.id;
    aiCoachErrorCode = errorCode;
    lastFailedAIRequest = { entryId: entry.id, previous, question, persona };
    render();
    const noCredit = error instanceof Error && error.message === "ai_budget_exhausted";
    const invalidReply = error instanceof Error && error.message === "invalid_followup_response";
    toast(invalidReply ? "Inget nytt svar skapades — prova igen" : noCredit ? "Klara svarar lokalt just nu" : "Klara svarar direkt — Gemini kan provas igen");
  }
}

function renderMomentResponse(log) {
  const checkIns = Array.isArray(log.checkIns) ? log.checkIns : [];
  if (!checkIns.length) {
    return `<section class="moment-result moment-empty" id="moment-result" tabindex="-1" aria-live="polite">
      ${companion("bunny", "", "Klara är redo", "Säg hur det är just nu, så hittar vi ett första steg som kan ge lite mer lugn, kraft eller glädje.")}
      <div class="empty-steps"><span>1 · fånga stunden som den är</span><span>2 · välj en snäll liten vinst</span><span>3 · checka in igen när dagen skiftar</span></div>
    </section>`;
  }
  const latest = checkIns[0];
  const previous = checkIns[1] || null;
  const response = momentCoach(latest, previous);
  const safetyResponse = latest.clientSafety || (response.crisis ? response : null);
  if (safetyResponse) return renderCrisisResponse(safetyResponse, latest);
  const personaName = latest.persona === "liv" ? "Liv" : "Klara";
  const personaAsset = latest.persona === "liv" ? "cycle" : "bunny";
  const bridge = latest.persona === "liv" ? "" : everyday.renderCoachBridge(latest.need);
  const failedQuestion = aiCoachErrorId === latest.id && lastFailedAIRequest?.entryId === latest.id
    ? String(lastFailedAIRequest.question || "")
    : "";
  const aiError = aiCoachErrorId === latest.id
    ? `<div class="ai-fallback-note is-error">${icon("sparks")}<div><p><strong>${aiCoachErrorCode === "invalid_followup_response" ? `${personaName} kunde inte skapa ett tydligt nytt svar` : `${personaName} svarar direkt`}</strong>${aiCoachErrorCode === "invalid_followup_response" ? "Det tidigare svaret ligger kvar nedanför men är inte ett svar på din senaste rad. Prova igen eller skriv frågan lite mer konkret." : "Gemini svarade inte i tid, men ditt lokala råd är redo nedanför. Du kan använda det nu eller be Gemini fördjupa."}</p>${failedQuestion ? `<p class="ai-failed-question"><strong>Din senaste rad:</strong> ${escapeHTML(failedQuestion)}</p>` : ""}</div><button class="button button-secondary" type="button" data-action="retry-ai">Fördjupa med Gemini</button></div>`
    : "";
  if (aiCoachLoadingId === latest.id) {
    return `<section class="moment-result ai-result" id="moment-result" tabindex="-1" aria-live="polite"><div class="result-meta"><span class="soft-badge">AI uppdaterar nu</span><span>${escapeHTML(coachNeedLabel(latest.need))}</span></div>${companion(personaAsset, "", `${personaName} tänker`, "Jag läser det du skrev och väljer ett svar som passar just den här stunden.")}${renderAILoading(personaName)}</section>`;
  }
  if (latest.aiCoach) {
    return `<section class="moment-result ai-result" id="moment-result" tabindex="-1" aria-live="polite" data-level="${escapeHTML(latest.aiCoach.level || "everyday")}"><div class="result-meta"><span class="soft-badge">${aiCoachErrorId === latest.id ? "Tidigare AI-svar" : `AI-svar ${formatCheckInTime(latest.aiUpdatedAt || latest.createdAt)}`}</span><span>${escapeHTML(coachNeedLabel(latest.need))}</span></div>${aiError}${companion(personaAsset, "", `${personaName} svarar`, escapeHTML(latest.aiCoach.animalLine || "Här är ditt personliga nästa steg."))}${renderAICoachResponse(latest, { personaName })}${bridge}${renderCheckInFeedback(latest, latest.aiCoach.checkBack)}</section>`;
  }
  const actions = response.actions.length ? response.actions : [];
  const currentIndex = actions.length ? coachStepIndex % actions.length : 0;
  const currentAction = actions[currentIndex];
  const task = coachSequenceDone
    ? `<div class="coach-complete">${icon("check-circle")}<p class="eyebrow">Stunden är uppdaterad</p><h2>Du gjorde det du valde</h2><p>Stanna upp i tio sekunder. Känn efter om du vill avsluta här eller göra en ny check-in med hur det känns nu.</p><button class="button button-primary" type="button" data-action="new-coach-checkin">Checka in igen</button></div>`
    : renderCoachStep(currentAction, currentIndex, actions.length);
  return `<section class="moment-result" id="moment-result" tabindex="-1" aria-live="polite" data-level="${response.level}">
    <div class="result-meta"><span class="soft-badge">uppdaterad ${formatCheckInTime(latest.createdAt)}</span><span>${escapeHTML(coachNeedLabel(latest.need))}</span></div>
    ${aiError}
    ${companion("bunny", "", "Klara speglar", escapeHTML(response.reflection))}
    <div class="moment-encouragement" data-tone="${response.encouragement.tone}"><strong>${escapeHTML(response.encouragement.label)}</strong><p>${escapeHTML(response.encouragement.text)}</p></div>
    ${task}
    ${bridge}
    ${wantsFoodSupport(latest) ? renderFoodSupport(response.foodSupport) : ""}
    ${coachSequenceDone ? renderGuidance(response.guidance) : ""}
    ${renderCheckInFeedback(latest, response.followUp)}
  </section>`;
}

function renderCheckInHistory(log) {
  const checkIns = Array.isArray(log.checkIns) ? log.checkIns.slice(0, 6) : [];
  if (!checkIns.length) return `<p class="fine-print">Dagens stunder visas här när du har checkat in.</p>`;
  return `<ol class="moment-timeline">${checkIns.map((entry) => `<li><time datetime="${entry.createdAt}">${formatCheckInTime(entry.createdAt)}</time><span class="timeline-dot" data-mood="${Number(entry.mood || 3)}" aria-hidden="true"></span><div><strong>${situationLabel(entry.situation)}</strong><small>mående ${Number(entry.mood || 3)}/5 · stress ${Number(entry.stress || 3)}/5${entry.feedback ? ` · ${entry.feedback === "better" ? "lite bättre" : entry.feedback === "worse" ? "sämre" : "oförändrat"}` : ""}</small>${entry.note ? `<p>${escapeHTML(entry.note)}</p>` : ""}</div></li>`).join("")}</ol>`;
}

function renderMoodPicker(log) {
  const moodIcons = ["half-moon", "heart", "home", "sparks", "stats-up-square"];
  return `<div class="mood-picker" role="group" aria-label="Välj hur dagen känns">${MOODS.map((mood, index) => `<button class="mood-option" type="button" data-action="set-mood" data-mood="${mood.value}" aria-pressed="${Number(log.mood) === mood.value}" aria-label="${mood.label}"><strong aria-hidden="true">${icon(moodIcons[index])}</strong><small>${mood.label}</small></button>`).join("")}</div>`;
}

function companionNames() {
  const names = ["Klara", moduleOn(state, "cycle") ? "Liv" : "", "Maja", moduleOn(state, "reflection") ? "Astrid" : ""].filter(Boolean);
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

function renderToday() {
  const name = String(state.profile.name || "").trim();
  const phase = dayPhase();
  const log = getTodayLog(state);
  const forestMoments = forestMomentsForDate(state);
  const latestCheckIn = Array.isArray(log.checkIns) ? log.checkIns[0] : null;
  return `
    <div class="page today-page world-page" data-forest-state="${forestGrowthState(forestMoments)}" style="--world-path:url('${WORLD_PATH_ASSETS.today}')">
      ${renderWorldHero({
        world: "today",
        compact: true,
        eyebrow: `${formattedToday()} · ${dayPhaseLabel(phase)}`,
        title: name ? `${greeting()}, <em>${escapeHTML(name)}</em>.` : `${greeting()}.`,
        body: "Det som spelar roll just nu. Resten håller Aura åt dig.",
        guideName: companionNames(),
        guide: "En sak i taget. Säg till om orken tryter, så gör vi dagen mindre."
      })}
      ${everyday.renderNowCard()}
      ${renderReminderBanner()}
      ${everyday.renderShortcuts()}
      ${everyday.renderToday()}
      ${latestCheckIn || forestMoments.length ? renderForestVisit(latestCheckIn, forestMoments) : ""}
    </div>`;
}

function closestChoice(value, choices, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return choices.reduce((best, candidate) => Math.abs(candidate - number) < Math.abs(best - number) ? candidate : best, choices[0]);
}

function choiceCards(name, options, selected, className = "") {
  return `<div class="coach-choice-grid ${className}" role="radiogroup">${options.map(({ value, label, detail }) => `<label class="coach-choice"><input type="radio" name="${name}" value="${escapeHTML(value)}" ${String(selected) === String(value) ? "checked" : ""} required /><span><strong>${escapeHTML(label)}</strong>${detail ? `<small>${escapeHTML(detail)}</small>` : ""}</span></label>`).join("")}</div>`;
}

function renderCoachSymptomPicker(selected = []) {
  const active = new Set(selected);
  return `<div class="symptom-grid coach-symptoms" aria-label="PMS- och menssymtom">${SYMPTOMS.map((symptom) => `<button class="symptom-chip" type="button" data-action="toggle-coach-symptom" data-symptom="${symptom.id}" aria-pressed="${active.has(symptom.id)}">${symptom.label}</button>`).join("")}</div>`;
}

function renderCoach() {
  const log = getTodayLog(state);
  const coachCheckIns = (Array.isArray(log.checkIns) ? log.checkIns : []).filter((entry) => entry.persona !== "liv" && entry.source !== "cycle");
  const coachLog = { ...log, checkIns: coachCheckIns };
  const latest = coachCheckIns[0] || log;
  const current = { ...latest, ...(coachPrefill || {}) };
  const need = COACH_NEEDS.some((item) => item.value === coachPrefill?.need) ? coachPrefill.need : "";
  const showForm = coachEditing || !coachCheckIns.length;
  const energy = closestChoice(current.energy, [2, 4, 6, 8], 6);
  const stress = closestChoice(current.stress, [1, 2, 3, 4, 5], 3);
  const sleepQuality = ["rough", "restless", "okay", "good", "unknown"].includes(current.sleepQuality) ? current.sleepQuality : "unknown";
  const foodStatus = current.foodStatus || (current.ate === false ? "empty" : current.ate === true ? "meal" : "unknown");
  const pmsSymptoms = current.pmsSymptoms || log.symptoms || [];
  const stepCopy = [
    ["Vad vill du ha hjälp med just nu?", "Välj det som känns viktigast. Resten kan vänta."],
    ["Hur känns stunden?", "Jag frågar bara om det som hjälper mig att anpassa rådet."],
    ["Vill du lägga till något?", "Du kan ge lite sammanhang eller gå direkt till ditt råd."]
  ][coachCheckinStep];
  return `<div class="page coach-page world-page" style="--world-path:url('${WORLD_PATH_ASSETS.coach}')">
    ${renderWorldHero({
      world: "coach",
      eyebrow: "Klaras glänta · levande stöd",
      title: "Klaras <em>levande samtal.</em>",
      body: "Välj vad som behöver bli lättare. Klara ställer bara relevanta följdfrågor och ger ett konkret första steg med en tydlig förklaring.",
      guideName: "Klara · vardagscoach",
      guide: "Vi börjar med det du vill ha hjälp med. Mat är ett spår bland flera — aldrig ett standardsvar.",
      actions: `<button class="button button-primary" type="button" data-action="focus-coach-form">${showForm ? "Gå till frågorna" : "Checka in igen"} ${icon("nav-arrow-right", "button-icon")}</button>`
    })}
    ${everyday.renderTalkPanel()}
    ${showForm ? `<section class="coach-conversation-stage forest-panel" id="coach-form-stage">
      ${characterDialogue("klara", stepCopy[1], `Klara · ${stepCopy[0]}`)}
      <form class="moment-form guided-checkin" id="coach-form">
        <div class="coach-progress" aria-label="Incheckningens steg"><span>Steg ${coachCheckinStep + 1} av 3</span><div>${[0,1,2].map((step) => `<i data-active="${step <= coachCheckinStep}"></i>`).join("")}</div></div>
        <section class="coach-checkin-panel" data-coach-panel="0" ${coachCheckinStep === 0 ? "" : "hidden"}>
          <h2 tabindex="-1">Vad vill du ha hjälp med just nu?</h2><p>Välj det som känns viktigast. Klara anpassar resten efter det.</p>
          <div class="coach-need-grid" role="radiogroup">${COACH_NEEDS.map((item) => `<label class="coach-need"><input type="radio" name="need" value="${item.value}" ${need === item.value ? "checked" : ""} required /><span>${icon(item.icon)}<strong>${item.label}</strong><small>${item.detail}</small></span></label>`).join("")}</div>
          <div class="coach-panel-actions"><button class="button button-primary" type="button" data-action="coach-next">Fortsätt ${icon("nav-arrow-right", "button-icon")}</button></div>
        </section>
        <section class="coach-checkin-panel" data-coach-panel="1" ${coachCheckinStep === 1 ? "" : "hidden"}>
          <h2 tabindex="-1">Hur känns stunden?</h2><p>Välj det som ligger närmast. Det behöver inte vara exakt.</p>
          <div class="quick-body-grid is-focused"><div class="choice-question"><span>Hur mår du just nu?</span>${choiceCards("mood", MOODS.map((item) => ({ value: item.value, label: item.label })), Number(current.mood || 3), "three-up mood-path")}</div><div class="choice-question"><span>Hur mycket ork har du till ett litet nästa steg?</span>${choiceCards("energy", [{ value: 2, label: "Nästan ingen ork" }, { value: 4, label: "Lite ork" }, { value: 6, label: "Jag klarar något litet" }, { value: 8, label: "Jag har ganska bra med ork" }], energy, "four-up")}</div></div>
          <div class="coach-context-question" data-coach-context="food" ${need === "food" ? "" : "hidden"}><div class="choice-question"><span>Vad stämmer bäst om maten i dag?</span>${choiceCards("foodStatus", [{ value: "empty", label: "Jag har inte ätit än" }, { value: "light", label: "Jag har bara fått i mig något litet" }, { value: "meal", label: "Jag har ätit en måltid eller mer" }, { value: "unknown", label: "Jag är osäker" }], foodStatus, "four-up")}</div><div class="choice-question"><span>Har du fått i dig något att dricka?</span>${choiceCards("hydration", [{ value: "low", label: "Nästan inget" }, { value: "some", label: "Lite, men jag behöver mer" }, { value: "good", label: "Det känns tillräckligt" }, { value: "unknown", label: "Jag är osäker" }], current.hydration || "unknown", "four-up")}</div></div>
          <div class="coach-context-question" data-coach-context="calm structure boost" ${["calm","structure","boost"].includes(need) ? "" : "hidden"}><div class="choice-question"><span>Hur mycket stress eller oro känner du just nu?</span>${choiceCards("stress", [{ value: 1, label: "Ingen" }, { value: 2, label: "Lite" }, { value: 3, label: "En del" }, { value: 4, label: "Mycket" }, { value: 5, label: "Så mycket att det är svårt att tänka" }], stress, "three-up")}</div></div>
          <div class="coach-context-question" data-coach-context="rest" ${need === "rest" ? "" : "hidden"}><div class="choice-question"><span>Hur återhämtad känner du dig efter natten?</span>${choiceCards("sleepQuality", [{ value: "rough", label: "Inte alls återhämtad" }, { value: "restless", label: "Fortfarande ganska trött" }, { value: "okay", label: "Varken pigg eller helt slut" }, { value: "good", label: "Ganska utvilad" }, { value: "unknown", label: "Svårt att säga" }], sleepQuality, "three-up")}</div></div>
          <div class="coach-context-question" data-coach-context="cycle" ${need === "cycle" ? "" : "hidden"}><input type="hidden" name="pmsNow" value="yes" /><div class="choice-question"><span>Vad känns i kroppen?</span>${renderCoachSymptomPicker(pmsSymptoms)}</div></div>
          <div class="coach-panel-actions"><button class="button button-ghost" type="button" data-action="coach-back">Tillbaka</button><button class="button button-primary" type="button" data-action="coach-next">Fortsätt ${icon("nav-arrow-right", "button-icon")}</button></div>
        </section>
        <section class="coach-checkin-panel" data-coach-panel="2" ${coachCheckinStep === 2 ? "" : "hidden"}>
          <h2 tabindex="-1">Vill du lägga till något?</h2><p>Välj ett sammanhang om det påverkar stunden, eller gå direkt till ditt råd.</p>
          ${choiceCards("situation", [{ value: "general", label: "Nej, inget mer" }, { value: "overwhelmed", label: "Jag har för mycket på en gång" }, { value: "separation", label: "Jag går igenom en separation" }, { value: "pms", label: "Det hänger ihop med PMS eller mens" }, { value: "lonely", label: "Jag känner mig ensam eller ledsen" }, { value: "conflict", label: "Det pågår en konflikt" }], need === "cycle" ? "pms" : "general", "three-up compact")}
          <label class="field coach-own-words"><span>Vad händer just nu? <small>frivilligt</small></span><textarea name="note" maxlength="800" placeholder="${escapeHTML(coachNotePlaceholder(need))}">${escapeHTML(coachPrefill?.note || "")}</textarea><small class="field-note">En konkret detalj hjälper Klara att knyta ihop svaret med din situation.</small></label>
          <details class="signal-details"><summary>Extra kroppshänsyn <span>bara vid behov</span></summary><div class="signal-grid">${signalOption("wantsConnection", "Jag vill ha mänsklig kontakt", "Någon trygg kan hjälpa", Boolean(current.wantsConnection))}${signalOption("fluidLoss", "Kräkning, diarré eller stor svettning", "Då kan vätskeersättning vara relevant", Boolean(current.fluidLoss))}${signalOption("heavyBleeding", "Riklig eller lång blödning", "För att råden ska prioritera rätt", Boolean(current.heavyBleeding))}${signalOption("severePain", "Ny eller mycket stark smärta", "För att inte gömma viktig kroppsinformation", Boolean(current.severePain))}${signalOption("contraceptionChange", "Preventivmedel har ändrats", "Metod, byte eller nya biverkningar", Boolean(current.contraceptionChange))}</div></details>
          <div class="coach-panel-actions"><button class="button button-ghost" type="button" data-action="coach-back">Tillbaka</button><button class="button button-primary ai-submit" type="submit">Ge mig mitt nästa steg ${icon("sparks", "button-icon")}</button></div>
          <p class="ai-privacy-short">Klara använder den här incheckningen för svaret. Dagbok, tarot och full historik skickas inte.</p>
        </section>
      </form>
    </section>` : ""}
    ${coachCheckIns.length && !showForm ? `<section class="coach-response-stage forest-panel"><div class="coach-response-intro"><div><p class="eyebrow">Ditt stöd just nu · ${escapeHTML(coachNeedLabel(coachCheckIns[0].need))}</p><h2>Klara har knutit ihop dina svar</h2></div><button class="button button-secondary" type="button" data-action="new-coach-checkin">Checka in igen</button></div>${renderMomentResponse(coachLog)}</section>` : ""}
    ${renderToolbox(log)}
    <section class="coach-tools forest-panel"><details><summary><span><strong>Fler verktyg när du själv vill</strong><small>Andning, matidéer och tre steg när huvudet är fullt</small></span><span aria-hidden="true">+</span></summary><div class="coach-tool-grid"><button class="button button-secondary" type="button" data-action="open-breathing">Två minuters andning</button><button class="button button-secondary" type="button" data-action="start-overwhelm">Tre tydliga steg</button>${renderPantryCompass()}${renderSourceDisclosure()}</div></details></section>
  </div>`;
}

function signalOption(key, title, detail, checked) {
  return `<label class="signal-option"><input type="checkbox" name="${key}" value="true" ${checked ? "checked" : ""} /><span class="signal-check" aria-hidden="true"></span><span><strong>${title}</strong><small>${detail}</small></span></label>`;
}

function toggleRow(key, title, detail, pressed) {
  return `<div class="toggle-row"><span><strong>${title}</strong><small>${detail}</small></span><button class="toggle" type="button" data-action="toggle-form-value" data-key="${key}" aria-pressed="${pressed}" aria-label="${title}"></button><input type="hidden" name="${key}" value="${pressed}"></div>`;
}

function renderSources() {
  return `<div class="source-list">${SOURCES.map((source) => `<a class="source-link" href="${source.url}" target="_blank" rel="noreferrer"><span><strong>${source.label}</strong><small>${source.note}</small></span>${icon("nav-arrow-right")}</a>`).join("")}</div>`;
}

function renderSourceDisclosure(span = "") {
  return `<details class="card card-pad source-disclosure ${span}"><summary><span><strong>Så är tipsen framtagna</strong><small>Källor och fördjupning för den som vill läsa mer</small></span><span aria-hidden="true">+</span></summary>${renderSources()}</details>`;
}

function cycleLearningCards(log) {
  const active = new Set(log.symptoms || []);
  const modules = [
    { id: "cramps", title: "När kramper tar plats", body: "Värme och lätt rörelse kan kännas skönt för vissa. Prova en sak i taget och välj den version kroppen faktiskt gillar.", source: 0 },
    { id: "appetite", title: "När aptiten skiftar", body: "En liten kombination av kolhydrat och protein kan vara lättare än en stor måltid: smörgås med ägg, yoghurt med havre eller soppa med bröd.", source: 1 },
    { id: "low-energy", title: "Jämnare energi utan perfektion", body: "Regelbundna måltider och fiberrika kolhydrater kan ge en stadigare grund. Det enkla som blir av är mer användbart än en perfekt meny.", source: 1 },
    { id: "sleep", title: "PMS och sömn kan dra i varandra", body: "Välj en återkommande kvällssignal som dämpat ljus eller samma ungefärliga läggtid. Följ sedan om nästa morgon känns annorlunda.", source: 7 },
    { id: "irritable", title: "Bygg in mer svängrum", body: "Irritation kan kännas större när flera krav ligger nära varandra. Flytta, förenkla eller halvera en sak och se om kroppen får mer plats.", source: 1 },
    { id: "anxious", title: "Gör nästa beslut mindre", body: "Skriv två möjliga nästa steg och välj det som hjälper den närmaste timmen. Du behöver inte lösa hela dagen på en gång.", source: 9 },
    { id: "general-cycle", title: "Cykeln är en karta, inte en klocka", body: "Ett fasnamn är bara sammanhang. Dagens symtom, sömn och mående väger tyngre än vad en kalender säger att du borde känna.", source: 1 },
    { id: "supplements", title: "Tillskott börjar med en tydlig fråga", body: "Välj först vilket besvär du försöker påverka. Vid långvarig trötthet eller riklig mens ger ett blodprov bättre underlag än att gissa med järn.", source: 10 },
    { id: "contraception", title: "Preventivmedel får följas upp", body: "Nya eller besvärliga förändringar efter start eller byte är värda att skriva ned. Då blir det lättare att prata konkret med en barnmorska om alternativ.", source: 5 }
  ];
  const relevant = modules.filter((item) => active.has(item.id));
  const remaining = modules.filter((item) => !relevant.includes(item));
  const offset = new Date().getDate() % remaining.length;
  return [...relevant, ...remaining.slice(offset), ...remaining.slice(0, offset)].filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index).slice(0, 4);
}

function renderCycleSupport(entry, log) {
  if (!entry) return `<div class="cycle-answer-empty">${characterDialogue("liv", "Välj det som känns i kroppen i dag. Jag ger ett första steg direkt här — cykeldatum är helt frivilligt.", "Liv · redo när du är")}</div>`;
  const previous = log.checkIns.find((item) => item.id !== entry.id) || null;
  if (aiCoachLoadingId === entry.id) return `${characterDialogue("liv", "Jag väger ihop dagens symtom och väljer ett råd med en tydlig förklaring.", "Liv tänker")}${renderAILoading("Liv")}`;
  const local = momentCoach(entry, previous);
  const safetyResponse = entry.clientSafety || (local.crisis ? local : null);
  if (safetyResponse) return renderSafetyCard(safetyResponse, { id: "cycle-safety-result", label: "Liv · mänsklig hjälp först" });
  const error = aiCoachErrorId === entry.id ? `<div class="ai-fallback-note is-error">${icon("sparks")}<p><strong>${aiCoachErrorCode === "invalid_followup_response" ? "Liv kunde inte skapa ett tydligt nytt svar" : "Liv svarar direkt"}</strong>${entry.aiCoach ? "Det tidigare svaret ligger kvar nedanför och är märkt som tidigare." : "Gemini dröjde, så Livs lokala råd visas direkt i stället."}</p><button class="button button-secondary" type="button" data-action="retry-ai">Fördjupa med Gemini</button></div>` : "";
  if (entry.aiCoach) return `${error}${renderAICoachResponse(entry, { personaName: "Liv", compact: true })}${renderCheckInFeedback(entry, entry.aiCoach.checkBack)}`;
  const first = local.actions?.[0];
  return `${error}${characterDialogue("liv", local.reflection, "Liv speglar stunden")}${first ? `<article class="ai-first-step"><p class="eyebrow">Gör nu</p><h3>${escapeHTML(first.title)}</h3><p>${escapeHTML(first.body)}</p>${first.why ? `<p class="ai-why"><strong>Varför:</strong> ${escapeHTML(first.why)}</p>` : ""}<span>${escapeHTML(first.minutes)}</span></article>` : ""}`;
}

function renderCycle() {
  const log = getTodayLog(state);
  const estimate = cycleEstimate({ lastPeriod: state.cycle.lastPeriod, cycleLength: state.profile.cycleLength, periodLength: state.profile.periodLength });
  const symptomCounts = recentSymptomCounts();
  const latestCycleEntry = (log.checkIns || []).find((entry) => entry.source === "cycle") || null;
  const learning = cycleLearningCards(log);
  const phaseName = estimate?.phase ? estimate.phase.charAt(0).toUpperCase() + estimate.phase.slice(1) : null;
  return `<div class="page cycle-page world-page" style="--world-path:url('${WORLD_PATH_ASSETS.cycle}')">
    ${renderWorldHero({
      world: "cycle",
      eyebrow: "Livs örtagård · PMS & kropp",
      title: estimate ? `${phaseName} — men <em>kroppen först.</em>` : "Hur känns <em>kroppen i dag?</em>",
      body: estimate ? `Du är ungefär på cykeldag ${estimate.cycleDay}. Det är bara sammanhang — dagens signaler bestämmer stödet.` : "Du får ett komplett svar från Liv utan att fylla i någon cykel. Ett datum gör bara kalendern och dina mönster tydligare senare.",
      guideName: "Liv · PMS- & cykelguide",
      guide: "Berätta vad som känns. Jag ger ett konkret steg, förklarar varför och lär dig något litet på vägen.",
      actions: `<button class="button button-primary" type="button" data-action="set-cycle-mode" data-mode="today">Få stöd i dag ${icon("nav-arrow-right", "button-icon")}</button>`
    })}
    <nav class="cycle-tabs" aria-label="Cykelns delar">${[["today","Stöd just nu"],["map","Min cykel"],["learn","Lär med Liv"]].map(([mode,label]) => `<button type="button" data-action="set-cycle-mode" data-mode="${mode}" aria-current="${cycleMode === mode ? "page" : "false"}">${label}</button>`).join("")}</nav>
    <div class="cycle-content">
      ${cycleMode === "today" ? `<section class="cycle-support-layout forest-panel">
        <form class="cycle-support-form light-clearing" id="cycle-support-form">
          <div class="section-heading"><div><p class="eyebrow">Stöd utan kalenderkrav</p><h2>Vad vill du få hjälp med?</h2></div><span class="soft-badge">cirka 30 sek</span></div>
          ${choiceCards("need", [{value:"practical",label:"Lindra något nu",detail:"ett konkret första steg"},{value:"food",label:"Mat & energi",detail:"vad som kan vara lätt att få i sig"},{value:"rest",label:"Vila & sömn",detail:"återhämtning som passar dagen"},{value:"cycle",label:"Förstå symtomen",detail:"en enkel kroppsförklaring"},{value:"boost",label:"Pepp",detail:"lite mer medvind"},{value:"listen",label:"Prata av mig",detail:"ett varmt svar först"}], "practical", "two-up cycle-need-grid")}
          <div class="choice-question cycle-symptom-question"><span>Vad känner du av i dag? <small>välj en eller flera</small></span><div class="symptom-grid cycle-support-symptoms">${SYMPTOMS.map((symptom) => `<button class="symptom-chip" type="button" data-action="toggle-cycle-support-symptom" data-symptom="${symptom.id}" aria-pressed="${log.symptoms?.includes(symptom.id) || false}">${symptom.label}</button>`).join("")}</div></div>
          <details class="cycle-extra-details"><summary>Lägg till energi, smärta eller blödning <span>frivilligt</span></summary><div class="cycle-quick-grid"><div class="choice-question"><span>Hur mycket energi har du?</span>${choiceCards("energy", [{value:2,label:"Ingen alls"},{value:4,label:"Lite"},{value:6,label:"Okej"},{value:8,label:"Ganska mycket"}], closestChoice(log.energy,[2,4,6,8],6), "four-up")}</div><div class="choice-question"><span>Hur ont gör det?</span>${choiceCards("pain", [{value:1,label:"Inte alls"},{value:2,label:"Lite"},{value:3,label:"Ganska ont"},{value:4,label:"Mycket ont"}], 1, "four-up")}</div><div class="choice-question"><span>Hur är blödningen?</span>${choiceCards("flow", [{value:"none",label:"Ingen"},{value:"light",label:"Liten"},{value:"medium",label:"Mellan"},{value:"heavy",label:"Riklig"}], "none", "four-up")}</div></div></details>
          <label class="field"><span>Något Liv bör veta? <small>frivilligt</small></span><textarea name="note" maxlength="800" placeholder="Till exempel: Jag har ont och ska jobba om en timme…"></textarea></label>
          <button class="button button-primary button-wide" type="submit">Ge mig stöd för stunden ${icon("sparks", "button-icon")}</button>
        </form>
        <div class="cycle-answer light-clearing" id="cycle-answer" tabindex="-1" aria-live="polite">${renderCycleSupport(latestCycleEntry, log)}</div>
      </section><section class="forest-panel learn-teaser"><div class="section-heading"><div><p class="eyebrow">Lär dig på 30 sek</p><h2>${learning[0].title}</h2></div><button class="text-button" type="button" data-action="set-cycle-mode" data-mode="learn">Fler förklaringar ${icon("nav-arrow-right")}</button></div><p>${learning[0].body}</p></section>` : ""}
      ${cycleMode === "map" ? `<section class="cycle-map-layout forest-panel"><div class="light-clearing cycle-map"><div class="section-heading"><div><p class="eyebrow">Din rytmkarta</p><h2>${estimate ? `${phaseName} · dag ${estimate.cycleDay}` : "Börja när du vill"}</h2></div><button class="button button-primary" type="button" data-action="period-start-today">Mens började i dag</button></div><p>${estimate ? `Nästa mens visas som ett ungefärligt fönster ${formatShortDate(estimate.windowStart)}–${formatShortDate(estimate.windowEnd)}. Dina egna mönster väger tyngre än datumet.` : "Tryck när en mens börjar eller fyll i ett tidigare datum. Stödet i dag fungerar även utan detta."}</p>${estimate ? renderCycleDots(estimate) : ""}</div><details class="light-clearing cycle-settings" open><summary>Min cykeldata</summary><form class="form-stack" id="cycle-form"><label class="field"><span>Senaste mensens första dag</span><input name="lastPeriod" type="date" value="${escapeHTML(state.cycle.lastPeriod)}" max="${localDateKey()}" /></label><div class="field-grid"><label class="field"><span>Genomsnittlig cykel</span><input name="cycleLength" type="number" min="21" max="45" value="${state.profile.cycleLength}" /></label><label class="field"><span>Menslängd</span><input name="periodLength" type="number" min="2" max="10" value="${state.profile.periodLength}" /></label></div><button class="button button-secondary" type="submit">Uppdatera kartan</button></form></details><div class="light-clearing pattern-mirror">${characterDialogue("liv", symptomCounts.length ? `Det som återkommer oftast hittills är ${symptomCounts.map((item) => item.label).join(", ")}. Jag kallar det en ledtråd tills fler dagar går att jämföra.` : "Några korta incheckningar räcker för att börja. Jag väntar hellre än hittar på ett mönster.", "Livs mönsterspegel")}</div></section>` : ""}
      ${cycleMode === "learn" ? `<section class="cycle-learning forest-panel"><div class="section-heading"><div><p class="eyebrow">Ett levande litet bibliotek</p><h2>Lär med Liv</h2></div><p>Innehållet prioriteras efter dagens symtom.</p></div><div class="learning-grid">${learning.map((item) => `<article class="light-clearing learning-card"><span>${icon(item.id === "sleep" ? "half-moon" : item.id === "appetite" || item.id === "low-energy" ? "heart" : "journal-page")}</span><p class="eyebrow">30 sekunder</p><h3>${escapeHTML(item.title)}</h3><p>${escapeHTML(item.body)}</p><a href="${SOURCES[item.source]?.url || SOURCES[1].url}" target="_blank" rel="noreferrer">Läs källan ${icon("nav-arrow-right")}</a></article>`).join("")}</div></section>` : ""}
    </div>
  </div>`;
}

function renderCycleDots(estimate) {
  const midStart = Math.max(estimate.periodLength + 1, estimate.length - 17);
  const midEnd = Math.max(midStart, estimate.length - 12);
  return `<div class="cycle-dots" aria-label="Uppskattad cykeltidslinje">${Array.from({ length: estimate.length }, (_, index) => { const day = index + 1; const classes = ["cycle-dot"]; if (day <= estimate.periodLength) classes.push("period"); if (day >= midStart && day <= midEnd) classes.push("mid"); if (day === estimate.cycleDay) classes.push("today"); return `<span class="${classes.join(" ")}" ${day === estimate.cycleDay ? 'aria-current="date"' : ""}>${day}</span>`; }).join("")}</div>`;
}

function cycleAdvice(phase) {
  const common = { title: "Bygg din egen karta", body: "Lägg märke till vad som återkommer och vad som faktiskt hjälper. Dina egna signaler väger tyngre än färdiga fasregler." };
  if (phase === "mens") return [{ title: "Gör det skönt att vara du", body: "Värme, vila eller lätt rörelse kan kännas hjälpsamt. Välj den version kroppen gillar bäst i dag." }, { title: "Snäll energi", body: "Ät regelbundet och drick efter törst. Det enkla som faktiskt blir av är en vinst." }, common];
  if (phase === "sen cykel") return [{ title: "Planera in mer svängrum", body: "Om du brukar få PMS kan färre beslut och mer återhämtning ge dig ett försprång." }, { title: "Hitta rörelsen som känns bra", body: "Rörelse, sömn, avslappning och regelbundna måltider kan stötta — välj det som passar kroppen i dag." }, common];
  return [{ title: "Var nyfiken, inte duktig", body: "Se fasen som en ledtråd. Välj det som känns hjälpsamt i dag och lämna resten." }, { title: "Bygg din egen grundrytm", body: "Sömn, mat, rörelse och pauser kan ge en stadig bas även när energin skiftar." }, common];
}

function recentSymptomCounts() {
  const cutoff = Date.now() - 90 * 86_400_000;
  const counts = {};
  Object.entries(state.logs).forEach(([date, log]) => {
    if (new Date(`${date}T12:00:00`).getTime() < cutoff) return;
    (log.symptoms || []).forEach((id) => { counts[id] = (counts[id] || 0) + 1; });
  });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, count]) => ({ label: SYMPTOMS.find((item) => item.id === id)?.label || id, count }));
}

function renderTarotCard(card, options = {}) {
  const revealed = options.revealed !== false;
  const interactive = Boolean(options.action);
  const tag = interactive ? "button" : "div";
  const action = interactive ? ` type="button" data-action="${options.action}"${Number.isInteger(options.index) ? ` data-index="${options.index}"` : ""} aria-label="${escapeHTML(options.ariaLabel || "Vänd tarotkortet")}"` : "";
  return `<${tag} class="tarot-flip ${revealed ? "is-revealed" : ""} ${interactive ? "is-interactive" : ""}"${action}>
    <span class="tarot-flip-inner">
      <span class="tarot-card tarot-back" aria-hidden="${revealed}"><span class="card-symbol" aria-hidden="true">${icon("sparks")}</span><small>${options.backLabel || "Låt kortet vakna"}</small></span>
      <span class="tarot-card tarot-face ${card?.isReversed ? "reversed" : ""}" data-color="${card?.color || "plum"}" aria-hidden="${!revealed}">${card?.image ? `<img class="tarot-art" src="${card.image}" alt="" loading="lazy" />` : ""}<span class="tarot-face-caption"><small>${String(card?.number ?? "").padStart(2, "0")} · ${options.label || (card?.isReversed ? "Omvänt · mer inåt" : "Rättvänt")}</small><strong>${escapeHTML(card?.name || "")}</strong></span></span>
    </span>
  </${tag}>`;
}

function currentDailyCard() {
  return dailyCard(TAROT_CARDS, `${localDateKey()}|${dailyDrawOffset}`, state.profile.name);
}

function renderMysticToday() {
  const sign = zodiacSign(state.profile.birthDate);
  const phase = moonPhase();
  if (!sign) {
    return `<section class="mystic-profile card card-pad">
      <div>${icon("sparks")}<p class="eyebrow">Din stjärnhimmel</p><h2>Vilket tecken lyser för dig?</h2><p>Fyll i födelsedatum en gång. Aura använder dag och månad för att visa stjärntecken och skapa dagens reflektion lokalt på din enhet.</p></div>
      <form id="mystic-profile-form" class="form-stack"><label class="field"><span>Födelsedatum</span><input type="date" name="birthDate" max="${localDateKey()}" required /></label><button class="button button-primary" type="submit">Öppna min stjärnhimmel</button></form>
    </section>`;
  }
  const reading = dailyStarReading(sign);
  const starMomentId = `mystic-star:${localDateKey()}`;
  const starActionDone = forestMomentsForDate(state).some((moment) => moment.id === starMomentId);
  return `<div class="mystic-today-grid">
    <section class="star-sign-card card card-pad"><p class="eyebrow">Dagens ton · ${sign.name}</p><h2>${reading.tone.title}</h2><p>${reading.tone.text}</p><div class="element-chip">${sign.element}</div></section>
    <section class="moon-card card card-pad"><div class="moon-orbit" style="--moon-turn:${Math.round(phase.progress * 360)}deg"><img src="/assets/icons/half-moon.svg" alt="" aria-hidden="true" /></div><div><p class="eyebrow">Månen just nu</p><h2>${phase.name}</h2><p>${phase.invitation}</p></div></section>
    <section class="star-guidance card card-pad"><div class="card-kicker"><span>Relationer</span>${icon("heart")}</div><h3>${reading.relationship.text}</h3><p>${reading.relationship.action}</p></section>
    <section class="star-guidance card card-pad"><div class="card-kicker"><span>För dig själv</span>${icon("sparks")}</div><h3>${reading.self.text}</h3><p>${reading.self.action}</p></section>
    <section class="tiny-star-action card card-pad"><p class="eyebrow">Ditt konkreta steg · ${reading.tinyAction.duration}</p><h2>${reading.tinyAction.title}</h2><p>${reading.tinyAction.body}</p><button class="button button-primary" type="button" data-action="complete-star-action" ${starActionDone ? "disabled" : ""}>${starActionDone ? "Sparat i skogen" : "Jag gjorde det"}</button></section>
    <section class="weekly-compass card card-pad"><p class="eyebrow">Veckans kompass</p><dl><div><dt>Behåll</dt><dd>${reading.week.hold}</dd></div><div><dt>Släpp</dt><dd>${reading.week.release}</dd></div><div><dt>Prova</dt><dd>${reading.week.try}</dd></div><div><dt>Fråga</dt><dd>${reading.week.question}</dd></div></dl></section>
    <section class="moon-action card card-pad"><p class="eyebrow">Månens lilla ritual</p><h2>${phase.name}</h2><p>${phase.action}</p></section>
  </div>`;
}

function renderMysticTarot() {
  const card = currentDailyCard();
  return `<div class="card-grid mystic-tarot-grid">
    <section class="card card-pad tarot-stage span-12">
      <div class="card-kicker"><span>Dagens kort · perspektiv ${dailyDrawOffset + 1}</span><span>Astrids sjö</span></div>
      <aside class="tarot-direction-note"><strong>Vad betyder rättvänt och omvänt?</strong><p><b>Rättvänt</b> betyder att temat är lättare att se eller använda. <b>Omvänt</b> betyder att samma tema kan kännas blockerat, inåtvänt eller värt extra uppmärksamhet. Det är inte ett dåligt omen och aldrig ett facit.</p></aside>
      <div class="daily-tarot">${renderTarotCard(card, { revealed: dailyRevealed, action: dailyRevealed ? null : "reveal-daily", ariaLabel: "Vänd dagens tarotkort" })}<div class="tarot-reading">${dailyRevealed ? `<p class="sr-only" role="status" aria-live="polite">Dagens kort är vänt: ${escapeHTML(card.name)}, ${card.isReversed ? "omvänt" : "rättvänt"}.</p><p class="eyebrow">${card.isReversed ? "Omvänt perspektiv · mer inåt" : "Rättvänt perspektiv"}</p><h3 tabindex="-1" data-daily-reading>${escapeHTML(card.name)}</h3><p>${card.isReversed ? card.reversed : card.upright}</p><blockquote>${card.prompt}</blockquote><div class="tarot-guidance"><div><span>Gör i dag</span><p>${card.practice}</p></div><div><span>Kroppsfråga</span><p>${card.body}</p></div><div><span>Relationslins</span><p>${card.relationship}</p></div></div><div class="button-row"><button class="button button-secondary" type="button" data-action="save-daily-card">Spara reflektionen</button><button class="button button-ghost" type="button" data-action="draw-new-daily">Dra ett nytt perspektiv</button></div>` : `<p class="eyebrow">Ett perspektiv, inte ett facit</p><h3>Ett riktigt kort väntar</h3><p>Tryck på kortet. Det vänder sig först, sedan visas den klassiska bilden, Astrids tolkning och ett konkret steg.</p><button class="button button-secondary" type="button" data-action="reveal-daily">Vänd kortet</button>`}</div></div>
    </section>
    <section class="card card-pad span-12 spread-section">
      <div class="card-kicker"><span>Tre kort · ett i taget</span><span>22 kort i Stora arkanan</span></div>
      <h2>Bakgrund · närvaro · nästa steg</h2>
      <p>Håll en öppen fråga i tanken. Varje kort visar ett eget perspektiv och väntar tills du själv vänder det.</p>
      ${currentSpread ? renderSpread(currentSpread) : `<div class="spread-deck is-preview" aria-hidden="true">${[0,1,2].map((_, index) => `<div class="spread-slot">${renderTarotCard({ symbol: "", name: "", color: "plum" }, { revealed: false, backLabel: SPREAD_LABELS[index] })}<small>${SPREAD_LABELS[index]}</small></div>`).join("")}</div>`}
      <div class="button-row spread-actions"><button class="button button-primary" type="button" data-action="${currentSpread && spreadRevealCount < 3 ? "reveal-next-spread" : "start-spread"}">${!currentSpread ? "Blanda och dra tre" : spreadRevealCount < 3 ? `Vänd kort ${spreadRevealCount + 1}` : "Blanda och dra igen"}</button>${currentSpread && spreadRevealCount === 3 ? `<button class="button button-secondary" type="button" data-action="save-spread">Spara läsningen</button>` : ""}</div>
    </section>
  </div>`;
}

const RITUAL_STEPS = {
  1: ["Lägg båda händerna löst i knät.", "Titta på en stilla punkt och gör tre vanliga andetag.", "Säg högt ett ord du vill bära med dig. Stanna efter ordet."],
  3: ["Sänk ljudet omkring dig och sätt dig bekvämt.", "Skriv tre ord för hur stunden känns, utan att förklara dem.", "Ringa in ett av orden. Skriv en handling som kan göra just det ordet lite lättare.", "Stanna efter den första handlingen."],
  10: ["Hämta ett glas vatten och din anteckningsbok eller mobilens Anteckningar.", "Skriv i tre minuter: ‘Det här tar mest plats i mig just nu …’", "Skriv i tre minuter: ‘Det jag faktiskt kan påverka före i morgon är …’", "Välj en enda mening ur texten. Gör en tydlig handling av den och lägg resten åt sidan.", "Drick fem klunkar vatten och avsluta när den tionde minuten är slut."]
};

function renderMysticRitual() {
  const steps = RITUAL_STEPS[ritualMinutes];
  const running = ritualTimer.remaining > 0;
  const minutes = Math.floor(ritualTimer.remaining / 60);
  const seconds = ritualTimer.remaining % 60;
  return `<div class="ritual-layout"><section class="ritual-card card card-pad"><p class="eyebrow">Välj hur mycket plats du har</p><h2>En stilla ritual vid sjön</h2><p>En kort paus för reflektion — inte ännu en sak att prestera.</p><div class="ritual-duration" role="group" aria-label="Ritualens längd">${[1,3,10].map((value) => `<button type="button" data-action="set-ritual-duration" data-minutes="${value}" aria-pressed="${ritualMinutes === value}">${value} min</button>`).join("")}</div><ol>${steps.map((step) => `<li>${step}</li>`).join("")}</ol><button class="button button-primary" type="button" data-action="${running ? "stop-mystic-ritual" : "start-mystic-ritual"}">${running ? "Avsluta ritualen" : `Starta ${ritualMinutes} minuter`}</button>${running ? `<div class="ritual-countdown" id="ritual-countdown" role="timer">${minutes}:${String(seconds).padStart(2, "0")}</div>` : ""}</section></div>`;
}

function renderJournalCorner() {
  const prompt = JOURNAL_PROMPTS[new Date().getDate() % JOURNAL_PROMPTS.length];
  const recentJournal = state.journal.slice(0, 3);
  return `<section class="journal-corner card card-pad">${companion("hamster", "", "Majas skrivhörna", escapeHTML(prompt))}<form class="form-stack" id="journal-form"><input type="hidden" name="prompt" value="${escapeHTML(prompt)}"><label class="field"><span>Din rad för i dag</span><textarea name="text" maxlength="3000" placeholder="Skriv fritt. Det stannar här på enheten…" required></textarea></label><button class="button button-secondary" type="submit">Spara i dagboken</button></form>${recentJournal.length ? `<details><summary>Visa mina senaste rader (${state.journal.length})</summary>${recentJournal.map((entry) => `<article class="journal-entry"><time datetime="${entry.createdAt}">${new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(entry.createdAt))}</time><p>${escapeHTML(entry.text)}</p></article>`).join("")}</details>` : ""}</section>`;
}

function renderReflectionJournal() {
  const log = getTodayLog(state);
  const gratitude = Array.isArray(log.gratitude) ? log.gratitude : [];
  return `<div class="reflection-journal-grid"><section class="light-clearing reflection-welcome">${characterDialogue("maja", "Här får det lilla räknas. Spara något som gav värme eller lättnad, så blir det enklare att hitta tillbaka till det.", "Maja · små vinster")}<form class="gratitude-form" id="gratitude-form"><label class="field"><span>En liten sak som var bra</span><input name="gratitude" maxlength="120" placeholder="Till exempel: promenaden efter lunch…" required /></label><button class="button button-primary" type="submit">Spara vinsten</button></form><div class="gratitude-chips">${gratitude.map((item) => `<span class="gratitude-chip">${escapeHTML(item)}</span>`).join("") || `<span class="fine-print">Din samling börjar när du vill.</span>`}</div></section>${renderJournalCorner()}</div>`;
}

function renderRitual() {
  return `<div class="page mystic-page world-page" style="--world-path:url('${WORLD_ASSETS.ritual}');--mystic-ui-texture:url('${WORLD_ASSETS.ritualUI}')">
    ${renderWorldHero({
      world: "ritual",
      eyebrow: "Astrids nattsjö · stjärnor, tarot & ritual",
      title: "Välkommen till <em>Mystik.</em>",
      body: "Dagens stjärnhimmel, månens rytm och tarot som öppnar nya frågor — alltid med ett konkret nästa steg.",
      guideName: "Astrid",
      guide: "Min stjärnkappa är på. Välj om vi ska läsa dagen, vända ett kort eller göra en liten ritual.",
      actions: `<button class="button button-frost" type="button" data-action="set-mystic-mode" data-mode="tarot">Dra dagens kort ${icon("sparks", "button-icon")}</button>`
    })}
    <nav class="mystic-tabs" aria-label="Mystikens delar">${[["today", "Stjärnhimmel"], ["tarot", "Tarot"], ["ritual", "Ritual"]].map(([mode, label]) => `<button type="button" data-action="set-mystic-mode" data-mode="${mode}" aria-current="${mysticMode === mode ? "page" : "false"}">${label}</button>`).join("")}</nav>
    <div class="mystic-content">${mysticMode === "tarot" ? renderMysticTarot() : mysticMode === "ritual" ? renderMysticRitual() : renderMysticToday()}</div>
  </div>`;
}

function renderSpread(spread) {
  const visible = spread.slice(0, spreadRevealCount);
  const latest = visible.at(-1);
  return `<div class="spread-deck" data-revealed="${spreadRevealCount}">${spread.map((card, index) => `<div class="spread-slot" data-state="${index < spreadRevealCount ? "revealed" : index === spreadRevealCount ? "next" : "waiting"}">${renderTarotCard(card, { revealed: index < spreadRevealCount, action: index === spreadRevealCount ? "reveal-spread-card" : null, index, ariaLabel: `Vänd kort ${index + 1}: ${SPREAD_LABELS[index]}`, backLabel: index === spreadRevealCount ? "Vänd mig" : "Snart din tur" })}<small>${SPREAD_LABELS[index]}</small></div>`).join("")}</div>${latest ? `<p class="sr-only" role="status" aria-live="polite">Kort ${spreadRevealCount} av 3 är vänt: ${escapeHTML(latest.name)}, ${latest.isReversed ? "omvänt" : "rättvänt"}.</p>` : ""}${visible.length ? `<div class="spread-interpretations">${visible.map((card, index) => `<article class="spread-note"><p class="eyebrow">${SPREAD_LABELS[index]}</p><h3 tabindex="-1" data-spread-reading="${index}">${escapeHTML(card.name)}</h3><p>${card.isReversed ? card.reversed : card.upright}</p><p class="prompt">${card.prompt}</p><div class="spread-practice"><strong>Ett konkret steg</strong><p>${card.practice}</p></div></article>`).join("")}</div>` : `<p class="spread-instruction">Tre kort väntar. Vänd ett i taget och läs klart innan du väljer nästa.</p>`}`;
}

function renderInsights() {
  const insight = personalInsights(state.logs, insightsRange);
  const log = getTodayLog(state);
  const forestMoments = forestMomentsForDate(state);
  const activeExperiment = getActiveExperiment(state.preferences.activeExperiment);
  const displayedExperiment = activeExperiment || insight.experiment;
  const latestExperimentResult = Array.isArray(state.preferences.experimentHistory) ? state.preferences.experimentHistory[0] : null;
  const maxMood = 5;
  const dateFormat = new Intl.DateTimeFormat("sv-SE", { weekday: "short" });
  const patternState = insight.sampleDays >= 3
    ? { eyebrow: "Första mönstret är synligt", title: "Nu kan vi jämföra vad som hjälpte", body: "Maja visar ledtrådar, inte diagnoser. Varje ny återkoppling gör bilden tydligare." }
    : { eyebrow: "Mönster byggs av riktiga stunder", title: `${Math.max(0, 3 - insight.sampleDays)} ${3 - insight.sampleDays === 1 ? "incheckning" : "incheckningar"} kvar till en första jämförelse`, body: "Under tiden får du ett litet test att prova. Aura fyller aldrig i tomma dagar åt dig." };
  return `<div class="page insights-page world-page" style="--world-path:url('${WORLD_PATH_ASSETS.insights}')">
    ${renderWorldHero({
      world: "insights",
      eyebrow: "Mönster · det som hjälper på riktigt",
      title: "Lär känna din <em>egen rytm.</em>",
      body: "Här samlar Maja tre saker: vad som hjälpte, vad som återkommer och vad som är värt att prova härnäst.",
      guideName: "Maja · mönsterkompis",
      guide: "Jag håller ordning på dina egna svar och små vinster. Inga tomma dagar fylls i och inget behöver bli en prestation.",
      actions: `<button class="button button-frost" type="button" data-route="coach">Gör en ny incheckning ${icon("nav-arrow-right", "button-icon")}</button>`
    })}
    <section class="pattern-intro forest-panel">${characterDialogue("maja", patternState.body, patternState.eyebrow)}<div><h2>${patternState.title}</h2><div class="pattern-counts"><span><strong>${insight.moments}</strong> stunder</span><span><strong>${insight.feedback.better}</strong> råd hjälpte</span><span><strong>${insight.sampleDays}</strong> loggade dagar</span></div></div></section>
    ${everyday.renderObservations()}
    ${renderTodayExperiment()}
    ${renderForestTrail(forestMoments)}
    <section class="insight-story-grid forest-panel">
      <article class="light-clearing insight-experiment"><p class="eyebrow">Prova härnäst · bara en sak</p><h2>${escapeHTML(displayedExperiment.title)}</h2><p>${escapeHTML(displayedExperiment.body)}</p><strong>Följ upp så här: ${escapeHTML(displayedExperiment.measure)}</strong>${activeExperiment ? `<span class="experiment-active">${icon("check-circle")} Pågår · ${activeExperiment.completedDates.length} av ${activeExperiment.days} försök</span>` : `<button class="button button-primary" type="button" data-action="start-insight-experiment">Jag provar detta</button>`}${latestExperimentResult ? `<p class="experiment-memory">Senast avslutat: ${escapeHTML(latestExperimentResult.title)} · ${latestExperimentResult.outcome === "helped" ? "hjälpte lite" : "ingen tydlig skillnad"}.</p>` : ""}</article>
      <article class="light-clearing insight-story is-help"><p class="eyebrow">Det som verkar hjälpa</p><h2>${escapeHTML(insight.helps.headline)}</h2><p>${escapeHTML(insight.helps.observation)}</p><span>${escapeHTML(insight.helps.evidence)}</span></article>
      <article class="light-clearing insight-story is-repeat"><p class="eyebrow">Det som återkommer</p><h2>${escapeHTML(insight.repeats.headline)}</h2><p>${escapeHTML(insight.repeats.observation)}</p><span>${escapeHTML(insight.repeats.evidence)}</span></article>
    </section>
    <section class="forest-panel maja-memory" id="maja-memory"><div class="section-heading"><div><p class="eyebrow">Majas minnesburk</p><h2>Spara det du vill hitta tillbaka till</h2></div><p>Små vinster och fria rader stannar på enheten.</p></div>${renderReflectionJournal()}</section>
    <details class="forest-panel insight-evidence"><summary><span><strong>Se underlaget bakom mönstren</strong><small>${insight.sampleDays} loggade dagar · ${insight.moments} stunder</small></span><span aria-hidden="true">+</span></summary><div class="insight-range"><p class="eyebrow">Tidsperiod</p><div class="range-tabs" role="group" aria-label="Välj tidsperiod">${[7,28,90].map((days) => `<button type="button" data-action="set-insight-range" data-days="${days}" aria-pressed="${insightsRange === days}">${days} dagar</button>`).join("")}</div></div><div class="insight-chart"><div class="section-heading"><div><p class="eyebrow">Dina loggade dagar</p><h2>Mående över tid</h2></div><p>Tomt betyder inte loggat.</p></div><div class="chart" aria-label="Mående i valt tidsfönster">${insight.series.slice(-14).map((day) => `<div class="chart-column"><div class="chart-rail"><span class="chart-bar" style="height:${day.mood ? Math.max(8, day.mood / maxMood * 100) : 3}%" title="${day.mood ? `${day.mood} av 5` : "Ingen logg"}"></span></div><small>${dateFormat.format(day.date).slice(0,2)}</small></div>`).join("") || `<p class="fine-print">Diagrammet vaknar efter din första incheckning.</p>`}</div></div><div class="insight-history"><h2>Senaste stunderna</h2>${renderCheckInHistory(log)}</div></details>
  </div>`;
}

function routeAvailable(name) {
  if (name === "cycle") return moduleOn(state, "cycle");
  if (name === "ritual") return moduleOn(state, "reflection");
  return ROUTES.includes(name);
}

function renderPageSafely(renderer) {
  try {
    return renderer();
  } catch {
    // Never leave a blank forest: the rest of Aura keeps working.
    return `<div class="page world-page" style="--world-path:url('${WORLD_PATH_ASSETS.today}')"><section class="forest-panel render-error">${characterDialogue("maja", "Den här sidan kunde inte visas just nu. Dina anteckningar är kvar. Prova att gå till Idag.", "Maja · något gick snett")}<button class="button button-primary" type="button" data-route="today">Till Idag</button></section></div>`;
  }
}

function render({ scroll = "preserve" } = {}) {
  const previousScroll = window.scrollY;
  if (!routeAvailable(route)) route = "today";
  const routeChanged = lastRenderedRoute !== route;
  const views = {
    today: renderToday, coach: renderCoach, cycle: renderCycle, ritual: renderRitual, insights: renderInsights,
    life: everyday.renderLifePage, day: everyday.renderDayPage, low: everyday.renderLowPage, chaos: everyday.renderChaosPage,
    evening: everyday.renderEveningPage, week: everyday.renderWeekPage
  };
  const theme = ROUTE_THEME[route] || route;
  document.body.dataset.route = theme;
  document.body.dataset.page = route;
  document.body.dataset.dayPhase = dayPhase();
  document.body.dataset.forestState = forestGrowthState(forestMomentsForDate(state));
  setAmbientRoute(theme);
  if (routePill) routePill.textContent = ROUTE_LABELS[route] || ROUTE_LABELS.today;
  main.innerHTML = renderPageSafely(() => (views[route] || renderToday)());
  main.firstElementChild?.classList.toggle("page-enter", routeChanged);
  lastRenderedRoute = route;
  const tab = ROUTE_TAB[route] || route;
  document.querySelectorAll(".bottom-nav [data-route]").forEach((button) => {
    button.hidden = !routeAvailable(button.dataset.route);
    if (button.dataset.route === tab) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  const nav = document.querySelector(".bottom-nav");
  if (nav) nav.style.setProperty("--nav-count", String(nav.querySelectorAll("button:not([hidden])").length));
  updateSoundButton();
  if (scroll === "top") window.scrollTo({ top: 0, behavior: "auto" });
  else {
    const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    window.scrollTo({ top: Math.min(previousScroll, maxScroll), behavior: "auto" });
  }
  scheduleReminderCheck();
}

function scrollToRequestedSection(selector, block = "start") {
  requestAnimationFrame(() => document.querySelector(selector)?.scrollIntoView({ behavior: "smooth", block }));
}

function updateSoundButton() {
  if (!soundButton) return;
  soundButton.setAttribute("aria-pressed", String(audioActive));
  soundButton.classList.toggle("is-awaiting", !audioActive);
  const scene = getAmbientLabel(route);
  soundButton.setAttribute("aria-label", audioActive ? `Stäng av ${scene.toLocaleLowerCase("sv-SE")}` : `Slå på ${scene.toLocaleLowerCase("sv-SE")}`);
  const image = soundButton.querySelector("img");
  const label = soundButton.querySelector("strong");
  if (image) image.src = audioActive ? "/assets/icons/sound-high.svg" : "/assets/icons/sound-off.svg";
  if (label) label.textContent = audioActive ? scene : "slå på";
  document.querySelectorAll(".world-sound-invite").forEach((button) => {
    button.setAttribute("aria-pressed", String(audioActive));
    const inviteImage = button.querySelector("img");
    const inviteTitle = button.querySelector("strong");
    const inviteDetail = button.querySelector("small");
    if (inviteImage) inviteImage.src = audioActive ? "/assets/icons/sound-high.svg" : "/assets/icons/sound-off.svg";
    if (inviteTitle) inviteTitle.textContent = audioActive ? `${scene} är på` : `Slå på ${scene.toLocaleLowerCase("sv-SE")}`;
    if (inviteDetail) inviteDetail.textContent = audioActive ? "Tryck för att stänga av" : "Lugn bakgrund · du styr själv";
  });
  const previewButton = settingsDialog?.querySelector('[data-action="toggle-audio"]');
  if (previewButton) previewButton.textContent = audioActive ? "Stäng av" : `Provlyssna på ${scene.toLocaleLowerCase("sv-SE")}`;
}

function toast(message, { undo = false } = {}) {
  clearTimeout(toastTimer);
  toastElement.textContent = "";
  const text = document.createElement("span");
  text.textContent = storageFailing && !message.startsWith("Kunde inte spara") ? `${message} · sparas inte` : message;
  toastElement.append(text);
  if (undo) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "toast-undo";
    button.dataset.action = "life-undo";
    button.textContent = "Ångra";
    toastElement.append(button);
  }
  toastElement.classList.toggle("has-action", undo);
  toastElement.classList.add("show");
  toastTimer = setTimeout(() => toastElement.classList.remove("show"), undo ? 6000 : 2600);
}

function showAnimalResponse(message, name = "Klara") {
  if (!animalResponse) return;
  clearTimeout(animalTimer);
  const key = String(name).toLocaleLowerCase("sv-SE");
  const character = key === "astrid" ? CHARACTERS.astrid : key === "maja" ? CHARACTERS.maja : key === "liv" ? CHARACTERS.liv : CHARACTERS.klara;
  animalResponse.innerHTML = `<div class="animal-response-art" aria-hidden="true"><img src="${character.asset}" alt="" /></div><p><strong>${escapeHTML(character.name)}</strong>${escapeHTML(message)}</p><button class="animal-response-close" type="button" data-action="close-animal-response" aria-label="Stäng tipset">${icon("xmark")}</button>`;
  animalResponse.hidden = false;
  void animalResponse.offsetWidth;
  animalResponse.classList.add("show");
  animalTimer = setTimeout(() => {
    animalResponse.classList.remove("show");
    setTimeout(() => { animalResponse.hidden = true; }, 320);
  }, 12000);
}

function hideAnimalResponse() {
  if (!animalResponse) return;
  clearTimeout(animalTimer);
  animalResponse.classList.remove("show");
  animalResponse.hidden = true;
}

function randomGenerator() {
  let seed = Date.now() >>> 0;
  if (globalThis.crypto?.getRandomValues) {
    const values = new Uint32Array(1);
    globalThis.crypto.getRandomValues(values);
    seed = values[0];
  }
  return mulberry32(seed);
}

function fillLifeSettings(form) {
  const prefs = ensureLife(state)?.prefs;
  if (!prefs) return;
  for (const field of ["wake", "sleep", "workStart", "workEnd"]) if (form.elements[field]) form.elements[field].value = prefs[field] || "";
  form.querySelectorAll('input[name="workDay"]').forEach((input) => { input.checked = prefs.workDays.includes(Number(input.value)); });
  form.querySelectorAll('input[name="module"]').forEach((input) => { input.checked = prefs.modules[input.value] !== false; });
  form.querySelectorAll('input[name="density"], input[name="notifications"]').forEach((input) => { input.checked = prefs[input.name] === input.value; });
}

/** Rhythm, density, nudges and modules from the settings form → one prefs op. */
function lifePrefsFrom(data, { withModules = false } = {}) {
  const clockOrEmpty = (value) => /^\d{2}:\d{2}$/.test(String(value || "")) ? String(value) : "";
  const patch = {};
  for (const field of ["wake", "sleep"]) if (data.has(field) && clockOrEmpty(data.get(field))) patch[field] = clockOrEmpty(data.get(field));
  for (const field of ["workStart", "workEnd"]) if (data.has(field)) patch[field] = clockOrEmpty(data.get(field));
  if (data.has("workDayMarker")) patch.workDays = data.getAll("workDay").map(Number).filter((day) => day >= 0 && day <= 6);
  if (["light", "balanced", "full"].includes(data.get("density"))) patch.density = data.get("density");
  if (["off", "minimal", "helpful"].includes(data.get("notifications"))) patch.notifications = data.get("notifications");
  if (withModules) {
    const chosen = new Set(data.getAll("module"));
    patch.modules = Object.fromEntries(["cycle", "reflection", "shopping", "admin", "home", "projects", "routines"].map((name) => [name, chosen.has(name)]));
  }
  return patch;
}

function openSettings() {
  const form = settingsDialog.querySelector("form");
  form.elements.name.value = state.profile.name;
  fillLifeSettings(form);
  settingsVolumeBeforeOpen = state.preferences.audioVolume;
  const volume = setAmbientVolume(state.preferences.audioVolume);
  form.elements.audioVolume.value = String(volume);
  const output = settingsDialog.querySelector("#ambient-volume-value");
  if (output) output.textContent = `${volume}%`;
  settingsDialog.showModal();
}

function dismissSettings() {
  if (settingsVolumeBeforeOpen !== null) setAmbientVolume(settingsVolumeBeforeOpen);
  settingsVolumeBeforeOpen = null;
  settingsDialog.close();
}

function exportData() {
  const data = { exportedAt: new Date().toISOString(), note: "Privat export från Aura", ...state };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `aura-export-${localDateKey()}.json`;
  link.click();
  URL.revokeObjectURL(url);
  toast("Din lokala kopia är exporterad");
}

function updateBreathingUI() {
  const total = 120;
  const cycleSecond = breathing.elapsed % 10;
  let phase = "Andas ut";
  let count = Math.max(1, Math.ceil(10 - cycleSecond));
  let instruction = "Låt utandningen bli mjuk och lite längre.";
  if (cycleSecond < 4) {
    phase = "Andas in";
    count = Math.max(1, Math.ceil(4 - cycleSecond));
    instruction = "Andas in lugnt genom näsan om det känns bekvämt.";
  } else if (cycleSecond < 6) {
    phase = "Vila";
    count = Math.max(1, Math.ceil(6 - cycleSecond));
    instruction = "En kort, mjuk paus — hoppa över den om det känns bättre.";
  }
  document.querySelector("#breath-phase").textContent = phase;
  document.querySelector("#breath-count").textContent = count;
  document.querySelector("#breath-instruction").textContent = instruction;
  document.querySelector("#breath-progress-fill").style.width = `${Math.min(100, breathing.elapsed / total * 100)}%`;
  const toggle = breathingDialog.querySelector('[data-action="toggle-breathing"]');
  if (toggle) toggle.textContent = breathing.active ? "Pausa" : "Fortsätt";
  if (breathing.elapsed >= total) {
    breathing.active = false;
    clearInterval(breathing.interval);
    breathing.interval = null;
    document.querySelector("#breath-phase").textContent = "Klart";
    document.querySelector("#breath-count").textContent = "klart";
    document.querySelector("#breath-instruction").textContent = "Lägg märke till hur det känns — utan krav på att det måste vara annorlunda.";
    const breathingMomentId = `breathing:${localDateKey()}`;
    if (!forestMomentsForDate(state).some((moment) => moment.id === breathingMomentId)) {
      rememberMoment({ id: breathingMomentId, title: "En lugn andningspaus", kind: "done", characterId: "klara", route: "coach" });
      persist();
      showAnimalResponse("Andningspausen är klar. Ett litet ljus tänds i skogen — inte för prestationen, utan för att du gav dig själv plats.", "Klara");
    }
  }
}

function startBreathing(reset = true) {
  if (reset) breathing.elapsed = 0;
  breathing.active = true;
  clearInterval(breathing.interval);
  breathing.interval = setInterval(() => { breathing.elapsed += 0.25; updateBreathingUI(); }, 250);
  updateBreathingUI();
}

function stopBreathing() {
  breathing.active = false;
  clearInterval(breathing.interval);
  breathing.interval = null;
  updateBreathingUI();
}

function closeBreathing() {
  stopBreathing();
  breathingDialog.close();
}

function stopMysticRitual({ complete = false } = {}) {
  clearInterval(ritualTimer.interval);
  ritualTimer.interval = null;
  ritualTimer.remaining = 0;
  if (complete) {
    rememberMoment({ id: `mystic-ritual:${localDateKey()}`, title: "En stilla ritual vid sjön", kind: "reflection", characterId: "astrid", route: "ritual" });
    persist();
  }
  if (route === "ritual" && mysticMode === "ritual") render();
  if (complete) showAnimalResponse("Ritualen är klar. Ta med dig en enda mening eller känsla och låt resten stanna vid sjön.", "Astrid");
}

function startMysticRitual() {
  clearInterval(ritualTimer.interval);
  ritualTimer.remaining = ritualMinutes * 60;
  render();
  ritualTimer.interval = setInterval(() => {
    ritualTimer.remaining -= 1;
    const timer = document.querySelector("#ritual-countdown");
    if (timer) timer.textContent = `${Math.floor(ritualTimer.remaining / 60)}:${String(Math.max(0, ritualTimer.remaining % 60)).padStart(2, "0")}`;
    if (ritualTimer.remaining <= 0) stopMysticRitual({ complete: true });
  }, 1000);
}

function setCoachCheckinStep(nextStep) {
  coachCheckinStep = clamp(Number(nextStep), 0, 2);
  const form = document.querySelector("#coach-form");
  if (!form) return;
  updateCoachContextQuestions(form);
  form.querySelectorAll("[data-coach-panel]").forEach((panel) => { panel.hidden = Number(panel.dataset.coachPanel) !== coachCheckinStep; });
  const copy = [
    ["Klara · Vad vill du ha hjälp med just nu?", "Välj det som känns viktigast. Resten kan vänta."],
    ["Klara · Hur känns stunden?", "Jag frågar bara om det som hjälper mig att anpassa rådet."],
    ["Klara · Vill du lägga till något?", "Du kan ge lite sammanhang eller gå direkt till ditt råd."]
  ][coachCheckinStep];
  const stage = document.querySelector("#coach-form-stage");
  const title = stage?.querySelector(".character-speech strong");
  const body = stage?.querySelector(".character-speech p");
  const progressLabel = form.querySelector(".coach-progress > span");
  if (title) title.textContent = copy[0];
  if (body) body.textContent = copy[1];
  if (progressLabel) progressLabel.textContent = `Steg ${coachCheckinStep + 1} av 3`;
  form.querySelectorAll(".coach-progress i").forEach((dot, index) => { dot.dataset.active = String(index <= coachCheckinStep); });
  form.querySelector(`[data-coach-panel="${coachCheckinStep}"] h2`)?.focus({ preventScroll: true });
}

function updateCoachContextQuestions(form = document.querySelector("#coach-form")) {
  if (!form) return;
  const need = form.querySelector('input[name="need"]:checked')?.value || "structure";
  form.querySelectorAll("[data-coach-context]").forEach((section) => {
    section.hidden = !String(section.dataset.coachContext || "").split(" ").includes(need);
  });
  const note = form.querySelector('textarea[name="note"]');
  if (note) note.placeholder = coachNotePlaceholder(need);
  const selectedSituation = form.querySelector('input[name="situation"]:checked');
  if (!selectedSituation || ["general", "pms"].includes(selectedSituation.value)) {
    const preferredSituation = form.querySelector(`input[name="situation"][value="${need === "cycle" ? "pms" : "general"}"]`);
    if (preferredSituation) preferredSituation.checked = true;
  }
}

function toolboxItem(id) {
  return (Array.isArray(state.toolbox) ? state.toolbox : []).find((item) => item.id === id) || null;
}

function resolveToolTarget(target) {
  const origin = target.dataset.origin || "coach";
  if (origin === "toolbox") return toolboxItem(target.dataset.id);
  if (origin === "helped") return lastHelpedTool(getTodayLog(state));
  return latestCoachTool(origin);
}

function openReminderFor(tool) {
  if (!tool || !reminderDialog) return;
  reminderDraft = { ...tool };
  if (reminderDraftCopy) reminderDraftCopy.textContent = `${tool.title} — ${tool.body}`;
  reminderDialog.showModal();
}

function deliverDueReminders() {
  const result = collectDueReminders(state.reminders, new Date());
  if (!result.due.length) { scheduleReminderCheck(); return; }
  state.reminders = result.reminders;
  persist();
  if (route === "today") render();
  const first = result.due[0];
  const extra = result.due.length > 1 ? ` Du har också ${result.due.length - 1} sparat steg till.` : "";
  showAnimalResponse(`En mjuk puff: ${first.title}. ${first.body}${extra}`);
  scheduleReminderCheck();
}

function scheduleReminderCheck() {
  clearTimeout(reminderTimer);
  const now = new Date();
  if (collectDueReminders(state.reminders, now).due.length) {
    reminderTimer = setTimeout(deliverDueReminders, 0);
    return;
  }
  const next = nextPendingReminder(state.reminders, now);
  if (!next) return;
  reminderTimer = setTimeout(deliverDueReminders, Math.max(250, Date.parse(next.scheduledAt) - now.getTime()));
}

document.addEventListener("click", (event) => {
  const routeButton = event.target.closest("button[data-route]");
  if (routeButton) {
    hideAnimalResponse();
    if (lifeSheet?.open) { lifeSheet.close(); everyday.onSheetClosed(); }
    if (routeButton.dataset.route === "coach") { coachPrefill = null; coachCheckinStep = 0; coachEditing = false; }
    route = routeAvailable(routeButton.dataset.route) ? routeButton.dataset.route : "today";
    setAmbientRoute(ROUTE_THEME[route] || route);
    render({ scroll: "top" });
    main.focus({ preventScroll: true });
    return;
  }
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;
  if (everyday.handleClick(target)) return;
  if (action === "toggle-audio") {
    const requested = !audioActive;
    setAmbientEnabled(requested, route).then((actual) => {
      audioActive = Boolean(actual);
      state.preferences.audioEnabled = audioActive;
      persist();
      updateSoundButton();
      toast(audioActive ? `${getAmbientLabel(route)} är på` : "Ljudlandskapet är av");
    });
    return;
  }
  if (action === "close-animal-response") { hideAnimalResponse(); return; }
  if (action === "open-forest-visit") {
    const targetRoute = ["today", "coach", "cycle", "ritual", "insights"].includes(target.dataset.targetRoute) ? target.dataset.targetRoute : "coach";
    hideAnimalResponse();
    if (targetRoute === "coach") {
      const need = COACH_NEEDS.some((item) => item.value === target.dataset.need) ? target.dataset.need : "";
      coachPrefill = need ? { need } : null;
      coachCheckinStep = need ? 1 : 0;
      coachEditing = true;
    }
    route = targetRoute;
    setAmbientRoute(route);
    render({ scroll: "top" });
    main.focus({ preventScroll: true });
    return;
  }
  if (action === "start-coach-need") {
    coachPrefill = { need: COACH_NEEDS.some((item) => item.value === target.dataset.need) ? target.dataset.need : "structure" };
    coachCheckinStep = 1;
    coachEditing = true;
    route = "coach";
    setAmbientRoute(route);
    render({ scroll: "top" });
    scrollToRequestedSection("#coach-form-stage");
    return;
  }
  if (action === "focus-coach-form") {
    if (!document.querySelector("#coach-form-stage")) {
      coachPrefill = null;
      coachCheckinStep = 0;
      coachEditing = true;
      render();
    }
    scrollToRequestedSection("#coach-form-stage");
    return;
  }
  if (action === "coach-next") {
    const panel = document.querySelector(`[data-coach-panel="${coachCheckinStep}"]`);
    const invalid = panel?.querySelector(":invalid");
    if (invalid) { invalid.reportValidity?.(); return; }
    setCoachCheckinStep(coachCheckinStep + 1);
    return;
  }
  if (action === "coach-back") { setCoachCheckinStep(coachCheckinStep - 1); return; }
  if (action === "fill-followup") {
    const form = target.closest(".ai-coach-response")?.querySelector(".ai-followup-form");
    const field = form?.querySelector("textarea[name='question']");
    if (field) { field.value = target.dataset.text || ""; field.focus({ preventScroll: true }); }
    return;
  }
  if (action === "retry-ai") {
    if (!lastFailedAIRequest) return;
    const entry = getTodayLog(state).checkIns.find((item) => item.id === lastFailedAIRequest.entryId);
    if (entry) void requestAICoach(entry, lastFailedAIRequest.previous, lastFailedAIRequest.question, lastFailedAIRequest.persona);
    return;
  }
  if (action === "save-current-tool") {
    const tool = resolveToolTarget(target);
    if (!tool) { toast("Spara ett råd först"); return; }
    state.toolbox = saveHelpfulTool(state.toolbox, tool, new Date());
    persist(); render();
    showAnimalResponse(`Sparat: ${tool.title}. Nu hittar du det i Min hjälplåda på Idag.`, "Maja");
    return;
  }
  if (action === "remove-saved-tool") {
    state.toolbox = (Array.isArray(state.toolbox) ? state.toolbox : []).filter((item) => item.id !== target.dataset.id);
    persist(); render(); toast("Tipset är borttaget från hjälplådan");
    return;
  }
  if (action === "do-saved-tool") {
    const tool = toolboxItem(target.dataset.id);
    if (tool) showAnimalResponse(`Gör nu: ${tool.title}. ${tool.body}`);
    return;
  }
  if (action === "open-reminder") { openReminderFor(resolveToolTarget(target)); return; }
  if (action === "close-reminder") { reminderDraft = null; reminderDialog?.close(); return; }
  if (action === "cancel-reminder") {
    state.reminders = (Array.isArray(state.reminders) ? state.reminders : []).map((item) => item.id === target.dataset.id ? { ...item, status: "cancelled", cancelledAt: new Date().toISOString() } : item);
    persist(); render(); toast("Påminnelsen är borttagen");
    return;
  }
  if (action === "pantry-ai") {
    const plan = state.preferences?.pantryPlan;
    if (!plan?.aiPrompt) return;
    const log = getTodayLog(state);
    const snapshot = {
      mood: Number(log.mood || 3), energy: Number(log.energy || 5), stress: Number(log.stress || 3), sleepHours: null,
      sleepQuality: log.sleepQuality || "unknown", foodStatus: log.foodStatus || (log.ate === false ? "empty" : "unknown"), hydration: log.hydration || "unknown",
      situation: plan.goal === "pms" ? "pms" : "general", need: "food", note: plan.aiPrompt, safetyLevel: "safe", source: "pantry", persona: "klara",
      pantryItems: plan.ingredientLabels, pantryGoal: plan.goalLabel
    };
    const previous = log.checkIns?.[0] || null;
    const entry = appendCheckIn(state, snapshot);
    persist(); coachStepIndex = 0; coachStepSimple = false; coachSequenceDone = false; render();
    showAnimalResponse("Jag använder exakt det du markerade och gör förslaget mer personligt. Det lokala förslaget finns kvar under tiden.");
    void requestAICoach(entry, previous, "", "klara");
    return;
  }
  if (action === "open-journal") { route = "insights"; render({ scroll: "top" }); scrollToRequestedSection("#maja-memory"); return; }
  if (action === "set-cycle-mode") { cycleMode = ["today", "map", "learn"].includes(target.dataset.mode) ? target.dataset.mode : "today"; render(); return; }
  if (action === "period-start-today") {
    const date = localDateKey();
    state.cycle.lastPeriod = date;
    state.cycle.events = [{ id: crypto.randomUUID?.() || String(Date.now()), date, type: "period_start" }, ...(Array.isArray(state.cycle.events) ? state.cycle.events.filter((item) => item.date !== date || item.type !== "period_start") : [])].slice(0, 48);
    persist(); render(); showAnimalResponse("Jag har markerat mensstarten. Kartan är uppdaterad, men dagens symtom får fortfarande styra råden.", "Liv");
    return;
  }
  if (action === "toggle-cycle-support-symptom") { target.setAttribute("aria-pressed", String(target.getAttribute("aria-pressed") !== "true")); return; }
  if (action === "set-insight-range") { insightsRange = [7,28,90].includes(Number(target.dataset.days)) ? Number(target.dataset.days) : 28; render(); return; }
  if (action === "start-insight-experiment") {
    const experiment = personalInsights(state.logs, insightsRange).experiment;
    state.preferences.activeExperiment = { ...experiment, startedAt: new Date().toISOString(), days: 3, completedDates: [] };
    persist(); render(); showAnimalResponse("Testet ligger nu på Idag. Tre försök räcker — inga streaks och inget att ta igen.", "Maja");
    return;
  }
  if (action === "mark-insight-experiment") {
    const updated = markExperimentDay(state.preferences.activeExperiment);
    if (!updated) return;
    state.preferences.activeExperiment = updated;
    const progress = experimentProgress(updated);
    rememberMoment({ id: `experiment:${localDateKey()}:${updated.title}`, title: `Provade: ${updated.title}`, kind: "done", characterId: "maja", route: "insights" });
    persist(); render();
    showAnimalResponse(progress?.readyForFeedback ? "Tre försök är klara. Nu får din egen upplevelse avgöra om det var värt att spara." : `Sparat för i dag. ${progress?.remaining || 0} försök kvar, när det passar.`, "Maja");
    return;
  }
  if (action === "finish-insight-experiment") {
    const experiment = getActiveExperiment(state.preferences.activeExperiment);
    const outcome = target.dataset.outcome === "helped" ? "helped" : "unclear";
    if (!experiment) return;
    const result = { ...experiment, outcome, finishedAt: new Date().toISOString() };
    state.preferences.experimentHistory = [result, ...(Array.isArray(state.preferences.experimentHistory) ? state.preferences.experimentHistory : [])].slice(0, 12);
    state.preferences.activeExperiment = null;
    rememberMoment({ id: `experiment-result:${Date.now()}`, title: outcome === "helped" ? `Hjälpte lite: ${experiment.title}` : `Testat klart: ${experiment.title}`, kind: outcome === "helped" ? "helped" : "done", characterId: "maja", route: "insights" });
    persist(); render();
    showAnimalResponse(outcome === "helped" ? "Bra — jag sparar det som en personlig ledtråd, inte som en regel." : "Okej. Då behöver det inte bli ett standardråd för dig. Vi provar något annat nästa gång.", "Maja");
    return;
  }
  if (action === "stop-insight-experiment") {
    state.preferences.activeExperiment = null;
    persist(); render(); showAnimalResponse("Testet är avslutat. Du behöver inte slutföra sådant som inte passar.", "Maja");
    return;
  }
  if (action === "start-overwhelm") {
    const log = getTodayLog(state);
    appendCheckIn(state, {
      mood: Number(log.mood || 3),
      energy: Number(log.energy || 5),
      stress: Number(log.stress || 3),
      sleepHours: null,
      situation: "overwhelmed",
      need: "structure",
      safetyLevel: "safe",
      source: "quick-overwhelm"
    });
    persist();
    coachStepIndex = 0;
    coachStepSimple = false;
    coachSequenceDone = false;
    coachEditing = false;
    route = "coach";
    render({ scroll: "top" });
    scrollToRequestedSection("#moment-result");
    requestAnimationFrame(() => document.querySelector("#moment-result")?.focus({ preventScroll: true }));
    return;
  }
  if (action === "complete-coach-step") {
    const latest = getTodayLog(state).checkIns?.[0];
    const response = latest ? momentCoach(latest, getTodayLog(state).checkIns?.[1] || null) : null;
    const total = response?.actions?.length || 1;
    const completedAction = response?.actions?.[coachStepIndex % total] || null;
    const remembered = rememberCheckInAction(latest, completedAction, { suffix: `local-${completedAction?.id || coachStepIndex}` });
    if (coachStepIndex + 1 >= total) coachSequenceDone = true;
    else coachStepIndex += 1;
    coachStepSimple = false;
    if (remembered) persist();
    render();
    showAnimalResponse(remembered
      ? coachSequenceDone
        ? `“${remembered.title}” blev gjort. Jag låter det glimma i skogen medan du känner efter på nytt.`
        : `“${remembered.title}” blev gjort. Jag sparar spåret medan Klara visar nästa lilla steg.`
      : coachSequenceDone ? "Du tog dig igenom stunden ett steg i taget. Nu får du känna efter på nytt." : `Bra. Nästa steg är nummer ${coachStepIndex + 1} — inget annat behöver göras samtidigt.`, remembered ? "Maja" : "Klara");
    return;
  }
  if (action === "complete-ai-step") {
    const entry = getTodayLog(state).checkIns?.find((item) => item.id === target.dataset.id);
    const completedAction = actionForCheckIn(entry);
    const remembered = rememberCheckInAction(entry, completedAction, { suffix: "ai-first" });
    if (!remembered) return;
    persist();
    render();
    showAnimalResponse(`“${remembered.title}” blev gjort. Jag sparar det som ett mjukt spår i dagens skog.`, "Maja");
    return;
  }
  if (action === "simplify-coach-step") { coachStepSimple = true; render(); showAnimalResponse("Nu gjorde jag steget mindre. Bara en tydlig handling och sedan stopp."); return; }
  if (action === "swap-coach-step") {
    const latest = getTodayLog(state).checkIns?.[0];
    const total = latest ? Math.max(1, momentCoach(latest, getTodayLog(state).checkIns?.[1] || null).actions.length) : 1;
    coachStepIndex = (coachStepIndex + 1) % total;
    coachStepSimple = false;
    render();
    showAnimalResponse("Vi bytte spår. Prova bara det nya steget och lämna det förra.");
    return;
  }
  if (action === "new-coach-checkin") {
    coachPrefill = null;
    coachCheckinStep = 0;
    coachEditing = true;
    render();
    scrollToRequestedSection("#coach-form-stage");
    return;
  }
  if (action === "focus-cycle-form") { scrollToRequestedSection("#cycle-form", "center"); return; }
  if (action === "coach-pms-now") {
    cycleMode = "today";
    route = "cycle";
    render({ scroll: "top" });
    showAnimalResponse("Jag har öppnat stödet för i dag. Välj symtom och få svaret direkt här hos mig.", "Liv");
    return;
  }
  if (action === "set-mystic-mode") {
    mysticMode = ["today", "tarot", "ritual"].includes(target.dataset.mode) ? target.dataset.mode : "today";
    render();
    requestAnimationFrame(() => document.querySelector(`.mystic-tabs [data-mode="${mysticMode}"]`)?.focus({ preventScroll: true }));
    return;
  }
  if (action === "set-ritual-duration") { stopMysticRitual(); ritualMinutes = Number(target.dataset.minutes) || 3; render(); return; }
  if (action === "start-mystic-ritual") { startMysticRitual(); showAnimalResponse(`Timern är startad på ${ritualMinutes} ${ritualMinutes === 1 ? "minut" : "minuter"}. Följ bara en rad i taget.`, "Astrid"); return; }
  if (action === "stop-mystic-ritual") { stopMysticRitual(); showAnimalResponse("Ritualen är avslutad. Att stanna tidigare är också ett tydligt val.", "Astrid"); return; }
  if (action === "complete-star-action") {
    const sign = zodiacSign(state.profile.birthDate);
    const reading = sign ? dailyStarReading(sign) : null;
    if (reading?.tinyAction?.title) {
      rememberMoment({ id: `mystic-star:${localDateKey()}`, title: reading.tinyAction.title, kind: "done", characterId: "astrid", route: "ritual" });
      persist();
      render();
    }
    showAnimalResponse("Klart. Jag låter det konkreta steget glimma i dagens skog — resten får vänta.", "Astrid");
    return;
  }
  if (action === "set-mood") {
    const mood = Number(target.dataset.mood);
    const log = getTodayLog(state);
    setTodayLog(state, { mood });
    appendCheckIn(state, { mood, energy: Number(log.energy || 5), stress: Number(log.stress || 3), sleepHours: null, ate: typeof log.ate === "boolean" ? log.ate : null, situation: "general", need: "listen", safetyLevel: "safe", source: "quick" });
    persist(); render(); toast("Incheckningen är sparad");
    const moodPep = {
      1: "Jag ser dig. Du behöver inte bli på topp — vi hittar ett snällt nästa steg tillsammans.",
      2: "Tack för att du säger som det är. Kom, vi gör stunden lite lättare tillsammans.",
      3: "Check-in klar! Nu väljer vi en liten sak som kan ge mer energi eller lugn.",
      4: "Härligt — här finns lite medvind! Ge den gärna till något som känns fint.",
      5: "Där glittrar det! Spara känslan och gör plats för något du längtar efter."
    };
    showAnimalResponse(moodPep[mood] || moodPep[3]);
  }
  if (action === "toggle-habit") { const log = getTodayLog(state); const done = !log.habits?.[target.dataset.habit]; setTodayLog(state, { habits: { ...(log.habits || {}), [target.dataset.habit]: done } }); persist(); render(); showAnimalResponse(done ? "Snyggt! En liten rytm på plats. Maja firar den med dig." : "Smart flexat — planen ska passa dig och dagen du faktiskt har.", "Maja"); }
  if (action === "open-breathing") { breathingDialog.showModal(); startBreathing(true); }
  if (action === "close-breathing") closeBreathing();
  if (action === "toggle-breathing") breathing.active ? stopBreathing() : startBreathing(false);
  if (action === "toggle-form-value") { const next = target.getAttribute("aria-pressed") !== "true"; target.setAttribute("aria-pressed", String(next)); target.parentElement.querySelector(`input[name="${target.dataset.key}"]`).value = String(next); }
  if (action === "toggle-coach-symptom") { target.setAttribute("aria-pressed", String(target.getAttribute("aria-pressed") !== "true")); return; }
  if (action === "toggle-symptom") { const log = getTodayLog(state); const selected = new Set(log.symptoms || []); selected.has(target.dataset.symptom) ? selected.delete(target.dataset.symptom) : selected.add(target.dataset.symptom); setTodayLog(state, { symptoms: [...selected] }); persist(); render(); showAnimalResponse("Bra spanat. Jag sparar signalen och låter Klara använda den i nästa coachning.", "Liv"); }
  if (action === "reveal-daily") {
    const routeChanged = route !== "ritual";
    route = "ritual";
    mysticMode = "tarot";
    dailyRevealed = true;
    render({ scroll: routeChanged ? "top" : "preserve" });
    showAnimalResponse("Ta det som glimmar till och låt resten vila — frågan är din och besluten är alltid dina.", "Astrid");
    requestAnimationFrame(() => document.querySelector("[data-daily-reading]")?.focus({ preventScroll: true }));
  }
  if (action === "draw-new-daily") {
    dailyDrawOffset = (dailyDrawOffset + 1) % TAROT_CARDS.length;
    dailyRevealed = false;
    render();
    showAnimalResponse("Jag blandade om. Ett nytt klassiskt kort väntar på att vändas.", "Astrid");
    requestAnimationFrame(() => document.querySelector(".daily-tarot .tarot-flip")?.focus({ preventScroll: true }));
  }
  if (action === "start-spread") { currentSpread = drawTarotSpread(TAROT_CARDS, randomGenerator(), 3); spreadRevealCount = 0; render(); showAnimalResponse("Tre baksidor väntar. Vänd ett kort i taget och läs klart innan du väljer nästa.", "Astrid"); }
  if (action === "reveal-next-spread" || action === "reveal-spread-card") {
    const requestedIndex = action === "reveal-spread-card" ? Number(target.dataset.index) : spreadRevealCount;
    if (currentSpread && requestedIndex === spreadRevealCount && spreadRevealCount < currentSpread.length) {
      spreadRevealCount += 1;
      render();
      showAnimalResponse(spreadRevealCount < 3 ? `Kort ${spreadRevealCount} är vänt. Stanna gärna en stund innan nästa.` : "Nu är hela bågen synlig. Ta bara med dig det som faktiskt känns användbart.", "Astrid");
      requestAnimationFrame(() => document.querySelector(`[data-spread-reading="${spreadRevealCount - 1}"]`)?.focus({ preventScroll: true }));
    }
  }
  if (action === "checkin-feedback") {
    const feedback = target.dataset.feedback;
    const updatedEntry = setCheckInFeedback(state, target.dataset.id, feedback);
    const remembered = feedback === "better"
      ? rememberCheckInAction(updatedEntry, actionForCheckIn(updatedEntry, coachStepIndex), { kind: "helped", suffix: "helped" })
      : null;
    persist();
    render();
    const feedbackPep = feedback === "worse"
      ? "Tack för att du säger det. Gör en ny check-in så prioriterar vi om tillsammans."
      : feedback === "better"
        ? remembered ? `Jag sparar “${remembered.title}” som något som hjälpte lite — en ledtråd, inget krav.` : "Härligt — noterat! Vi bygger vidare på det som faktiskt hjälpte."
        : "Tack. Oförändrat är också viktig information — vi justerar nästa steg när du vill.";
    showAnimalResponse(feedbackPep, feedback === "better" ? "Maja" : "Klara");
  }
  if (action === "save-daily-card") { const card = currentDailyCard(); state.tarotReadings.unshift({ id: crypto.randomUUID?.() || String(Date.now()), createdAt: new Date().toISOString(), type: "daily", title: `Dagens kort: ${card.name}`, cards: [{ number: card.number, name: card.name, isReversed: card.isReversed }] }); persist(); toast("Dagens reflektion är sparad"); }
  if (action === "save-spread" && currentSpread) { state.tarotReadings.unshift({ id: crypto.randomUUID?.() || String(Date.now()), createdAt: new Date().toISOString(), type: "spread", title: currentSpread.map((card) => card.name).join(" · "), cards: currentSpread.map(({ number, name, isReversed }) => ({ number, name, isReversed })) }); state.tarotReadings = state.tarotReadings.slice(0, 100); persist(); toast("Läsningen är sparad lokalt"); }
  if (action === "open-settings") openSettings();
  if (action === "close-settings") dismissSettings();
  if (action === "export-data") exportData();
  if (action === "request-reset") { dismissSettings(); resetDialog.showModal(); }
  if (action === "cancel-reset") resetDialog.close();
  if (action === "confirm-reset") { clearAll(); state = createInitialState(); ensureLife(state); resetHistory(); route = "today"; currentSpread = null; spreadRevealCount = 0; resetDialog.close(); render({ scroll: "top" }); everyday.openOnboarding(); toast("All lokal data är raderad"); }
});

document.addEventListener("input", (event) => {
  if (event.target.matches('#coach-form input[name="need"]')) updateCoachContextQuestions(event.target.form);
  if (event.target.matches('#settings-form input[name="audioVolume"]')) {
    const volume = setAmbientVolume(event.target.value);
    const output = settingsDialog.querySelector("#ambient-volume-value");
    if (output) output.textContent = `${volume}%`;
  }
  const id = event.target.dataset.output;
  if (id) document.querySelector(`#${id}`).textContent = `${event.target.value}/${event.target.max}`;
});

document.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.target;
  const data = new FormData(form);
  if (everyday.handleSubmit(form, data)) return;
  if (form.id === "reminder-form") {
    if (!reminderDraft) return;
    const reminder = createAuraReminder(reminderDraft, Number(data.get("minutes") || 30), new Date());
    state.reminders = [reminder, ...(Array.isArray(state.reminders) ? state.reminders : [])].slice(0, 50);
    persist(); reminderDialog.close(); reminderDraft = null; render();
    const minutes = Number(data.get("minutes") || 30);
    showAnimalResponse(`Jag kommer tillbaka om ${minutes === 60 ? "en timme" : `${minutes} minuter`}. Du behöver inte hålla steget i huvudet.`);
    return;
  }
  if (form.id === "pantry-form") {
    const ingredients = data.getAll("ingredient").map(String);
    const goal = String(data.get("goal") || "quick");
    const plan = buildPantrySuggestion(ingredients, goal);
    state.preferences.pantryItems = plan.ingredients;
    state.preferences.pantryGoal = plan.goal;
    state.preferences.pantryPlan = plan;
    persist(); render();
    showAnimalResponse(plan.ingredients.length ? `Matförslaget är klart: ${plan.title}. Tre steg, sedan stopp.` : "Markera minst två saker som faktiskt finns hemma, så bygger jag något av dem.");
    requestAnimationFrame(() => document.querySelector("#pantry-result")?.focus({ preventScroll: true }));
    return;
  }
  if (form.id === "coach-followup-form") {
    const entry = getTodayLog(state).checkIns.find((item) => item.id === form.dataset.checkinId);
    const question = String(data.get("question") || "").trim().slice(0, 500);
    if (!entry || !question) return;
    const previous = getTodayLog(state).checkIns.find((item) => item.id !== entry.id) || null;
    const persona = form.dataset.persona === "liv" ? "liv" : "klara";
    form.reset();
    void requestAICoach(entry, previous, question, persona);
    return;
  }
  if (form.id === "cycle-support-form") {
    const log = getTodayLog(state);
    const selectedSymptoms = [...form.querySelectorAll('[data-action="toggle-cycle-support-symptom"][aria-pressed="true"]')].map((button) => button.dataset.symptom).filter(Boolean);
    const pain = Number(data.get("pain") || 1);
    const flow = String(data.get("flow") || "none");
    const note = String(data.get("note") || "").trim().slice(0, 800);
    const estimate = state.cycle.lastPeriod ? cycleEstimate({ lastPeriod: state.cycle.lastPeriod, cycleLength: state.profile.cycleLength, periodLength: state.profile.periodLength }) : null;
    const snapshot = {
      mood: Number(log.mood || 3), energy: Number(data.get("energy") || log.energy || 5), stress: Number(log.stress || 3), sleepHours: null,
      sleepQuality: log.sleepQuality || "unknown", foodStatus: log.foodStatus || (log.ate === false ? "empty" : log.ate === true ? "meal" : "unknown"), hydration: log.hydration || "unknown",
      pmsNow: "yes", pmsSymptoms: selectedSymptoms, cyclePhase: estimate?.phase || null, cycleDay: estimate?.cycleDay || null,
      situation: "pms", need: String(data.get("need") || "cycle"), note, safetyLevel: detectSafetyLevel(note), heavyBleeding: flow === "heavy", severePain: pain >= 4,
      flow, pain, source: "cycle", persona: "liv"
    };
    setTodayLog(state, { symptoms: [...new Set([...(log.symptoms || []), ...selectedSymptoms])], energy: snapshot.energy });
    const entry = appendCheckIn(state, snapshot);
    persist(); render();
    const previous = getTodayLog(state).checkIns.find((item) => item.id !== entry.id) || null;
    const local = momentCoach(entry, previous);
    requestAnimationFrame(() => document.querySelector("#cycle-answer")?.focus({ preventScroll: true }));
    if (!local.crisis) {
      showAnimalResponse(local.actions?.[0]?.title ? `Jag börjar med: ${local.actions[0].title.toLocaleLowerCase("sv-SE")}. AI-svaret kommer strax.` : "Jag läser in stunden och väljer ett konkret första steg.", "Liv");
      void requestAICoach(entry, previous, "", "liv");
    } else {
      hideAnimalResponse();
      toastElement.classList.remove("show");
    }
    return;
  }
  if (form.id === "gratitude-form") {
    const text = String(data.get("gratitude") || "").trim().slice(0, 120);
    if (!text) return;
    const log = getTodayLog(state);
    setTodayLog(state, { gratitude: [...(log.gratitude || []), text].slice(-5) });
    rememberMoment({ id: `gratitude:${Date.now()}`, title: "Du sparade en liten vinst", kind: "reflection", characterId: "maja", route: "insights" });
    persist(); render(); toast("Sparat med värme"); showAnimalResponse("Den räknas. Jag lägger den lilla fina saken i din samling och låter skogen svara med lite mer ljus.", "Maja");
  }
  if (form.id === "coach-form") {
    const need = String(data.get("need") || "structure");
    const situation = String(data.get("situation") || "general");
    const foodStatus = need === "food" ? String(data.get("foodStatus") || "unknown") : "unknown";
    const sleepQuality = need === "rest" ? String(data.get("sleepQuality") || "unknown") : "unknown";
    const hydration = need === "food" ? String(data.get("hydration") || "unknown") : "unknown";
    const pmsNow = need === "cycle" || situation === "pms" ? "yes" : "no";
    const selectedPmsSymptoms = [...form.querySelectorAll('[data-action="toggle-coach-symptom"][aria-pressed="true"]')].map((button) => button.dataset.symptom).filter(Boolean);
    const pmsSymptoms = pmsNow === "no" ? [] : selectedPmsSymptoms;
    const note = String(data.get("note") || "").trim().slice(0, 800);
    const estimate = state.cycle.lastPeriod ? cycleEstimate({ lastPeriod: state.cycle.lastPeriod, cycleLength: state.profile.cycleLength, periodLength: state.profile.periodLength }) : null;
    const snapshot = {
      energy: Number(data.get("energy")), stress: Number(data.get("stress")), mood: Number(data.get("mood")),
      sleepHours: null,
      sleepQuality,
      foodStatus,
      ate: foodStatus === "empty" ? false : ["light", "meal"].includes(foodStatus) ? true : null,
      hydration,
      pmsNow,
      pmsSymptoms,
      cyclePhase: estimate?.phase || null,
      cycleDay: estimate?.cycleDay || null,
      wantsConnection: data.get("wantsConnection") === "true",
      fluidLoss: data.get("fluidLoss") === "true",
      heavyBleeding: data.get("heavyBleeding") === "true",
      severePain: data.get("severePain") === "true",
      contraceptionChange: data.get("contraceptionChange") === "true",
      situation,
      need,
      safetyLevel: detectSafetyLevel(note),
      note,
      source: "coach",
      persona: "klara"
    };
    const mergedSymptoms = [...new Set([...(getTodayLog(state).symptoms || []), ...pmsSymptoms])];
    setTodayLog(state, { mood: snapshot.mood, energy: snapshot.energy, stress: snapshot.stress, sleepHours: snapshot.sleepHours, ate: snapshot.ate, foodStatus, sleepQuality, hydration: snapshot.hydration, symptoms: mergedSymptoms, wantsConnection: snapshot.wantsConnection });
    const entry = appendCheckIn(state, snapshot);
    coachPrefill = null;
    coachStepIndex = 0;
    coachStepSimple = false;
    coachSequenceDone = false;
    coachCheckinStep = 0;
    coachEditing = false;
    persist();
    render();
    const previous = getTodayLog(state).checkIns[1] || null;
    const response = momentCoach(entry, previous);
    if (response.crisis) {
      hideAnimalResponse();
      toastElement.classList.remove("show");
    } else {
      toast("Ny pepp är redo för stunden");
      showAnimalResponse(response.actions[0]?.title ? `Bra att du checkade in. Börja här: ${response.actions[0].title.toLocaleLowerCase("sv-SE")}.` : "Jag är med dig i nästa snälla steg.");
    }
    requestAnimationFrame(() => document.querySelector("#moment-result")?.focus({ preventScroll: true }));
    if (!response.crisis) void requestAICoach(entry, previous, "", "klara");
  }
  if (form.id === "cycle-form") {
    const lastPeriod = String(data.get("lastPeriod") || "");
    state.cycle.lastPeriod = lastPeriod;
    if (lastPeriod) state.cycle.events = [{ id: crypto.randomUUID?.() || String(Date.now()), date: lastPeriod, type: "period_start" }, ...(Array.isArray(state.cycle.events) ? state.cycle.events.filter((item) => item.date !== lastPeriod || item.type !== "period_start") : [])].slice(0, 48);
    state.profile.cycleLength = clamp(data.get("cycleLength"), 21, 45);
    state.profile.periodLength = clamp(data.get("periodLength"), 2, 10);
    persist(); render(); toast("Din rytmkarta är uppdaterad"); showAnimalResponse("Uppdaterat! Varje notering gör din personliga karta lite tydligare.", "Liv");
  }
  if (form.id === "mystic-profile-form") {
    const birthDate = String(data.get("birthDate") || "").slice(0, 10);
    if (!zodiacSign(birthDate)) return;
    state.profile.birthDate = birthDate;
    persist();
    render();
    showAnimalResponse(`Din stjärnhimmel är öppen. ${zodiacSign(birthDate).name} får dagens första läsning.`, "Astrid");
  }
  if (form.id === "journal-form") {
    const text = String(data.get("text") || "").trim().slice(0, 3000);
    if (!text) return;
    state.journal.unshift({ id: crypto.randomUUID?.() || String(Date.now()), createdAt: new Date().toISOString(), prompt: String(data.get("prompt") || ""), text });
    state.journal = state.journal.slice(0, 500);
    persist(); render(); toast("Din rad är sparad lokalt"); showAnimalResponse("Raden är sparad. Fint att ge tanken en egen plats.", "Maja");
  }
  if (form.id === "settings-form") {
    state.profile.name = String(data.get("name") ?? state.profile.name).trim().slice(0, 40);
    ensureLife(state);
    commitLife(state, [{ op: "prefs.set", patch: lifePrefsFrom(data, { withModules: true }) }], { system: true });
    ensureLife(state);
    state.preferences.audioVolume = setAmbientVolume(data.get("audioVolume"));
    settingsVolumeBeforeOpen = null;
    persist(); settingsDialog.close(); render(); toast("Inställningarna är sparade");
  }
});

document.addEventListener("change", (event) => { everyday.handleChange(event.target); });

breathingDialog.addEventListener("cancel", (event) => { event.preventDefault(); closeBreathing(); });
settingsDialog.addEventListener("cancel", (event) => { event.preventDefault(); dismissSettings(); });
reminderDialog.addEventListener("cancel", (event) => { event.preventDefault(); reminderDraft = null; reminderDialog.close(); });
lifeSheet?.addEventListener("close", () => everyday.onSheetClosed());

everyday.configure({
  state: () => state,
  persist,
  render,
  route: () => route,
  go(next) {
    hideAnimalResponse();
    route = routeAvailable(next) ? next : "today";
    render({ scroll: "top" });
    main.focus({ preventScroll: true });
  },
  toast,
  animal: showAnimalResponse,
  rememberMoment,
  icon,
  escapeHTML,
  characterDialogue,
  renderWorldHero,
  characters: CHARACTERS,
  worlds: { ...WORLD_PATH_ASSETS, ritual: WORLD_ASSETS.ritual },
  finishOnboarding({ name, cycleLength, periodLength }) {
    state.profile.name = String(name || "").trim().slice(0, 40);
    state.profile.cycleLength = clamp(cycleLength || 28, 21, 45);
    state.profile.periodLength = clamp(periodLength || 5, 2, 10);
    state.profile.onboarded = true;
    persist();
    render({ scroll: "top" });
    toast(state.profile.name ? `Välkommen, ${state.profile.name}` : "Välkommen till Aura");
  }
});

document.addEventListener("pointerdown", (event) => { everyday.handlePointerDown(event); });

// The NOW card follows the clock. Refresh quietly while nobody is typing or in a dialog.
function calmRefresh() {
  if (document.hidden) return;
  if (housekeepLife(state)) persist();
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "");
  const dialogOpen = Boolean(document.querySelector("dialog[open]"));
  if (!typing && !dialogOpen && ["today", "day", "chaos", "low", "evening"].includes(route)) render();
}
setInterval(calmRefresh, 60000);
document.addEventListener("visibilitychange", calmRefresh);

render();
if (!state.profile.onboarded) everyday.openOnboarding();
if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("/sw.js").catch(() => {});
