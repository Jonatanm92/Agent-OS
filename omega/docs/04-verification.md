# Fas 4 – Verifiering: ett riktigt end-to-end-flöde

## Vad som kördes

```
node src/cli.ts demo --engine claude-code --approve-spend --home <scratch>/omega-real
```

**Beställning (fri text):** *"Bygg en liten app som räknar ut dricks och delar notan mellan flera personer,
med avrundning till hela kronor och ett kommandoradsverktyg."*

Riktiga Claude Code-körningar (CLI 2.1.330, modell `claude-opus-5-5`), inga simuleringar.

| Steg | Utfört av | Tid | Kostnad* | Resultat |
|---|---|---|---|---|
| Utgiftsgrind | människa (operatör via `--approve-spend`) | – | – | godkänd, tak $3,00 |
| product | Claude Code, inga verktyg, `--json-schema` | 30 s | $0,0948 | Spec "Dricksräknare och notadelare", 8 acceptanskriterier |
| architect | OMEGA (deterministisk) | <1 s | – | package.json (noll beroenden), OMEGA.md, layout |
| test-author | Claude Code, får bara skriva `test/**` | 27 s | $0,1043 | `test/acceptance.test.js`, 8 tester (AC1–AC8) |
| coder | Claude Code, får bara skriva `src/**`, kan inte köra kommandon | 37 s | $0,1557 | `src/index.js`, `src/cli.js` |
| tester | OMEGA (`node --test`, rensad miljö) | 0,2 s | – | **8/8 godkända, 8/8 kriterier verifierade, exitkod 0** |
| security | OMEGA (statisk granskning) | <1 s | – | 8 filer, 0 fynd |
| docs | OMEGA | <1 s | – | README från spec + verifierade resultat + git-historik |
| Slutgranskning | – | – | – | **väntar på dig** (medvetet inte godkänd av mig) |

**Totalt: 95 s väggtid, $0,3549** (\*enligt Claude Codes egen `total_cost_usd`). Inga nekade verktygsanrop,
ingen rättningsiteration behövdes, inga policyöverträdelser.

Sidonot: steget heter "testkörning #2" i den här körningen. Det var en räknarbugg i OMEGA (den räknade
med det pågående steget); den är rättad efter körningen, se nedan. Evidensen visar körningen som den skedde.

## Oberoende kontroll (gjord av mig, utanför OMEGA)

- `npm test` i det genererade projektet: **8/8 pass**.
- `node src/cli.js 347 --dricks 10 --personer 3` →
  `Dricks: 35 kr / Totalt: 382 kr / Per person: 128, 127, 127 kr` (exit 0). Kontrollräknat: 347 × 10 % = 34,7 → 35;
  382 / 3 = 127,33 → 128 + 127 + 127 = 382.
- `node src/cli.js 1000 --personer 7` → 158 + 6 × 157 = 1100 ✓. Ogiltig indata → felmeddelande + exit 1 ✓.
- Läst koden (`project/src/index.js`, 59 rader): ren, utan beroenden, utan nätverk/`eval`/`child_process`.

## Evidenspaket i repot

`docs/evidence/real-run-msn_990c384537ee/`:

| Fil | Innehåll |
|---|---|
| `mission.json` | Uppdraget, uppgifterna, godkännandena och kostnadsposterna |
| `audit.jsonl` | Hashkedjad revisionslogg (32 poster) |
| `artifacts/agent-*.json` | Fullständiga transkript: prompt, systemprompt, CLI-argument, kostnad, antal turer, nekade anrop |
| `artifacts/spec.json`, `test-run-2.tap`, `test-report-2.json`, `security-report.json`, `test-digest.json` | Rådata från varje steg |
| `artifacts/evidence-manifest.json` | Förseglat manifest: alla hashar, commits, revisionshuvud |
| `project/` + `project.bundle` | Den genererade appen och hela dess git-historik (`git clone project.bundle`) |
| `git-log.txt` | Commit-historik med roll som författare |

Kontrollera allt själv, offline:

```
cd omega
node scripts/verify-evidence.ts docs/evidence/real-run-msn_990c384537ee
```

