// Deterministic keyword engine used when no AI key is configured. It is far
// less complete than the Claude pipeline, but it exercises exactly the same
// data shapes so the product, tests and demos all work offline.

const MONTHS = {
  januari: 1, februari: 2, mars: 3, april: 4, maj: 5, juni: 6,
  juli: 7, augusti: 8, september: 9, oktober: 10, november: 11, december: 12,
};

// Sentence boundary that ignores common Swedish abbreviations ("kl. 23.59").
const SENTENCE_SPLIT = /(?<=[.!?])(?<!\b(?:kl|t\.ex|bl\.a|resp|ca|nr|jfr|m\.m|s|st|p|tel)\.)\s+(?=[A-ZÅÄÖ0-9])/;
const STARTS_ITEM = /^(\d+(\.\d+)*\.?|[A-Z]{1,2}\d{1,3}|[-•*])\s/;

function* sentencesOf(document, page, lines) {
  // PDF text arrives line-wrapped; re-join lines into paragraphs first.
  const paragraphs = [];
  for (const line of lines) {
    const last = paragraphs.length - 1;
    const labelLine = /^[A-ZÅÄÖ][\p{L} ]{2,40}:\s/u.test(line);
    if (last >= 0 && !STARTS_ITEM.test(line) && !labelLine && !/[.:!?]$/.test(paragraphs[last]) && !/^[A-ZÅÄÖ][\p{L} ]{2,40}:\s/u.test(paragraphs[last])) {
      paragraphs[last] = `${paragraphs[last]} ${line}`;
    } else paragraphs.push(line);
  }
  for (const paragraph of paragraphs) {
    for (const sentence of paragraph.split(SENTENCE_SPLIT)) {
      const s = sentence.trim();
      if (s) yield { document, page, sentence: s };
    }
  }
}

function* walk(chunkText) {
  let document = "okänt dokument";
  let page = 1;
  let lines = [];
  for (const rawLine of chunkText.split("\n")) {
    const line = rawLine.trim();
    const doc = /^\[DOKUMENT: (.*)\]$/.exec(line);
    const marker = /^\[(?:SIDA|AVSNITT|DEL) (\d+)\]$/.exec(line);
    if (doc || marker) {
      yield* sentencesOf(document, page, lines);
      lines = [];
      if (doc) document = doc[1];
      if (marker) page = Number(marker[1]);
      continue;
    }
    if (line) lines.push(line);
  }
  yield* sentencesOf(document, page, lines);
}

const quote = (s) => (s.length > 200 ? `${s.slice(0, 197)}...` : s);

function requirementType(s) {
  if (/(utvärder|mervärde|poäng|viktning|prisavdrag|tilldelningsgrund)/i.test(s)) return "UTVARDERING";
  if (/\b(ska|skall|måste)\b/i.test(s) || /\bminimikrav\b/i.test(s)) return "SKA";
  if (/\bbör\b/i.test(s) || /\bönskvärt\b/i.test(s)) return "BOR";
  return null;
}

function category(s, type) {
  if (type === "UTVARDERING") return "UTVARDERING";
  if (/(uteslut|sanningsförsäkran|brottslig|konkurs|skatter och (sociala )?avgifter)/i.test(s)) return "UTESLUTNING";
  if (/(omsättning|kreditvärdighet|riskklass|kreditupplys|rating|referens|certifi|\bISO\b|erfarenhet|nyckelperson|\bCV\b|kapacitet)/i.test(s)) return "KVALIFICERING";
  if (/(vite|skadestånd|ansvar|försäkring|fakturer|betalning|uppsägning|hävning|prisjuster|index|underleverantör|personuppgift|GDPR|avtalet)/i.test(s)) return "AVTAL";
  if (/(anbudet ska lämnas|anbudet ska vara|giltig|svenska språket|prisbilaga|elektroniskt|e-avrop|tendsign|mercell|opic|undertecknad|signerad)/i.test(s)) return "ANBUDETS_FORM";
  return "TJANST";
}

function evidence(s) {
  const match = /(bifoga[sr]?|intyg|certifikat|referens(?:er|uppdrag)?|\bCV\b|kopia|redovisa[sr]?|lämna[sr]? in|bilaga \d+)/i.exec(s);
  if (!match) return "";
  const tail = s.slice(match.index, match.index + 120).replace(/[.;:]+$/, "");
  return tail.charAt(0).toUpperCase() + tail.slice(1);
}

function parseDates(s) {
  const found = [];
  for (const m of s.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g)) {
    found.push(`${m[1]}-${m[2]}-${m[3]}`);
  }
  for (const m of s.matchAll(/\b(\d{1,2}) (januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december) (20\d{2})\b/gi)) {
    const month = MONTHS[m[2].toLowerCase()];
    found.push(`${m[3]}-${String(month).padStart(2, "0")}-${m[1].padStart(2, "0")}`);
  }
  return found;
}

