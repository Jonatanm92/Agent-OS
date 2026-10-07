# Grok-prompts — research och second opinion

Grok jobbar som **researcher och djävulens advokat**. Claude är fortfarande projektledare:
klistra in Groks resultat i Claude-chatten, så verifieras länkarna och de bästa fynden
sparas i repot. Ge aldrig Grok i uppdrag att skicka något i ditt namn.

Varje prompt ber om samma format, så att resultatet går att klistra in direkt.

---

## 1. Signalagent (köra varje vardag)

```text
Du är researcher åt en svensk konsult med 11 års erfarenhet av e-handelsdrift (SAP på Komplett, Infor M3 och WM6 på Varner) som säljer AI-piloter som automatiserar driftproblem hos nordiska handlare.

Hitta köpsignaler från de senaste 14 dagarna hos handlare/e-handlare i Sverige, Norge, Danmark och Finland:
- platsannonser som nämner Infor M3, SAP, WMS, WM6, systemförvaltare e-handel, orderflöde, lageroptimering eller integration
- nyheter om systembyten, nya lager, lagerflyttar eller e-handelsproblem (förseningar, leveransstrul)
- inlägg på X eller LinkedIn där driftchefer/e-handelschefer klagar på manuellt arbete i order, lager eller returer

Regler:
- Ta bara med signaler du har en fungerande länk till. Hitta aldrig på bolag, annonser, citat eller personer.
- Skriv "osäker" om du inte kunnat öppna källan.
- Max 10 signaler, bäst först.

Svara ENDAST med en tabell:
| Bolag | Land | Signal (1 mening) | Citat ur källan | Länk | Datum | Troligt driftproblem | Roll att kontakta |
```

## 2. Bolagsresearch (per bolag)

```text
Gör en kort profil av [BOLAG] för en konsult som säljer AI-automatisering av driftproblem (order, lager, returer, integration mellan affärssystem och webbshop).

Ta reda på, med källa för varje punkt:
1. Vad de säljer, ungefärlig storlek (omsättning/anställda), kanaler (egen webbshop, marknadsplatser, butiker)
2. Vilka system de verkar använda (affärssystem, WMS, e-handelsplattform) – ledtrådar finns ofta i platsannonser
3. Tecken på driftproblem senaste året (nyheter, recensioner om leveranser, annonser)
4. Vem som troligen äger problemet (titel, inte gissade namn)

Hitta aldrig på. Skriv "okänt" där källa saknas. Avsluta med: "Bästa öppningsfråga till dem:" (en fråga om deras problem, ingen säljpitch).
```

## 3. Djävulens advokat (en gång per vecka)

```text
Här är en affärsstrategi. Din uppgift är att hitta varför den kommer att misslyckas. Var hård och konkret.

[KLISTRA IN innehållet i forge-hq/strategi-grill-10x-2026-10-07.md]

Svara med:
1. De tre största riskerna, rangordnade, med motivering
2. Ett antagande som troligen är fel, och hur man testar det på under en vecka
3. En konkurrent eller ett alternativ som jag har missat (med länk)
4. Om du var tvungen att satsa pengar: vad skulle du göra annorlunda?
```

## 4. Samtalsförberedelse (före varje kundsamtal)

```text
Jag ska ha ett 20-minuterssamtal med [ROLL] på [BOLAG] om driftproblem i order/lager/returer. Min bakgrund: 11 år i e-handelsdrift (SAP, Infor M3, WM6), bygger AI-agenter.

Ge mig:
1. Fem öppna frågor som får dem att berätta om sitt mest tidsödande manuella moment (ingen säljpitch)
2. Tre följdfrågor som tar reda på kostnad i timmar/kronor och vem som beslutar om budget
3. Vad jag ska lyssna efter som tecken på att de skulle betala för en pilot
```
