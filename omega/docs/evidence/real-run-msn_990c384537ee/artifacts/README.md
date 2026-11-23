# Dricksräknare och notadelare

Ett litet Node.js-bibliotek med kommandoradsverktyg. Det räknar ut dricks på ett belopp, avrundar till hela kronor och delar totalen mellan flera personer. Andelarna är hela kronor och summerar exakt till totalen.

## Usage

```js
import { roundKronor, calculateTip, splitBill } from './src/index.js';
```

- `roundKronor` `roundKronor(value: number): number` — Avrundar till närmaste hela krona. Exakt ,5 avrundas uppåt och små flyttalsfel hanteras.
- `calculateTip` `calculateTip(amount: number, tipPercent: number): number` — Räknar ut dricksen i hela kronor: roundKronor(amount * tipPercent / 100).
- `splitBill` `splitBill({ amount: number, tipPercent?: number = 10, people?: number = 1 }): { tip: number, total: number, shares: number[] }` — Räknar ut dricks och total och delar totalen i heltalsandelar som summerar exakt till totalen. Kastar RangeError vid ogiltig indata.

### Command line

```sh
node src/cli.js <belopp> [--dricks <procent>] [--personer <antal>]
node src/cli.js 347 --dricks 10 --personer 3
node src/cli.js 100
node src/cli.js 250 --personer 4
```

## Run the tests

```sh
npm test
```

Requires Node.js 22+. No dependencies.

## Acceptance criteria and verified status

| Id | Criterion | Status |
|----|-----------|--------|
| AC1 | roundKronor(2.5) === 3, roundKronor(2.49) === 2, roundKronor(0) === 0 och roundKronor(34.7) === 35. | pass |
| AC2 | calculateTip(347, 10) === 35 och calculateTip(200, 15) === 30. | pass |
| AC3 | splitBill({ amount: 347, tipPercent: 10, people: 3 }) deepStrictEqual { tip: 35, total: 382, shares: [128, 127, 127] }. | pass |
| AC4 | splitBill({ amount: 100 }) deepStrictEqual { tip: 10, total: 110, shares: [110] } (standardvärden 10 % och 1 person). | pass |
| AC5 | För flera kombinationer, minst amount i {0, 1, 99.9, 347, 1000} × people i {1, 2, 3, 7}, gäller följande: shares har längden people, alla andelar är heltal, summan av shares är lika med total och största minus minsta andel är högst 1. | pass |
| AC6 | splitBill kastar RangeError för amount: -1, amount: NaN, tipPercent: -5, people: 0 och people: 2.5. | pass |
| AC7 | Kommandot 'node src/cli.js 347 --dricks 10 --personer 3' avslutar med kod 0. Det skriver exakt raderna 'Dricks: 35 kr', 'Totalt: 382 kr' och 'Per person: 128, 127, 127 kr' till stdout. | pass |
| AC8 | Kommandona 'node src/cli.js abc' och 'node src/cli.js 100 --personer 0' avslutar båda med kod 1 och skriver en icke-tom text till stderr. | pass |

Independent test run #2 by OMEGA: 8/8 passed, exit code 0.

Security scan: 0 high, 0 medium, 0 findings in total.

## Not included in this version

- Ojämn fördelning, där personer betalar olika andelar eller för egna rätter
- Andra valutor än kronor och valutaomräkning
- Avrundning till annat än hela kronor, t.ex. närmaste 5 eller 10 kr
- Moms- eller kvittoberäkningar
- Grafiskt gränssnitt eller webbgränssnitt
- Lokalisering till andra språk
- Att spara historik eller tidigare notor
- JSON-utdata från CLI:t

## Provenance

Built by OMEGA mission `msn_990c384537ee` (engine: claude-code, model: claude-opus-5-5).

- `5d88a4b923` OMEGA architect: [omega:architect] Scaffolded package.json, .gitignore, OMEGA.md, src/.gitkeep, test/.gitkeep
- `f57ca1ddf1` OMEGA test-author: [omega:test-author] 1 test file(s): I've written the acceptance tests in `test/acceptance.test.js`, one test for each criterion AC1–AC8. I …
- `e99429dbfa` OMEGA coder: [omega:coder] I wrote `src/index.js` and `src/cli.js`. I couldn't run anything here, so the tests haven't been run; I checked the exp…

Generated documentation — review before publishing.