function dateKind(s) {
  if (/(sista anbudsdag|anbud(et|en)? ska vara (inkomna|inkommet|lämnade?)|sista dag för (att lämna )?anbud)/i.test(s)) return "SISTA_ANBUDSDAG";
  if (/frågor/i.test(s) && /(senast|sista)/i.test(s)) return "SISTA_FRAGEDAG";
  if (/svar (på frågor|publiceras)/i.test(s)) return "SVAR_PA_FRAGOR";
  if (/(visning|platsbesök)/i.test(s)) return "VISNING";
  if (/giltig/i.test(s)) return "ANBUDETS_GILTIGHET";
  if (/tilldelning/i.test(s)) return "TILLDELNING";
  if (/(avtalsstart|avtalsperiod|avtalet (börjar|gäller från|löper från))/i.test(s)) return "AVTALSSTART";
  if (/(avtalsslut|avtalet (upphör|löper ut))/i.test(s)) return "AVTALSSLUT";
  return "OVRIGT";
}

const DATE_LABELS = {
  SISTA_ANBUDSDAG: "Sista anbudsdag",
  SISTA_FRAGEDAG: "Sista dag för frågor",
  SVAR_PA_FRAGOR: "Svar på frågor publiceras",
  VISNING: "Visning/platsbesök",
  ANBUDETS_GILTIGHET: "Anbudets giltighet",
  TILLDELNING: "Planerad tilldelning",
  AVTALSSTART: "Avtalsstart",
  AVTALSSLUT: "Avtalsslut",
  OVRIGT: "Datum",
};

function facts(s, document, page) {
  const out = [];
  const add = (key, value) => value && out.push({ key, value: value.trim().slice(0, 200), document, page });
  const buyer = /upphandlande (?:myndighet|organisation|enhet)(?: är)?[:\s]+([^.;]+)/i.exec(s);
  if (buyer) add("UPPHANDLANDE_ORGANISATION", buyer[1]);
  const ref = /(?:diarienummer|dnr|referensnummer|upphandlingsnummer)[:.\s]+((?:[A-ZÅÄÖ]{1,4}\s)?[A-Za-z0-9./:-]*\d[A-Za-z0-9./:-]*)/i.exec(s);
  if (ref) add("DIARIENUMMER", ref[1]);
  const procedure = /(förenklat förfarande|öppet förfarande|selektivt förfarande|förhandlat förfarande|urvalsförfarande|direktupphandling)/i.exec(s);
  if (procedure) add("FORFARANDE", procedure[1].charAt(0).toUpperCase() + procedure[1].slice(1).toLowerCase());
  const model = /(lägsta pris|bästa förhållandet mellan pris och kvalitet|kostnad)/i.exec(s);
  if (model && /utvärder|tilldel/i.test(s)) add("UTVARDERINGSMODELL", model[1].charAt(0).toUpperCase() + model[1].slice(1));
  if (/avtalsperioden är|avtalstiden är/i.test(s)) add("AVTALSPERIOD", quote(s));
  if (/förläng/i.test(s)) add("FORLANGNINGSOPTION", quote(s));
  if (/(e-avrop|tendsign|mercell|visma opic|kommers annons|upphandlingsverktyg)/i.test(s) && /anbud/i.test(s)) add("ANBUDETS_INLAMNING", quote(s));
  const value = /(uppskattat|beräknat) (?:värde|avtalsvärde|ordervärde)[^0-9]*([0-9][0-9 .]*(?:kr|kronor|SEK|miljoner|mnkr|tkr))/i.exec(s);
  if (value) add("UPPSKATTAT_VARDE", value[2]);
  return out;
}

function risk(s, document, page) {
  const at = (title, severity, description) => ({ title, severity, description, document, page, quote: quote(s) });
  if (/obegränsat/i.test(s) && /(ansvar|skadestånd)/i.test(s)) return at("Obegränsat ansvar", "HOG", "Leverantörens ansvar verkar inte vara begränsat till ett maxbelopp.");
  if (/\bvite\b|\bviten\b/i.test(s)) {
    const severe = /(\d{2,}\s?%|per (dag|påbörjad))/i.test(s);
    return at("Vite", severe ? "HOG" : "MEDEL", "Avtalet innehåller vite vid förseningar eller brister. Räkna in risken i priset.");
  }
  if (/(ingen volymgaranti|inga garanterade volymer|volymerna är uppskattade|garanterar inte)/i.test(s)) return at("Ingen volymgaranti", "MEDEL", "Beställaren garanterar inga volymer – intäkten är osäker.");
  if (/försäkring/i.test(s) && /\d/.test(s)) return at("Försäkringskrav", "LAG", "Kontrollera att er ansvarsförsäkring täcker angivet belopp.");
  if (/ensidig/i.test(s)) return at("Ensidig ändringsrätt", "MEDEL", "Beställaren kan ensidigt ändra villkor eller omfattning.");
  return null;
}

