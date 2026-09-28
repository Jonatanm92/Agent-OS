export const PANTRY_ITEMS = [
  { id: "bread", label: "Bröd / knäcke", group: "carb" },
  { id: "eggs", label: "Ägg", group: "protein" },
  { id: "yogurt", label: "Yoghurt / kvarg", group: "protein" },
  { id: "oats", label: "Havre / müsli", group: "carb" },
  { id: "fruit", label: "Banan / frukt", group: "fruit" },
  { id: "soup", label: "Soppa", group: "meal" },
  { id: "rice", label: "Ris / pasta", group: "carb" },
  { id: "beans", label: "Bönor / linser", group: "protein" },
  { id: "leftovers", label: "Rester", group: "meal" },
  { id: "cheese", label: "Ost", group: "protein" },
  { id: "vegetables", label: "Frysta grönsaker", group: "vegetable" },
  { id: "nutbutter", label: "Nöt- / frösmör", group: "protein" }
];

export const PANTRY_GOALS = [
  { id: "quick", label: "Så snabbt som möjligt" },
  { id: "pms", label: "PMS / mensdag" },
  { id: "gentle", label: "Snällt för magen" },
  { id: "steady", label: "Mer stabil energi" }
];

const itemById = new Map(PANTRY_ITEMS.map((item) => [item.id, item]));
const goalById = new Map(PANTRY_GOALS.map((goal) => [goal.id, goal]));

function cleanText(value, fallback = "") {
  const text = typeof value === "string" ? value.trim() : "";
  return text || fallback;
}

function uniqueKnownItems(ids) {
  return [...new Set(Array.isArray(ids) ? ids : [])].map((id) => itemById.get(id)).filter(Boolean);
}

function stepList(first, second, third) {
  return [first, second, third];
}

export function buildPantrySuggestion(itemIds, goalId = "quick") {
  const items = uniqueKnownItems(itemIds);
  const ids = new Set(items.map((item) => item.id));
  const goal = goalById.get(goalId) || goalById.get("quick");
  let plan;

  if (ids.has("eggs") && ids.has("bread")) {
    plan = {
      title: "Varm äggmacka eller knäcke",
      minutes: "6–8 min",
      steps: stepList("Koka eller stek ett ägg.", "Lägg ägget på bröd eller knäckebröd.", "Ät det du orkar och spara resten — klart."),
      why: "Ägg och bröd ger en enkel kombination av protein och kolhydrater som ofta håller bättre än att bara småäta något sött."
    };
  } else if (ids.has("yogurt") && (ids.has("oats") || ids.has("fruit"))) {
    const extras = [ids.has("oats") ? "havre eller müsli" : "", ids.has("fruit") ? "frukt" : ""].filter(Boolean).join(" och ");
    plan = {
      title: "Skål som tar två minuter",
      minutes: "2 min",
      steps: stepList("Häll yoghurt eller kvarg i en skål.", `Lägg på ${extras}.`, "Sätt dig ner för de första fem skedarna — sedan får du känna efter."),
      why: "En enkel blandning av protein och kolhydrater kan ge jämnare mättnad och kräver nästan ingen matlagning."
    };
  } else if (ids.has("soup")) {
    const side = ids.has("bread") ? "Ta bröd eller knäcke bredvid." : ids.has("cheese") ? "Lägg lite ost till." : "Börja med en liten skål.";
    plan = {
      title: "Varm soppa, minsta möjliga jobb",
      minutes: "4–6 min",
      steps: stepList("Värm en portion soppa.", side, "Ställ undan resten innan du börjar äta."),
      why: "Varm mat kan kännas lättare att komma igång med, och en tydlig portion gör beslutet mindre."
    };
  } else if (ids.has("beans") && ids.has("rice")) {
    const vegetable = ids.has("vegetables") ? " och frysta grönsaker" : "";
    plan = {
      title: "Enkel varm skål",
      minutes: "8–10 min",
      steps: stepList("Värm ris eller pasta.", `Rör ner bönor eller linser${vegetable}.`, "Smaka av med det enkla du brukar ha hemma och ät ur skålen."),
      why: "Kolhydrater tillsammans med bönor eller linser ger både energi, protein och mer mättnad i samma enkla rätt."
    };
  } else if (ids.has("leftovers")) {
    const extra = ids.has("vegetables") ? "frysta grönsaker" : ids.has("eggs") ? "ett ägg" : ids.has("bread") ? "en bit bröd" : "något litet du redan valt";
    plan = {
      title: "Rädda resterna till en riktig måltid",
      minutes: "5–8 min",
      steps: stepList("Lägg en lagom portion rester på en tallrik.", `Värm och lägg till ${extra}.`, "Ät utan att förbättra eller laga om rätten."),
      why: "Färdig mat är en resurs. Ett enda tillägg kan göra den mer mättande utan att skapa ett nytt projekt."
    };
  } else if (ids.has("bread") && (ids.has("cheese") || ids.has("nutbutter"))) {
    const topping = ids.has("cheese") ? "ost" : "nöt- eller frösmör";
    plan = {
      title: "Två mackor och stopp",
      minutes: "3 min",
      steps: stepList("Ta fram två bröd eller knäckebröd.", `Lägg på ${topping}.`, "Lägg gärna till frukt om du valde det — sedan är beslutet klart."),
      why: "Det är ett konkret mellanmål med både snabb energi och något som mättar längre."
    };
  } else if (items.length) {
    const labels = items.slice(0, 3).map((item) => item.label.toLocaleLowerCase("sv-SE"));
    plan = {
      title: "Din snabbaste lilla tallrik",
      minutes: "3–8 min",
      steps: stepList(`Ta fram ${labels.join(", ")}.`, "Välj en lagom portion av varje — inget behöver bli en färdig rätt.", "Ät den första delen sittande och bedöm sedan om du vill ha mer."),
      why: "Målet är att få i gång en riktig måltid med det som redan finns, inte att laga något perfekt."
    };
  } else {
    plan = {
      title: "Välj två saker, sedan hjälper Klara",
      minutes: "20 sek",
      steps: stepList("Titta i kyl eller skafferi.", "Markera minst två saker som faktiskt finns hemma.", "Tryck sedan på ‘Gör ett matförslag’."),
      why: "Två konkreta ingredienser räcker för att slippa börja från ett tomt recept."
    };
  }

  const goalNotes = {
    quick: "Vi prioriterar få moment och nästan ingen disk.",
    pms: "På en PMS- eller mensdag får enkel, regelbunden mat vara viktigare än perfektion.",
    gentle: "Börja med en mindre portion och välj den tillagning som brukar kännas snäll för din mage.",
    steady: "Kombinera gärna en kolhydrat med protein eller fett för mer uthållig mättnad."
  };
  const selectedLabels = items.map((item) => item.label);
  const aiPrompt = selectedLabels.length
    ? `Jag har ${selectedLabels.join(", ")} hemma. Mitt mål är: ${goal.label}. Ge mig ett konkret matförslag på högst tio minuter med exakta steg. Utgå främst från det jag har och säg tydligt om något litet är valfritt.`
    : "Hjälp mig välja två enkla saker hemma som kan bli ett mellanmål eller en liten måltid på högst tio minuter.";

  return { ...plan, goal: goal.id, goalLabel: goal.label, goalNote: goalNotes[goal.id], ingredients: items.map((item) => item.id), ingredientLabels: selectedLabels, aiPrompt };
}

