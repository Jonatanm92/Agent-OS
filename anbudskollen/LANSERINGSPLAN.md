# Lanseringsplan – första betalande kunder inom 2–4 veckor

## Varför just den här appen

- **Kunderna har pengar och ett akut problem.** Tusentals svenska småföretag (städ, bygg, IT-konsulter,
  transport, grönyta, tolk, bemanning, catering) lämnar anbud. Varje underlag är 50–200 sidor, och ett missat
  ska-krav innebär att anbudet förkastas. En arbetsdag för den som läser underlaget kostar mer än en rapport.
- **Tidsstyrt köpbehov.** Varje upphandling har en sista anbudsdag. Köpet sker när företaget överväger en
  specifik upphandling – inte "någon gång".
- **Billig leverans.** Analysen tar minuter och kostar oftast 5–15 kr i AI. Marginalen på 995 kr är över 95 %.
- **Kunden ser värdet före köpet.** Gratis förhandsvisning med deras egen upphandling, deras egen
  sista anbudsdag och deras egna ska-krav.
- **Du kan sälja utan att vänta på att någon hittar sajten.** Upphandlingar är offentliga. Du kan analysera
  en färsk upphandling själv och skicka resultatet till rätt företag samma dag (se säljmotorn nedan).

Konkurrenter (t.ex. Tendium) säljer abonnemang till företag med egna anbudsteam. Anbudskollen är
**per upphandling, utan abonnemang, för småföretag** – ett annat köpbeslut.

## Vecka 0 (dag 1–3): bli redo att ta betalt

1. **Företag och skatt.** Registrera enskild firma och ansök om F-skatt på verksamt.se om du inte redan har
   ett företag. Bestäm moms: antingen momsregistrering (25 % moms, som företagskunder drar av) eller
   momsbefrielse om omsättningen understiger gränsen (120 000 kr/år sedan 2025). Kontrollera med Skatteverket
   vad som passar dig och justera `PRIS_TEXT`/`MOMS_TEXT`. Fram till dess kan fakturakunder hanteras via
   ett egenanställningsföretag (t.ex. Frilans Finans, som Revenue OS redan pekar ut).
2. **Domän.** Köp t.ex. `anbudskollen.se` (kontrollera att den är ledig) och en e-postadress på domänen.
3. **Claude API.** Skapa nyckel på platform.claude.com, fyll på 200–500 kr och sätt en månadsgräns.
4. **Stripe.** Skapa konto, aktivera kort (och gärna Klarna/Swish), testa med testnyckel, byt till live.
5. **Driftsätt** enligt README (Railway eller Docker). Fyll i `FORETAGSNAMN`, `ORGANISATIONSNUMMER`,
   `FORETAGSADRESS`, `KONTAKT_EPOST`, `ADMIN_TOKEN`, `PUBLIC_URL`. Läs igenom villkor och integritetspolicy.
6. **Kvalitetskontroll.** Hämta 3–5 riktiga, aktuella upphandlingar och kör dem i ägarpanelen. Jämför
   de 15 första ska-kraven och sista anbudsdag mot källan. Skicka inget till kunder förrän du litar på
   resultatet. (Byt till `claude-sonnet-5-5` bara om kvaliteten håller och du vill sänka kostnaden.)

## Säljmotorn: "färsk upphandling → värde först"

Gör detta varje vardag, ca 2–3 timmar:

| Tid | Aktivitet |
|---|---|
| 30 min | Hitta 2 nyligen publicerade upphandlingar med 3–6 veckor kvar till sista anbudsdag, i branscher med många småföretag. Källor: e-Avrop, Visma TendSign/Opic, Mercell, Kommers Annons och TED. Gratis leverantörskonto räcker för att ladda ner underlagen. |
| 15 min | Ladda upp underlaget i ägarpanelen (*Ny analys*) och kontrollera rapporten snabbt mot källan. |
| 45 min | Hitta 10 relevanta företag per upphandling: kommunens avtalskatalog (nuvarande leverantörer och konkurrenter), allabolag.se, Google Maps, branschförbund. Välj aktiebolag i rätt region och storlek. Skapa en **delningslänk per företag** med företagets namn som etikett. |
| 45 min | Skicka 20 personliga mejl (mall nedan) från din egen adress. |
| 30 min | Ring de som fick mejl för två dagar sedan och har öppnat länken eller inte svarat. |

Varje företag får en egen länk – betalar ett företag låses bara deras länk upp. I ägarpanelen ser du vem som
betalat, fakturaförfrågningar och intäkten.

### Mejlmall

