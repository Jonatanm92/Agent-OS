# Levande sagor

Barnets teckning fotograferas, klipps ut och vaknar till liv. Claude skriver en svensk saga om just den figuren, ritar en bild till varje sida och läser upp sagan.

Det här är den fristående versionen. Den fungerar i vilken telefon som helst, utan Claude-konto, och kan läggas på hemskärmen som en app.

## Hur det hänger ihop

- `app/levande-sagor.html` är själva appen. Det är samma fil som Claude-artefakten.
- `public/` är det som läggs ut och byggs från appen med `npm run build`. Där finns också:
  - ikoner och manifest
  - offline-stöd (`sw.js`)
  - `claude-shim.js`, som kopplar appen till den egna servern i stället för ett Claude-konto
- `src/worker.ts` är servern, en Cloudflare Worker. Den lämnar ut appen och har en enda adress, `/api/claude`, som skickar vidare till Claude.
  - API-nyckeln finns bara på servern.
  - Telefonen behöver bara en familjekod.
  - Ingenting sparas eller loggas på servern.
- Figurer och sagor sparas bara i telefonen som använder appen.

## Lägga ut appen (en gång)

1. **Skaffa en API-nyckel** på [console.anthropic.com](https://console.anthropic.com). Lägg in en månadsgräns för kostnaderna där, så att räkningen aldrig kan skena.
2. **Skapa ett gratis konto** på [Cloudflare](https://dash.cloudflare.com/sign-up).
3. **Kör de här kommandona i den här mappen:**

   ```bash
   npm install
   npx wrangler login                          # loggar in i Cloudflare via webbläsaren
   npx wrangler secret put ANTHROPIC_API_KEY   # klistra in nyckeln
   npx wrangler secret put APP_CODE            # hitta på en familjekod, t.ex. tre ord
   npm run deploy
   ```

   Sista steget skriver ut adressen, till exempel `https://levande-sagor.<ditt-namn>.workers.dev`.
4. **Skicka länken med koden:** `https://levande-sagor.<ditt-namn>.workers.dev/?kod=DIN-KOD`.
   - Första gången appen öppnas sparar telefonen koden och tar bort den ur adressen.
   - **iPhone:** öppna länken i Safari, tryck på Dela och välj **Lägg till på hemskärmen**.
   - **Android:** öppna länken i Chrome, öppna menyn och välj **Installera app**.

## Uppdatera

Kopiera in den nya versionen av appen till `app/levande-sagor.html` och kör `npm run deploy`. Telefonerna får den nya versionen nästa gång appen öppnas med nätuppkoppling.

## Kostnad

Varje saga kostar ett anrop till Claude för texten och ett anrop för varje bild. Hur mycket det blir beror på hur långa sagorna och bilderna är. Följ förbrukningen i Anthropic-konsolen och sätt en gräns där.

## Prova lokalt

```bash
printf 'APP_CODE=test\nANTHROPIC_API_KEY=din-nyckel\n' > .dev.vars
npm run dev          # öppna http://localhost:8787/?kod=test
```
