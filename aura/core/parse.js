/* Aura — capture parser (rules, Swedish and English).
 *
 * This is a RULE ENGINE, not AI, and the interface always says so. When AI
 * is available the app may use it instead, but its answer passes through
 * the same shape and validation and is shown the same way: as candidates
 * the user confirms or corrects before anything is created.
 *
 * "I need shampoo, need to book the dentist, wash the jacket and remember
 *  Mum's birthday present" becomes
 *   Shopping  Shampoo
 *   Admin     Book the dentist
 *   Task      Wash the jacket            (runs in the machine)
 *   Reminder  Mum's birthday present     (needs a date → flagged for review)
 */
(function (root) {
  const A = root.Aura || (root.Aura = {});
  const U = A.util, M = A.model, I = A.i18n;

  const B = '(?<![\\p{L}\\p{N}])';      // word start that understands å, ä, ö
  const E = '(?![\\p{L}\\p{N}])';       // word end
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
  const words = (list) => new RegExp(`${B}(?:${list.map(esc).join('|')})${E}`, 'iu');

  /* ---------------- lexicons ---------------- */

  const LEADS = [
    // English
    "i'd like to", 'i would like to', 'i need to', 'i have to', "i've got to", 'i got to', 'i must', 'i should', 'i want to',
    'we need to', 'we have to', 'we must', 'need to', 'have to', 'got to', 'gotta', 'must', 'should',
    'remember to', "don't forget to", 'dont forget to', 'do not forget to', 'remind me to', 'remind me about', 'remind me',
    'please', 'also', 'and', 'then', 'plus', 'oh and', 'i need', 'we need', 'need',
    'remember', "don't forget", 'dont forget', 'do not forget',
    // Swedish
    'jag skulle vilja', 'jag behöver', 'jag måste', 'jag ska', 'jag borde', 'jag vill', 'vi behöver', 'vi måste', 'vi ska',
    'behöver', 'måste', 'ska', 'borde', 'komma ihåg att', 'kom ihåg att', 'glöm inte att', 'påminn mig om att', 'påminn mig att',
    'påminn mig om', 'påminn mig', 'komma ihåg', 'kom ihåg', 'glöm inte', 'också', 'även', 'och', 'sen', 'sedan', 'plus', 'att',
  ];
  const LEAD_RE = new RegExp(`^(?:${LEADS.sort((a, b) => b.length - a.length).map(esc).join('|')})${E}\\s*`, 'iu');

  const REMINDER_LEAD = words(['remember', 'remember to', "don't forget", 'dont forget', 'remind me', 'kom ihåg', 'komma ihåg', 'glöm inte', 'påminn mig']);
  const REMINDER_NOUNS = words(['birthday', 'birthday present', 'anniversary', 'present', 'gift', 'födelsedag', 'födelsedagen', 'födelsedagspresent', 'present', 'presenten', 'årsdag', 'namnsdag']);
  const SHOP_VERBS = words(['buy', 'get some', 'pick up some', 'grab', 'köpa', 'köp', 'handla', 'inhandla', 'fixa lite']);
  const ORDER_VERBS = words(['order', 'beställa', 'beställ']);
  const ADMIN_VERBS = words(['book', 'call', 'ring', 'phone', 'email', 'e-mail', 'mail', 'pay', 'renew', 'cancel', 'apply for', 'apply',
    'fill in', 'fill out', 'send', 'sign', 'register', 'return', 'submit', 'contact', 'reply to', 'follow up', 'sort out the',
    'boka', 'ringa', 'ring', 'maila', 'mejla', 'betala', 'förnya', 'säga upp', 'avboka', 'ansöka om', 'ansöka', 'fylla i',
    'skicka', 'skriva under', 'anmäla', 'deklarera', 'lämna tillbaka', 'returnera', 'kontakta', 'svara', 'följa upp', 'hämta ut']);
  const CALL_VERBS = words(['call', 'ring', 'phone', 'ringa']);
  const ADMIN_NOUNS = words(['dentist', 'doctor', "doctor's", 'gp', 'appointment', 'form', 'invoice', 'bill', 'tax', 'taxes', 'insurance',
    'school', 'preschool', 'nursery', 'daycare', 'subscription', 'bank', 'passport', 'parcel', 'package', 'delivery', 'vet', 'council',
    'tandläkare', 'tandläkaren', 'läkare', 'läkaren', 'vårdcentral', 'vårdcentralen', 'tid', 'blankett', 'blanketten', 'faktura',
    'fakturan', 'räkning', 'räkningen', 'räkningar', 'skatt', 'skatten', 'deklaration', 'försäkring', 'försäkringen', 'skola', 'skolan',
    'förskola', 'förskolan', 'dagis', 'abonnemang', 'abonnemanget', 'banken', 'pass', 'passet', 'paket', 'paketet', 'leverans', 'veterinär', 'veterinären']);
  const CHORE_VERBS = words(['wash', 'clean', 'vacuum', 'hoover', 'mop', 'tidy', 'tidy up', 'iron', 'dust', 'fold', 'defrost', 'water',
    'take out', 'empty', 'change the bed', 'do the dishes', 'do the laundry', 'put the laundry on', 'put a wash on', 'hang the washing',
    'tvätta', 'städa', 'dammsuga', 'moppa', 'plocka', 'plocka undan', 'diska', 'stryka', 'damma', 'vika', 'frosta av', 'vattna',
    'slänga', 'tömma', 'töm', 'byta lakan', 'bädda', 'panta', 'sätta på', 'hänga tvätt']);
  const CHORE_NOUNS = words(['laundry', 'washing', 'dishes', 'dishwasher', 'bathroom', 'kitchen', 'floor', 'floors', 'bedding', 'sheets',
    'rubbish', 'trash', 'bins', 'recycling', 'plants', 'fridge', 'oven', 'hallway', 'tvätt', 'tvätten', 'disk', 'disken', 'diskmaskin',
    'diskmaskinen', 'badrum', 'badrummet', 'kök', 'köket', 'golv', 'golvet', 'lakan', 'sopor', 'soporna', 'återvinning', 'pant', 'blommor',
    'blommorna', 'växter', 'kylskåp', 'kylen', 'ugn', 'ugnen', 'hallen']);
  const CLOTHES = words(['jacket', 'coat', 'jeans', 'clothes', 'towels', 'sheets', 'bedding', 'laundry', 'washing', 'trousers', 'shirt',
    'jacka', 'jackan', 'rock', 'kläder', 'kläderna', 'handdukar', 'handdukarna', 'lakan', 'lakanen', 'tvätt', 'tvätten', 'byxor', 'byxorna', 'tröja', 'tröjan']);
  const BACKGROUND = words(['put the laundry on', 'put a wash on', 'start the washing machine', 'start a wash', 'laundry', 'dishwasher',
    'washing machine', 'tvätten', 'tvättmaskin', 'tvättmaskinen', 'diskmaskin', 'diskmaskinen', 'sätta på en tvätt', 'sätt på tvätten', 'starta tvätten']);
  const EVENT_NOUNS = words(['appointment', 'meeting', 'party', 'dinner with', 'lunch with', 'coffee with', 'interview', 'match', 'game',
    'concert', 'class', 'lesson', 'training', 'practice', 'möte', 'mötet', 'kalas', 'fest', 'middag med', 'lunch med', 'fika med',
    'intervju', 'match', 'matchen', 'konsert', 'lektion', 'träning', 'träningen', 'tid hos', 'besök', 'utvecklingssamtal']);
  const IDEA_WORDS = words(['idea', 'maybe', 'someday', 'some day', 'what if', 'idé', 'kanske', 'någon gång', 'tänk om']);
  const NOTE_START = /^(note|notera|anteckning|obs)\s*[:-]\s*/iu;
  const IDEA_START = /^(idea|idé)\s*[:-]\s*/iu;
  const QUESTION_START = /^(what|which|when|where|how|who|why|do i|did i|have i|am i|is there|vad|vilka|vilken|vilket|när|var|hur|vem|varför|har jag|ska jag|finns det)\b/iu;

  /* Products → shopping category. Short and practical; unknown nouns after "buy" still work. */
  const PRODUCTS = {
    produce: ['apple', 'apples', 'banana', 'bananas', 'fruit', 'vegetables', 'veg', 'potatoes', 'onions', 'onion', 'tomatoes', 'lettuce',
      'cucumber', 'carrots', 'avocado', 'avocados', 'lemons', 'lemon', 'berries', 'äpplen', 'äpple', 'bananer', 'frukt', 'grönsaker',
      'potatis', 'lök', 'tomater', 'sallad', 'gurka', 'morötter', 'avokado', 'citron', 'citroner', 'bär'],
    dairy: ['milk', 'oat milk', 'butter', 'cheese', 'yoghurt', 'yogurt', 'cream', 'eggs', 'mjölk', 'havremjölk', 'smör', 'ost', 'fil',
      'filmjölk', 'grädde', 'ägg', 'kvarg', 'crème fraiche'],
    bread: ['bread', 'rolls', 'bagels', 'crispbread', 'tortillas', 'bröd', 'knäckebröd', 'frallor', 'limpa', 'tortilla'],
    meat: ['chicken', 'mince', 'beef', 'fish', 'salmon', 'sausages', 'ham', 'bacon', 'tofu', 'kyckling', 'köttfärs', 'fisk', 'lax',
      'korv', 'skinka', 'bacon', 'tofu'],
    pantry: ['pasta', 'rice', 'flour', 'sugar', 'coffee', 'tea', 'oil', 'olive oil', 'cereal', 'oats', 'porridge', 'spices', 'tins',
      'beans', 'lentils', 'ketchup', 'jam', 'peanut butter', 'ris', 'mjöl', 'socker', 'kaffe', 'te', 'olja', 'olivolja', 'flingor',
      'havregryn', 'kryddor', 'bönor', 'linser', 'sylt', 'jordnötssmör', 'müsli', 'muesli'],
    frozen: ['ice cream', 'frozen peas', 'frozen', 'glass', 'fryst', 'frysta ärtor'],
    drinks: ['juice', 'water', 'sparkling water', 'beer', 'wine', 'soda', 'coke', 'vatten', 'kolsyrat vatten', 'öl', 'vin', 'läsk'],
    household: ['toilet paper', 'toilet roll', 'loo roll', 'kitchen roll', 'paper towels', 'washing-up liquid', 'washing up liquid',
      'dish soap', 'detergent', 'washing powder', 'fabric softener', 'dishwasher tablets', 'bin bags', 'light bulb', 'light bulbs',
      'batteries', 'sponges', 'cleaning spray', 'foil', 'cling film', 'toalettpapper', 'hushållspapper', 'diskmedel', 'tvättmedel',
      'sköljmedel', 'maskindisk', 'diskmaskinstabletter', 'soppåsar', 'glödlampa', 'glödlampor', 'batterier', 'svampar', 'rengöringsspray', 'folie', 'plastfolie'],
    hygiene: ['shampoo', 'conditioner', 'soap', 'hand soap', 'shower gel', 'toothpaste', 'toothbrush', 'deodorant', 'razors', 'razor',
      'tampons', 'pads', 'sunscreen', 'lotion', 'moisturiser', 'moisturizer', 'floss', 'schampo', 'balsam', 'tvål', 'duschtvål',
      'tandkräm', 'tandborste', 'deo', 'rakhyvel', 'rakblad', 'tamponger', 'bindor', 'solkräm', 'hudkräm', 'tandtråd'],
    pharmacy: ['paracetamol', 'ibuprofen', 'painkillers', 'plasters', 'band-aids', 'medicine', 'vitamins', 'prescription', 'cough syrup',
      'alvedon', 'ipren', 'värktabletter', 'plåster', 'medicin', 'vitaminer', 'receptet', 'hostmedicin', 'nässpray', 'nasal spray'],
    baby: ['nappies', 'diapers', 'baby wipes', 'wipes', 'formula', 'baby food', 'blöjor', 'våtservetter', 'välling', 'barnmat', 'ersättning'],
    pets: ['cat food', 'dog food', 'cat litter', 'litter', 'kattmat', 'hundmat', 'kattsand'],
    clothing: ['rain trousers', 'rain jacket', 'rain suit', 'waterproofs', 'wellies', 'wellington boots', 'boots', 'shoes', 'trainers',
      'socks', 'tights', 'mittens', 'gloves', 'hat', 'beanie', 'scarf', 'pyjamas', 'pajamas', 'underwear', 'vest', 'snowsuit',
      'fleece', 'hoodie', 'jumper', 'sweater', 'leggings', 'overalls', 'regnbyxor', 'regnjacka', 'regnkläder', 'regnställ',
      'gummistövlar', 'stövlar', 'skor', 'gympaskor', 'strumpor', 'strumpbyxor', 'vantar', 'handskar', 'mössa', 'halsduk',
      'pyjamas', 'underkläder', 'overall', 'vinteroverall', 'fleecetröja', 'tjocktröja', 'mjukisbyxor', 'skaljacka', 'skalbyxor', 'skalkläder'],
  };
  const PRODUCT_INDEX = [];
  for (const [cat, list] of Object.entries(PRODUCTS)) for (const w of list) PRODUCT_INDEX.push([w, cat]);
  PRODUCT_INDEX.sort((a, b) => b[0].length - a[0].length);

  function productCategory(text) {
    const t = ` ${U.normalize(text)} `;
    for (const [w, cat] of PRODUCT_INDEX) {
      if (new RegExp(`${B}${esc(w)}${E}`, 'iu').test(t)) return cat;
    }
    return '';
  }

  /* Rough estimates. They are starting points the user can change. */
  const ESTIMATES = [
    [words(['put the laundry on', 'put a wash on', 'start a wash', 'start the washing machine', 'sätta på en tvätt', 'sätt på tvätten', 'starta tvätten', 'dishwasher', 'diskmaskinen']), 5, 'light', true],
    [words(['water the plants', 'vattna blommorna', 'vattna växterna', 'take out the rubbish', 'take out the trash', 'take the bins out', 'slänga soporna', 'ta ut soporna', 'töm soporna']), 5, 'light', false],
    [words(['clean the bathroom', 'städa badrummet', 'deep clean', 'storstäda']), 45, 'heavy', false],
    [words(['vacuum', 'hoover', 'dammsuga']), 20, 'medium', false],
    [words(['mop', 'moppa']), 20, 'medium', false],
    [words(['dishes', 'diska', 'disken']), 15, 'light', false],
    [words(['change the bed', 'change the bedding', 'byta lakan', 'bädda rent']), 15, 'medium', false],
    [words(['iron', 'stryka']), 25, 'medium', false],
    [words(['tidy', 'plocka undan', 'plocka']), 15, 'light', false],
    [words(['clean', 'städa']), 30, 'medium', false],
    [words(['call', 'ring', 'phone', 'ringa']), 10, 'medium', false],
    [words(['book', 'boka', 'avboka', 'cancel']), 10, 'light', false],
    [words(['email', 'e-mail', 'mail', 'maila', 'mejla', 'reply', 'svara']), 10, 'light', false],
    [words(['form', 'blankett', 'tax', 'skatt', 'deklarera', 'deklaration', 'apply', 'ansöka', 'insurance', 'försäkring']), 30, 'medium', false],
    [words(['pay', 'betala']), 10, 'light', false],
    [words(['cook', 'make dinner', 'laga mat', 'laga middag']), 40, 'medium', false],
    [words(['gym', 'workout', 'run', 'training', 'träna', 'springa', 'gymmet']), 45, 'heavy', false],
    [words(['pick up', 'hämta', 'collect']), 20, 'medium', false],
  ];

  function estimate(text, kind) {
    for (const [re, minutes, energy, bg] of ESTIMATES) {
      if (re.test(text)) return { minutes, energy, background: bg };
    }
    return { minutes: M.DEFAULT_MINUTES[kind] || 20, energy: kind === 'shopping' || kind === 'reminder' ? 'light' : 'medium', background: false };
  }

  /* ---------------- dates, times, durations ---------------- */

  const WEEKDAYS = {
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
    söndag: 0, måndag: 1, tisdag: 2, onsdag: 3, torsdag: 4, fredag: 5, lördag: 6,
  };
  const WEEKDAY_SHORT = { sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6 };
  const MONTHS = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
    jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
    januari: 1, februari: 2, mars: 3, maj: 5, juni: 6, juli: 7, augusti: 8, oktober: 10, okt: 10,
  };
  const WD_RE = '(sunday|monday|tuesday|wednesday|thursday|friday|saturday|söndag|måndag|tisdag|onsdag|torsdag|fredag|lördag)(?:s|en|ar)?';

  function endOfWorkWeek(today) {
    const wd = U.weekday(today);
    if (wd === 6) return U.addDays(today, 1);
    if (wd === 0) return today;
    return U.addDays(today, 5 - wd);
  }

  function dayFromMonth(day, month, today) {
    const year = Number(today.slice(0, 4));
    let key = `${year}-${U.pad(month)}-${U.pad(day)}`;
    if (!U.isDateKey(key) || Number.isNaN(new Date(key).getTime())) return '';
    if (U.daysBetween(today, key) < -7) key = `${year + 1}-${U.pad(month)}-${U.pad(day)}`;
    return key;
  }

  /** Pull date, time, duration and recurrence out of a clause. Returns what was found and the rest. */
  function extractWhen(clause, today) {
    let t = ` ${clause} `;
    const out = { date: '', dueDate: '', time: '', minutes: 0, recur: null, evening: false };
    const take = (re, fn) => {
      const m = re.exec(t);
      if (!m) return false;
      const ok = fn(m);
      if (ok !== false) t = t.slice(0, m.index) + ' ' + t.slice(m.index + m[0].length);
      return ok !== false;
    };

    /* recurrence first ("every monday" is not "on monday") */
    take(new RegExp(`${B}(?:every|each|varje|på)\\s+${WD_RE}${E}`, 'iu'), (m) => {
      if (/^på$/i.test(m[0].trim().split(/\s+/)[0]) && !/(ar|s)$/i.test(m[0].trim())) return false;   // "på måndag" = once
      const wd = WEEKDAYS[m[1].toLowerCase()];
      out.recur = { unit: 'week', every: 1, weekdays: [wd] };
    });
    take(new RegExp(`${B}(?:every day|daily|varje dag|dagligen|every morning|every evening|varje morgon|varje kväll)${E}`, 'iu'), () => { out.recur = { unit: 'day', every: 1, weekdays: [] }; });
    take(new RegExp(`${B}(?:every other week|every second week|fortnightly|every two weeks|varannan vecka)${E}`, 'iu'), () => { out.recur = { unit: 'week', every: 2, weekdays: [] }; });
    take(new RegExp(`${B}(?:every week|weekly|varje vecka|en gång i veckan|once a week|veckovis)${E}`, 'iu'), () => { out.recur = { unit: 'week', every: 1, weekdays: [] }; });
    take(new RegExp(`${B}(?:every month|monthly|varje månad|en gång i månaden|once a month|månadsvis)${E}`, 'iu'), () => { out.recur = { unit: 'month', every: 1, weekdays: [] }; });
    take(new RegExp(`${B}(?:every|var)\\s+(\\d+)(?::e)?\\s+(days?|weeks?|months?|dag|dagar|vecka|veckor|månad|månader)${E}`, 'iu'), (m) => {
      const u = m[2].toLowerCase();
      out.recur = { unit: /^(day|dag)/.test(u) ? 'day' : /^(week|veck)/.test(u) ? 'week' : 'month', every: Number(m[1]), weekdays: [] };
    });

    /* durations */
    take(new RegExp(`${B}(?:half an hour|en halvtimme|halvtimme|30 mins?)${E}`, 'iu'), () => { out.minutes = 30; });
    take(new RegExp(`${B}(?:an hour|one hour|en timme)${E}`, 'iu'), () => { out.minutes = 60; });
    take(/\(?\s*(?:ca\.?\s*|about\s*|~\s*)?(\d{1,3})\s*(?:min|mins|minutes|minuter|minuters|m)\b\s*\)?/iu, (m) => { out.minutes = Number(m[1]); });
    take(/\(?\s*(?:ca\.?\s*|about\s*|~\s*)?(\d(?:[.,]\d)?)\s*(?:h|hr|hrs|hours?|timmar|timme|tim)\b\s*\)?/iu, (m) => { out.minutes = Math.round(Number(m[1].replace(',', '.')) * 60); });

    /* times */
    take(/(?:\bat\s+|\bkl\.?\s*|\bklockan\s+|@\s*)(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?/iu, (m) => {
      let h = Number(m[1]); const mi = Number(m[2] || 0);
      if (m[3] && /pm/i.test(m[3]) && h < 12) h += 12;
      if (m[3] && /am/i.test(m[3]) && h === 12) h = 0;
      if (!m[3] && h >= 1 && h <= 7 && !/kl|klockan/i.test(m[0])) h += 12;
      if (h > 23 || mi > 59) return false;
      out.time = U.toClock(h * 60 + mi);
    }) || take(/\b(\d{1,2})[:.](\d{2})\b/u, (m) => {
      const h = Number(m[1]), mi = Number(m[2]);
      if (h > 23 || mi > 59) return false;
      out.time = U.toClock(h * 60 + mi);
    }) || take(/\b(\d{1,2})\s*(am|pm)\b/iu, (m) => {
      let h = Number(m[1]);
      if (/pm/i.test(m[2]) && h < 12) h += 12;
      if (/am/i.test(m[2]) && h === 12) h = 0;
      out.time = U.toClock(h * 60);
    });
    take(new RegExp(`${B}(?:at noon|noon|midday|lunchtid|vid lunch)${E}`, 'iu'), () => { out.time = out.time || '12:00'; });

    /* relative days */
    take(new RegExp(`${B}(?:the day after tomorrow|day after tomorrow|i övermorgon|övermorgon)${E}`, 'iu'), () => { out.date = U.addDays(today, 2); });
    take(new RegExp(`${B}(?:tomorrow morning|i morgon bitti|imorgon bitti)${E}`, 'iu'), () => { out.date = U.addDays(today, 1); out.time = out.time || '09:00'; });
    take(new RegExp(`${B}(?:tomorrow|tmrw|i morgon|imorgon|imorn)${E}`, 'iu'), () => { out.date = U.addDays(today, 1); });
    take(new RegExp(`${B}(?:tonight|this evening|i kväll|ikväll)${E}`, 'iu'), () => { out.date = today; out.evening = true; });
    take(new RegExp(`${B}(?:today|this morning|this afternoon|i dag|idag|i eftermiddag|i förmiddag|nu på morgonen)${E}`, 'iu'), () => { out.date = today; });
    take(new RegExp(`${B}(?:by the end of the week|by the end of this week|this week|later this week|before the weekend|i veckan|den här veckan|denna vecka|under veckan|innan helgen|före helgen)${E}`, 'iu'), () => { out.dueDate = endOfWorkWeek(today); });
    take(new RegExp(`${B}(?:next week|nästa vecka|i nästa vecka)${E}`, 'iu'), () => { out.date = U.addDays(U.startOfWeek(today), 7); });
    take(new RegExp(`${B}(?:this weekend|at the weekend|on the weekend|over the weekend|i helgen|till helgen|nu i helgen)${E}`, 'iu'), () => {
      const wd = U.weekday(today);
      out.date = wd === 6 || wd === 0 ? today : U.nextWeekday(today, 6, true);
    });
    take(new RegExp(`${B}(?:next month|nästa månad)${E}`, 'iu'), () => { out.date = U.addMonths(today.slice(0, 8) + '01', 1); });

    /* deadline weekday: "by Friday", "senast fredag" */
    take(new RegExp(`${B}(?:by|before|until|till|senast|före|innan|tills)\\s+(?:på\\s+)?${WD_RE}${E}`, 'iu'), (m) => {
      out.dueDate = U.nextWeekday(today, WEEKDAYS[m[1].toLowerCase()], true);
    });
    /* weekday: "on Thursday", "på torsdag", "Thursday" */
    take(new RegExp(`${B}(?:on\\s+|på\\s+|nu\\s+på\\s+)?${WD_RE}${E}`, 'iu'), (m) => {
      out.date = U.nextWeekday(today, WEEKDAYS[m[1].toLowerCase()], false);
    }) || take(new RegExp(`${B}(?:on|by)\\s+(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)${E}`, 'iu'), (m) => {
      const d = U.nextWeekday(today, WEEKDAY_SHORT[m[1].toLowerCase()], false);
      if (/^by/i.test(m[0])) out.dueDate = d; else out.date = d;
    });

    /* explicit dates: "5 October", "October 5th", "5 okt", "den 5:e", "5/10" */
    const monthNames = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');
    const byDue = (m) => /^(by|before|until|senast|före|innan|till)/i.test(m[0].trim());
    take(new RegExp(`${B}(?:(by|before|until|senast|före|innan|till)\\s+)?(?:on\\s+|den\\s+|the\\s+)?(\\d{1,2})(?:st|nd|rd|th|:e|:a)?(?:\\s+of)?\\s+(${monthNames})${E}`, 'iu'), (m) => {
      const d = dayFromMonth(Number(m[2]), MONTHS[m[3].toLowerCase()], today);
      if (!d) return false;
      if (m[1]) out.dueDate = d; else out.date = d;
    }) || take(new RegExp(`${B}(?:(by|before|until)\\s+)?(?:on\\s+)?(${monthNames})\\s+(\\d{1,2})(?:st|nd|rd|th)?${E}`, 'iu'), (m) => {
      const d = dayFromMonth(Number(m[3]), MONTHS[m[2].toLowerCase()], today);
      if (!d) return false;
      if (m[1]) out.dueDate = d; else out.date = d;
    }) || take(/(?:\b(by|before|until|senast|före|innan|till)\s+)?(?:\bon\s+|\bden\s+)?\b(\d{1,2})\/(\d{1,2})\b/iu, (m) => {
      const d = dayFromMonth(Number(m[2]), Number(m[3]), today);
      if (!d) return false;
      if (byDue(m)) out.dueDate = d; else out.date = d;
    }) || take(/(?:\b(by|before|until|senast|före|innan|till)\s+)?\b(?:the|den)\s+(\d{1,2})(?:st|nd|rd|th|:e|:a)\b/iu, (m) => {
      const day = Number(m[2]);
      let [y, mo] = today.split('-').map(Number);
      if (day < Number(today.slice(8))) { mo += 1; if (mo > 12) { mo = 1; y += 1; } }
      const d = `${y}-${U.pad(mo)}-${U.pad(day)}`;
      if (!U.isDateKey(d)) return false;
      if (m[1]) out.dueDate = d; else out.date = d;
    });

    if (out.evening && !out.time) out.time = '';
    out.rest = t.replace(/\s+/g, ' ').trim();
    return out;
  }

  /* ---------------- splitting ---------------- */

  const STARTERS = new RegExp(`^(?:${[
    'i ', "i'", 'we ', 'need', 'have to', 'must', 'should', 'remember', "don't", 'dont', 'remind', 'also', 'buy', 'book', 'call',
    'ring', 'email', 'pay', 'wash', 'clean', 'vacuum', 'tidy', 'take', 'change', 'water', 'pick up', 'get ', 'order', 'send',
    'renew', 'cancel', 'fix', 'sort', 'make', 'cook', 'plan', 'return',
    'jag ', 'vi ', 'behöver', 'måste', 'ska ', 'kom ihåg', 'komma ihåg', 'glöm', 'påminn', 'köpa', 'köp', 'handla', 'boka', 'ringa',
    'maila', 'mejla', 'betala', 'tvätta', 'städa', 'dammsuga', 'plocka', 'diska', 'byta', 'vattna', 'hämta', 'beställa', 'skicka',
    'förnya', 'säga upp', 'fixa', 'laga', 'planera', 'lämna', 'sen ', 'sedan', 'också', 'även',
  ].map(esc).join('|')})`, 'iu');

  function splitClauses(text) {
    const cleaned = String(text || '')
      .replace(/\r/g, '')
      .replace(/^[\s]*[-–—•·▪●*]\s+/gmu, '\n')
      .replace(/\s+[-–—]\s+/g, ', ');
    const rough = cleaned.split(/\n+|[;!?]+|\.(?=\s|$)/u).map((s) => s.trim()).filter(Boolean);
    const out = [];
    const groups = [];
    let groupId = 0;
    for (const part of rough) {
      const commaParts = part.split(/,(?!\d)|\s+(?:plus|also|även|samt)\s+/iu).map((s) => s.trim()).filter(Boolean);
      for (const cp of commaParts) {
        const pieces = cp.split(/\s+(?:and then|and|then|och sen|och sedan|och|sen|sedan)\s+/iu);
        groupId += 1;
        let buffer = '';
        for (const piece of pieces) {
          const p = piece.trim();
          if (!p) continue;
          if (!buffer) { buffer = p; continue; }
          if (STARTERS.test(p) || (isBareNoun(p) && shoppingLike(buffer)) || startsOwnThing(p)) { out.push(buffer); groups.push(groupId); buffer = p; }
          else buffer = `${buffer} ${/och|and/i.test(cp) ? (I.language() === 'sv' ? 'och' : 'and') : ''} ${p}`.replace(/\s+/g, ' ');
        }
        if (buffer) { out.push(buffer); groups.push(groupId); }
      }
    }
    const keep = out.map((c, i) => [c, groups[i]]).filter(([c]) => c.replace(/[^\p{L}\p{N}]/gu, '').length > 1);
    lastGroups = keep.map(([, g]) => g);
    return keep.map(([c]) => c);
  }
  let lastGroups = [];

  /** "…and dentist appointment Thursday at 14" — a new thing with its own time. */
  function startsOwnThing(p) {
    return EVENT_NOUNS.test(p) && /(?:\bat\s+|\bkl\.?\s*|\bklockan\s+)\d|\d{1,2}[:.]\d{2}/iu.test(p);
  }

  function isBareNoun(p) {
    const w = p.trim().split(/\s+/);
    return w.length <= 3 && !STARTERS.test(p) && !ADMIN_VERBS.test(p) && !CHORE_VERBS.test(p);
  }
  function shoppingLike(p) { return SHOP_VERBS.test(p) || !!productCategory(p) || /^(i need|need|we need|jag behöver|behöver|vi behöver)\s/iu.test(p.trim()); }

  /* ---------------- clause → candidate ---------------- */

  function stripLeads(text) {
    let t = text.trim();
    for (let i = 0; i < 4; i += 1) {
      const next = t.replace(LEAD_RE, '').trim();
      if (next === t) break;
      t = next;
    }
    return t;
  }

  function cleanTitle(text) {
    let t = String(text || '').replace(/\s+/g, ' ').trim()
      .replace(/^(to|att|some|a few|a couple of|lite|några|nya?|more|mer|fler)\s+/iu, (m) => (/^(nya?|new)\s/i.test(m) ? m : ''))
      .replace(/[\s,.;:!-]+$/u, '')
      .replace(/^[\s,.;:!-]+/u, '');
    return U.capitalize(t).slice(0, 140);
  }

  function findPerson(state, text) {
    const t = ` ${text} `;
    for (const p of state.people || []) {
      if (!p.name) continue;
      const re = new RegExp(`${B}(?:for|till|åt)\\s+${esc(p.name)}${E}`, 'iu');
      if (re.test(t)) return p.name;
    }
    return '';
  }

  function classifyClause(state, raw, today, inherited) {
    const noteMatch = NOTE_START.exec(raw);
    const ideaMatch = IDEA_START.exec(raw);
    if (noteMatch || ideaMatch) {
      const body = raw.replace(noteMatch ? NOTE_START : IDEA_START, '');
      return base(state, noteMatch ? 'note' : 'idea', cleanTitle(body), raw, {}, 0.9);
    }

    const when = extractWhen(raw, today);
    const isReminder = REMINDER_LEAD.test(raw);
    let body = stripLeads(when.rest);
    let needsFor = '';
    const needs = /^(\S+)\s+(?:needs|need|behöver|ska ha|saknar)\s+(.+)$/iu.exec(body);
    if (needs) {
      const person = (state.people || []).find((p) => p.name && p.name.toLowerCase() === needs[1].toLowerCase());
      if (person) { needsFor = person.name; body = needs[2]; }
    }
    const lowered = ` ${U.normalize(body)} `;
    const forPerson = needsFor || findPerson(state, body);
    const bodyNoPerson = forPerson ? body.replace(new RegExp(`${B}(?:for|till|åt)\\s+${esc(forPerson)}${E}`, 'iu'), '').trim() : body;

    let kind = 'task', title = bodyNoPerson, category = '', confidence = 0.6, context = 'anywhere', adminStatus = '';
    const shopVerb = SHOP_VERBS.exec(bodyNoPerson);
    const product = productCategory(bodyNoPerson);
    const wordCount = bodyNoPerson.split(/\s+/).filter(Boolean).length;

    if (IDEA_WORDS.test(raw) && !ADMIN_VERBS.test(body) && !shopVerb) {
      kind = 'idea'; confidence = 0.55;
    } else if (shopVerb && shopVerb.index <= 2 && !bodyNoPerson.slice(shopVerb.index + shopVerb[0].length).trim()) {
      kind = 'task'; context = 'out'; confidence = 0.75;
      title = I.language() === 'sv' || /handla|köp/iu.test(bodyNoPerson) ? 'Handla' : 'Go shopping';
    } else if (shopVerb && shopVerb.index <= 2) {
      kind = 'shopping';
      title = bodyNoPerson.slice(shopVerb.index + shopVerb[0].length);
      category = productCategory(title) || 'other';
      confidence = 0.9;
    } else if (needsFor && product) {
      kind = 'shopping'; category = product; confidence = 0.85;
    } else if (product && !CHORE_VERBS.test(bodyNoPerson) && !ADMIN_VERBS.test(bodyNoPerson) && wordCount <= 5) {
      kind = 'shopping'; category = product; confidence = 0.85;
    } else if (inherited === 'shopping' && wordCount <= 3 && !CHORE_VERBS.test(bodyNoPerson) && !ADMIN_VERBS.test(bodyNoPerson)) {
      kind = 'shopping'; category = product || 'other'; confidence = 0.7;
    } else if (when.time && EVENT_NOUNS.test(lowered) && !ADMIN_VERBS.test(bodyNoPerson)) {
      kind = 'event'; confidence = 0.8;
    } else if (ADMIN_VERBS.test(bodyNoPerson) || (ADMIN_NOUNS.test(lowered) && !CHORE_VERBS.test(bodyNoPerson))) {
      kind = 'admin'; adminStatus = 'action'; confidence = ADMIN_VERBS.test(bodyNoPerson) ? 0.85 : 0.65;
      if (CALL_VERBS.test(bodyNoPerson)) { category = 'call'; context = 'phone'; }
      else if (/book|boka|avboka|appointment|tid hos/iu.test(bodyNoPerson)) category = 'appointment';
      else if (/pay|betala|invoice|bill|faktura|räkning/iu.test(bodyNoPerson)) category = 'payment';
      else if (/form|blankett|apply|ansök|tax|skatt|deklar/iu.test(bodyNoPerson)) category = 'form';
      else if (/subscription|abonnemang|cancel|säga upp/iu.test(bodyNoPerson)) category = 'subscription';
      else if (/parcel|package|delivery|paket|leverans|hämta ut|return|returnera/iu.test(bodyNoPerson)) category = 'delivery';
      else if (/school|preschool|nursery|daycare|skola|förskola|dagis/iu.test(bodyNoPerson)) category = 'school';
      else category = 'other';
    } else if (isReminder || REMINDER_NOUNS.test(lowered)) {
      kind = 'reminder'; confidence = 0.75;
    } else if (CHORE_VERBS.test(bodyNoPerson) || CHORE_NOUNS.test(lowered)) {
      kind = 'task'; category = 'home'; context = 'home'; confidence = 0.8;
    } else if (ORDER_VERBS.test(bodyNoPerson)) {
      kind = 'shopping'; title = bodyNoPerson.replace(ORDER_VERBS, '').trim(); category = productCategory(title) || 'other'; confidence = 0.7;
    }

    if (kind === 'shopping') title = title.replace(/^(some|more|a|an|en|ett|lite|mer|fler)\s+/iu, '');

    const est = estimate(` ${U.normalize(bodyNoPerson)} `, kind === 'event' ? 'task' : kind);
    if (kind === 'event') est.minutes = 60;
    if (kind === 'task' && context === 'out' && /^(handla|go shopping)$/i.test(title)) est.minutes = 45;
    const extra = {
      date: when.date, dueDate: when.dueDate, time: when.time, recur: when.recur, category, context, adminStatus, forPerson,
      minutes: when.minutes || est.minutes, energy: est.energy,
      background: est.background || (kind === 'task' && /^(wash|tvätta)\b/iu.test(bodyNoPerson) && CLOTHES.test(bodyNoPerson)) || BACKGROUND.test(bodyNoPerson),
    };
    if (extra.background && !when.minutes) extra.minutes = 5;
    if (extra.background) extra.energy = 'light';
    if (kind === 'task' && extra.recur) kind = 'chore';
    if (kind === 'chore') extra.category = 'home';
    return base(state, kind, cleanTitle(title), raw, extra, confidence);
  }

  function base(state, kind, title, raw, extra, confidence) {
    const c = Object.assign({
      tempId: U.makeId('cand'), kind, title, raw: raw.trim(),
      date: '', dueDate: '', time: '', recur: null, minutes: 0, energy: 'medium', context: 'anywhere', background: false,
      category: '', adminStatus: '', forPerson: '', confidence,
    }, extra || {});
    c.review = needsReview(c);
    c.hint = hintFor(c);
    return c;
  }

  /** High-impact or ambiguous candidates are marked so the user looks before they are created. */
  function needsReview(c) {
    if (c.kind === 'event') return true;
    if (c.kind === 'reminder' && !c.date && !c.dueDate) return true;
    if (c.confidence < 0.6) return true;
    if (!c.title || c.title.length < 2) return true;
    return false;
  }

  function hintFor(c) {
    if (c.kind === 'event') return 'cap.hintEvent';
    if (c.kind === 'reminder' && !c.date && !c.dueDate) return 'cap.hintWhen';
    if (c.confidence < 0.6) return 'cap.hintKind';
    return '';
  }

  /* ---------------- public ---------------- */

  /**
   * Parse free text into candidates. Never changes anything —
   * the user confirms, and only then do the candidates become ops.
   */
  function parse(state, text, now) {
    const today = U.dateKey(now);
    const input = String(text || '').slice(0, 4000);
    const trimmed = input.trim();
    if (!trimmed) return { mode: 'rules', candidates: [], question: false };
    const question = QUESTION_START.test(trimmed) && /\?\s*$/.test(trimmed);
    if (question) return { mode: 'rules', candidates: [], question: true };

    const clauses = splitClauses(input);
    const groups = lastGroups.slice();
    const candidates = [];
    let inherited = '';
    clauses.forEach((clause, i) => {
      const c = classifyClause(state, clause, today, inherited);
      inherited = c.kind === 'shopping' ? 'shopping' : '';
      if (!c.title) return;
      c.group = groups[i];
      candidates.push(c);
    });
    /* "milk and bread tomorrow": a date said once at the end belongs to the whole shopping group. */
    for (let i = candidates.length - 1; i > 0; i -= 1) {
      const c = candidates[i], prev = candidates[i - 1];
      if (c.group === prev.group && c.kind === 'shopping' && prev.kind === 'shopping' && (c.date || c.dueDate) && !prev.date && !prev.dueDate) {
        prev.date = c.date; prev.dueDate = c.dueDate;
      }
    }
    return { mode: 'rules', candidates: candidates.slice(0, 40), question: false };
  }

  /** Candidate → op. Events become events; everything else becomes an item. */
  function toOp(c, opts) {
    const o = opts || {};
    if (c.kind === 'event') {
      const start = U.toMinutes(c.time);
      const end = start !== null ? U.toClock(start + (c.minutes && c.minutes >= 15 ? c.minutes : 60)) : '';  // events default to an hour
      return {
        op: 'event.add',
        event: { title: c.title, date: c.date || c.dueDate || o.today, start: c.time, end, recur: c.recur && c.recur.weekdays && c.recur.weekdays.length ? { weekdays: c.recur.weekdays } : null, source: o.source || 'dump' },
      };
    }
    const item = {
      kind: c.kind, title: c.title, date: c.date, dueDate: c.dueDate, time: c.time, minutes: c.minutes,
      energy: c.energy, context: c.context, background: c.background, category: c.category, recur: c.recur,
      adminStatus: c.kind === 'admin' ? (c.adminStatus || 'action') : '', forPerson: c.forPerson,
      priority: c.priority || '', source: o.source || 'dump', note: c.note || '',
    };
    if (item.kind === 'chore' && item.recur && !item.dueDate) item.dueDate = item.date || o.today || '';
    if (o.inbox) item.status = 'inbox';
    return { op: 'item.add', item };
  }

  /** Quick add from a single line (My Day): one item, no preview needed for low-impact text. */
  function quick(state, text, now) {
    const r = parse(state, text, now);
    if (r.candidates.length === 1) return r.candidates[0];
    const today = U.dateKey(now);
    const when = extractWhen(text, today);
    return base(state, 'task', cleanTitle(stripLeads(when.rest) || text), text,
      { date: when.date, dueDate: when.dueDate, time: when.time, minutes: when.minutes || 20 }, 0.7);
  }

  A.parse = {
    parse, splitClauses, extractWhen, classifyClause, productCategory, estimate, toOp, quick, stripLeads, cleanTitle, needsReview,
    PRODUCTS,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