export function demoExtract(chunkText) {
  const out = { requirements: [], dates: [], facts: [], risks: [], ambiguities: [], changes: [] };
  for (const { document, page, sentence } of walk(chunkText)) {
    if (sentence.length < 20) continue;
    const s = sentence.length > 600 ? `${sentence.slice(0, 597)}...` : sentence;
    const type = requirementType(s);
    const previous = out.requirements[out.requirements.length - 1];
    if (!type && previous && previous.page === page && !previous.evidence && /^(bifoga|kopia|referenserna|cv)/i.test(s)) {
      previous.evidence = s.replace(/[.;:]+$/, "");
    }
    if (type) {
      const ref = /^(\d+(?:\.\d+)+|[A-Z]{1,2}\d{1,3})\s/.exec(s);
      out.requirements.push({
        ref: ref ? ref[1] : "",
        category: category(s, type),
        type,
        text: s.length > 250 ? `${s.slice(0, 247)}...` : s,
        evidence: evidence(s),
        document,
        page,
        quote: quote(s),
      });
    }
    for (const date of parseDates(s)) {
      const kind = dateKind(s);
      const time = /\bkl(?:ockan)?\.?\s*([01]?\d|2[0-3])[.:]([0-5]\d)\b/i.exec(s);
      out.dates.push({
        kind,
        label: DATE_LABELS[kind],
        date,
        time: time ? `${time[1].padStart(2, "0")}:${time[2]}` : "",
        document,
        page,
        quote: quote(s),
      });
    }
    if (/anbudet ska vara giltigt/i.test(s) && !parseDates(s).length) {
      out.dates.push({ kind: "ANBUDETS_GILTIGHET", label: quote(s), date: "", time: "", document, page, quote: quote(s) });
    }
    out.facts.push(...facts(s, document, page));
    const r = risk(s, document, page);
    if (r) out.risks.push(r);
    if (/(vid behov|i förekommande fall|enligt överenskommelse|kan komma att)/i.test(s)) {
      out.ambiguities.push({
        issue: `Öppen formulering: "${quote(s)}"`,
        suggested_question: "Kan ni förtydliga omfattning och förutsättningar för detta, t.ex. förväntade volymer eller hur ofta det blir aktuellt?",
        document,
        page,
      });
    }
  }
  return out;
}

const PROFILE_TOKENS = /(ISO\s?\d{4,5}|miljöcertifi\w*|kvalitetscertifi\w*|F-skatt|kollektivavtal|ansvarsförsäkring)/gi;

