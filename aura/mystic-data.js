const SIGNS = [
  { id: "capricorn", name: "Stenbocken", element: "jord", test: (md) => md >= 1222 || md <= 119 },
  { id: "aquarius", name: "Vattumannen", element: "luft", test: (md) => md >= 120 && md <= 218 },
  { id: "pisces", name: "Fiskarna", element: "vatten", test: (md) => md >= 219 && md <= 320 },
  { id: "aries", name: "Väduren", element: "eld", test: (md) => md >= 321 && md <= 419 },
  { id: "taurus", name: "Oxen", element: "jord", test: (md) => md >= 420 && md <= 520 },
  { id: "gemini", name: "Tvillingarna", element: "luft", test: (md) => md >= 521 && md <= 620 },
  { id: "cancer", name: "Kräftan", element: "vatten", test: (md) => md >= 621 && md <= 722 },
  { id: "leo", name: "Lejonet", element: "eld", test: (md) => md >= 723 && md <= 822 },
  { id: "virgo", name: "Jungfrun", element: "jord", test: (md) => md >= 823 && md <= 922 },
  { id: "libra", name: "Vågen", element: "luft", test: (md) => md >= 923 && md <= 1022 },
  { id: "scorpio", name: "Skorpionen", element: "vatten", test: (md) => md >= 1023 && md <= 1121 },
  { id: "sagittarius", name: "Skytten", element: "eld", test: (md) => md >= 1122 && md <= 1221 }
];

const PHASES = [
  { id: "new", name: "Nymåne", invitation: "Gör plats för en tydlig början.", action: "Öppna Anteckningar och skriv en sak du vill börja med. Skriv bara första handlingen, inte hela planen." },
  { id: "waxing-crescent", name: "Tilltagande skära", invitation: "Ge en liten idé fem minuter av din tid.", action: "Välj en sak du redan har påbörjat. Sätt en timer på fem minuter och fortsätt tills den ringer. Stanna sedan." },
  { id: "first-quarter", name: "Halvmåne på väg mot fullmåne", invitation: "Välj riktning utan att lösa allt.", action: "Skriv två alternativ på varsin rad. Ring in det alternativ som gör morgondagen enklast och lämna resten." },
  { id: "waxing-gibbous", name: "Tilltagande måne", invitation: "Justera något som nästan fungerar.", action: "Välj en pågående sak. Skriv exakt vad som saknas för att nästa lilla del ska bli klar." },
  { id: "full", name: "Fullmåne", invitation: "Lägg märke till det som redan har vuxit.", action: "Skriv tre saker du faktiskt har tagit dig igenom den här månaden. Stanna efter den tredje." },
  { id: "waning-gibbous", name: "Avtagande måne", invitation: "Dela med dig av något som blivit tydligare.", action: "Skicka en kort rad till en trygg person: ‘En sak jag har förstått på sistone är …’" },
  { id: "last-quarter", name: "Halvmåne på väg mot nymåne", invitation: "Släpp ett krav som inte behöver följa med.", action: "Skriv ett krav du bär på. Skriv sedan: ‘I dag räcker det att …’ och fyll i en mindre version." },
  { id: "waning-crescent", name: "Avtagande skära", invitation: "Vila innan nästa början.", action: "Sänk ljuset, lägg mobilen utom räckhåll och sitt eller ligg bekvämt i tre minuter utan att lösa något." }
];

const TONES = [
  { title: "Mjuk tydlighet", text: "Du behöver inte reda ut allt på en gång. I dag blir det lättare när du skiljer på det du vet och det som får vänta." },
  { title: "Varmt mod", text: "En liten rak handling kan ge mer kraft än ännu ett varv i huvudet. Välj något du kan avsluta tydligt." },
  { title: "Lugn rörelse", text: "Det som känns stillastående behöver inte få en stor lösning. En konkret förflyttning räcker som början." },
  { title: "Snäll avgränsning", text: "Din energi mår bra av en tydlig kant i dag. Bestäm vad du gör nu och vad du medvetet lämnar." },
  { title: "Nyfiken närvaro", text: "Lägg märke till vad som faktiskt händer innan du tolkar det. Det kan göra nästa val enklare." },
  { title: "Mjuk återkomst", text: "Något välbekant kan ge fäste i dag. Börja med en rutin, plats eller person som brukar kännas trygg." }
];

