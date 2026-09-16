# Min vardag

En personlig vardagsassistent för Jonatan: håller reda på ansvar, planerar
realistiska dagar och svarar på frågan *"vad är viktigast att göra nu, med de
förutsättningar jag har i dag?"*

Fristående app med egen kod och egen datalagring. Delar ingenting med något
annat projekt.

## Vad appen gör

| Vy | Syfte |
|---|---|
| **Min dag** | Startsidan: en tydlig nästa handling, högst tre prioriteringar, dagens fasta åtaganden och en diskret översikt över det som kommer senare. |
| **Berätta** | Fritext eller diktering → konkreta, granskningsbara ändringar av planen. Ingenting sker utan godkännande. |
| **Barn** | Behov, storlekar och förberedelser per barn, med tre åtskilda steg: behöver ordnas → planerat → bekräftat klart. |
| **Vecka** | Sju dagar framåt med bekräftat läge per dag, plus återkommande åtaganden som skrivs in en gång. |
| **Kan vänta** | Sådant som inte behöver göras i dag, utan att det försvinner. Tidsgränser lyfts fram. |
| **Kväll** | Kvällsrutin, förberedelser och packlistor inför i morgon — härlett ur bekräftade fakta, aldrig påhittat. |

## Principer som koden håller

Dessa är inte ambitioner utan testade regler (`test/suite.js`):

- **Okänt är ett giltigt värde.** Barnschema och arbetsdagar är okända tills de
  anges. Appen skapar aldrig påhittade lämningar eller hämtningar.
- **Planen börjar vid aktuell tid.** En plan som skapas kl. 16 börjar inte med frukost.
- **Marginaler lämnas.** Resa, mat och återhämtning räknas bort. Ledig tid fylls inte.
- **Låg ork förenklar dagen** — och visar vad som lyftes ur, i stället för att dölja det.
- **Gissa aldrig.** Är det oklart vilket barn eller plagg som avses ställs en kort fråga.
- **Planerat är inte genomfört.** Ett inköpsförslag blir aldrig automatiskt ett köp.
- **Delvis klart hanteras delvis.** 1 av 2 par byxor köpta lämnar 1 kvar.
- **Missade förslag staplas inte** ovanpå morgondagens plan. Tidsgränser väger tyngre.
- **Inga omdömen.** Ingen poängsättning av föräldraskap, inga sviter, inga skuldbeläggande påminnelser.
- **En regelmotor kallas aldrig AI.** Saknas AI-anslutning står det i gränssnittet.
- **Återkommande gör inga antaganden.** En träning på onsdagar gör inte onsdagen till arbetsdag eller barndag.
- **Rutiner nollställs av sig själva.** Avbockningen sparas per datum, så listan är ny nästa dag.

## Struktur

```
core/      ren domänlogik, utan DOM — samma filer körs i test och i webbläsare
  util.js      tid och datum i Europe/Stockholm, oberoende av enhetens tidszon
  model.js     datamodell och härledda frågor om dagen
  planner.js   dagsplanering: fasta åtaganden, marginaler, prioriteringar
  recurring.js återkommande åtaganden och veckoöversikt
  routines.js  rutiner och packlistor som återkommer av sig själva
  language.js  svensk regeltolkning av fritext → ändringsförslag
  apply.js     tillämpning av ändringar, med beskrivning i klartext
  evening.js   kväll och morgon
app/
  storage.js   lagring (skyddad db, annars localStorage) och ångra
  ai.js        valfri AI-tolkning med strikt validering av svaret
  icons.js     ikoner som infogad SVG — inga färgemoji
  ui.js        gränssnittet
test/
  suite.js     83 enhetstester av domänlogiken
  browser.js   61 tester i riktig webbläsare, i mobilstorlek
index.html   skal och formgivning
```

`core/` och `app/` är vanliga skript utan byggsteg. Testerna laddar exakt samma
filer som webbläsaren, så det som testas är det som körs.

## Köra testerna

```bash
node test/suite.js                                    # domänlogik
NODE_PATH=/opt/node22/lib/node_modules node test/browser.js   # webbläsare, mobil
```

## Formgivning

Allt som styr utseendet ligger som CSS-variabler överst i `index.html`:
färger för ljust och mörkt läge, typsnitt, rundningar, tryckytor och skuggor.
Ändra en rad där och ändringen slår igenom i hela appen.

- **Färg**: svalt papper och bläck med blå ton, petrol som struktur, och EN varm
  signalfärg som bara nästa handling får använda. Salvia för egen tid och vila.
- **Typsnitt**: Bricolage Grotesque för rubriker, IBM Plex Sans för text,
  IBM Plex Mono för klockslag. Alla har riktiga reservtypsnitt om Google Fonts
  inte går att nå.
- **Dagsband**: en remsa som visar dygnet från uppgångstid till läggdags med
  fasta åtaganden som block och en levande nu-markör.

## Lagring och integritet

Publicerad som en åtkomstskyddad Artifact-sida sparas allt i sidans egna
db-lager, med regler som ger endast ägaren läs- och skrivrätt. Går det lagret
inte att nå faller appen tillbaka på webbläsarens `localStorage` och skriver ut
vilket läge som gäller — den påstår aldrig att något är skyddat sparat när det
inte är det.

Uppgifter kan rättas, raderas per post och raderas helt (Inställningar →
Radera allt). Ångra finns för de senaste 15 ändringarna.

Riktiga personuppgifter finns inte i den här kodbasen. Alla exempel och tester
använder påhittade barn (Alva, Noa, Vide).

## Integrationer

- **AI-tolkning**: valfri. Används bara om sidan får tillgång till den, och kan
  stängas av. Svaret valideras mot verkliga id:n innan det ens visas som förslag.
- **Google Kalender**: inte ansluten. Ingen verifierad koppling finns i den här
  versionen. När den byggs blir den endast läsning och kräver uttryckligt godkännande.
- **Påminnelser**: appen skickar inga. Inga morgonnotiser skapas, så den krockar
  inte med befintliga rutiner.
