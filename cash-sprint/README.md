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

Huvudspåret är **Hemsida på 24 timmar** till lokala företag, eftersom det är det spår där systemet kan göra nästan allt arbete: hitta företagen, kontrollera dem, bygga demosidan och skriva manuset. Du går in, visar och tar betalt.

- Frilans Finans betalar ut lönen **fem bankdagar efter att fakturan godkänts**, utan att vänta på att kunden betalar (enligt deras frågor och svar). Ett ja med faktura på måndag kan alltså ge pengar före den 30:e.
- Räkna med ungefär **hälften netto**. En hemsida för 2 900 kr plus moms ger cirka 1 300–1 400 kr efter avgift, arbetsgivaravgift och skatt. Appen räknar netto.
- Sålda saker och småjobb åt privatpersoner som betalar med Swish går ännu snabbare. Kör dem parallellt i helgen.
- Mejla hyresvärden idag med ett förslag på delbetalning, och ansök om ekonomiskt bistånd om du inte kommer att klara hela hyran.

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

Varje företag får en mapp under `demo-site/out/`. Dra hela `out`-mappen till <https://app.netlify.com/drop> så får du en adress som `https://namn.netlify.app`. Klistra in den i Kassasprint under Läge → Dina uppgifter och priser, så får varje lead med `demoPath` rätt demolänk automatiskt. Demosidorna har en gul banderoll med texten ”Förslag till … från <maker>” och är spärrade för sökmotorer. När kunden säger ja kör du samma kommando med `--live`.

Fält per lead: `name`, `category` (`frisor`, `skonhet`, `hantverkare`, `stad`, `bilverkstad`, `restaurang`, `cafe`, `djur`, `ovrigt`), `city`, minst ett av `phone`, `email` och `address`, och valfritt `slug`, `hours`, `services`, `servicesAreExamples`, `about`, `tagline`, `bookingUrl`, `facebook`, `instagram`. Använd bara uppgifter som företaget självt har publicerat. Saknas riktiga tjänster visar banderollen att de är exempel.

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
