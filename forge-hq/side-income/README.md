# Sidoinkomst – driftmanual

Snabb inkomst nu (hemsidefixar åt småföretag) medan Checkout Lockdown byggs enligt
`../launch-plan-30-day-checkout-lockdown-2026-10-06.md`.

## Roller

| Roll | Vem | Ansvar |
|---|---|---|
| **VD** | Du | Stora beslut, kundkontakt i ditt namn, skicka meddelanden, ta betalt, godkänna leveranser |
| **Projektledare / expert** | Claude | Plan, prioritering, bygga verktyg och agenter, skriva utkast, kvalitetskontroll |
| **Leadagent** | `site-check.mjs` | Hittar konkreta fel på hemsidor och skriver säljutkast |
| **Säljagent** | Studio-skill *Sälj: Svar och uppföljning* | Svarsutkast till kunder som svarat |
| **Leveransagent** | Studio-skill *Leverans: Hemsidetexter* | Första utkast till nya texter för kundens sida |

Agenterna skickar aldrig något själva. Allt som når en kund går via dig.

## Beslut som väntar på VD

1. **Stad/område** att leta kunder i (påverkar vilka sidor leadagenten kör på).
2. **Priser:** förslaget nedan, eller justera.
3. **Fakturering:** Swish privat för de första småjobben + deklarera, eller egenanställning
   (t.ex. Frilans Finans / Cool Company) från start. Rekommendation: egenanställning, så
   blir skatt och avgifter rätt från första kronan.

## Ikväll – checklista

- [ ] **18:00** Skriv ner 20 småföretag: först de du eller familjen känner, sedan lokala
      (frisör, hantverkare, restaurang, butik). Lägg in dem i `leads.csv`.
- [ ] **18:30** Kör leadagenten på deras sidor:
      `node forge-hq/side-income/site-check.mjs --file urls.txt`
      Hoppa över sidor utan fynd.
- [ ] **18:45** Öppna varje sida själv och **bekräfta felet med egna ögon**.
- [ ] **19:00** Skicka 15–20 meddelanden (mallar nedan). Bekanta först – de svarar ikväll.
- [ ] **19:30–21:30** Leverera till den som svarar (checklista nedan). Claude hjälper live.
- [ ] **21:30** Uppdatera `leads.csv`. Följ upp imorgon kl 10, inte ikväll.

Realistiskt utfall: 15–20 meddelanden till bekanta och lokala ger några svar. Ett jobb
ikväll är ett bra resultat; noll är inte ett misslyckande – svaren kommer ofta dagen efter.

## Priser (förslag)

| Jobb | Pris | Tid med AI |
|---|---|---|
| Ta bort standardtext/platshållare, uppdatera sidfot | 300–600 kr | 15–30 min |
| Klickbart telefonnummer + kontaktknapp | 200–400 kr | 15 min |
| Kontaktformulär | 400–800 kr | 30–45 min |
| Titel och Google-beskrivning för huvudsidorna | 300–600 kr | 30 min |
| Skriva om startsidans texter | 600–1 200 kr | 1–2 h |
| Mobilanpassning / SSL | 600–1 500 kr | beror på tema/webbhotell – kolla först |

Betalning först när kunden är nöjd. Det är ditt starkaste säljargument när du saknar
referenser.

## Mallar

**Bekant / familjens kontakt**
> Hej [namn]! Jag har börjat hjälpa småföretag med hemsidor. Jag tittade på er sida och
> såg att [konkret fel]. Jag kan fixa det ikväll eller imorgon för [pris] – du betalar
> när du är nöjd. Ska jag?

**Lokalt företag (e-post/kontaktformulär/Instagram-DM)**
Använd utkastet från leadagenten. Ändra alltid minst en mening så att det låter som du.

**Uppföljning (en gång, nästa dag)**
> Hej igen! Ville bara höra om du såg mitt meddelande om [fel] på er sida. Inga problem
> om det inte passar – då hör jag inte av mig mer.

**Efter leverans**
> Klart! [Kort vad du gjort.] Swish/faktura: [uppgifter]. Känner du någon mer företagare
> som behöver hjälp med sin sida tar jag gärna emot tips.

## Leveranschecklista

1. **Få åtkomst säkert:** be kunden skapa ett eget WordPress-konto åt dig (Användare →
   Lägg till ny). Be aldrig om deras eget lösenord, och ta inte emot lösenord via SMS.
2. **Säkerhetskopia före ändring** (webbhotellets backup eller plugin). Ingen backup = ingen
   ändring.
3. Gör ändringen. Låt Claude/ChatGPT skriva utkast; du läser och godkänner varje rad.
4. Kontrollera på mobil och dator.
5. Skicka "klart"-meddelandet med före/efter-bild.
6. Be kunden ta bort ditt konto när de betalat.

Säg nej till: webbshoppar med betalningar ikväll, sajter utan backup, allt du inte förstår.

## Rytm

- **Varje dag:** 10 nya meddelanden, följ upp gårdagens, leverera.
- **Varje söndag:** VD-möte (15 min) – Claude sammanfattar `leads.csv`, du beslutar.
- **Parallellt:** Checkout Lockdown enligt 30-dagarsplanen.

## Vad Claude inte kan

Claude kan inte skicka meddelanden, ha konton, ta emot betalningar eller jobba när
ingen session är öppen. Repot är minnet: allt som ska överleva sparas här.
