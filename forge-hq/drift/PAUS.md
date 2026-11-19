# Dagsmotorn är pausad (2026-11-19)

Pausad enligt det som aviserades i briefarna 24 och 26 oktober: inget svar från VD sedan
2026-10-07 och inget CV, så inga ansökningar har kunnat skickas. Den schemalagda körningen
(trigger `trig_012GrEnaHsnT5HYy1LoVQCuw`, måndag och torsdag 06:52) är avstängd, inte borttagen.

## Läge vid paus
- Senaste brief: `dagsbrief/2026-10-26.md`. Alla signaler och statusar finns i `signals.csv`.
- Tipsen i briefarna är från oktober; de flesta sista ansökningsdagar har passerat.
  Kör om motorn innan något söks.

## Starta igen
Skriv i chatten, till exempel "starta motorn igen" eller klistra in CV-texten. Då
- slås triggern på igen (samma schema eller det du väljer),
- körs `node forge-hq/drift/signals.mjs` med färska annonser,
- görs ansökningar till de bästa aktuella tipsen så fort CV:t finns.

Inget annat behöver byggas om – strategin (`../strategi-grill-10x-2026-10-07.md`),
motorinstruktionen (`MOTOR.md`), leadkällor och verktyg ligger kvar.
