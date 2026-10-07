# Dagsmotorn — arbetsinstruktion

Körs varje vardagsmorgon av en schemalagd Claude Code-session. Strategin finns i
`../strategi-grill-10x-2026-10-07.md`: AI-piloter för drift i handeln (M3/SAP/WMS) +
jobbspåret parallellt. VD = Jonatan (Vänersborg). Claude = projektledare.

## Varje körning

1. **Hämta signaler:** `node forge-hq/drift/signals.mjs` (lägger nya rader i `signals.csv`).
   Om API:et inte svarar: notera det i briefen och fortsätt med steg 4–5.
2. **Välj ut max 5** av dagens nya signaler. Prioritera:
   - handel, e-handel, grossist och distribution före tillverkning
   - roller som äger system/flöden (M3-specialist, systemförvaltare, order fulfilment,
     WMS-specialist, business analyst) före operativa roller
   - Västsverige (närhet till Vänersborg) vid lika fit
   - Om annonsen är från ett bemanningsbolag: ta reda på det faktiska bolaget ur
     rubriken/texten. Hittar du det inte, hoppa över den.
3. **Researcha varje utvald signal** (webbsök, max ca 5 min per bolag): vad bolaget säljer,
   storlek, troligt driftproblem som annonsen avslöjar, och vilken roll som äger problemet.
   Varje uppgift ska ha en källa. Gissa aldrig namn på personer.
4. **Två spår per signal** (jobbspåret är primärt sedan 2026-10-07 – VD saknar varmt
   nätverk, se strategins uppdatering). Om annonsen kommer från ett bemanningsbolag eller
   en M3-partner: lägg rekryteraren/bolaget i `leadkallor.md` (avsnitt 1 eller 2) med källa.
   - **Jobbspår:** passar annonsen Jonatans profil (`../../CAREER_PORTFOLIO.md`)? Ja/nej + en
     mening varför. Jobbtips är lika mycket värda som säljleads.
   - **Säljspår:** ett utkast till kort meddelande (max 5 meningar, svenska, du-form) från
     Jonatan till rätt roll. Ingen säljpitch: nämn signalen, hans bakgrund i en mening
     (11 år e-handelsdrift, SAP/M3/WM6) och ställ **en** fråga om deras problem.
5. **Uppdatera `signals.csv`:** sätt status `vald`, `jobbtips` eller `skippad` på dagens rader.
6. **Skriv dagsbriefen** `forge-hq/drift/dagsbrief/ÅÅÅÅ-MM-DD.md` (mall nedan).
7. **Committa och pusha** till grenen `claude/new-session-iti11u`.

## Regler

- Skicka aldrig något, kontakta aldrig någon, skapa inga konton. Allt utåtriktat gör VD.
- Hitta aldrig på bolag, annonser, citat, personer eller siffror. Saknas källa: skriv "okänt".
- Max 5 utkast per dag – hellre 2 bra än 5 svaga. Noll är okej om inget håller.
- Ändra inte strategin på egen hand. Ser du något som borde ändra den: lägg det under
  "Beslut till VD".
- Läs gårdagens brief och `pipeline.md` först så att samma bolag inte föreslås två gånger.

## Mall för dagsbriefen

```markdown
# Dagsbrief ÅÅÅÅ-MM-DD

**Läge:** X nya signaler, Y utvalda, Z jobbtips. [API-status om något strulade]

## Att göra i dag (cirka 20 min)
1. [ ] Skicka meddelande till [roll] på [bolag] (utkast 1)
...

## Jobbtips
- [Rubrik] – [bolag] – [länk] – varför det passar dig: …

## Utkast
### 1. [Bolag] – [roll att kontakta]
Signal: [annons/länk, datum]. Troligt problem: … (källa)
> [meddelande]

## Beslut till VD
- (bara om något kräver ett beslut)
```
