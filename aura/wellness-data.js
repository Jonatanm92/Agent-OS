export const MOODS = [
  { value: 1, icon: "◔", label: "Jag mår riktigt dåligt" },
  { value: 2, icon: "◡", label: "Jag mår inte särskilt bra" },
  { value: 3, icon: "—", label: "Det är blandat" },
  { value: 4, icon: "◠", label: "Jag mår ganska bra" },
  { value: 5, icon: "✦", label: "Jag mår bra" }
];

export const SYMPTOMS = [
  { id: "cramps", label: "Kramper" },
  { id: "tender", label: "Bröstspänning" },
  { id: "headache", label: "Huvudvärk" },
  { id: "bloating", label: "Uppsvälld" },
  { id: "low-energy", label: "Låg energi" },
  { id: "irritable", label: "Irritation" },
  { id: "anxious", label: "Oro" },
  { id: "low-mood", label: "Nedstämdhet" },
  { id: "sleep", label: "Sömnsvårigheter" },
  { id: "appetite", label: "Förändrad aptit" }
];

export const JOURNAL_PROMPTS = [
  "Vad behöver få vara lite enklare i dag?",
  "Vilken liten sak gav mig energi tillbaka?",
  "Vad skulle kroppen tacka mig för just nu?",
  "Vilken gräns skulle kännas som omtanke?",
  "Vad vill jag tacka mig själv för i dag?",
  "Om den här dagen fick vara ‘bra nog’ — hur skulle det se ut?",
  "Vad vill jag bjuda in lite mer av i veckan?",
  "Vilket ögonblick vill jag bära med mig till i morgon?"
];

export const SOURCES = [
  { label: "1177 — PMS och PMDS", url: "https://www.1177.se/sjukdomar--besvar/hormoner/pms-och-pmds/", note: "Symtom, egenvård och när vård kan hjälpa." },
  { label: "ACOG — Premenstrual Syndrome", url: "https://www.acog.org/womens-health/faqs/premenstrual-syndrome", note: "Regelbundna måltider, fiberrika kolhydrater, sömn, rörelse och kalciumrik mat vid PMS." },
  { label: "1177 — När en relation tar slut", url: "https://www.1177.se/liv--halsa/psykisk-halsa/att-ma-daligt-nar-en-relation-tar-slut/", note: "Stöd vid sorg, separation och när mer hjälp behövs." },
  { label: "1177 — Riklig mens", url: "https://www.1177.se/sjukdomar--besvar/konsorgan/mens-blodningar-och-flytningar/riklig-mens/", note: "Tecken att notera och vägar till vård." },
  { label: "1177 — Järnbrist", url: "https://www.1177.se/sjukdomar--besvar/hjarta-och-blodkarl/blodsjukdomar/blodbrist-pa-grund-av-for-lite-jarn/", note: "Järnrik mat, vanliga symtom och när ett blodprov kan ge svar." },
  { label: "1177 — Preventivmedel", url: "https://www.1177.se/liv--halsa/sexuell-halsa/skydd-mot-graviditet/preventivmedel--skydd-mot-graviditet/", note: "Metoder, biverkningar och stöd från barnmorska." },
  { label: "1177 — Uttorkning", url: "https://www.1177.se/sjukdomar--besvar/mage-och-tarm/magsjuka-och-krakningar/uttorkning/", note: "När vätskeersättning kan vara relevant." },
  { label: "1177 — Sömnsvårigheter", url: "https://www.1177.se/liv--halsa/stresshantering-och-somn/somnsvarigheter/", note: "Grundråd om sömn och återhämtning." },
  { label: "1177 — Avslappning genom andning", url: "https://www.1177.se/liv--halsa/stresshantering-och-somn/avslappning-genom-andning/", note: "En enkel andningsövning för att varva ner." },
  { label: "WHO — Doing What Matters in Times of Stress", url: "https://www.who.int/publications/i/item/9789240003927", note: "Praktiska övningar för att sänka stresspåslag, sortera tankar och välja ett påverkbart nästa steg." },
  { label: "Livsmedelsverket — Kosttillskott", url: "https://www.livsmedelsverket.se/livsmedel-och-innehall/kosttillskott/risker-med-kosttillskott/", note: "Så använder du tillskott klokt och undviker onödiga risker." },
  { label: "WHO — Physical activity", url: "https://www.who.int/news-room/fact-sheets/detail/physical-activity", note: "All rörelse räknas; anpassning efter förmåga." }
];

export const DEFAULT_HABITS = [
  { id: "outside", label: "Lite dagsljus", detail: "öppna dörren — eller bara fönstret", icon: "☼" },
  { id: "move", label: "Mjuk rörelse", detail: "sträck, skaka loss eller ta en sväng", icon: "↝" },
  { id: "unwind", label: "Lugn landning", detail: "ett litet nu-är-dagen-klar", icon: "☾" }
];
