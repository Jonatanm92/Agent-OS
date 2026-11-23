# Säkerhetsmodell

## Hotbild

| Hot | Skydd i OMEGA v0.1 | Testat i |
|---|---|---|
| Agent skriver utanför sitt område (t.ex. kodare ändrar testerna, lägger in en bakdörr) | Claude Code körs med `--permission-mode dontAsk` och path-regler (`Edit(src/**)`); därefter jämför OMEGA `git status` mot rollens skrivregler, **återställer** överträdelser och fäller steget | `claude-pipeline.test.ts` (bakdörrstest), manuellt test i `docs/01-inventory.md` |
| Kodaren "fuskar" genom att ändra acceptanstester | Tester skrivs av en annan roll, fingeravtrycks (SHA-256 över test/) och kontrolleras före varje testkörning och i evidenskontrollen | `e2e-template.test.ts` (manipulationstest) |
| Kodaren påstår att testerna går igenom | Kodaren kan inte köra kommandon. Testerna körs av OMEGA i en rensad miljö; resultatet kommer från TAP-utdata och exitkod | `claude-pipeline.test.ts` (buggig kod → `tester#1:failed`) |
| Läckta hemligheter till agenter | Rensad miljö: bas-allow-list + rollens uttryckliga passthrough; `GH_TOKEN`, `GITHUB_TOKEN`, `AWS_*`, `AZURE_*`, `NPM_TOKEN`, `OPENAI_API_KEY`, `NODE_OPTIONS` m.fl. tas alltid bort | `core.test.ts`, `claude-pipeline.test.ts` |
| Användarens egna Claude-inställningar vidgar agentens rättigheter | `--setting-sources project` (inga `~/.claude`-regler/hooks), `--strict-mcp-config` (inga MCP-servrar), `--tools` (bara rollens verktyg) | `claude-pipeline.test.ts` (argument) + manuell körning |
| Skal-injektion | Ingen shell används någonsin (`spawn(..., { shell: false })`); exec-allow-list per roll med exakta argumentprefix | `core.test.ts` |
| Sökvägstraversering (`../`, absoluta, symlänkar, `.git`, `.env`) | `resolveInside` + realpath-kontroll, `checkRead`/`checkWrite` | `core.test.ts`, `server.test.ts` |
| Skadlig/nedladdad kod körs vid installation | Genererade projekt har noll beroenden; OMEGA kör aldrig `npm install`; säkerhetsgranskningen flaggar beroenden och install-skript | `core.test.ts` |
| Skenande kostnader | Spend gate (manuellt godkännande), tak per körning/uppdrag/dygn, kostnad bokförs från CLI:ts egen rapport | `claude-pipeline.test.ts` (budgetstopp) |
| Obehörig fjärråtkomst | Binder bara 127.0.0.1; annan adress kräver `OMEGA_ALLOW_REMOTE=1`; Bearer-token på alla API-anrop; konstant-tidsjämförelse; 10 misslyckade försök/min → 429 | `server.test.ts` |
| CSRF / XSS från agentutdata | Header-autentisering (inga cookies), JSON-only POST (415 annars), strikt CSP utan inline-skript/stil, all data renderas med `textContent` | `server.test.ts`, Playwright-körning (0 CSP-fel) |
| Manipulation av historik | Hashkedjad revisionslogg + evidensmanifest + git-commits; `omega verify` och `scripts/verify-evidence.ts` | `core.test.ts`, `verify-evidence.ts` (manipulationstest) |
| Befintliga projekt skadas | OMEGA skriver bara i `OMEGA_HOME`. Inventeringen är skrivskyddad. Inga remotes, inga pushar | – |

## Det som uttryckligen **inte** finns

- Ingen terminal, ingen endpoint som kör godtyckliga kommandon.
- Inga produktionsdeployer, inga pushar till GitHub, inga betalningar.
- Ingen bakgrundstjänst: arbetaren kör bara medan `omega serve` är igång.

## Kvarvarande risker (ärligt)

- **Genererad kod körs på värddatorn.** Testerna körs som en barnprocess med rensad miljö, tidsgräns och
  i projektkatalogen – men inte i en container. Kod som avsiktligt läser filer utanför projektet *kan* göra
  det under testkörningen. Den statiska granskningen flaggar `child_process`, nätverk och filradering i
  `src/`, men är mönsterbaserad. Starkare isolering (Docker / Windows Sandbox / separat OS-användare) är
  prioritet 1 i `REMAINING.md`.
- Agentens **läsrättigheter** är Claude Codes egna (arbetskatalogen). OMEGA verifierar skrivningar i
  efterhand men kan inte se vad agenten läste utanför projektet om CLI:t skulle tillåta det.
- Revisionsloggen är *manipulationsupptäckande*, inte *manipulationssäker*: den som har skrivrätt på disken
  kan skriva om hela kedjan. Extern förankring av huvudhashen är planerad.
- Token lagras i klartext i `OMEGA_HOME/token` (filrättighet 0600 på POSIX; på Windows ärvs katalogens ACL).
  I webbläsaren ligger den i `localStorage` för den origin som dashboarden körs på.
- Ingen TLS i OMEGA själv. HTTPS för mobilen ska komma från tunneln.

## Mobilåtkomst – rekommenderad uppsättning (inte installerad eller verifierad här)

1. Installera Tailscale på PC och telefon och logga in med samma konto.
2. Låt OMEGA lyssna på loopback som vanligt (`omega serve`).
3. Kör på PC:n `tailscale serve --bg 7420` – det publicerar porten **endast inom ditt tailnet**, med HTTPS.
   Använd **inte** `tailscale funnel` (det gör tjänsten publik på internet).
4. Öppna `https://<datornamn>.<tailnet>.ts.net/#token=<din token>` på telefonen en gång; token sparas lokalt.

Kontrollera kommandona mot Tailscales aktuella dokumentation innan du kör dem – de har inte körts i den här
miljön.
