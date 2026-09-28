const DAY_MS = 86_400_000;

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value)));
}

export function inferSleepQuality(savedQuality, sleepHours) {
  if (["rough", "restless", "okay", "good", "unknown"].includes(savedQuality)) return savedQuality;
  if (sleepHours === null || sleepHours === "" || !Number.isFinite(Number(sleepHours))) return "unknown";
  const hours = Number(sleepHours);
  if (hours < 5.5) return "rough";
  if (hours < 7) return "restless";
  if (hours >= 8) return "good";
  return "okay";
}

export function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function dayPhase(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 9) return "dawn";
  if (hour >= 9 && hour < 17) return "day";
  if (hour >= 17 && hour < 22) return "dusk";
  return "night";
}

const FOREST_VISITS = {
  dawn: {
    characterId: "klara",
    eyebrow: "Morgonbesök i gläntan",
    title: "Klara öppnar dagen mjukt",
    body: "Du behöver inte planera hela dagen. En snabb incheckning räcker för att hitta ett första steg som passar kroppen och huvudet just nu.",
    actionLabel: "Checka in med Klara",
    route: "coach",
    need: ""
  },
  day: {
    characterId: "klara",
    eyebrow: "Dagens besök i gläntan",
    title: "Klara frågar hur stunden blev",
    body: "Humör, ork och behov får ändras under dagen. Uppdatera läget på några tryck så får du ett nytt råd för just den här stunden.",
    actionLabel: "Uppdatera hur det känns",
    route: "coach",
    need: ""
  },
  dusk: {
    characterId: "liv",
    eyebrow: "Kvällsbesök vid ängen",
    title: "Liv gör plats för kroppen",
    body: "Känn efter vad kroppen försöker säga efter dagen. Du kan få stöd för PMS, mens, spänningar eller låg ork utan att fylla i någon cykeldata.",
    actionLabel: "Kolla kropp & PMS",
    route: "cycle",
    need: ""
  },
  night: {
    characterId: "astrid",
    eyebrow: "Nattbesök vid sjön",
    title: "Astrid har tänt lyktorna",
    body: "Natten behöver inte lösa allt. Välj en stilla ritual, dra ett kort eller skriv en enda rad innan du låter dagen vara färdig.",
    actionLabel: "Gå till kvällsro",
    route: "ritual",
    need: ""
  }
};

export function forestVisit({ date = new Date(), latestCheckIn = null, latestForestMoment = null } = {}) {
  const phase = dayPhase(date);
  if (latestCheckIn && latestCheckIn.safetyLevel && latestCheckIn.safetyLevel !== "safe") return null;
  const symptoms = Array.isArray(latestCheckIn?.pmsSymptoms) ? latestCheckIn.pmsSymptoms : [];
  if (latestCheckIn?.pmsNow === "yes" || symptoms.length) {
    return {
      ...FOREST_VISITS.dusk,
      phase,
      eyebrow: "Liv tittar in efter din incheckning",
      title: "Kroppen får ändra dagens plan",
      body: "Du nämnde PMS- eller mensbesvär. Liv kan hjälpa dig välja ett konkret stöd för kroppen nu; cykeldata är fortfarande frivillig.",
      actionLabel: "Få stöd av Liv"
    };
  }
  if (latestCheckIn?.feedback === "worse" || Number(latestCheckIn?.mood) <= 2 && Number(latestCheckIn?.stress) >= 4) {
    return {
      characterId: "klara",
      phase,
      eyebrow: "Klara stannar kvar",
      title: "Stunden behöver ett nytt svar",
      body: "Det förra rådet verkar inte passa längre. Checka in igen så börjar Klara om från hur det faktiskt känns nu.",
      actionLabel: "Få ett nytt råd",
      route: "coach",
      need: "calm"
    };
  }
  if (latestCheckIn?.feedback === "better" || latestForestMoment) {
    const rememberedTitle = typeof latestForestMoment?.title === "string" ? latestForestMoment.title.trim() : "";
    return {
      characterId: "maja",
      phase,
      eyebrow: rememberedTitle ? "Ett nytt spår lyser i skogen" : "Maja såg en liten förändring",
      title: rememberedTitle ? "Skogen minns vad du faktiskt gjorde" : "Det där verkade hjälpa lite",
      body: rememberedTitle
        ? `Du markerade “${rememberedTitle}”. Det sparas som en mjuk ledtråd för i dag — inte som en streak eller ett krav.`
        : "Aura sparar det som faktiskt hjälpte, så att Maja kan göra nästa förslag lite klokare.",
      actionLabel: "Se dagens spår",
      route: "insights",
      need: ""
    };
  }
  return { ...FOREST_VISITS[phase], phase };
}

export function parseLocalDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return null;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(year, month - 1, day, 12);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

export function daysBetween(start, end) {
  const a = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 12);
  const b = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 12);
  return Math.round((b - a) / DAY_MS);
}

export function formatShortDate(date, locale = "sv-SE") {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(date);
}

export function cycleEstimate({ lastPeriod, cycleLength = 28, periodLength = 5, today = new Date() }) {
  const start = parseLocalDate(lastPeriod);
  if (!start) return null;
  const length = clamp(Math.round(cycleLength), 21, 45);
  const bleed = clamp(Math.round(periodLength), 2, 10);
  const elapsed = daysBetween(start, today);
  const normalized = ((elapsed % length) + length) % length;
  const cycleDay = normalized + 1;
  const nextStart = addDays(start, Math.ceil((elapsed + 1) / length) * length);
  const midStart = Math.max(bleed + 1, length - 17);
  const midEnd = Math.max(midStart, length - 12);
  let phase = "sen cykel";
  if (cycleDay <= bleed) phase = "mens";
  else if (cycleDay < midStart) phase = "tidig cykel";
  else if (cycleDay <= midEnd) phase = "mittcykel";
  return {
    cycleDay,
    length,
    periodLength: bleed,
    phase,
    nextStart,
    windowStart: addDays(nextStart, -2),
    windowEnd: addDays(nextStart, 2)
  };
}