Resultat: **ALL 28 CHECKS PASSED** (artefakthashar, manifest, revisionskedja, att varje commit finns och är
skriven av rätt roll, att testerna inte ändrats, och att testerna går igenom på en färsk klon).
Manipulationstest: ändrar man en siffra i `agent-coder.json` rapporterar verktyget `VERIFICATION FAILED`.

## Dashboarden i en riktig webbläsare

Playwright (Chromium) mot servern med den riktiga uppdragsdatan, iPhone 13-emulering och 1280 px desktop:
inga konsolfel, inga CSP-överträdelser, ingen horisontell scroll på någon vy. Skärmdumpar i
`docs/evidence/screenshots/`:

| Fil | Vy |
|---|---|
| `01-login-phone.png` | Inloggning (token krävs) |
| `02-overview-phone.png` | Översikt, kostnad mot dygnstak, revisionskedjans status |
| `03-mission-phone.png` | Uppdraget: slutgranskning, budget, pipeline, kravtäckning, steg + evidens, git, filer |
| `04-approvals-phone.png` | Godkännandekön |
| `05-new-phone.png` | Beställningsformuläret |
| `06-audit-phone.png` | Revisionslogg med verifierad hashkedja |
| `07-system-phone.png` | Inventering, verktyg, roller och behörigheter |
| `08-mission-desktop.png`, `09-evidence-check-desktop.png` | Desktop + evidenskontrollen körd från dashboarden |

## Automatiska tester

`npm test` – 24 tester, alla gröna, ~3 s, kostar inget:

| Fil | Täcker |
|---|---|
| `core.test.ts` (12) | Tillståndsmaskin, revisionskedja + manipulation, sökvägsflykt inkl. symlänk, skrivregler per roll, exec-allow-list, miljörensning, tidsgräns, skal-injektion, budget, kö + kraschåterhämtning, atomiska skrivningar, specvalidering, TAP-tolkning, säkerhetsgranskning |
| `e2e-template.test.ts` (3) | Hela pipelinen med mallmotorn → godkännande; ärligt nej för okänd idé; omverifiering upptäcker ändrade tester |
| `claude-pipeline.test.ts` (6) | Den riktiga Claude-adaptern mot en **falsk** `claude`-binär (bara i tester): låsta CLI-argument, spend gate, **buggig kod → test misslyckas → rättningsvarv → godkänt**, bakdörr utanför scope återställs, budgetstopp, att `GH_TOKEN` aldrig når agenten |
| `server.test.ts` (3) | Vägrar icke-loopback, 401/429, säkerhetsheaders, JSON-only, sökvägsskydd, hela livscykeln via API |

Plus `npm run typecheck` (TypeScript strict, 0 fel).

## Buggar som verifieringen hittade – och som är rättade

1. **Testkörningsnumret** började på 2 (räknade det pågående steget). Rättat i `orchestrator.ts`.
2. **Token-länken fungerade inte i en redan öppen flik** (hash-byte utan omladdning). Rättat i `app.js`.
3. **Strikt CSP blockerade inline-stilar** i dashboarden (budgetstapeln m.m.). Ersatt med klasser/CSSOM.
4. **Horisontell scroll på mobil** (långa hashar/JSON). Rättat med `overflow-wrap`.
5. **Ett av mina egna tester var tomt:** e2e-testet körde `node --test test/` som barnprocess och ärvde
   `NODE_TEST_CONTEXT`, vilket får barnprocessen att alltid avsluta med 0. Rättat (ren miljö + kontroll att en
   trasig implementation faktiskt fäller samma kommando). OMEGA:s egen testare påverkades inte – den rensar
   miljön – och `NODE_TEST_CONTEXT`/`NODE_OPTIONS` står nu även uttryckligen på spärrlistan.

## Vad som *inte* är verifierat

- Ingenting har körts på din Windows-dator (ingen dator var ansluten). Windows-specifika delar
  (F:-standard, `.cmd`-shim-varning, `os.devNull` för git, PowerShell-skriptet) är skrivna men otestade.
- Mobilåtkomst via Tailscale är dokumenterad men inte uppsatt.
- Rättningsvarvet med en *riktig* modell har inte behövts i den här körningen; det är bevisat med den falska
  CLI:n i testerna.
