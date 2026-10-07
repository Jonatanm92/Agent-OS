# Anbudskollen

**AI-analys av offentliga upphandlingar för småföretag som lämnar anbud.**

Kunden laddar upp förfrågningsunderlaget (PDF, Word, Excel). Efter några minuter får de:

- en **go/avstå-rekommendation** med poäng 0–100 och de faktorer som påverkar den
- en **källspårad kravmatris** där varje ska-krav, bör-krav och utvärderingskriterium har dokument, sida och ordagrant citat
- alla **deadlines**, som kalenderfil med påminnelser
- **avtalsrisker** (viten, ansvar, volymgaranti, prisjustering)
- **underlag att ta fram**, **frågor till myndigheten**, **anbudsdisposition** och **slutkontroll**
- med företagsprofil: en **krav-för-krav-bedömning** mot företagets förutsättningar

Förhandsvisningen är gratis. Den fullständiga rapporten (Excel-export, alla krav, risker, frågor) låses upp
för en engångsavgift per upphandling (standard **995 kr exkl. moms**) med kort via Stripe eller mot faktura.

Affärsplanen för de första veckorna finns i [LANSERINGSPLAN.md](./LANSERINGSPLAN.md).

## Snabbstart

Kräver Node.js 20.12 eller senare (22 LTS rekommenderas).

```bash
cd anbudskollen
npm ci
cp .env.example .env      # fyll i minst ADMIN_TOKEN och ANTHROPIC_API_KEY
npm start                 # http://localhost:3020
```

På Windows: `powershell -ExecutionPolicy Bypass -File .\start.ps1`

Utan `ANTHROPIC_API_KEY` körs ett **demoläge** med enkel nyckelordsanalys så att hela flödet går att prova.
Rapporterna märks då tydligt som demo.

| Sida | Adress |
|---|---|
| Landningssida | `/` |
| Ny analys | `/analys.html` |
| Exempelrapport | `/rapport.html?exempel=1` |
| Ägarpanel | `/admin.html` (logga in med `ADMIN_TOKEN`) |

## Konfiguration

Alla inställningar görs med miljövariabler, se [.env.example](./.env.example). De viktigaste:

| Variabel | Standard | Beskrivning |
|---|---|---|
| `ANTHROPIC_API_KEY` | – | Aktiverar AI-analysen med Claude. Sätt en månadsbudget i Claude Console. |
| `ANALYS_MODELL` | `claude-opus-5-5` | `claude-sonnet-5-5` ger ungefär halva AI-kostnaden. |
| `ADMIN_TOKEN` | – | Lång slumpsträng för ägarpanelen. |
| `STRIPE_SECRET_KEY` | – | Aktiverar kortbetalning (Stripe Checkout). |
| `PRIS_SEK` / `PRIS_TEXT` | `995` | Pris per upphandling och hur det visas. |
| `FAKTURA_AKTIVERAD` | `true` | Kunden kan begära faktura; du låser upp i ägarpanelen. |
| `GRATISLAGE` | `false` | Allt upplåst gratis – för egna piloter. |
| `FORETAGSNAMN`, `ORGANISATIONSNUMMER`, `FORETAGSADRESS`, `KONTAKT_EPOST` | platshållare | Visas i villkor, integritetspolicy och sidfot. **Måste fyllas i innan lansering.** |
| `PUBLIC_URL` | – | Publik adress, används i Stripe-länkarna. |
| `GRATIS_ANALYSER_PER_IP_OCH_DYGN` / `MAX_ANALYSER_PER_DYGN` | `2` / `40` | Kostnadsskydd för gratisanalyser. Ägaren omfattas inte. |
| `DATA_DIR` | `./data` | Var analyser och leads sparas (JSON-filer). |
| `LAGRINGSTID_DAGAR` | `365` | Analyser raderas automatiskt efter denna tid. |

### AI-kostnad

Med Claude Opus 5.5 kostar en analys ungefär 1–30 kr beroende på hur stort underlaget är
(ett typiskt kommunalt underlag på 40–80 sidor: ca 5–15 kr). Varje analys visar sin kostnad i ägarpanelen.
Gratisanalyserna är er kundanskaffningskostnad – gränserna ovan skyddar mot missbruk.

### Stripe

