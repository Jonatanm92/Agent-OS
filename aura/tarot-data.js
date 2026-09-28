const BASE_TAROT_CARDS = [
  { number: 0, name: "Narren", symbol: "✦", color: "sun", upright: "En början med öppet sinne. Nyfikenhet får gå före perfektion.", reversed: "En paus innan språnget. Känn efter vad som är mod och vad som bara är brådska.", prompt: "Vad skulle jag prova om jag fick börja försiktigt?" },
  { number: 1, name: "Magikern", symbol: "∞", color: "plum", upright: "Lägg märke till resurserna som redan finns nära. Samla en av dem kring en tydlig avsikt.", reversed: "Kraften är splittrad. Välj ett verktyg och en riktning i stället för att göra allt.", prompt: "Vilken förmåga använder jag för lite just nu?" },
  { number: 2, name: "Översteprästinnan", symbol: "☾", color: "night", upright: "Det tysta vetandet får plats. Lyssna innan du förklarar.", reversed: "Det kan vara svårt att höra sig själv under allt brus. Skapa en minut av stillhet.", prompt: "Vad vet jag redan, under alla andras röster?" },
  { number: 3, name: "Kejsarinnan", symbol: "❀", color: "rose", upright: "Omsorg, skapande och sinnliga behov vill tas på allvar.", reversed: "Du kanske ger mer näring än du tar emot. Rikta lite av omsorgen hemåt.", prompt: "Vad behöver få växa långsamt hos mig?" },
  { number: 4, name: "Kejsaren", symbol: "♜", color: "clay", upright: "Struktur kan vara omtanke. En vänlig gräns gör nästa steg tryggare.", reversed: "För mycket kontroll skapar stelhet. Vilken regel kan mjukna utan att allt faller?", prompt: "Vilken gräns skulle skapa mer lugn?" },
  { number: 5, name: "Översteprästen", symbol: "⌂", color: "sage", upright: "Lärdom och gemenskap bär. Ta stöd av det som redan prövats.", reversed: "En gammal sanning kanske inte längre passar. Behåll visdomen, ompröva formen.", prompt: "Vilken tradition hjälper mig — och vilken har jag vuxit ur?" },
  { number: 6, name: "De älskande", symbol: "♡", color: "rose", upright: "Värderingar och val möts. Välj det som känns sant, inte bara bekvämt.", reversed: "Något skaver mellan vilja och handling. Möt skillnaden utan att döma.", prompt: "Vilket val ligger närmast det jag verkligen värderar?" },
  { number: 7, name: "Vagnen", symbol: "➶", color: "blue", upright: "Riktning skapas av fokuserad rörelse. Håll tyglarna mjukt men bestämt.", reversed: "Farten kanske döljer att riktningen är oklar. Stanna och välj om.", prompt: "Vad vill jag faktiskt föra framåt?" },
  { number: 8, name: "Styrkan", symbol: "♌", color: "gold", upright: "Mjuk styrka håller längre än tvång. Mod kan låta stilla.", reversed: "Självtvivlet har fått mikrofonen. Tala till dig själv som till någon du älskar.", prompt: "Hur ser varsamt mod ut i dag?" },
  { number: 9, name: "Eremiten", symbol: "✧", color: "night", upright: "Ensam tid kan göra riktningen synlig. Sök ett ärligt ljus, inte alla svar.", reversed: "Avskildhet riskerar att bli isolering. Bjud in en trygg röst.", prompt: "Vilken fråga behöver få vara obesvarad en stund?" },
  { number: 10, name: "Lyckohjulet", symbol: "◉", color: "plum", upright: "En cykel rör sig. Du behöver inte kontrollera allt för att svara klokt.", reversed: "Motstånd mot förändring kan vara tröttande. Hitta det lilla du faktiskt kan påverka.", prompt: "Vad förändras, och vad kan jag välja mitt i det?" },
  { number: 11, name: "Rättvisan", symbol: "⚖", color: "blue", upright: "Klarhet kommer när fakta och värderingar får mötas. Var både ärlig och vänlig.", reversed: "Något vägs på en orättvis våg. Lägg till sammanhang innan du dömer.", prompt: "Vilken sanning behöver både ansvar och medkänsla?" },
  { number: 12, name: "Den hängde", symbol: "◇", color: "sage", upright: "Ett nytt perspektiv kan vara mer värdefullt än snabb handling.", reversed: "Pausen har blivit stillastående. Välj ett mycket litet experiment.", prompt: "Vad ser annorlunda ut om jag vänder på frågan?" },
  { number: 13, name: "Döden", symbol: "✤", color: "night", upright: "Ett avslut frigör plats. Förändring behöver inte betyda katastrof.", reversed: "Du håller kanske fast i något som redan är färdigt. Sörj och släpp i din takt.", prompt: "Vad får vara klart nu?" },
  { number: 14, name: "Måttfullheten", symbol: "≈", color: "blue", upright: "Balans byggs genom små justeringar, inte genom perfektion.", reversed: "Ytterligheter drar åt varsitt håll. Leta efter den vänliga mitten.", prompt: "Vad kan jag blanda, förenkla eller dosera mjukare?" },
  { number: 15, name: "Djävulen", symbol: "♟", color: "clay", upright: "Se bandet utan skam. När mönstret blir synligt uppstår ett val.", reversed: "Greppet börjar lossna. Stöd den friheten med en konkret gräns.", prompt: "Vilket mönster tar mer än det ger?" },
  { number: 16, name: "Tornet", symbol: "ϟ", color: "rose", upright: "Om något känns skakigt eller inte längre håller, sök trygg mark och ta en sak i taget.", reversed: "Förändringen sker inuti eller i det lilla. Du får förbereda dig utan att förutse allt.", prompt: "Vad står kvar när det oväsentliga faller bort?" },
  { number: 17, name: "Stjärnan", symbol: "✷", color: "blue", upright: "Hoppet behöver inte vara högljutt för att vara verkligt. Följ nästa lilla ljuspunkt.", reversed: "Kontakten med hoppet känns svag. Låna hopp av någon annan en stund.", prompt: "Vilken liten sak ger mig tillbaka framtidskänslan?" },
  { number: 18, name: "Månen", symbol: "☽", color: "night", upright: "Allt är inte tydligt ännu. Känslor är viktig information, men inte alltid hela kartan.", reversed: "Dimman lättar, eller så behöver förvirringen sorteras med fakta. Skriv ner vad du vet säkert.", prompt: "Vad är känsla, vad är fakta och vad är fortfarande okänt?" },
  { number: 19, name: "Solen", symbol: "☼", color: "gold", upright: "Värme och livskraft får synas. Ta emot det goda utan att förminska det.", reversed: "Glädjen är kanske dämpad, inte borta. Leta efter det som faktiskt är en procent lättare.", prompt: "Vad vill jag fira utan att ursäkta mig?" },
  { number: 20, name: "Domen", symbol: "↟", color: "plum", upright: "Ett ärligt uppvaknande kallar dig framåt. Lär av det som varit utan att bo där.", reversed: "Den inre domaren pratar för högt. Byt domslut mot nyfiken utvärdering.", prompt: "Vad vill jag svara ja till nu?" },
  { number: 21, name: "Världen", symbol: "◌", color: "sage", upright: "En hel cirkel. Erkänn vad du har slutfört och bär lärdomen vidare.", reversed: "Något litet återstår för att få avslut. Definiera vad ‘klart nog’ betyder.", prompt: "Vad är färdigt nog för att få vila?" }
];