> **Ämne:** Lokalvård Exempelstads kommun – sista anbudsdag 12 nov, kraven sammanställda
>
> Hej Anna,
>
> Exempelstads kommun publicerade i veckan en upphandling av lokalvård för 20 förskolor och skolor
> (ca 38 000 m², sista anbudsdag 12 november). Eftersom ni gör skolstädning i Exempelstad tänkte jag att
> den kan vara intressant för er.
>
> Jag har gått igenom underlaget och sammanställt kraven med sidhänvisningar. Tre saker som sticker ut:
> - två referensuppdrag på minst 10 000 m² i skolmiljö krävs
> - ISO 9001 och ISO 14001 krävs
> - vite 5 000 kr per objekt och påbörjad dag
>
> Här är en gratis sammanfattning med deadlines och de viktigaste ska-kraven: [länk]
> Om ni vill ha hela kravmatrisen i Excel, alla risker och en anbudsdisposition kan ni låsa upp den direkt i länken.
>
> Vänliga hälsningar
> Jonatan, Anbudskollen
> [telefon]
>
> *Vill du inte få fler tips om upphandlingar? Svara "nej tack", så hör jag inte av mig igen.*

Regler att följa: skicka till aktiebolag (inte enskilda firmor, som räknas som privatpersoner i
marknadsföringslagen), helst till funktionsadresser eller ansvarig person i rollen, med relevant och personligt
innehåll, tydlig avsändare och enkel avregistrering. Notera avregistreringar och respektera dem. Kontrollera
gärna aktuella regler hos Konsumentverket och IMY.

### Telefonmanus (60 sekunder)

> "Hej, Jonatan här från Anbudskollen. Jag skickade en sammanfattning av kommunens lokalvårdsupphandling i
> tisdags – hann du titta? … Det som brukar fälla anbud i den här är referenskravet på 10 000 m². Har ni två
> sådana uppdrag? … Om ni lägger in er företagsprofil i länken får ni en bedömning krav för krav, gratis.
> Hela kravmatrisen kostar 995 kr och kan låsas upp direkt eller mot faktura."

### Fler kanaler (parallellt från vecka 2)

- **LinkedIn:** publicera 2–3 inlägg i veckan i stil med *"5 krav som fäller anbud i kommunala städupphandlingar"*
  med länk till exempelrapporten. Kommentera i grupper för upphandling och småföretagare.
- **Partner:** anbudskonsulter, redovisningsbyråer, Företagarna lokalt, branschförbund. Erbjud 10-pack
  (t.ex. 6 900 kr) – du låser upp deras länkar manuellt mot faktura.
- **Lanseringsrabatt:** skapa koden `LANSERING` (t.ex. 30 %) i Stripe för att få de första referenskunderna.
  Be dem om ett citat till landningssidan.

## Mål och uppföljning

Räkna med ungefär så här de första veckorna (antaganden – mät själv):

| | Vecka 1 | Vecka 2 | Vecka 3 | Vecka 4 |
|---|---:|---:|---:|---:|
| Personliga mejl | 60 | 100 | 100 | 100 |
| Öppnade förhandsvisningar | 15 | 30 | 35 | 40 |
| Betalda rapporter | 1–2 | 3–5 | 4–7 | 5–8 |
| Intäkt (995 kr/st) | ~1–2 tkr | ~3–5 tkr | ~4–7 tkr | ~5–8 tkr |

**Realistiskt mål de första fyra veckorna: 10–20 sålda rapporter, 10 000–20 000 kr.** Det som driver mer
är volym (fler mejl och samtal), partner med många upphandlingar och återkommande kunder. När 5+ kunder
har köpt mer än en rapport är det dags att erbjuda ett månadspaket (t.ex. 2 495 kr/mån för 5 analyser).

Följ upp varje fredag i ägarpanelen: analyser, betalda rapporter, intäkt, AI-kostnad. Notera vilka branscher
och vilka formuleringar som ger köp.

**Byt spår om** 200 personliga kontakter och 40 öppnade förhandsvisningar har gett färre än 3 köp:
testa lägre pris (495 kr), en annan bransch, eller sälj tjänsten som "vi gör kravsammanställningen åt er"
med rapporten som leverans.

## Koppling till Revenue OS / BidSprint 48

Anbudskollen är BidSprint 48 som produkt: samma kundgrupp och samma leverans (go/avstå, kravmatris, saknade
bevis, deadlines, frågor, anbudsdisposition, slutkontroll), men levererad på minuter i stället för 48 timmar,
med betalvägg och gratis förhandsvisning. Red-team-rapportens stoppkriterier (källspårning, inga påhittade
bevis, ingen juridisk rådgivning, mänsklig kontroll innan utskick) är inbyggda i både promptar och spärrar.