export function demoSynthesize({ digest, profile, daysLeft }) {
  const reqs = digest.requirements ?? [];
  const ska = reqs.filter((r) => r.type === "SKA");
  const kval = ska.filter((r) => r.category === "KVALIFICERING");
  const highRisks = (digest.risks ?? []).filter((r) => r.severity === "HOG");
  const hasProfile = profile && Object.values(profile).some((v) => String(v ?? "").trim());
  const profileText = hasProfile ? Object.values(profile).join(" ").toLowerCase() : "";

  const assessments = [];
  if (hasProfile) {
    for (const r of ska) {
      const tokens = [...`${r.text} ${r.evidence}`.matchAll(PROFILE_TOKENS)].map((m) => m[0].toLowerCase());
      if (tokens.length === 0) {
        assessments.push({ id: r.id, status: "OKLART", comment: "Profilen säger inget om detta krav – kontrollera manuellt." });
      } else if (tokens.every((t) => profileText.includes(t.replace(/\s+/g, " ")))) {
        assessments.push({ id: r.id, status: "UPPFYLLT", comment: "Profilen anger det som efterfrågas." });
      } else {
        assessments.push({ id: r.id, status: "SAKNAS", comment: `Profilen nämner inte: ${[...new Set(tokens)].join(", ")}.` });
      }
    }
  }
  const missing = assessments.filter((a) => a.status === "SAKNAS").length;

  let score = 62;
  const reasons = [];
  if (kval.length > 8) {
    score -= 8;
    reasons.push({ factor: "Många kvalificeringskrav", effect: "MINUS", explanation: `${kval.length} kvalificeringskrav ska styrkas.` });
  } else {
    reasons.push({ factor: "Hanterbara kvalificeringskrav", effect: "PLUS", explanation: `${kval.length} kvalificeringskrav hittades.` });
  }
  if (highRisks.length) {
    score -= Math.min(24, highRisks.length * 8);
    reasons.push({ factor: "Avtalsrisker", effect: "MINUS", explanation: `${highRisks.length} villkor med hög risk (t.ex. ${highRisks[0].title.toLowerCase()}).` });
  }
  if (daysLeft !== null && daysLeft < 7) {
    score -= 15;
    reasons.push({ factor: "Kort tid", effect: "MINUS", explanation: `Endast ${daysLeft} dagar kvar till sista anbudsdag.` });
  } else if (daysLeft !== null) {
    reasons.push({ factor: "Tidsmarginal", effect: daysLeft >= 14 ? "PLUS" : "NEUTRAL", explanation: `${daysLeft} dagar kvar till sista anbudsdag.` });
  }
  if (hasProfile) {
    score -= missing * 10;
    reasons.push({
      factor: "Matchning mot företagsprofil",
      effect: missing ? "MINUS" : "PLUS",
      explanation: missing ? `${missing} skall-krav verkar saknas enligt profilen.` : "Inga uppenbart saknade skall-krav enligt profilen.",
    });
  }
  score = Math.max(0, Math.min(100, score));
  const recommendation = !hasProfile ? "MER_INFO" : score >= 70 ? "GO" : score >= 50 ? "GO_MED_FORBEHALL" : "AVSTA";

  const factLabel = {
    UPPHANDLANDE_ORGANISATION: "Upphandlande organisation",
    DIARIENUMMER: "Diarienummer",
    FORFARANDE: "Förfarande",
    AVTALSPERIOD: "Avtalsperiod",
    FORLANGNINGSOPTION: "Förlängning",
    UTVARDERINGSMODELL: "Utvärderingsmodell",
    ANBUDETS_INLAMNING: "Inlämning",
    UPPSKATTAT_VARDE: "Uppskattat värde",
  };
  const seenFacts = new Set();
  const key_facts = (digest.facts ?? [])
    .filter((f) => factLabel[f.key] && !seenFacts.has(f.key) && seenFacts.add(f.key))
    .map((f) => ({ label: factLabel[f.key], value: f.value }));
  const deadline = (digest.dates ?? []).find((d) => d.kind === "SISTA_ANBUDSDAG" && d.date);
  if (deadline) key_facts.push({ label: "Sista anbudsdag", value: `${deadline.date}${deadline.time ? ` kl. ${deadline.time}` : ""}` });

  return {
    summary: `Demoläge (utan AI): ${reqs.length} krav hittades med nyckelordsanalys, varav ${ska.length} skall-krav och ${reqs.filter((r) => r.type === "UTVARDERING").length} utvärderingskriterier. ${highRisks.length ? `${highRisks.length} avtalsvillkor bedöms som högrisk.` : "Inga högriskvillkor identifierades."} Aktivera AI-analys för en fullständig, källspårad bedömning.`,
    recommendation,
    score,
    score_reasons: reasons,
    key_facts,
    assessments,
    missing_evidence: reqs
      .filter((r) => r.evidence)
      .slice(0, 40)
      .map((r) => ({ item: r.evidence, why: r.text, requirement_ids: [r.id] })),
    questions: (digest.ambiguities ?? []).slice(0, 10).map((a) => ({ question: a.suggested_question, reason: a.issue, requirement_ids: [] })),
    bid_outline: [
      { section: "1. Anbudsformulär och sanningsförsäkran", contents: "Ifyllda uppgifter om anbudsgivaren, firmatecknarens underskrift och ESPD/sanningsförsäkran." },
      { section: "2. Kvalificering", contents: "Bevis för ekonomisk ställning, referenser, certifikat och nyckelpersoner enligt kraven." },
      { section: "3. Kravuppfyllnad", contents: "Bekräftelse och beskrivning per skall-krav i den ordning dokumentet anger." },
      { section: "4. Kvalitet och mervärden", contents: "Svar på utvärderingskriterierna med konkreta exempel." },
      { section: "5. Pris", contents: "Ifylld prisbilaga enligt anvisningar." },
      { section: "6. Bilagor", contents: "Alla efterfrågade bilagor, namngivna enligt instruktionerna." },
    ],
    final_checklist: [
      "Alla skall-krav är bekräftade och besvarade",
      "Samtliga efterfrågade bilagor är bifogade och korrekt namngivna",
      "Prisbilagan är komplett ifylld utan egna reservationer",
      "Anbudet är undertecknat av behörig firmatecknare",
      "Anbudet lämnas via angiven plattform före sista anbudsdag",
      "Anbudets giltighetstid stämmer med kravet",
      "Inga villkor eller reservationer som kan leda till förkastande",
      "Sekretessbegäran är motiverad om sådan lämnas",
    ],
    next_steps: [
      "Gå igenom skall-kraven och markera vad ni saknar (idag)",
      "Ställ frågor till myndigheten före sista frågedag",
      "Beställ intyg, certifikat och referenser i god tid (minst en vecka före sista anbudsdag)",
      "Räkna på priset och riskerna i avtalsvillkoren",
      "Slutkontroll och inlämning senast dagen före sista anbudsdag",
    ],
  };
}