const TAROT_GUIDANCE = {
  0: {
    practice: "Öppna Anteckningar. Skriv en sak du är nyfiken på och ett test som tar högst fem minuter. Gör testet och stanna när fem minuter har gått.",
    body: "Var i kroppen känns nyfikenhet, och var känns tvekan?",
    relationship: "Vem kan du be om sällskap utan att lämna över beslutet?"
  },
  1: {
    practice: "Lägg telefonen med skärmen nedåt. Välj ett verktyg du redan har — kalender, penna eller dator — och använd bara det i tio minuter. Stanna när timern ringer.",
    body: "Vad händer med hållning och andetag när du känner dig handlingskraftig?",
    relationship: "Hur kan du uttrycka din avsikt tydligt utan att styra den andre?"
  },
  2: {
    practice: "Sätt en timer på en minut och stäng av musik och notiser. Skriv sedan den första meningen som kommer i Anteckningar. Stanna efter mening ett.",
    body: "Vilken kroppssignal märks när något känns sant för dig?",
    relationship: "Vilken fråga kan du lyssna på utan att genast försöka lösa den?"
  },
  3: {
    practice: "Välj en växt, måltid, text eller skapande sak framför dig. Ge den tjugo minuter utan andra flikar och avsluta när timern ringer.",
    body: "Vilken enkel form av vila, mat eller rörelse känns omhändertagande nu?",
    relationship: "Vad skulle du vilja ta emot lika öppet som du brukar ge?"
  },
  4: {
    practice: "Öppna kalendern och lägg ett block på femton minuter för dagens viktigaste sak. Skriv också vad du inte gör under blocket. Stanna när tiden är bokad.",
    body: "Mjukna i käke och axlar och känn efter vad som fortfarande behöver stadga.",
    relationship: "Vilken gräns behöver sägas med både tydlighet och respekt?"
  },
  5: {
    practice: "Välj ett råd du redan har fått av en trygg person. Prova rådet i tio minuter och skriv därefter en rad: ‘Det här hjälpte / hjälpte inte därför att …’",
    body: "Hur reagerar kroppen när du följer en regel som passar — eller inte passar?",
    relationship: "Vems erfarenhet vill du fråga efter utan att göra den till facit?"
  },
  6: {
    practice: "Skriv en värdering som betyder mycket för dig, till exempel ärlighet eller omtanke. Skriv en handling under den och gör bara den handlingen i dag.",
    body: "Känn skillnaden mellan ett avslappnat ja och ett spänt ja.",
    relationship: "Vad behöver sägas för att ett val ska bli ärligt för er båda?"
  },
  7: {
    practice: "Öppna Anteckningar och skriv nästa synliga handling, till exempel ‘lägg brevet i kuvertet’. Gör handlingen och stanna direkt när den är klar.",
    body: "Behöver kroppen mer framåtrörelse eller en broms innan du fortsätter?",
    relationship: "Hur kan du berätta vart du är på väg utan att kräva samma tempo?"
  },
  8: {
    practice: "Skriv den hårdaste meningen du säger till dig själv. Skriv om den som om du talade till din bästa vän. Läs den nya meningen högt en gång och stanna.",
    body: "Kan du sänka kraften ett steg och ändå känna dig stadig?",
    relationship: "Hur kan du vara både varsam och uppriktig i nästa samtal?"
  },
  9: {
    practice: "Sätt telefonen på stör ej i tio minuter. Sitt utan ljud och skriv sedan en enda fråga som fortfarande finns kvar. Stanna efter frågetecknet.",
    body: "Känns ensamheten återhämtande eller dränerande i kroppen just nu?",
    relationship: "Vem kan få veta att du behöver närhet, utrymme eller både och?"
  },
  10: {
    practice: "Dra ett lodrätt streck på ett papper. Skriv ‘kan påverka’ till vänster och ‘får vänta’ till höger. Placera tre saker och stanna efter sak tre.",
    body: "Vilken fysisk spänning kan du släppa när allt inte måste kontrolleras?",
    relationship: "Vad har förändrats mellan er som behöver ett nytt samtal?"
  },
  11: {
    practice: "Skriv exakt tre rader: ‘Fakta: …’, ‘Min tolkning: …’ och ‘Jag behöver: …’. Sätt punkt efter den tredje raden och fatta inget beslut förrän alla tre finns.",
    body: "Blir kroppen mer samlad när du tänker på ett rättvist nästa steg?",
    relationship: "Vilket ansvar är ditt, och vilket behöver den andre bära själv?"
  },
  12: {
    practice: "Skriv frågan högst upp på en sida. Skriv sedan ett svar som börjar ‘Om motsatsen också kunde vara sann …’. Skriv i fem minuter och stanna när timern ringer.",
    body: "Vad förändras när du släpper kravet på att agera omedelbart?",
    relationship: "Vad skulle du förstå bättre om du frågade innan du förklarade?"
  },
  13: {
    practice: "Välj ett gammalt utkast, ett plagg eller en sak som är färdig för dig. Arkivera, skänk eller lägg den i en tydligt märkt låda. Stanna efter en sak.",
    body: "Vilken känsla vill kroppen få utrymme att röra sig igenom i egen takt?",
    relationship: "Vad behöver få ett tydligt avslut, en paus eller en ny form?"
  },
  14: {
    practice: "Välj en vana du redan gör. Gör den två minuter kortare eller enklare i dag, till exempel fem minuters promenad i stället för ingen. Stanna vid den nya gränsen.",
    body: "Vad längtar kroppen mest efter just nu: lite rörelse, mindre brus eller en mjuk paus?",
    relationship: "Var kan ni mötas halvvägs utan att någon överger ett viktigt behov?"
  },
  15: {
    practice: "Skriv ‘När jag vill ___ brukar jag ___’. Sätt sedan en timer på två minuter innan du gör vanan. Under pausen tar du fem långsamma steg i rummet.",
    body: "Vilken impuls växer när du är pressad, och vad händer om du väntar ett andetag?",
    relationship: "Vilket mönster mellan er behöver beskrivas utan skuld eller skam?"
  },
  16: {
    practice: "Sätt dig på en stol, ta fem klunkar vatten och skriv namnet på den enda person eller uppgift som behöver din uppmärksamhet först. Stanna efter namnet.",
    body: "Vilken enkel signal visar att du behöver sakta ner innan du väljer nästa steg?",
    relationship: "Vilken konkret hjälp eller tydlighet behöver du be om nu?"
  },
  17: {
    practice: "Gör en sak som gör morgonen lättare: fyll vattenflaskan, lägg fram kläder eller skriv första kalenderpunkten. Välj en och stanna när den är klar.",
    body: "Var märks minsta antydan till lättnad eller rymd i kroppen?",
    relationship: "Vem kan du dela ett försiktigt hopp med utan att behöva försvara det?"
  },
  18: {
    practice: "Skriv fem numrerade rader: två fakta, två känslor och en fråga du behöver få svar på. Stanna efter rad fem och kontrollera bara frågan senare.",
    body: "Vilken kroppssignal säger att du behöver pausa och samla mer fakta innan du tolkar vidare?",
    relationship: "Vilken oklarhet kan du fråga om direkt i stället för att fylla i själv?"
  },
  19: {
    practice: "Välj dagens tydligaste glädjeämne — en smak, låt, person eller utsikt. Lägg undan mobilen och ge det exakt en minut. Stanna när minuten är slut.",
    body: "Hur känns det att låta ansiktet, bröstet eller magen ta emot något gott?",
    relationship: "Vilken uppskattning kan du uttrycka konkret och utan förbehåll?"
  },
  20: {
    practice: "Skriv ‘Förra gången lärde jag mig …’. Skriv sedan ett nytt svar du kan ge i dag och använd bara den första meningen. Stanna efter svaret.",
    body: "Vad händer i kroppen när självkritik byts mot ärlig nyfikenhet?",
    relationship: "Vad behöver du ta ansvar för — och vad behöver du sluta straffa dig för?"
  },
  21: {
    practice: "Välj en färdig uppgift. Stryk den från listan, stäng dess flik och lägg undan materialet. Säg ‘klart’ högt och stanna innan du öppnar nästa sak.",
    body: "Stanna upp en stund: var i kroppen märks känslan av ‘jag gjorde det’?",
    relationship: "Vad vill du tacka, erkänna eller lämna vidare efter den här etappen?"
  }
};

export const TAROT_CARDS = BASE_TAROT_CARDS.map((card) => ({
  ...card,
  ...TAROT_GUIDANCE[card.number],
  image: `/assets/tarot/major-${String(card.number).padStart(2, "0")}-card.jpg`
}));

export const SPREAD_LABELS = ["Det jag bär med mig", "Det som ber om närvaro", "Ett möjligt nästa steg"];