const RELATIONSHIPS = [
  { text: "Ett svar behöver inte skickas i samma stund som känslan kommer.", action: "Skriv svaret i Anteckningar. Ställ en timer på tio minuter och läs det igen innan du väljer om du vill skicka." },
  { text: "Tydlighet kan vara vänligare än långa förklaringar.", action: "Skriv en mening som börjar med ‘Det jag behöver just nu är …’. Ta bort allt efter den första tydliga punkten." },
  { text: "Du får välja kontakt som ger mer ro, inte mer brus.", action: "Välj en trygg person och skicka: ‘Har du tio minuter att bara lyssna i dag?’" },
  { text: "Allt behöver inte avgöras i samma samtal.", action: "Skriv en enda fråga du vill få svar på. Spara övriga frågor till en senare anteckning." }
];

const SELF_CARE = [
  { text: "Gör det lätt att börja, även om du inte gör klart.", action: "Lägg fram det första du behöver: handduk, skor, matlåda eller anteckningsbok. Stanna när saken ligger framme." },
  { text: "Kroppen kan få en enkel signal om att tempot sänks.", action: "Sätt dig bekvämt, släpp ner axlarna och gör en långsam axelrullning bakåt. Stanna efter tre varv." },
  { text: "En liten påfyllning kan göra nästa beslut enklare.", action: "Fyll ett glas till hälften och ta fem klunkar. Ställ glaset där du ser det." },
  { text: "Ordning kan börja mycket mindre än ett helt rum.", action: "Flytta exakt tre saker till rätt plats. Sluta efter den tredje, även om mer återstår." }
];

const WEEKLY = [
  { hold: "Lugna och tydliga besked.", release: "Försöket att lösa tre steg samtidigt.", try: "Boka en enda femtonminutersruta för det du undviker.", question: "Vad skulle kännas som lättnad – inte perfektion?" },
  { hold: "Det som ger kroppen mer utrymme.", release: "Att svara innan du vet vad du vill säga.", try: "Skriv ett utkast och vänta tio minuter innan du skickar.", question: "Vilken gräns skulle göra veckan mjukare?" },
  { hold: "Små saker du faktiskt avslutar.", release: "Listor som bara växer.", try: "Välj tre uppgifter och stryk resten från dagens vy.", question: "Vad är tillräckligt bra den här veckan?" },
  { hold: "Personer och platser där du kan andas ut.", release: "Att bära allt tyst.", try: "Be en trygg person om tio minuters sällskap.", question: "Var känner du dig mest som dig själv?" }
];

function safeDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function hash(value) {
  let result = 2166136261;
  for (const character of String(value)) {
    result ^= character.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function pick(items, seed, offset = 0) {
  return items[(hash(`${seed}:${offset}`) + offset) % items.length];
}

export function zodiacSign(value) {
  const date = safeDate(value);
  if (!date) return null;
  const md = (date.getMonth() + 1) * 100 + date.getDate();
  return SIGNS.find((sign) => sign.test(md)) || null;
}

export function moonPhase(value = new Date()) {
  const date = safeDate(value instanceof Date ? value : String(value)) || new Date();
  const referenceNewMoon = Date.UTC(2000, 0, 6, 18, 14);
  const synodicMonth = 29.530588853;
  const elapsedDays = (date.getTime() - referenceNewMoon) / 86_400_000;
  const age = ((elapsedDays % synodicMonth) + synodicMonth) % synodicMonth;
  const index = Math.floor((age + synodicMonth / 16) / (synodicMonth / 8)) % 8;
  return { ...PHASES[index], age: Number(age.toFixed(1)), progress: age / synodicMonth };
}

export function dailyStarReading(sign, value = new Date()) {
  const date = safeDate(value instanceof Date ? value : String(value)) || new Date();
  const identity = sign?.id || "open-sky";
  const seed = `${identity}:${dateKey(date)}`;
  const tone = pick(TONES, seed, 1);
  const relationship = pick(RELATIONSHIPS, seed, 2);
  const self = pick(SELF_CARE, seed, 3);
  const week = pick(WEEKLY, `${identity}:${date.getFullYear()}-w${Math.ceil(date.getDate() / 7)}-${date.getMonth()}`, 4);
  return {
    sign: sign || null,
    tone,
    relationship,
    self,
    tinyAction: {
      title: "Två tydliga meningar",
      body: "Öppna Anteckningar och skriv: ‘Det här vet jag just nu.’ Skriv sedan: ‘Det här får vänta till i morgon.’ Stanna efter mening två.",
      duration: "2 min"
    },
    week
  };
}

export { SIGNS };
