# Kassasprint

Kassasprint är Agent-OS-modulen för en enda sak: att få ihop till hyran snabbt och sedan bygga en stabil inkomst. Revenue OS och ForgeHQ är bra system, men de har tjänat 0 kr eftersom inget erbjudande har nått en riktig människa. Kassasprint vänder på det. Systemet förbereder allt, och du lägger dina timmar på att sälja, ringa, leverera och ta betalt.

**Appen:** <https://claude.ai/artifact/9vp7Xcz7ejAa2hbr7vpMhp> (privat, fungerar i mobilen och sparar på alla dina enheter)

| Flik | Vad den gör |
|---|---|
| Läge | Hur mycket som saknas, förfallodag, belopp per dag, dagens drag och en plan för glappet |
| Drag | Inkomstidéerna sorterade efter hur snabbt pengarna kommer, med steg och länkar |
| Manus | Färdiga texter med ditt namn, nummer och dina priser ifyllda: hyresvärd, socialtjänst, Blocket, lokala inlägg, företag, bemanning, betalning |
| Pipeline | Varje lead med status, uppföljning efter tre dagar och meddelande att kopiera |
| Kassa | Logg över varje krona som kommer in, per källa |

## Sanningen om tidsplanen

Pengar som kan vara på kontot före förfallodagen kommer nästan bara från **sålda saker, småjobb åt privatpersoner som betalar med Swish, och kommunen**. Företagskunder betalar fakturor efter 10–30 dagar och lön från bemanning kommer oftast månadsvis. Därför är planen:

1. **Köp tid.** Mejla hyresvärden idag med ett förslag på delbetalning. Ansök om ekonomiskt bistånd om du inte kommer att klara hela hyran.
2. **Snabba pengar till förfallodagen.** Sälj saker och ta hemhjälpsjobb.
3. **Fyll på efter förfallodagen.** Hemsidekunder, bemanningspass och jobbansökningar betalar restskulden och nästa månad.

## 14 dagar

| När | Fokus |
|---|---|
| Fre 16 okt (idag) | Mejla hyresvärden. Ring socialtjänsten före lunch om du inte klarar hyran. Lägg ut fem saker. Posta hemhjälpsinlägget. Registrera dig hos tre bemanningsföretag eller jobbappar. Skapa konto hos Frilans Finans. |
| Lör–sön 17–18 okt | Visa och sälj saker, ta hemhjälpsjobb. Hitta 20 företag utan hemsida på Google Maps och bygg 3–5 demosidor. |
| Mån–fre 19–23 okt | Förmiddag: 10 besök eller samtal till företag med demon i mobilen, och ring bemanningsföretagen. Eftermiddag: leverera. Kväll: 10 mejl till webbshoppar som är aktiebolag. |
| Lör–sön 24–25 okt | Hemhjälp och fler annonser. |
| Mån–fre 26–30 okt | Samma loop. Driv in betalningar: Swish samma dag, förskott på hemsidor. Betala det du kan på förfallodagen enligt överenskommelsen. |

Mål: 20 kontakter om dagen. Ett ja kommer ungefär efter 15–30 riktiga kontakter. Det är en tumregel, inte en garanti.

## Demosidor till hemsideerbjudandet

```bash
cd cash-sprint
cp demo-site/leads.example.json demo-site/leads.json   # fyll i riktiga företag
npm run demo -- demo-site/leads.json --maker "Jonatan"
```

Varje företag får en mapp under `demo-site/out/`. Dra mappen till <https://app.netlify.com/drop> så får du en länk att visa. Demosidorna har en gul banderoll med texten ”Förslag till …” och är spärrade för sökmotorer. När kunden säger ja kör du samma kommando med `--live`.

Fält per lead: `name`, `category` (`frisor`, `skonhet`, `hantverkare`, `stad`, `bilverkstad`, `restaurang`, `cafe`, `djur`, `ovrigt`), `city`, `phone` eller `email`, och valfritt `address`, `hours`, `services`, `about`, `tagline`, `bookingUrl`, `facebook`, `instagram`. Använd bara uppgifter som företaget självt har publicerat.

`demo-site/out/` är undantagen från git, så riktiga företagsuppgifter hamnar inte i repot.

## Den dagliga agenten

[`agent/DAILY_AGENT.md`](agent/DAILY_AGENT.md) beskriver en körning varje morgon. Agenten letar upp och kontrollerar nya lokala leads, skriver ett personligt första meddelande till varje och lägger in dem i Kassasprints pipeline, sedan skriver den dagens fokus. Den skickar aldrig något själv.

## Regler som skyddar dig

- **Marknadsföringslagen:** mejl och sms med reklam till fysiska personer kräver samtycke i förväg, och det gäller i regel även enskilda firmor. Till dem ringer du eller går in. Aktiebolag går att mejla om du anger vem du är och att de kan tacka nej. Har någon bett dig skicka en länk går det bra.
- **Skatt:** deklarera allt. Fakturerar du företag utan egen firma går det via Frilans Finans (enligt deras frågor och svar cirka 6 % i avgift), eller via Cool Company som reserv.
- **Bedrägerier på Blocket:** ta betalt med Swish vid hämtning. Klicka aldrig på betallänkar från köpare.
- **Ärlighet:** skriv bara erfarenheter och omdömen som du faktiskt har. Texterna i Manus är skrivna så.
- **Lån:** inga SMS-lån eller snabbkrediter till hyran.

## Utveckling

```bash
cd cash-sprint
npm test          # appens logik, manusreferenser och demo-generatorn
npm run check
npm run standalone  # dist/kassasprint.html som går att öppna direkt från disk (sparar bara lokalt)
```

`app/index.html` är källan till den publicerade appen. Den sparar i appens databas när den öppnas via Claude-länken och i webbläsaren annars.
