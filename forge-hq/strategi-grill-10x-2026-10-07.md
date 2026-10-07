# Strategi: grill + 10x — 2026-10-07

Beslutsunderlag till VD. Claude har grillat alla spår som finns i repot mot fakta och mot
dina mål: **inkomst snart, så lite egen tid som möjligt, du styr och AI gör jobbet.**

## Tre obekväma sanningar

1. **Varje "AI-tjänst X" finns redan.** AI har gjort det billigt att bygga, så verktyget är
   ingen vallgrav. Exempel från i dag: upphandlings-AI finns redan
   ([Tendium](https://tendium.ai/se/blogg/skriv-anbud-med-ai/),
   [Tendoer](https://inkubera.se/sa-gor-ai-foretaget-tendoer-det-enklare-att-svara-pa-upphandlingar/),
   [Anbudsintelligens](https://www.anbudsintelligens.se/var-tjanst/)). Även en nisch som
   "är din webbshop redo för AI-shoppingagenter?" har redan
   [skannrar](https://www.agenticcommerce.shop/),
   [färdiga granskningsverktyg](https://apify.com/trovevault/ai-commerce-agent-readiness-auditor)
   och byråer. Det som inte går att kopiera är **din bakgrund, ditt nätverk och att du
   faktiskt pratar med kunder.**
2. **Flaskhalsen har aldrig varit bygget.** Fyra system i rad (Agent OS, ForgeHQ, Revenue OS,
   BidSprint) och noll kundsamtal. BidSprint hade 30 researchade bolag och skickade 0
   meddelanden, eftersom systemets egna spärrar sa nej. Claude byggde samma mönster igen i
   går (Gate A/B i Checkout Lockdown).
3. **Noll egen insats finns inte i början.** AI kan göra ungefär 95 %: hitta, researcha,
   skriva, bygga och leverera. Men de första kunderna litar på en människa. Minimum för dig:
   **cirka 20 minuter om dagen** för att godkänna och skicka, plus samtalen när någon svarar.
   Allt annat kan Claude driva.

## Grillningen, spår för spår

| Spår | Den svåraste frågan | Svar | Beslut |
|---|---|---|---|
| Hemsidefixar åt småföretag | Varför du och inte vem som helst med ChatGPT? | Inget bra svar. Lågt pris, mycket sälj per krona. | **Lägg ner** (behåll bara som akut nödutgång för småpengar) |
| Checkout Lockdown (WooCommerce) | Vem känner dig på den engelskspråkiga marknaden? | Ingen. Ingen publik, kunden måste lämna ut åtkomst, och det tar 30 dagar innan första kronan. | **Pausa.** Materialet ligger kvar. |
| BidSprint 48 (upphandling) | Varför skulle de välja dig framför Tendium? | Inget validerat svar. 1 900 kr per jobb är lågt för analys av 157 sidor. | **Parkera.** Kunskapen återanvänds nedan. |
| Plugins/presets för metalgitarr | Räcker en nisch för en inkomst? | Den enda modellen där kunden köper själv, men liten och mot jättar som Neural DSP. | **Hobby,** inte inkomstspår |
| **AI för drift i handeln (din bakgrund)** | Vem mer har 11 år med SAP/M3/WMS **och** bygger AI-agenter? | Väldigt få. Köparna är bolag du har jobbat på eller deras grannar. | **Huvudspår** (nedan) |
| Anställning inom tillämpad AI | Ger den inkomst snabbare än ett företag? | Troligen ja. Portfolion finns redan. | **Kör parallellt** – samma samtal tjänar båda |

## 10x: från 1 900-kronorsjobb till 30 000-kronorspiloter

Små jobb för 1 900 kr kräver många kunder, och många kunder kräver mycket av din tid.
**10x-versionen är 10x högre pris och 10x färre kunder.** Det matchar ditt mål att lägga lite
egen tid.

**Erbjudandet (hypotes – ovaliderad):**
> *AI-pilot för drift i handeln.* Ett återkommande driftproblem hos en nordisk handlare som
> kör M3, SAP eller ett WMS – till exempel ordrar som fastnar, lagersaldon som inte stämmer
> mellan affärssystem och webbshop, eller manuella returflöden – automatiseras med en
> AI-agent på två till fyra veckor. Fast pris i storleksordningen 25 000–40 000 kr.
> Byggd av någon som själv har drivit flödet från insidan.

**Varför det slår de andra spåren:**
- **Din orättvisa fördel räknas.** Du kan prata M3 och WM6 med en driftchef. Det kan inte
  en generisk AI-byrå.
- **Varma kontakter i stället för kalla.** Komplett, Varner och deras leverantörer,
  konkurrenter och tidigare kollegor.
- **Tre kunder gör en månadslön.** Det är realistiskt med 20 minuter om dagen.
- **Varje samtal är också en jobbintervju.** Om ingen köper piloten men någon vill anställa
  dig har du ändå vunnit på inkomstfrågan.

**Det som måste vara sant (testas först, innan något byggs):**
1. Driftchefer hos handlare har ett återkommande problem som kostar timmar varje vecka.
2. De får lov att köpa en pilot för 25 000–40 000 kr utan en lång upphandling.
3. Du kan leverera säkert utan att röra produktionsdata först (läsåtkomst eller exporter).

**Avbrottsregel:** efter 15 riktiga samtal utan två konkreta problem som någon vill betala
för → byt erbjudande eller satsa helt på jobbspåret.

## Den autonoma motorn

**Rekommendation: Claude Code i molnet är motorn, repot är minnet och Agent OS är
skyltfönstret.** Agent OS körs på din dator med gratismodeller och kräver att datorn är
igång. Claude Code kan köras schemalagt i molnet utan dig. Bygg inte fler interna system nu
– det är mönstret som har stoppat dig fyra gånger.

| Agent | Vad den gör, utan dig | Hur ofta |
|---|---|---|
| **Signalagent** | Letar köpsignaler i offentliga källor: platsannonser där handlare söker "M3-konsult", "systemförvaltare e-handel" eller "WMS" (= de har problemet och budget), plus nyheter om systembyten och lagerflyttar. Varje signal är också ett jobbtips åt dig. | Varje vardag |
| **Researchagent** | Bygger en kort profil per bolag: system, troligt problem, rätt roll att kontakta och vem i ditt nätverk som kan känna någon där. | Per signal |
| **Utkastagent** | Skriver ett personligt meddelande i din ton, utifrån signalen. Ingen säljpitch, bara en fråga om deras problem. | Per signal |
| **Dagsbrief** | En sida i repot: "5 meddelanden att godkänna i dag", status och nästa steg. | Varje morgon |
| **Leveransagent** | När en pilot är såld: Claude bygger agenten, testar och skriver dokumentationen. Du granskar och lämnar över. | Per kund |

**Din dag som VD (cirka 20 min):** läs dagsbriefen, godkänn eller ändra 5 meddelanden och
skicka dem från din egen LinkedIn eller e-post, och boka samtal med dem som svarar.
Samtalen är din riktiga insats. Ett 20-minuterssamtal i veckan räcker i början.

**Det Claude inte gör:** skickar inte i ditt namn, ringer inte, tar inte emot betalning och
lovar inget till kunder. Det är dina beslut.

## Beslut till VD

1. **Huvudspår:** AI för drift i handeln + jobbspåret parallellt? (Rekommendation: ja.)
2. **Starta den autonoma motorn:** en schemalagd körning varje vardagsmorgon som tar fram
   signaler, utkast och dagsbrief. (Rekommendation: ja.)
3. **De första 10 namnen:** vem från Komplett- och Varner-tiden kan du skriva till den här
   veckan? Bara namn räcker; Claude researchar resten.

---

## Uppdatering 2026-10-07: inget varmt nätverk

VD har inga kvarvarande kontakter från Komplett/Varner. Det tar bort huvudspårets största
fördel (varma kontakter). En okänd person som säljer piloter för 25 000–40 000 kr helt
kallt till driftchefer har låg träffsäkerhet. Därför byter spåren plats:

1. **Jobbspåret blir primärt för inkomst.** Det finns öppna M3-tjänster just nu (Scan,
   Saint-Gobain Distribution m.fl. i signalloggen) och rekryterare som aktivt letar
   M3-erfarenhet. Där är din bakgrund efterfrågad i dag, utan nätverk.
2. **10x-versionen av jobbspåret:** bli "AI-personen" hos en M3-partner. CGI har
   [160+ M3-konsulter](https://www.cgi.com/se/sv/tjanster/affarssystem/infor-m3);
   Columbus, Meridion, Elvenite och Navcite är de andra stora
   ([MAF:s konferens](https://www.movexm3.se/en/conference/page/start/) listar alla fem).
   Få kan både M3 och AI-agenter – det är en sällsynt profil hos dem, och deras kunder blir
   indirekt dina.
3. **Pilotspåret blir sekundärt** och går via partnerkanalen (underkonsult åt en M3-partner)
   eller via signaler där annonsen själv visar problemet. Ingen kall massutskickning.

**Nätverk byggs, det köps inte:** M3-användarföreningen (cirka 140 medlemsföretag,
[movexm3.se](https://www.movexm3.se/), konferens maj 2027), e-handelsevent i Göteborg
([ehandel.se/event](https://www.ehandel.se/event)) och LinkedIn-inlägg om M3 + AI i praktiken.