export function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function mulberry32(seed) {
  return function random() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function dailyCard(cards, dateKey, name = "") {
  if (!cards.length) return null;
  const seed = hashString(`${dateKey}|${name.trim().toLocaleLowerCase("sv-SE")}|min-dag`);
  const random = mulberry32(seed);
  const card = cards[Math.floor(random() * cards.length)];
  return { ...card, isReversed: random() < 0.32 };
}

export function drawTarotSpread(cards, random = Math.random, count = 3) {
  const deck = cards.map((card) => ({ ...card }));
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck.slice(0, count).map((card) => ({ ...card, isReversed: random() < 0.32 }));
}

const COACH_ACTIONS = {
  safety: { id: "safety", eyebrow: "Viktigast nu", title: "Ta in en människa i stunden", body: "Om det känns outhärdligt eller du har tankar på att skada dig: ring 112. För sjukvårdsråd kan du ringa 1177.", minutes: "nu", tone: "rose" },
  ground: { id: "ground", eyebrow: "Snabb omstart", title: "Sänk intrycken en minut", body: "Lägg mobilen med skärmen nedåt, stäng av ljudet omkring dig och titta på en stilla sak. Stanna när en minut har gått.", minutes: "1 min", tone: "sage" },
  breathe: { id: "breathe", eyebrow: "Två minuters omstart", title: "Ge utandningen lite mer plats", body: "Testa fem lugna andetag: mjukt in, lite längre ut. Hitta en rytm som känns behaglig och pausa om du blir yr.", minutes: "2 min", tone: "lavender" },
  fuel: { id: "fuel", eyebrow: "Snäll energi", title: "Ge kroppen något gott och enkelt", body: "Välj något du faktiskt orkar: en smörgås, yoghurt, frukt eller en riktig måltid. Regelbundenhet slår perfektion.", minutes: "10 min", tone: "gold" },
  water: { id: "water", eyebrow: "Liten påfyllning", title: "Ta ett glas i din takt", body: "Fyll ett glas och ta några lugna klunkar. En enkel påfyllning kan ge kroppen en bättre start.", minutes: "1 min", tone: "blue" },
  daylight: { id: "daylight", eyebrow: "Ny energi", title: "Byt miljö och få in lite dagsljus", body: "Öppna fönstret eller gå ut en kort stund. Några minuter räknas och kan ge dagen en ny känsla.", minutes: "10 min", tone: "sage" },
  simplify: { id: "simplify", eyebrow: "Smart förenkling", title: "Välj dagens viktigaste lilla vinst", body: "Skriv tre saker du funderar på. Ring in den enda som behöver göras först och låt de andra två vänta.", minutes: "5 min", tone: "lavender" },
  sleep: { id: "sleep", eyebrow: "Kvällens lagom-plan", title: "Gör landningen lite mysigare", body: "Välj en ungefärlig läggtid, dämpa ljuset och lägg undan det som triggar tankarna en stund före sänggående.", minutes: "ikväll", tone: "night" },
  connect: { id: "connect", eyebrow: "Team du", title: "Skicka ett enkelt ‘kan du vara nära?’", body: "Skriv till någon trygg: ‘Jag har en tung stund. Kan du bara vara med mig en liten stund?’", minutes: "2 min", tone: "rose" },
  celebrate: { id: "celebrate", eyebrow: "Här finns medvind", title: "Gör plats för något du längtar efter", body: "Välj en sak som ger energi tillbaka — kreativitet, natur, rörelse eller någon du tycker om. Låt det goda få räknas fullt ut.", minutes: "valfritt", tone: "gold" },
  tinyJoy: { id: "tinyJoy", eyebrow: "Något att längta till", title: "Boka in en liten höjdpunkt", body: "Välj något inom 48 timmar: favoritfrukost, ett bad, promenad med musik, en serie, fika eller en vän. Lägg in det i kalendern nu.", minutes: "2 min", tone: "gold" },
  confidence: { id: "confidence", eyebrow: "Tillbaka till dig", title: "Gör en sak som känns typiskt du", body: "Välj en låt, ett plagg, lite rörelse, en vän eller en plats som påminner dig om vem du är. Ge det tio minuter utan att prestera.", minutes: "10 min", tone: "lavender" },
  orient: { id: "orient", eyebrow: "Börja här · 1 av 3", title: "Sänk intrycken en minut", body: "Lägg mobilen med skärmen nedåt och stäng av ljudet omkring dig. Titta på en stilla sak och stanna när en minut har gått.", minutes: "1 min", tone: "sage" },
  fourCheck: { id: "fourCheck", eyebrow: "Sedan · 2 av 3", title: "Gör en enkel grundkoll", body: "Fråga dig: när åt jag, när drack jag och behöver jag vila eller gå på toaletten? Välj bara det mest självklara behovet och ordna det först.", minutes: "2 min", tone: "blue" },
  nextVisible: { id: "nextVisible", eyebrow: "Till sist · 3 av 3", title: "Välj en sak för nästa timme", body: "Välj en enda sak som gör nästa timme lättare: svara på det viktigaste meddelandet, boka om ett krav eller plocka undan tre saker. Gör bara den du valde.", minutes: "5 min", tone: "lavender" },
  listen: { id: "listen", eyebrow: "Din röst först", title: "Sätt ord på vad du känner och behöver", body: "Skriv eller säg: ‘Det jag känner är …’ och ‘det jag behöver mest just nu är …’. Orden får vara ett första steg.", minutes: "2 min", tone: "lavender" },
  separationPause: { id: "separationPause", eyebrow: "Din energi först", title: "Ge dig själv 20 minuter före nästa steg", body: "Om inget är akut: skriv meddelandet som ett utkast och vänta 20 minuter. Fråga sedan vad du vill att kontakten ska leda till.", minutes: "20 min", tone: "rose" },
  pmsMargin: { id: "pmsMargin", eyebrow: "Mer plats åt dig", title: "Byt ett krav mot extra omtanke", body: "Välj en sak att förenkla, flytta eller göra på halvfart. Använd energin till det som hjälper mest just i dag.", minutes: "nu", tone: "lavender" },
  pmsMeal: { id: "pmsMeal", eyebrow: "Jämnare energi", title: "Välj en liten måltid som håller", body: "Ta en fullkornsmacka med ägg eller hummus och frukt, gröt med mjölk eller yoghurt, eller linssoppa med bröd. Välj den enklaste vägen.", minutes: "5–10 min", tone: "gold" },
  pmsComfort: { id: "pmsComfort", eyebrow: "Kroppsvänligt", title: "Prova värme eller mjuk rörelse", body: "Lägg något varmt över mage eller rygg, eller ta en lugn promenad i fem minuter. Välj bara det som känns skönt i kroppen i dag.", minutes: "5–15 min", tone: "rose" },
  simpleMeal: { id: "simpleMeal", eyebrow: "Snäll energi", title: "Bygg något enkelt och mättande", body: "Välj till exempel smörgås med ägg eller hummus och frukt, yoghurt med havre och bär, eller linssoppa med bröd.", minutes: "10 min", tone: "gold" },
  rehydrate: { id: "rehydrate", eyebrow: "Smart påfyllning", title: "Fyll på vätska och salter", body: "Efter kräkning, diarré eller mycket svettning: ta små klunkar ofta och välj vätskeersättning om förlusten varit stor.", minutes: "nu", tone: "blue" },
  careBleeding: { id: "careBleeding", eyebrow: "Vårdväg", title: "Be vården bedöma blödningen", body: "Blödning över sju dagar, klumpar, genomblödningar eller behov av dubbla skydd bör tas upp med vårdcentral, barnmorska eller gynekolog.", minutes: "boka", tone: "rose" },
  carePain: { id: "carePain", eyebrow: "Vårdväg", title: "Sök bedömning för den svåra smärtan", body: "Ny, mycket stark eller snabbt förvärrad smärta behöver bedömas. Ring 1177 om du är osäker på var du ska söka hjälp.", minutes: "nu", tone: "rose" },
  careNavigate: { id: "careNavigate", eyebrow: "Rätt person direkt", title: "Välj en enkel första kontakt", body: "Börja med barnmorska för cykel eller preventivmedel och vårdcentral för andra besvär. Om du är osäker på hur bråttom det är kan 1177 hjälpa dig välja.", minutes: "nu", tone: "blue" },
  contraceptionReview: { id: "contraceptionReview", eyebrow: "Inför barnmorskan", title: "Samla förändringarna, byt inte själv", body: "Notera metod, när något ändrades och vad du märkt i humör, blödning eller huvudvärk. Ta sammanfattningen till barnmorska eller gynekolog.", minutes: "5 min", tone: "blue" }
};

const ACTION_REASONS = {
  ground: "Färre ljud och synintryck ger hjärnan mindre att sortera när allt känns fullt.",
  breathe: "En lite längre utandning kan hjälpa kroppen växla ned, men bara om rytmen känns behaglig.",
  fuel: "Mat ger kroppen bränsle; en enkel kombination av kolhydrater och protein brukar hålla bättre än att vänta på den perfekta måltiden.",
  water: "Om du druckit lite kan några klunkar vara en enkel kroppskoll vid huvudvärk eller trötthet.",
  daylight: "Ett miljöbyte och dagsljus kan ge dagen en tydligare rytm och lite ny energi.",
  simplify: "Ett tydligt förstaval minskar mängden beslut som konkurrerar om uppmärksamheten.",
  sleep: "En jämn, lugn kvällsrutin kan göra det lättare för kroppen att förstå att dagen är på väg att ta slut.",
  connect: "Trygg kontakt kan göra en tung stund mindre ensam utan att du först måste förklara allt.",
  celebrate: "Att medvetet använda medvind hjälper det som redan känns bra att få verklig plats.",
  tinyJoy: "En liten planerad höjdpunkt gör något fint konkret och nära i tiden.",
  confidence: "Något välbekant som känns typiskt du kan påminna om identiteten utanför dagens känsla.",
  orient: "Färre intryck gör det enklare att se vilket behov som faktiskt kommer först.",
  fourCheck: "Mat, vätska, toalett och vila är konkreta grundbehov som är lättare att välja mellan än hela dagens problem.",
  nextVisible: "En avgränsad handling minskar startmotståndet och gör nästa timme mer överskådlig.",
  listen: "Att sätta ord på känsla och behov skiljer upplevelsen från nästa beslut.",
  separationPause: "En kort paus kan ge starka känslor tid att sjunka innan du väljer vad kontakten ska leda till.",
  pmsMargin: "PMS kan påverka humör, ork och koncentration; mer svängrum minskar mängden krav som behöver bäras samtidigt.",
  pmsMeal: "Regelbundna måltider och fiberrika kolhydrater kan ge jämnare energi och kan vara hjälpsamt vid PMS och sug.",
  pmsComfort: "Värme eller rörelse känns lindrande för många vid kramper; kroppen får avgöra vilken variant som passar.",
  simpleMeal: "Kolhydrater ger tillgänglig energi och protein eller fett gör måltiden mer mättande.",
  rehydrate: "Vid verklig vätskeförlust behöver kroppen både vätska och salter tillbaka.",
  careBleeding: "En bedömning kan skilja ett vanligt mönster från blodförlust som behöver behandlas.",
  carePain: "Ny eller mycket stark smärta är viktig att bedöma i stället för att försöka coacha bort.",
  careNavigate: "Rätt första kontakt gör det lättare att få hjälp utan att själv behöva avgöra exakt vad besväret beror på.",
  contraceptionReview: "En tydlig tidslinje gör det lättare att se om symtom började efter en förändring och att jämföra alternativ tillsammans med barnmorska."
};

export function coachPlan(input = {}) {
  const mood = clamp(input.mood ?? 3, 1, 5);
  const energy = clamp(input.energy ?? 5, 1, 10);
  const stress = clamp(input.stress ?? 3, 1, 5);
  const sleepHours = Number(input.sleepHours ?? 7);
  const ate = input.ate !== false;
  const water = Number(input.water ?? 0);
  const wantsConnection = Boolean(input.wantsConnection);
  const crisis = Boolean(input.crisis);
  const ranked = [];
  const add = (id, score) => ranked.push({ ...COACH_ACTIONS[id], score });
  if (crisis) add("safety", 100);
  if (mood <= 1) add("connect", 92);
  if (stress >= 5) add("breathe", 82);
  if (ate === false) add("fuel", 86);
  if (water <= 1) add("water", 70);
  if (energy <= 3) add("simplify", 82);
  if (sleepHours < 6.5) add("sleep", 84);
  if (wantsConnection || mood <= 2) add("connect", 80);
  if (energy >= 7 && mood >= 4) add("celebrate", 76);
  add("daylight", energy <= 4 ? 72 : 58);
  add("breathe", 52);
  add("simplify", 48);
  const unique = new Map();
  ranked.sort((a, b) => b.score - a.score).forEach((action) => {
    if (!unique.has(action.id)) unique.set(action.id, action);
  });
  return [...unique.values()].slice(0, 3).map(({ score, ...action }) => action);
}

const GUIDANCE = {
  food: {
    id: "food",
    title: "Bygg ett enkelt energiankare",
    body: "Välj till exempel smörgås med ägg eller hummus och frukt, yoghurt med havre och bär eller en varm restportion. Det bästa valet är det som faktiskt blir ätet.",
    sourceLabel: "Livsmedelsverket",
    url: "https://www.livsmedelsverket.se/matvanor-halsa--miljo/mat-och-naring/premiar-for-livsmedelsverkets-nya-matpyramid"
  },
  pms: {
    id: "pms",
    title: "PMS-stöd även utan cykeldag",
    body: "Börja med dagens signaler: regelbundna enkla måltider, sömn, rörelse eller värme och lite mindre stress kan vara värt att prova. Logga sedan vad som faktiskt hjälpte; en ifylld cykel gör mönstret tydligare men krävs inte för råd.",
    sourceLabel: "1177: PMS och PMDS",
    url: "https://www.1177.se/sjukdomar--besvar/hormoner/pms-och-pmds/"
  },
  iron: {
    id: "iron",
    title: "Järnrik mat + C-vitamin",
    body: "Kombinera linser, bönor, tofu, frön eller kött med paprika, citrus eller bär. Vid riklig mens och tydlig trötthet, andfåddhet eller hjärtklappning kan ett blodprov ge bättre svar före tillskott.",
    sourceLabel: "1177: järnbrist",
    url: "https://www.1177.se/sjukdomar--besvar/hjarta-och-blodkarl/blodsjukdomar/blodbrist-pa-grund-av-for-lite-jarn/"
  },
  electrolytes: {
    id: "electrolytes",
    title: "När vätskeersättning är värd det",
    body: "Efter kräkning, diarré eller mycket svettning kan vätskeersättning fylla på både vätska och salter. Vid vanlig PMS eller mens räcker vatten och mat oftast.",
    sourceLabel: "1177: uttorkning",
    url: "https://www.1177.se/sjukdomar--besvar/mage-och-tarm/magsjuka-och-krakningar/uttorkning/"
  },
  contraception: {
    id: "contraception",
    title: "Gör en smart preventivmedelskoll",
    body: "Skriv metod, start- eller bytesdatum och vad som har ändrats i humör, blödning eller huvudvärk. Ta med mönstret till barnmorskan om du vill justera eller jämföra alternativ.",
    sourceLabel: "1177: preventivmedel",
    url: "https://www.1177.se/liv--halsa/sexuell-halsa/skydd-mot-graviditet/preventivmedel--skydd-mot-graviditet/"
  }
};

function momentTrend(current, previous) {
  if (!previous) return "first";
  const moodDelta = Number(current.mood ?? 3) - Number(previous.mood ?? 3);
  const stressDelta = Number(current.stress ?? 3) - Number(previous.stress ?? 3);
  if (moodDelta <= -1 || stressDelta >= 2) return "worse";
  if (moodDelta >= 1 || stressDelta <= -2) return "better";
  return "steady";
}

export function detectSafetyLevel(note = "") {
  const text = String(note).toLocaleLowerCase("sv-SE").replace(/\s+/g, " ").trim();
  if (!text) return "safe";

  const immediate = [
    /\b(?:jag\s+)?(?:ska|kommer att|tänker)\s+(?:ta (?:livet av mig|mitt liv|en överdos)|döda mig själv|skada mig(?: själv)?|göra illa mig(?: själv)?)\b/,
    /\b(?:jag\s+)?(?:ska|kommer att|tänker)\s+(?:hoppa framför (?:ett )?(?:tåg(?:et)?|buss(?:en)?)|hoppa från (?:en bro|bron|ett tak|taket)|hänga mig|skära mig)(?![a-zåäö])/,
    /\b(?:jag\s+)?(?:har\s+(?:redan\s+)?tagit|tog\s+(?:redan\s+)?)\s*en\s+överdos\b/,
    /\b(?:har|gjort|skrivit)\s+en\s+(?:självmords)?plan\b/,
    /\b(?:ta livet av mig|döda mig själv)\s+(?:nu|ikväll|i natt)\b/
  ];
  if (immediate.some((pattern) => pattern.test(text))) return "immediate";

  const violence = [
    /\b(?:han|hon|någon|min partner|mitt ex).{0,45}\b(?:hotar|slår|misshandlar|förföljer|kan skada)\b/,
    /\b(?:rädd|orolig)\s+(?:att|för att).{0,40}\b(?:skada|slå|döda)\s+mig\b/
  ];
  if (violence.some((pattern) => pattern.test(text))) return "violence";

  const thoughts = [
    "(?:självmord(?:stankar?|splan)?|tankar på självmord|funderar på självmord)",
    "(?:vill\\s+(?:jag\\s+)?dö)",
    "(?:vill\\s+(?:jag\\s+)?inte\\s+leva)",
    "(?:ta livet av mig|ta mitt liv|döda mig själv|skada(?:t|r)? mig(?: själv)?|göra illa mig(?: själv)?|gör illa mig(?: själv)?|skära mig|skär mig|skurit mig|självskad(?:a|ar|at|e(?:tankar?|beteende|handlingar?)?)|bränn(?:a|er|t) mig(?: själv)? med flit|risp(?:a|ar|at) mig(?: själv)?)",
    "(?:ta en överdos|överdosera)",
    "(?:hänga mig|hoppa framför (?:ett )?(?:tåg(?:et)?|buss(?:en)?)|hoppa från (?:en bro|bron|ett tak|taket))"
  ];
  return thoughts.some((source) => hasUnnegatedSignal(text, source)) ? "thoughts" : "safe";
}

function hasUnnegatedSignal(text, source) {
  const clauses = String(text).split(/(?:[.!?;]+|\b(?:men|fast|dock|däremot)\b)/u);
  return clauses.some((clause) => {
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])${source}(?![\\p{L}\\p{N}_])`, "gu");
    for (const match of clause.matchAll(pattern)) {
      const before = clause.slice(0, match.index);
      const after = clause.slice(match.index + match[0].length);
      const directlyNegated = /\b(?:har|hade|känner|kände|upplever|vill|tänker|ska|kommer|kan|funderar)\s+(?:verkligen\s+)?(?:inte|ingen|inget|inga|aldrig)\s+(?:alls\s+)?(?:att\s+|på\s+)?$/u.test(before)
        || /\b(?:inte|ingen|inget|inga|aldrig|varken)\s*(?:alls\s+)?$/u.test(before)
        || /\butan(?:\s+(?:någon|något|några))?\s*$/u.test(before);
      const negatedAfter = /^\s*(?:inte|aldrig)\b/u.test(after);
      if (!directlyNegated && !negatedAfter) return true;
    }
    return false;
  });
}

export function detectPhysicalUrgency(note = "") {
  const text = String(note).toLocaleLowerCase("sv-SE").replace(/\s+/g, " ").trim();
  if (!text) return "safe";

  const chestSource = "(?:bröstsmärta|bröstsmärtor|bröstvärk|bröstont|ont (?:i|över) bröstet|ont (?:i|över) bröstkorgen|smärt(?:a|or) (?:i|över) bröstet|smärt(?:a|or) (?:i|över) bröstkorgen|värker i bröstet|bröstet värker|tryck (?:över|i) bröstet|tryck (?:över|i) bröstkorgen|bröstet gör (?:mycket )?ont)";
  const breathSource = "(?:svårt att andas|svårt med andningen|svårt att få luft|problem med andningen|andningen är svår|andningssvårighet(?:er)?|andningsbesvär|kan inte andas|kan knappt andas|kan inte få luft|kan knappt få luft|får (?:ingen|inte) luft|kippar efter luft|andnöd|kämpar (?:med|för) att andas)";
  return hasUnnegatedSignal(text, chestSource) && hasUnnegatedSignal(text, breathSource) ? "emergency" : "safe";
}

function crisisResponse(level) {
  if (level === "immediate") {
    return {
      level: "emergency",
      title: "Det här behöver mänsklig hjälp nu",
      body: "Ring 112 eller sök psykiatrisk akutmottagning. Be någon du litar på att stanna hos dig medan du tar kontakt.",
      links: [{ label: "Ring 112", href: "tel:112" }, { label: "Ring 1177", href: "tel:1177" }]
    };
  }
  if (level === "violence") {
    return {
      level: "emergency",
      title: "Din säkerhet går först",
      body: "Om någon kan skada dig, ring 112. Kvinnofridslinjen 116 016 är gratis, anonym och öppen dygnet runt.",
      links: [{ label: "Ring 112", href: "tel:112" }, { label: "Kvinnofridslinjen 116 016", href: "tel:116016" }]
    };
  }
  if (level === "thoughts") {
    return {
      level: "urgent",
      title: "Du ska inte bära det här ensam",
      body: "Självmordstankar ska tas på allvar. Berätta för någon du litar på och kontakta vårdcentralen. Ring 1177 om du behöver hjälp att hitta rätt. Vid omedelbar fara: ring 112.",
      links: [{ label: "Ring 1177", href: "tel:1177" }, { label: "Ring 112", href: "tel:112" }, { label: "Mind 901 01", href: "tel:90101" }]
    };
  }
  return null;
}

function physicalCrisisResponse() {
  return {
    level: "emergency",
    title: "Ring 112 nu",
    body: "Mycket ont i bröstet tillsammans med svårt att andas behöver bedömas akut. Ring 112 och vänta inte på fler råd i appen.",
    links: [{ label: "Ring 112", href: "tel:112" }]
  };
}

export function urgentCoachResponse(input = {}, previous = null) {
  const note = String(input.note || "").trim().slice(0, 1200);
  const detectedSafety = detectSafetyLevel(note);
  const declaredSafety = ["immediate", "violence", "thoughts"].includes(input.safetyLevel) ? input.safetyLevel : "safe";
  const safetyLevel = detectedSafety !== "safe" ? detectedSafety : declaredSafety;
  const physicalUrgency = input.physicalUrgency === "emergency" ? "emergency" : detectPhysicalUrgency(note);
  const crisis = physicalUrgency === "emergency" ? physicalCrisisResponse() : crisisResponse(safetyLevel);
  if (!crisis) return null;
  return {
    level: crisis.level,
    title: crisis.title,
    reflection: crisis.body,
    actions: [],
    guidance: [],
    followUp: null,
    trend: momentTrend(input, previous),
    crisis
  };
}

function noteCoachCue(note = "") {
  const text = String(note).toLocaleLowerCase("sv-SE").replace(/\s+/g, " ").trim();
  if (!text) return null;

  if (/\b(?:jobbmejl|jobbmail|arbetsmejl|arbetsmail|inkorg|e-post|email)\b/.test(text)) {
    return {
      reflection: "Det är jobbmejlen som gör nästa steg otydligt. Du behöver inte beta av hela inkorgen — välj ett enda mejl med en enkel regel.",
      action: {
        id: "noteJobMail",
        eyebrow: "Ett tydligt förstaval",
        title: "Välj ett enda jobbmejl",
        body: "Öppna inkorgen, välj mejlet med närmast deadline eller tydligast fråga och skriv bara svaret på det. Stäng inkorgen när det är skickat.",
        why: "En synlig urvalsregel tar bort beslutet om var du ska börja och ett avslut hindrar uppgiften från att växa.",
        minutes: "5–10 min",
        tone: "lavender"
      }
    };
  }

  const mentionsEgg = /(?:^|[^a-zåäö])ägg(?:$|[^a-zåäö])/.test(text);
  if (/\b(?:knäckebröd|knäcke|smörgås|macka|yoghurt|kvarg|gröt|mellanmål)\b/.test(text) || mentionsEgg) {
    const mentionsCrispbread = /\b(?:knäckebröd|knäcke)\b/.test(text);
    const namedFood = mentionsCrispbread && mentionsEgg
      ? "knäckebröd och ägg"
      : mentionsCrispbread
        ? "knäckebrödet"
        : mentionsEgg
          ? "ägget"
          : "det du redan har hemma";
    return {
      reflection: `Du nämner ${namedFood}. Det är en fullt rimlig start — vi gör den enkel i stället för att vänta på en perfekt måltid.`,
      action: {
        id: "noteFoodAtHome",
        eyebrow: "Använd det som redan finns",
        title: mentionsCrispbread && mentionsEgg ? "Gör knäckebröd och ägg till en liten måltid" : "Gör en liten måltid av det du har",
        body: mentionsCrispbread && mentionsEgg
          ? "Lägg upp ett eller två knäckebröd med ägg. Lägg till frukt, yoghurt eller mjölk om det finns och känns enkelt — annars räcker det som första steg."
          : "Lägg upp det du nämnde och ät en enkel portion nu. Lägg till frukt eller något att dricka om det redan finns nära till hands.",
        why: mentionsCrispbread && mentionsEgg
          ? "Knäckebröd bidrar med kolhydrater och ägg med protein och fett, så kombinationen ger mer bränsle och mättnad än att skjuta upp maten."
          : "Att använda mat som redan finns minskar startmotståndet och ger kroppen bränsle utan ett nytt projekt.",
        minutes: "5 min",
        tone: "gold"
      }
    };
  }

  return null;
}

/**
 * Deterministiskt digitalt samtalsstöd. Medicinska varningsregler körs före
 * vardagsråd och funktionen ställer aldrig diagnos eller doserar behandling.
 */
export function momentCoach(input = {}, previous = null) {
  const foodStatus = ["empty", "light", "meal", "unknown"].includes(input.foodStatus) ? input.foodStatus : "unknown";
  const pmsNow = ["no", "maybe", "yes"].includes(input.pmsNow) ? input.pmsNow : "no";
  const pmsSymptoms = Array.isArray(input.pmsSymptoms) ? [...new Set(input.pmsSymptoms.filter((value) => typeof value === "string"))].slice(0, 10) : [];
  const ate = typeof input.ate === "boolean"
    ? input.ate
    : foodStatus === "empty"
      ? false
      : ["light", "meal"].includes(foodStatus)
        ? true
        : null;
  const current = {
    mood: clamp(input.mood ?? 3, 1, 5),
    energy: clamp(input.energy ?? 5, 1, 10),
    stress: clamp(input.stress ?? 3, 1, 5),
    sleepHours: input.sleepHours === null || input.sleepHours === "" ? null : Number(input.sleepHours),
    ate,
    foodStatus,
    hydration: ["low", "some", "good", "unknown"].includes(input.hydration) ? input.hydration : "unknown",
    sleepQuality: ["rough", "restless", "okay", "good", "unknown"].includes(input.sleepQuality) ? input.sleepQuality : "unknown",
    pmsNow,
    pmsSymptoms,
    situation: input.situation || "general",
    need: input.need || "practical",
    safetyLevel: input.safetyLevel || "safe",
    physicalUrgency: input.physicalUrgency || detectPhysicalUrgency(input.note),
    heavyBleeding: Boolean(input.heavyBleeding),
    severePain: Boolean(input.severePain),
    fluidLoss: Boolean(input.fluidLoss),
    contraceptionChange: Boolean(input.contraceptionChange),
    wantsConnection: Boolean(input.wantsConnection),
    overwhelmFocus: input.overwhelmFocus || null,
    note: String(input.note || "").trim().slice(0, 600),
    hasNote: Boolean(String(input.note || "").trim())
  };
  const trend = momentTrend(current, previous);
  const urgent = urgentCoachResponse(current, previous);
  if (urgent) return urgent;

  const ranked = [];
  const add = (id, score) => ranked.push({ ...COACH_ACTIONS[id], score });
  const noteSupport = noteCoachCue(current.note);
  const hasPmsSignals = current.situation === "pms" || current.need === "cycle" || current.pmsNow !== "no" || current.pmsSymptoms.length > 0;
  if (current.severePain) add("carePain", 100);
  if (current.heavyBleeding) add("careBleeding", 98);
  if (noteSupport) ranked.push({ ...noteSupport.action, score: 96 });
  if (current.ate === false) add("simpleMeal", 94);
  if (current.hydration === "low") add("water", 90);
  if (current.fluidLoss) add("rehydrate", 92);
  if (current.situation === "separation") add("separationPause", 90);
  if (hasPmsSignals) {
    const hasPhysicalPms = current.pmsSymptoms.some((id) => ["cramps", "headache", "bloating", "tender"].includes(id));
    add("pmsMargin", hasPhysicalPms ? 84 : 89);
    add("pmsMeal", current.ate === false || current.foodStatus === "light" ? 88 : 82);
    if (hasPhysicalPms) add("pmsComfort", 92);
  }
  if (current.situation === "spark") {
    add("tinyJoy", 96);
    add("daylight", 78);
  }
  if (current.situation === "confidence") {
    add("confidence", 96);
    add("celebrate", 82);
  }
  const needsClarity = current.situation === "overwhelmed" || current.need === "structure";
  if (needsClarity) {
    const focusAction = { choose: "fourCheck", body: "simpleMeal", practical: "nextVisible", relationship: "separationPause", thoughts: "listen" }[current.overwhelmFocus];
    if (focusAction) add(focusAction, 97);
    add("orient", 93);
    add("fourCheck", 92);
    add("nextVisible", 91);
  }
  if (current.contraceptionChange) add("contraceptionReview", 86);
  if (current.need === "care") add("careNavigate", 93);
  if (current.need === "boost") {
    add("confidence", 95);
    add("daylight", 88);
  }
  if (current.need === "joy") {
    add("tinyJoy", 97);
    add("celebrate", 86);
  }
  if (current.need === "listen") add("listen", 85);
  if (current.need === "rest") {
    add("sleep", 92);
    add("water", 68);
  }
  if (current.need === "cycle") add("pmsMargin", 90);
  if (current.need === "practical") {
    add("simplify", 87);
    add("nextVisible", 86);
  }
  if (current.need === "food") add("simpleMeal", 84);
  if (current.stress >= 5 || current.need === "calm") add("breathe", 83);
  if (current.energy <= 3 || current.mood <= 2) add("simplify", 80);
  if (current.wantsConnection || current.situation === "lonely" || current.mood <= 2) add("connect", 82);
  if (Number.isFinite(current.sleepHours) && current.sleepHours < 6.5) add("sleep", 74);
  if (["rough", "restless"].includes(current.sleepQuality)) add("sleep", 78);
  add("listen", 56);
  add("daylight", 48);

  const unique = new Map();
  ranked.sort((a, b) => b.score - a.score).forEach((action) => {
    if (!unique.has(action.id)) unique.set(action.id, action);
  });
  const actions = [...unique.values()].slice(0, 3).map(({ score, ...action }) => ({ ...action, why: action.why || ACTION_REASONS[action.id] || "Ett litet, tydligt steg är lättare att prova och utvärdera än att försöka lösa allt samtidigt." }));

  const guidance = [];
  const guide = (id) => {
    if (!guidance.some((item) => item.id === id)) guidance.push(GUIDANCE[id]);
  };
  if (current.ate === false || current.need === "food") guide("food");
  if (hasPmsSignals) guide("pms");
  if (current.heavyBleeding) guide("iron");
  if (current.fluidLoss) guide("electrolytes");
  if (current.contraceptionChange) guide("contraception");

  const situationReflection = {
    overwhelmed: "När det är svårt att sortera blir fler val bara mer att bära. Klara håller i ordningen: sänk intrycken, kolla det mest grundläggande och välj sedan en enda sak.",
    spark: "Dagen behöver inte bli perfekt för att få en höjdpunkt. Nu hittar vi något litet som faktiskt känns roligt att se fram emot.",
    confidence: "Du är mer än den här perioden. Nu plockar vi fram något som känns som du och bygger lite ny kraft därifrån.",
    separation: "En separation kan svänga från minut till minut. Ditt nästa steg får handla om att skydda din energi och hjälpa dig själv genom just den här stunden.",
    pms: "Du känner din kropp bäst. Vi kan ge dagen mer marginal och leta efter det som faktiskt gör den lite lättare.",
    lonely: "Att du checkar in är ett första kontaktsteg. Nu letar vi efter en trygg person eller plats som kan ge stunden mer värme.",
    conflict: "Efter en konflikt kan kroppen ligga kvar i hög beredskap. Vi hjälper den ner ett steg och väljer sedan vad som är värt din energi.",
    sleep: "Kort sömn kan göra allt tyngre. I dag vinner du på att använda energin smart och räkna det som faktiskt blir gjort.",
    body: "Kroppens signaler förtjänar att bli lyssnade på. Vi väljer omsorg som ger dig lite mer stöd här och nu.",
    general: "Bra att du fångade stunden. Du har redan gjort första steget — nu väljer vi det som kan ge lite mer lugn, kraft eller glädje."
  }[current.situation] || "Bra att du fångade stunden. Du har redan gjort första steget — nu väljer vi det som kan ge lite mer lugn, kraft eller glädje.";
  const notePrefix = current.hasNote && !noteSupport ? "Tack för att du berättade. " : "";
  const trendPrefix = trend === "worse"
    ? "Det verkar tyngre än förra gången. Då växlar vi ner och prioriterar dig. "
    : trend === "better"
      ? "Något verkar ha lättat sedan sist — fint, det räknas. "
      : "";

  const needsCare = current.severePain || current.heavyBleeding;
  const asksForLift = ["boost", "joy"].includes(current.need) || ["spark", "confidence"].includes(current.situation);
  const encouragement = needsCare
    ? { tone: "care", label: "Bra att du fångade signalen", text: "Att ta kroppens signaler på allvar och söka rätt hjälp är ett handlingskraftigt steg." }
    : needsClarity
      ? { tone: "focus", label: "Klara håller i ordningen", text: "Du behöver inte reda ut allt. Sänk först intrycken, kolla sedan vad du behöver och välj därefter en enda sak." }
    : trend === "better"
      ? { tone: "uplift", label: "Det här räknas", text: "Något hjälpte lite. Lägg märke till vad det var och bygg vidare med en snäll dos till." }
      : asksForLift
        ? { tone: "uplift", label: "Okej, nu skapar vi lite medvind", text: "Du behöver inte må toppen för att få en fin stund. Vi gör den enkel, konkret och nära." }
      : current.mood >= 4 && current.energy >= 6 && current.stress <= 3
        ? { tone: "uplift", label: "Här finns medvind", text: "Det finns lite kraft att använda. Välj något du längtar efter och ge det en stund på riktigt." }
        : current.mood <= 2 || current.stress >= 4
          ? { tone: "gentle", label: "Klara hejar varsamt", text: "Att du checkar in mitt i det tunga är också styrka. Du behöver inte känna dig positiv — välj bara ett steg som är snällt mot dig." }
          : { tone: "steady", label: "Första vinsten är redan här", text: "Du stannade upp och lyssnade in. Bra gjort. Nu hittar vi en liten skjuts mot mer lugn eller energi." };

  const title = needsCare
    ? "Ta hand om det här först"
    : needsClarity
      ? "Tre enkla steg när huvudet är fullt"
    : trend === "better"
      ? "Bygg vidare på det som hjälpte"
      : asksForLift
        ? "Nu gör vi dagen lite mer din"
      : encouragement.tone === "uplift"
        ? "Ta vara på medvinden"
        : encouragement.tone === "gentle"
          ? "Ett snällt steg framåt"
          : "Nu tar vi nästa lilla vinst";

  const askedForFood = current.need === "food"
    || noteSupport?.action?.id === "noteFoodAtHome"
    || (hasPmsSignals && ["empty", "light"].includes(current.foodStatus));
  const foodSupport = askedForFood
    ? {
        title: hasPmsSignals ? "Tre enkla vägar till jämnare PMS-energi" : "Tre enkla vägar till mer bränsle",
        why: hasPmsSignals
          ? "Regelbundna måltider och fiberrika kolhydrater kan ge jämnare energi och kan minska sug eller humörsvängningar för vissa. Du behöver inte äta perfekt."
          : "När energi eller matintag är lågt är en liten, komplett måltid ofta mer användbar än att vänta tills du orkar laga något avancerat.",
        options: [
          "Fullkornsmacka med ägg eller hummus + en frukt",
          "Yoghurt eller växtalternativ med havre, bär och nötter eller frön",
          "Gröt eller en varm restportion — gärna med något proteinrikt"
        ]
      }
    : null;

  return {
    level: needsCare ? "care" : "support",
    title,
    reflection: `${notePrefix}${trendPrefix}${noteSupport?.reflection || situationReflection}`,
    encouragement,
    actions,
    foodSupport,
    guidance,
    followUp: needsClarity ? "Känns det lite lättare att välja efter första steget?" : "Hur känns det efter det första lilla steget?",
    trend,
    crisis: null
  };
}

export function weeklyInsights(logs = {}, endDate = new Date(), days = 7) {
  const series = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = addDays(endDate, -offset);
    const key = localDateKey(date);
    const log = logs[key] || {};
    const moments = Array.isArray(log.checkIns) && log.checkIns.length ? log.checkIns.length : (Number(log.mood) ? 1 : 0);
    series.push({ key, date, mood: Number(log.mood) || null, energy: Number(log.energy) || null, sleepHours: Number(log.sleepHours) || null, water: Number(log.water) || 0, habits: log.habits || {}, moments });
  }
  const average = (key) => {
    const values = series.map((item) => item[key]).filter((value) => Number.isFinite(value) && value > 0);
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  };
  const loggedDays = series.filter((item) => item.mood || item.moments).length;
  const checkIns = series.reduce((sum, item) => sum + item.moments, 0);
  const gentleNote = loggedDays < 3
    ? "Varje check-in gör kartan tydligare. Fortsätt några dagar så kan Astrid hjälpa dig hitta vad som ger energi, lugn och lite mer medvind."
    : average("mood") < 2.5
      ? "Veckan har varit tung, och ändå har du fortsatt lyssna in. Det är viktigt. Låt nästa steg vara stöd från någon du litar på."
      : average("sleepHours") && average("sleepHours") < 6.5
        ? "Du har upptäckt flera korta nätter. Fin spaning — ge återhämtningen en tydligare plats och se vad som blir lättare."
        : "Du har byggt en tydligare bild av veckan. Ge mer plats åt det som gav energi tillbaka — där finns din medvind."
  return { series, checkIns, loggedDays, averageMood: average("mood"), averageEnergy: average("energy"), averageSleep: average("sleepHours"), gentleNote };
}