function normalizedTitle(value) {
  return cleanText(value).toLocaleLowerCase("sv-SE").replace(/\s+/gu, " ");
}

export function saveHelpfulTool(toolbox, tool, now = new Date()) {
  const title = cleanText(tool?.title);
  const body = cleanText(tool?.body);
  if (!title || !body) return Array.isArray(toolbox) ? toolbox.slice(0, 20) : [];
  const createdAt = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  const saved = {
    id: cleanText(tool.id, `tool-${createdAt}-${Math.random().toString(16).slice(2)}`),
    title,
    body,
    why: cleanText(tool.why),
    minutes: cleanText(tool.minutes, "några minuter"),
    source: cleanText(tool.source, "Aura"),
    createdAt
  };
  const existing = Array.isArray(toolbox) ? toolbox : [];
  return [saved, ...existing.filter((item) => normalizedTitle(item?.title) !== normalizedTitle(title))].slice(0, 20);
}

export function createAuraReminder(tool, minutes = 30, now = new Date()) {
  const created = now instanceof Date ? now : new Date(now);
  const safeMinutes = Math.min(720, Math.max(1, Math.round(Number(minutes) || 30)));
  return {
    id: `reminder-${created.toISOString()}-${Math.random().toString(16).slice(2)}`,
    title: cleanText(tool?.title, "Ditt lilla nästa steg"),
    body: cleanText(tool?.body, "Öppna Aura och välj det minsta steget som känns rimligt."),
    source: cleanText(tool?.source, "Klara"),
    createdAt: created.toISOString(),
    scheduledAt: new Date(created.getTime() + safeMinutes * 60_000).toISOString(),
    status: "pending"
  };
}

export function nextPendingReminder(reminders, now = new Date()) {
  const time = (now instanceof Date ? now : new Date(now)).getTime();
  return (Array.isArray(reminders) ? reminders : [])
    .filter((item) => item?.status === "pending" && Number.isFinite(Date.parse(item.scheduledAt)))
    .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt))
    .find((item) => Date.parse(item.scheduledAt) >= time) || null;
}

export function minutesUntilReminder(reminder, now = new Date()) {
  if (!reminder) return null;
  const current = (now instanceof Date ? now : new Date(now)).getTime();
  return Math.max(0, Math.ceil((Date.parse(reminder.scheduledAt) - current) / 60_000));
}

export function collectDueReminders(reminders, now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  const time = date.getTime();
  const due = [];
  const updated = (Array.isArray(reminders) ? reminders : []).map((item) => {
    if (item?.status !== "pending" || !Number.isFinite(Date.parse(item.scheduledAt)) || Date.parse(item.scheduledAt) > time) return item;
    const delivered = { ...item, status: "delivered", deliveredAt: date.toISOString() };
    due.push(delivered);
    return delivered;
  });
  return { reminders: updated.slice(0, 50), due };
}
