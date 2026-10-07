// Showcase report for the landing page, built from a fictional tender. Dates
// are relative to today so the example never shows a passed deadline.
import { buildReportView, finalizeSynthesis, mergeExtractions, todayInSweden, daysBetween } from "./report.mjs";

function shift(today, days) {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const UD = "Upphandlingsdokument – Lokalvård 2027–2029.pdf";
const KS = "Bilaga 1 Kravspecifikation lokalvård.pdf";
const AV = "Bilaga 4 Avtalsvillkor.pdf";

export function buildExampleView(today = todayInSweden()) {
  const D = {
    visning: shift(today, 14),
    fragor: shift(today, 22),
    svar: shift(today, 27),
    anbud: shift(today, 36),
    tilldelning: shift(today, 57),
    start: shift(today, 117),
    giltig: shift(today, 236),
  };
  const r = (ref, type, category, text, evidence, document, page, quote) => ({ ref, type, category, text, evidence, document, page, quote });

  const part = {
    requirements: [
      r("1.4", "SKA", "ANBUDETS_FORM", "Anbud ska lämnas elektroniskt via e-Avrop. Anbud som lämnas på annat sätt beaktas inte.", "", UD, 2, "Anbud ska lämnas elektroniskt via upphandlingsverktyget e-Avrop. Anbud som lämnas på annat sätt beaktas inte."),
      r("1.5", "SKA", "ANBUDETS_FORM", `Anbudet ska vara giltigt till och med ${D.giltig}.`, "", UD, 2, `Anbudet ska vara giltigt till och med ${D.giltig}.`),
      r("2.1", "SKA", "UTESLUTNING", "Leverantören ska vara registrerad i aktiebolags-, handels- eller föreningsregistret och ha fullgjort sina skyldigheter avseende skatter och sociala avgifter.", "Bekräftas i ESPD/sanningsförsäkran – kommunen kontrollerar hos Skatteverket", UD, 3, "Leverantören ska vara registrerad i aktiebolags-, handels- eller föreningsregistret och ha fullgjort sina skyldigheter avseende skatter och sociala avgifter."),
      r("2.2", "SKA", "KVALIFICERING", "Årsomsättning om minst 6 000 000 kr för det senast avslutade räkenskapsåret.", "Ingen bilaga – kontrolleras via kreditupplysning. Säkerställ att senaste årsredovisning är registrerad hos Bolagsverket.", UD, 3, "Leverantören ska ha en årsomsättning som uppgår till minst 6 000 000 kr för det senast avslutade räkenskapsåret."),
      r("2.3", "SKA", "KVALIFICERING", "Riskklass lägst 3 hos UC eller motsvarande. Vid lägre riskklass krävs förklaring samt bank- eller moderbolagsgaranti.", "Vid riskklass under 3: skriftlig förklaring + bankgaranti eller moderbolagsgaranti", UD, 3, "Leverantören ska ha en riskklass motsvarande lägst 3 hos UC eller motsvarande kreditvärderingsföretag."),
      r("2.4", "SKA", "KVALIFICERING", "Certifierat kvalitetsledningssystem enligt ISO 9001 eller likvärdigt.", "Kopia av giltigt ISO 9001-certifikat", UD, 3, "Leverantören ska ha ett certifierat kvalitetsledningssystem enligt ISO 9001 eller likvärdigt. Bifoga kopia av giltigt certifikat."),
      r("2.5", "SKA", "KVALIFICERING", "Certifierat miljöledningssystem enligt ISO 14001 eller likvärdigt.", "Kopia av giltigt ISO 14001-certifikat", UD, 3, "Leverantören ska ha ett certifierat miljöledningssystem enligt ISO 14001 eller likvärdigt. Bifoga kopia av giltigt certifikat."),
      r("2.6", "SKA", "KVALIFICERING", "Minst två referensuppdrag avseende lokalvård i skol- eller förskolemiljö om minst 10 000 m² vardera under de senaste tre åren.", "Bilaga 3 Referensuppdrag ifylld med två kvalificerande uppdrag och kontaktpersoner", UD, 4, "Leverantören ska ha erfarenhet av minst två uppdrag avseende lokalvård i skol- eller förskolemiljö med en omfattning om minst 10 000 kvadratmeter vardera"),
      r("2.7", "SKA", "KVALIFICERING", "Avtalsansvarig med minst tre års erfarenhet av att leda lokalvårdsuppdrag ska utses.", "CV för avtalsansvarig", UD, 4, "Leverantören ska utse en avtalsansvarig med minst tre års erfarenhet av att leda lokalvårdsuppdrag. CV för avtalsansvarig ska bifogas."),
      r("5.1", "UTVARDERING", "UTVARDERING", "Tilldelning sker till anbudet med bästa förhållandet mellan pris och kvalitet.", "", UD, 5, "Tilldelning sker till det anbud som har det bästa förhållandet mellan pris och kvalitet."),
      r("5.2", "UTVARDERING", "UTVARDERING", "Pris viktas till 60 % och kvalitet till 40 %.", "", UD, 5, "Pris viktas till 60 procent och kvalitet till 40 procent."),
      r("5.3", "UTVARDERING", "UTVARDERING", "Kvalitet bedöms utifrån en genomförandebeskrivning (max två A4-sidor): inskolning av personal, kvalitetsuppföljning och kommunikation med verksamheterna.", "Genomförandebeskrivning, max 2 A4-sidor", UD, 5, "Kvalitet utvärderas utifrån en beskrivning av leverantörens genomförande av uppdraget, max två A4-sidor"),
      r("5.4", "UTVARDERING", "UTVARDERING", "Mervärde: fossilfria fordon i uppdraget ger ett prisavdrag om 3 % i utvärderingen.", "Förteckning över fordon som används i uppdraget och drivmedel", UD, 5, "Mervärde ges om leverantören använder fossilfria fordon i uppdraget, vilket ger ett prisavdrag om 3 procent i utvärderingen."),
      r("6.1", "SKA", "ANBUDETS_FORM", "Anbudet ska vara skrivet på svenska.", "", UD, 6, "Anbudet ska vara skrivet på svenska."),
      r("6.2", "SKA", "ANBUDETS_FORM", "Prisbilaga 2 ska fyllas i fullständigt – ofullständiga prisuppgifter medför att anbudet förkastas.", "Ifylld Prisbilaga 2 (alla objekt och á-priser)", UD, 6, "Prisbilaga 2 ska fyllas i fullständigt. Ofullständiga prisuppgifter medför att anbudet förkastas."),
      r("6.3", "SKA", "ANBUDETS_FORM", "Anbudet ska undertecknas av behörig firmatecknare.", "Underskrift av firmatecknare (eller fullmakt)", UD, 6, "Anbudet ska undertecknas av behörig firmatecknare."),
      r("3.1", "SKA", "TJANST", "Lokalvård enligt SS 627801: kvalitetsnivå 3 i förskolornas lekrum och nivå 2 i övriga utrymmen.", "", KS, 1, "Lokalvården ska utföras enligt Svensk Standard SS 627801 för kvalitetsnivå 3 i förskolornas lekrum och nivå 2 i övriga utrymmen."),
      r("3.2", "SKA", "TJANST", "Daglig städning ska utföras vardagar kl. 16.00–22.00 så att verksamheten inte störs.", "", KS, 1, "Daglig städning ska utföras mellan kl. 16.00 och 22.00 på vardagar, så att verksamheten inte störs."),
      r("3.3", "SKA", "TJANST", "All personal ska inom sex månader från avtalsstart ha grundutbildning motsvarande Städbranschens Yrkesbevis eller likvärdigt.", "Utbildningsplan i anbudet; intyg kan begäras under avtalstiden", KS, 1, "All personal som utför uppdraget ska ha genomgått grundutbildning i lokalvård motsvarande Städbranschens Yrkesbevis eller likvärdigt inom sex månader från avtalsstart."),
      r("3.4", "SKA", "TJANST", "All personal ska kunna kommunicera på svenska i tal och skrift med kommunens personal.", "", KS, 2, "All personal ska kunna kommunicera på svenska i tal och skrift med kommunens personal."),
      r("3.5", "SKA", "TJANST", "Minst 90 % av volymen kemtekniska produkter ska vara miljömärkta (Svanen, EU Ecolabel eller likvärdigt).", "Produktförteckning med miljömärkning (kan begäras av kommunen)", KS, 2, "Leverantören ska använda miljömärkta kemtekniska produkter (Svanen, EU Ecolabel eller likvärdigt) i minst 90 procent av volymen."),
      r("3.6", "SKA", "TJANST", "Egenkontroll varje månad med rapport till kommunen senast den 10:e i efterföljande månad.", "", KS, 2, "Leverantören ska utföra egenkontroll varje månad och rapportera resultatet till kommunen senast den 10:e i efterföljande månad."),
      r("3.7", "BOR", "TJANST", "Ett digitalt felanmälningssystem som verksamheterna kan använda dygnet runt bör erbjudas.", "", KS, 2, "Leverantören bör erbjuda ett digitalt felanmälningssystem som verksamheterna kan använda dygnet runt."),
      r("3.8", "SKA", "TJANST", "Extra städning vid behov (t.ex. vattenskada eller magsjuka) med inställelsetid om högst fyra timmar.", "", KS, 2, "Vid behov ska leverantören utföra extra städning, exempelvis vid vattenskador eller utbrott av magsjuka, med en inställelsetid om högst fyra timmar."),
      r("4.1", "SKA", "AVTAL", "Ansvarsförsäkring om minst 10 000 000 kr per skadetillfälle under hela avtalstiden.", "Försäkringsbevis (senast vid avtalsstart)", AV, 1, "Leverantören ska ha en ansvarsförsäkring som omfattar minst 10 000 000 kr per skadetillfälle under hela avtalstiden."),
      r("4.2", "INFO", "AVTAL", "Vite om 5 000 kr per objekt och påbörjad dag om städning inte utförs enligt avtal.", "", AV, 1, "Om leverantören inte utför städning enligt avtal utgår vite med 5 000 kr per objekt och påbörjad dag."),
      r("4.3", "INFO", "AVTAL", "Leverantörens skadeståndsansvar är obegränsat vid grov vårdslöshet.", "", AV, 1, "Leverantörens skadeståndsansvar är obegränsat vid grov vårdslöshet."),
      r("4.4", "SKA", "AVTAL", "Fakturor ska skickas elektroniskt enligt Peppol BIS Billing 3. Betalning 30 dagar efter godkänd faktura.", "", AV, 1, "Betalning sker 30 dagar efter godkänd faktura. Fakturor ska skickas elektroniskt enligt Peppol BIS Billing 3."),
      r("4.5", "INFO", "AVTAL", "Fasta priser de första 12 månaderna, därefter årlig justering med högst 80 % av förändringen i AKI (privat sektor).", "", AV, 2, "Därefter får priserna justeras en gång per år med högst 80 procent av förändringen i Arbetskostnadsindex (AKI) för privat sektor."),
      r("4.6", "SKA", "AVTAL", "Lön, semester och arbetstid ska minst motsvara gällande kollektivavtal för serviceentreprenad.", "Redovisning av villkor kan begäras under avtalstiden", AV, 2, "Leverantören ska tillämpa lön, semester och arbetstid som lägst motsvarar nivåerna i gällande kollektivavtal för serviceentreprenad."),
      r("4.7", "SKA", "AVTAL", "Underleverantörer får anlitas endast efter skriftligt godkännande från kommunen.", "", AV, 2, "Leverantören får anlita underleverantörer endast efter skriftligt godkännande från kommunen."),
      r("4.8", "SKA", "AVTAL", "Personuppgiftsbiträdesavtal ska tecknas om personuppgifter behandlas inom uppdraget.", "", AV, 2, "Leverantören ska teckna ett personuppgiftsbiträdesavtal med kommunen om personuppgifter behandlas inom uppdraget."),
    ],
    dates: [
      { kind: "VISNING", label: "Frivillig visning av ett urval av objekten", date: D.visning, time: "09:00", document: UD, page: 2, quote: `Visning av ett urval av objekten genomförs ${D.visning} kl. 09.00. Visningen är frivillig.` },
      { kind: "SISTA_FRAGEDAG", label: "Sista dag för frågor via e-Avrop", date: D.fragor, time: "", document: UD, page: 2, quote: `Frågor om upphandlingen ska ställas via e-Avrop senast ${D.fragor}.` },
      { kind: "SVAR_PA_FRAGOR", label: "Svar på frågor publiceras senast", date: D.svar, time: "", document: UD, page: 2, quote: `Svar publiceras senast ${D.svar}.` },
      { kind: "SISTA_ANBUDSDAG", label: "Sista anbudsdag", date: D.anbud, time: "23:59", document: UD, page: 2, quote: `Sista anbudsdag är ${D.anbud} kl. 23.59.` },
      { kind: "TILLDELNING", label: "Planerad tilldelning", date: D.tilldelning, time: "", document: UD, page: 2, quote: `Planerad tilldelning sker ${D.tilldelning}.` },
      { kind: "AVTALSSTART", label: "Avtalsstart (2 år + 1 + 1 års förlängning)", date: D.start, time: "", document: UD, page: 1, quote: `Avtalsperioden är två år från och med ${D.start}.` },
      { kind: "ANBUDETS_GILTIGHET", label: "Anbudet ska vara giltigt till och med", date: D.giltig, time: "", document: UD, page: 2, quote: `Anbudet ska vara giltigt till och med ${D.giltig}.` },
    ],
    facts: [
      { key: "UPPHANDLANDE_ORGANISATION", value: "Exempelstads kommun", document: UD, page: 1 },
      { key: "UPPHANDLINGENS_NAMN", value: "Lokalvård för förskolor och skolor 2027–2029", document: UD, page: 1 },
      { key: "DIARIENUMMER", value: "KS 2026/1187", document: UD, page: 1 },
      { key: "FORFARANDE", value: "Förenklat förfarande (LOU)", document: UD, page: 1 },
    ],
    risks: [
      { title: "Vite per objekt och påbörjad dag", severity: "HOG", description: "5 000 kr per objekt och påbörjad dag. Med 20 objekt kan en störning (sjukdom, personalbrist) snabbt kosta mer än marginalen för en hel månad. Säkerställ reservbemanning.", document: AV, page: 1, quote: "Om leverantören inte utför städning enligt avtal utgår vite med 5 000 kr per objekt och påbörjad dag." },
      { title: "Obegränsat skadeståndsansvar vid grov vårdslöshet", severity: "HOG", description: "Ansvaret saknar tak vid grov vårdslöshet. Kontrollera med ert försäkringsbolag vad som täcks.", document: AV, page: 1, quote: "Leverantörens skadeståndsansvar är obegränsat vid grov vårdslöshet." },
      { title: "Prisjustering under löneutvecklingen", severity: "MEDEL", description: "Priserna får bara räknas upp med 80 % av AKI. Personalkostnaden är huvuddelen av kostnaden i lokalvård – marginalen minskar varje år under en avtalstid på upp till fyra år. Räkna in det i startpriset.", document: AV, page: 2, quote: "Därefter får priserna justeras en gång per år med högst 80 procent av förändringen i Arbetskostnadsindex (AKI) för privat sektor." },
      { title: "Ingen volymgaranti", severity: "MEDEL", description: "Det uppskattade värdet är 24 mkr inklusive förlängningar, men kommunen garanterar inga volymer.", document: UD, page: 1, quote: "Kommunen garanterar inte några volymer. Volymerna är uppskattade och kan förändras under avtalstiden." },
      { title: "Inställelsetid fyra timmar för extra städning", severity: "MEDEL", description: "Kräver beredskap även kvällstid. Ersättningen för extra städning framgår inte av utdraget.", document: KS, page: 2, quote: "med en inställelsetid om högst fyra timmar." },
      { title: "Krav på ansvarsförsäkring 10 mkr", severity: "LAG", description: "Många mindre städföretag har 5 mkr. En höjning är ofta enkel men bör ordnas före avtalsstart.", document: AV, page: 1, quote: "minst 10 000 000 kr per skadetillfälle under hela avtalstiden." },
    ],
    ambiguities: [
      { issue: "Det framgår inte hur extra städning vid behov (punkt 3.8) ersätts.", suggested_question: "Hur ersätts extra städning enligt punkt 3.8 – enligt timpris i Prisbilaga 2 eller genom separat avrop?", document: KS, page: 2 },
      { issue: "Det är oklart vilka rum som räknas som lekrum med kvalitetsnivå 3.", suggested_question: "Kan ni bifoga en lokalförteckning som anger kvalitetsnivå per rum och objekt?", document: KS, page: 1 },
      { issue: "”Motsvarande Städbranschens Yrkesbevis eller likvärdigt” är inte definierat.", suggested_question: "Vilka utbildningar godtas som likvärdiga med Städbranschens Yrkesbevis, och hur ska det styrkas?", document: KS, page: 1 },
    ],
    changes: [],
  };

  const extraction = mergeExtractions([part], [UD, KS, AV]);
  const id = (ref) => extraction.requirements.find((q) => q.ref === ref)?.id ?? "";
  const deadline = D.anbud;
  const daysLeft = daysBetween(today, deadline);

  const raw = {
    summary: "Exempelstads kommun upphandlar lokalvård för 14 förskolor och 6 grundskolor (ca 38 000 m²) under två år med option på 1 + 1 år, uppskattat till 24 mkr totalt. Ert företag uppfyller omsättnings- och certifieringskraven, men referenskravet och försäkringsbeloppet behöver åtgärdas. Utvärderingen 60/40 pris/kvalitet ger utrymme att vinna på en stark genomförandebeskrivning. Viten och den begränsade prisjusteringen måste räknas in i priset.",
    recommendation: "GO",
    score: 66,
    score_reasons: [
      { factor: "Ekonomi och certifikat", effect: "PLUS", explanation: "Omsättningen 11,2 mkr överstiger kravet på 6 mkr och både ISO 9001 och ISO 14001 finns." },
      { factor: "Referenskrav", effect: "MINUS", explanation: "Endast ett av era två skoluppdrag når 10 000 m². Ett andra kvalificerande uppdrag behövs – annars förkastas anbudet." },
      { factor: "Avtalsrisker", effect: "MINUS", explanation: "Vite per objekt och dag samt obegränsat ansvar vid grov vårdslöshet." },
      { factor: "Utvärderingsmodell", effect: "PLUS", explanation: "40 % kvalitet – en tydlig beskrivning av inskolning och kvalitetsuppföljning kan slå billigare konkurrenter." },
      { factor: "Prisjustering", effect: "MINUS", explanation: "Uppräkning med max 80 % av AKI urholkar marginalen över fyra år." },
      { factor: "Tidsmarginal", effect: "PLUS", explanation: `${daysLeft} dagar kvar till sista anbudsdag räcker för att ta fram underlag och ställa frågor.` },
      { factor: "Geografi och kapacitet", effect: "PLUS", explanation: "Ni finns i Exempelstad och har arbetsledare som kan avsättas." },
    ],
    key_facts: [
      { label: "Upphandlande organisation", value: "Exempelstads kommun" },
      { label: "Diarienummer", value: "KS 2026/1187" },
      { label: "Förfarande", value: "Förenklat förfarande (LOU)" },
      { label: "Omfattning", value: "14 förskolor och 6 grundskolor, ca 38 000 m²" },
      { label: "Avtalsperiod", value: "2 år + 1 + 1 år" },
      { label: "Uppskattat värde", value: "24 mkr inkl. förlängningar (ingen volymgaranti)" },
      { label: "Utvärdering", value: "Bästa förhållande pris/kvalitet – pris 60 %, kvalitet 40 %" },
      { label: "Inlämning", value: "Elektroniskt via e-Avrop" },
    ],
    assessments: [
      [id("1.4"), "UPPFYLLT", "Ni kan lämna anbud via e-Avrop – skapa konto i god tid."],
      [id("1.5"), "UPPFYLLT", "Bekräftas genom att anbudet lämnas."],
      [id("2.1"), "UPPFYLLT", "Registrerat aktiebolag med F-skatt enligt profilen."],
      [id("2.2"), "UPPFYLLT", "11,2 mkr ≥ 6 mkr."],
      [id("2.3"), "OKLART", "Profilen anger inte riskklass – ta en kreditupplysning på er själva nu."],
      [id("2.4"), "UPPFYLLT", "ISO 9001 finns enligt profilen."],
      [id("2.5"), "UPPFYLLT", "ISO 14001 finns enligt profilen."],
      [id("2.6"), "SAKNAS", "Grannby skola 12 000 m² kvalificerar, men Norrby förskolor 8 000 m² når inte 10 000 m². Ett andra uppdrag ≥ 10 000 m² behövs."],
      [id("2.7"), "TROLIGEN", "Ni har arbetsledare – kontrollera att någon har minst tre års erfarenhet som avtalsansvarig och ta fram CV."],
      [id("6.1"), "UPPFYLLT", "Bekräftas genom anbudet."],
      [id("6.2"), "TROLIGEN", "Kräver noggrann ifyllnad av alla objekt."],
      [id("6.3"), "UPPFYLLT", "Firmatecknare finns."],
      [id("3.1"), "TROLIGEN", "Ni utför skolstädning idag – säkerställ arbetssätt för nivå 3 i lekrum."],
      [id("3.2"), "UPPFYLLT", "Kvällsstädning ingår i er nuvarande verksamhet."],
      [id("3.3"), "TROLIGEN", "Planera utbildning för nyanställd personal inom sex månader."],
      [id("3.4"), "OKLART", "Profilen säger inget om språkkrav – kontrollera för all personal i uppdraget."],
      [id("3.5"), "UPPFYLLT", "Miljömärkta produkter ingår i ISO 14001-arbetet."],
      [id("3.6"), "TROLIGEN", "Ni har kvalitetssystem – rapportmall behöver anpassas."],
      [id("3.8"), "OKLART", "Kräver beredskap med fyra timmars inställelsetid."],
      [id("4.1"), "SAKNAS", "Er ansvarsförsäkring är 5 mkr – höj till minst 10 mkr före avtalsstart."],
      [id("4.4"), "TROLIGEN", "Kontrollera att ert ekonomisystem kan skicka Peppol-faktura."],
      [id("4.6"), "UPPFYLLT", "Kollektivavtal finns enligt profilen."],
      [id("4.7"), "UPPFYLLT", "Inga underleverantörer planeras."],
      [id("4.8"), "UPPFYLLT", "Avtal tecknas vid behov."],
    ].map(([aid, status, comment]) => ({ id: aid, status, comment })),
    missing_evidence: [
      { item: "Ett andra referensuppdrag ≥ 10 000 m² i skol-/förskolemiljö", why: "Krav 2.6 kräver två kvalificerande uppdrag. Undersök om två närliggande avtal kan redovisas som ett uppdrag eller om ett äldre uppdrag ryms inom tre år.", requirement_ids: [id("2.6")] },
      { item: "Bilaga 3 Referensuppdrag med kontaktpersoner", why: "Kontaktpersonerna kan bli kontaktade – förvarna dem.", requirement_ids: [id("2.6")] },
      { item: "Kopia av ISO 9001- och ISO 14001-certifikat", why: "Kontrollera att certifikaten är giltiga efter sista anbudsdag.", requirement_ids: [id("2.4"), id("2.5")] },
      { item: "CV för avtalsansvarig", why: "Ska visa minst tre års erfarenhet av att leda lokalvårdsuppdrag.", requirement_ids: [id("2.7")] },
      { item: "Kreditupplysning (UC) på det egna bolaget", why: "Kontrollera riskklass – vid riskklass under 3 behövs förklaring och garanti.", requirement_ids: [id("2.3")] },
      { item: "Försäkringsbevis på minst 10 mkr", why: "Nuvarande 5 mkr räcker inte. Begär offert på höjning från försäkringsbolaget.", requirement_ids: [id("4.1")] },
      { item: "Genomförandebeskrivning (max 2 A4)", why: "Utvärderas till 40 %: inskolning, kvalitetsuppföljning och kommunikation.", requirement_ids: [id("5.3")] },
      { item: "Ifylld Prisbilaga 2", why: "Ofullständig prisbilaga leder till förkastat anbud.", requirement_ids: [id("6.2")] },
      { item: "Fordonsförteckning (om fossilfria fordon används)", why: "Ger 3 % prisavdrag i utvärderingen.", requirement_ids: [id("5.4")] },
    ],
    questions: [
      { question: "Kan referensuppdrag som består av flera avtal med samma beställare, med en sammanlagd yta om minst 10 000 m², godtas som ett uppdrag enligt punkt 2.6?", reason: "Avgör om ni kvalificerar er med befintliga referenser.", requirement_ids: [id("2.6")] },
      { question: "Hur ersätts extra städning enligt punkt 3.8 – enligt timpris i Prisbilaga 2 eller genom separat avrop?", reason: "Påverkar prissättning och beredskapskostnad.", requirement_ids: [id("3.8")] },
      { question: "Kan ni bifoga en lokalförteckning som anger kvalitetsnivå per rum och objekt?", reason: "Nivå 3 i lekrum kräver mer tid – behövs för korrekt kalkyl.", requirement_ids: [id("3.1")] },
      { question: "Vilka utbildningar godtas som likvärdiga med Städbranschens Yrkesbevis?", reason: "Kravet är otydligt formulerat.", requirement_ids: [id("3.3")] },
      { question: "Avser vitet i punkt 4.2 varje enskilt objekt även när en störning drabbar flera objekt samma dag?", reason: "Avgör den verkliga risken vid t.ex. personalbortfall.", requirement_ids: [id("4.2")] },
    ],
    bid_outline: [
      { section: "1. Anbudsformulär i e-Avrop", contents: "Företagsuppgifter, kontaktperson och bekräftelse av samtliga ska-krav." },
      { section: "2. ESPD / sanningsförsäkran", contents: "Uteslutningsgrunder, registrering och skatter (krav 2.1)." },
      { section: "3. Kvalificering", contents: "Certifikat ISO 9001 och 14001, Bilaga 3 med två referenser, CV för avtalsansvarig." },
      { section: "4. Genomförandebeskrivning (max 2 A4)", contents: "Inskolning av personal, kvalitetsuppföljning med egenkontroll, kommunikation med verksamheterna och felanmälan. Skriv konkret med rutiner och ansvar." },
      { section: "5. Mervärde", contents: "Redovisning av fossilfria fordon (om tillämpligt)." },
      { section: "6. Prisbilaga 2", contents: "Pris per objekt och timpris; räkna in viten, beredskap och begränsad indexuppräkning." },
      { section: "7. Underskrift", contents: "Anbudet undertecknas av behörig firmatecknare eller med fullmakt." },
    ],
    final_checklist: [
      "Alla ska-krav är bekräftade i e-Avrop",
      "Två referensuppdrag ≥ 10 000 m² finns i Bilaga 3 och kontaktpersonerna är förvarnade",
      "Giltiga ISO 9001- och ISO 14001-certifikat är bifogade",
      "CV för avtalsansvarig visar minst tre års erfarenhet",
      "Riskklass är kontrollerad – annars bifoga förklaring och garanti",
      "Genomförandebeskrivningen är max två A4-sidor och svarar på alla tre bedömningsområden",
      "Prisbilaga 2 är komplett för samtliga objekt",
      "Inga egna reservationer eller villkor i anbudet",
      "Anbudet är skrivet på svenska",
      "Anbudet är undertecknat av behörig firmatecknare",
      "Anbudets giltighet stämmer med kravet",
      "Anbudet är inlämnat i e-Avrop senast dagen före sista anbudsdag",
    ],
    next_steps: [
      "I dag: ta en kreditupplysning på bolaget och kontrollera riskklass",
      "Denna vecka: be försäkringsbolaget om offert på ansvarsförsäkring 10 mkr",
      "Före sista frågedag: ställ frågan om referenser och ersättning för extra städning",
      "Två veckor före sista anbudsdag: färdig genomförandebeskrivning och prisbilaga",
      "Dagen före sista anbudsdag: slutkontroll och inlämning i e-Avrop",
    ],
  };

  const synthesis = finalizeSynthesis(raw, { requirements: extraction.requirements, daysLeft, hasProfile: true });
  synthesis.profileUsed = true;
  synthesis.daysLeft = daysLeft;

  const analysis = {
    id: "exempel",
    createdAt: `${today}T08:00:00.000Z`,
    status: "klar",
    engine: "anthropic",
    title: "Lokalvård för förskolor och skolor 2027–2029 – Exempelstads kommun",
    documents: [
      { name: UD, pages: 6, unit: "sida" },
      { name: KS, pages: 3, unit: "sida" },
      { name: AV, pages: 4, unit: "sida" },
    ],
    extraction,
    synthesis,
  };
  return buildReportView({
    analysis,
    access: { token: "exempel" },
    unlocked: true,
    previewRequirements: 6,
    pricing: { label: "995 kr exkl. moms", vatNote: "" },
    invoiceEnabled: false,
    paymentsEnabled: false,
  });
}