1. Skapa konto på stripe.com (enskild firma eller aktiebolag) och aktivera kort och gärna Klarna/Swish under *Payment methods*.
2. Börja med testnyckeln `sk_test_...` och testkortet `4242 4242 4242 4242`.
3. Byt till `sk_live_...` när allt fungerar. Kunden får kvitto/faktura från Stripe automatiskt.

Betalningen verifieras genom att servern hämtar Checkout-sessionen när kunden kommer tillbaka – ingen webhook behövs.
Rabattkoder skapas i Stripe (*Products → Coupons → Promotion codes*) och kan anges i kassan.

## Driftsättning

Appen är en Node-server med lokal disk för data. Den kräver **en instans med beständig lagring**.

**Railway (enklast):** New Project → Deploy from GitHub repo → välj repot, sätt *Root Directory* till `anbudskollen`.
Lägg till en Volume monterad på `/data`, sätt `DATA_DIR=/data` och övriga miljövariabler. Koppla er domän.

**Docker (valfri VPS, t.ex. Hetzner eller DigitalOcean):**

```bash
docker build -t anbudskollen ./anbudskollen
docker run -d --restart unless-stopped -p 3020:3020 -v anbudskollen-data:/data --env-file anbudskollen/.env anbudskollen
```

Kör bakom HTTPS (t.ex. Caddy eller plattformens inbyggda TLS).

## Så fungerar det

```
Uppladdning ─► textutvinning per sida (PDF/DOCX/XLSX) ─► delar à ~60 000 tecken
   ─► Claude extraherar krav, datum, fakta, risker, oklarheter (parallellt, JSON-schema)
   ─► sammanslagning + dubblettrensning (siffror måste matcha) + id K1..Kn
   ─► Claude gör go/avstå, bedömning mot profil, frågor, disposition
   ─► deterministiska spärrar (passerad deadline ⇒ AVSTÅ, saknat ska-krav ⇒ aldrig GO)
   ─► rapport: gratis förhandsvisning / upplåst efter betalning
```

- Dokumenten hålls **bara i minnet** under analysen och sparas aldrig.
- En obetald besökare får aldrig det låsta innehållet skickat till webbläsaren – bara antal.
- Varje **delningslänk** har egen betalstatus. Ägaren kan analysera en upphandling en gång och skicka
  en unik länk till varje potentiell kund.
- Excel-exporten skyddas mot formelinjektion, all text renderas som text (ingen HTML), strikt CSP.

| Fil | Ansvar |
|---|---|
| `src/server.mjs` | HTTP-API, betalvägg, ägarpanel, statiska sidor |
| `src/extract.mjs` | Textutvinning med sid-/avsnittsnummer |
| `src/chunk.mjs` | Delar upp text i modellstora bitar med dokumentrubriker |
| `src/prompts.mjs` | Systemprompter och JSON-scheman |
| `src/llm.mjs` | Claude-anrop (strukturerad output, fallback, felhantering) och demomotor |
| `src/pipeline.mjs` | Jobbkö, map-reduce-analys, anpassning efter profil, gallring |
| `src/report.mjs` | Sammanslagning, spärrar och vad som visas låst/upplåst |
| `src/export.mjs` | Excel och iCalendar |
| `src/payments.mjs` | Stripe Checkout via REST |
| `src/example.mjs` | Exempelrapporten (fiktiv upphandling, datum relativt idag) |

## Tester

```bash
npm test
```

27 tester täcker textutvinning, uppdelning, dubblettrensning, spärrar, att låst innehåll inte läcker,
Excel/kalender, Stripe-flödet, Claude-anropens form och felhantering, samt ett helt HTTP-flöde
(uppladdning → förhandsvisning → betalning → upplåsning → export → ägarpanel → radering).

## Begränsningar och nästa steg

- Inskannade PDF:er utan text analyseras inte (nästa steg: skicka sådana sidor som PDF till Claude).
- Ingen e-post skickas automatiskt – kunden sparar länken, och fakturaförfrågningar syns i ägarpanelen.
- En serverinstans med lokal disk. Räcker gott för hundratals analyser per dag.
- Möjliga tillägg när det finns betalande kunder: månadsabonnemang, e-postnotiser, bevakning av nya
  upphandlingar per bransch, anbudsutkast.

Villkoren och integritetspolicyn är mallar. Läs igenom dem och fyll i era uppgifter innan lansering.
