# Vad som återstår – ärlig lista

## Gjort och verifierat
- Inventering av byggmiljön; Claude Code headless testad (behörigheter, kostnad, strukturerad output, miljörensning).
- Arkitektur: uppdragskö, tillståndsmaskiner, git per uppdrag, hashkedjad logg, budgettak, rollpolicyer.
- 7 roller implementerade (3 AI-drivna: produkt, testförfattare, kodare; 4 deterministiska: arkitekt,
  testare, säkerhet, dokumentation). Research-rollen är definierad men **inte implementerad**.
- Mobilvänlig dashboard med uppdragshistorik, testresultat per krav, evidens, git, filer, godkännandekö,
  revisionslogg och systemvy – kontrollerad i Chromium (mobil + desktop).
- Ett riktigt end-to-end-flöde med Claude Code ($0,35, 8/8), evidenspaket + offline-verifierare.
- 24 automatiska tester, strikt typkontroll.

## Inte gjort – i prioritetsordning

1. **Kör och verifiera på din Windows-dator.** Inget i OMEGA har körts på Windows. Kör
   `scripts\inventory-windows.ps1`, `npm test` och `node src/cli.ts demo` där och rätta det som skiljer sig
   (troliga ställen: `.cmd`-shims, `os.devNull` för git, filrättigheter för token, sökvägar med mellanslag).
2. **Starkare sandlåda för att köra genererad kod.** Idag körs testerna som barnprocess med rensad miljö
   och tidsgräns, men på värden. Nästa steg: Docker-container eller Windows Sandbox utan nätverk, med bara
   projektkatalogen monterad.
3. **Slutgranska det riktiga uppdraget.** `msn_990c384537ee` väntar på slutgranskning. Jag har medvetet inte
   godkänt det – det beslutet är ditt. (Datan ligger i molncontainerns scratch-katalog; i repot finns en
   fullständig kopia för granskning och verifiering.)
4. **Mobilåtkomst.** Dashboarden är mobilanpassad men nås bara via loopback. Sätt upp Tailscale enligt
   `docs/03-security.md` och verifiera från telefonen. Inget är installerat eller testat.
5. **Drift.** Det finns **ingen dygnet-runt-drift**: arbetaren kör bara medan `omega serve` är öppen. En
   Windows-tjänst (t.ex. via schemalagd uppgift eller NSSM) med automatisk omstart och hälsokontroll är inte
   byggd. Kön tål omstarter (avbrutna uppgifter återköas), men det är inte detsamma som verifierad drift.
6. **Fler motorer.** Codex-adapter (CLI:t saknades här, flaggorna overifierade), Ollama för gratis lokala
   körningar, modellval per roll (t.ex. billigare modell för produkt/test).
7. **Befintliga repon.** Låta ett uppdrag arbeta mot ett av dina repon på en egen gren/worktree, med PR via
   `gh` först efter godkännande. Kräver fler grindar (push, PR) och starkare sandlåda.
8. **Fler projekttyper.** Idag: Node.js-bibliotek + CLI utan beroenden. Webbappar (med webbläsartester),
   Python, och projekt med granskade beroenden.
9. **Research-rollen** (WebSearch/WebFetch, endast läsning) och en "omarbeta efter avvisning"-loop där din
   motivering går tillbaka till produkt/kodare.
10. **Skalning:** SQLite i stället för JSON-dokumentet, flera parallella arbetare, avbrytning av en pågående
    agentkörning (idag avslutas körningen och resultatet kasseras).
11. **Säkerhetshärdning:** extern förankring av revisionskedjans huvudhash, token-rotation, flera användare
    med roller, notiser till telefonen när något väntar på godkännande.
12. **Kostnadsprognos** före start (idag: hårda tak och faktisk kostnad i efterhand).

## Kända begränsningar i v0.1
- Säkerhetsgranskningen är mönsterbaserad, ingen fullständig SAST.
- Mallmotorn kan bara två recept och säger nej till allt annat (avsiktligt – den är ingen AI).
- Kostnadssiffran är Claude Codes egen `total_cost_usd`; på abonnemang kan den skilja sig från faktisk debitering.
- En enda arbetare; stora uppdrag körs i tur och ordning.
