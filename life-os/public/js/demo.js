// Realistic, deterministic example data so the app can be explored before
// entering your own. Generated relative to "now".

import * as C from './core.js';

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PRIORITIES = {
  family: ['Pappa-dejt med Elsa', 'Läsa saga med röster', 'Hämta tidigt och gå till lekparken', 'Baka bullar med barnen', 'Mobilfri middag'],
  money: ['Skicka offert till kommunen', 'Följ upp tre prospekt', 'Leverera BidSprint-pilot', 'Hitta en betald fix-uppgift', 'Uppdatera portfolion'],
  self: ['Löprunda 30 min', 'Gitarr 20 min', 'I säng före 23', 'Promenad utan mobil', 'Läsa 10 min'],
};
const WINS = ['Skickade offerten jag skjutit upp', 'Elsa och jag byggde en koja', 'Fick ett ja från en pilotkund', 'Lugn kväll utan bråk vid nattningen', 'Sprang 5 km', 'Leo sa ”pappa bäst” vid frukosten', 'Levererade en dag före deadline'];
const GRATITUDE = ['Fika i solen med barnen', 'En kund som tackade', 'Att alla är friska', 'En tyst morgon med kaffe'];

export function buildDemoState(now = new Date()) {
  const today = C.toKey(now);
  const rnd = mulberry32(C.hashString(today));
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  const s = C.createDefaultState(now.toISOString());
  s.profile = { name: 'Alex', onboarded: true };
  const elsa = { id: 'k_demo_elsa', name: 'Elsa', birthdate: C.addDays(today, -Math.round(6.3 * 365.25)), color: 0 };
  const leo = { id: 'k_demo_leo', name: 'Leo', birthdate: C.addDays(today, -Math.round(3.1 * 365.25)), color: 1 };
  s.kids = [elsa, leo];
  s.settings.monthlyIncomeGoal = 30000;
  s.settings.monthlyCosts = 18000;
  s.habits = C.SUGGESTED_HABITS.filter((h) => h.preselect).map((h) => ({ id: `hb_demo_${h.id}`, name: h.name, icon: h.icon, archived: false, createdAt: now.toISOString() }));
  const habitOdds = [0.55, 0.75, 0.6, 0.7, 0.5];

  for (let back = 20; back >= 0; back -= 1) {
    const key = C.addDays(today, -back);
    const isToday = back === 0;
    const weekend = [0, 6].includes(C.fromKey(key).getDay());
    const day = C.emptyDay();
    if (rnd() < 0.88 || isToday) {
      const sleep = 2 + Math.floor(rnd() * 4);
      day.checkin = { sleep, energy: C.clamp(sleep + Math.round(rnd() * 2 - 1), 1, 5), mood: 2 + Math.floor(rnd() * 4), intention: isToday ? 'Lugn, närvarande och ett modigt säljsamtal' : '', at: `${key}T07:10:00.000Z` };
    }
    for (const a of C.AREAS) day.priorities[a.id] = { text: pick(PRIORITIES[a.id]), done: isToday ? a.id === 'self' : rnd() < 0.7 };
    day.mission.done = !isToday && rnd() < 0.68;
    day.money.done = !isToday && !weekend && rnd() < 0.72;
    s.habits.forEach((h, i) => {
      if (isToday ? i < 2 : rnd() < habitOdds[i]) day.habits[h.id] = true;
    });
    if (!isToday) {
      const base = weekend ? 90 : 25;
      day.dadMinutes[elsa.id] = Math.round((base + rnd() * base) / 5) * 5;
      day.dadMinutes[leo.id] = Math.round((base * 0.8 + rnd() * base) / 5) * 5;
      if (rnd() < 0.62) day.reflection = { wins: pick(WINS), gratitude: pick(GRATITUDE), lesson: '', tomorrow: '', tomorrowArea: 'money', at: `${key}T20:30:00.000Z` };
      if (!weekend) {
        const sessions = 1 + Math.floor(rnd() * 2);
        for (let i = 0; i < sessions; i += 1) s.focus.push({ id: `f_demo_${key}_${i}`, date: key, minutes: pick([25, 50, 50, 90]), label: day.priorities.money.text, at: `${key}T09:00:00.000Z` });
      }
    } else {
      day.dadMinutes[elsa.id] = 20;
    }
    s.days[key] = day;
  }

  const mk = C.monthKey(today);
  const dayOfMonth = C.parseKey(today).d;
  const inMonth = (n) => `${mk}-${String(Math.max(1, Math.min(dayOfMonth, n))).padStart(2, '0')}`;
  const income = [
    [inMonth(3), 1900, 'bidsprint', 'Pilot – Byggfirma i Trollhättan'],
    [inMonth(8), 4500, 'forge', 'WooCommerce-fix'],
    [inMonth(11), 1900, 'bidsprint', 'Pilot – Städbolag Väst'],
    [inMonth(14), 650, 'other', 'Sålde gammal förstärkare'],
  ];
  income.forEach(([date, amount, streamId, note], i) => s.income.push({ id: `i_demo_${i}`, date, amount, streamId, note, createdAt: `${date}T12:00:00.000Z` }));
  for (let m = 1; m <= 5; m += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - m, 20);
    const key = C.toKey(d);
    s.income.push({ id: `i_demo_hist_${m}`, date: key, amount: 14000 + Math.round(rnd() * 12) * 1000, streamId: pick(['forge', 'bidsprint', 'other']), note: '', createdAt: `${key}T12:00:00.000Z` });
  }
  s.hours.push(
    { id: 'h_demo_1', date: inMonth(3), hours: 5, streamId: 'bidsprint', note: 'Pilot 1' },
    { id: 'h_demo_2', date: inMonth(11), hours: 4.5, streamId: 'bidsprint', note: 'Pilot 2' },
    { id: 'h_demo_3', date: inMonth(8), hours: 6, streamId: 'forge', note: 'WooCommerce' },
  );
  s.deals = [
    { id: 'd_demo_1', title: 'Kommunfastigheter – anbud', streamId: 'bidsprint', value: 1900, stage: 'offer', nextStep: 'Ring och fråga om beslut', nextDate: C.addDays(today, -1) },
    { id: 'd_demo_2', title: 'Elfirma Norr', streamId: 'bidsprint', value: 1900, stage: 'contact', nextStep: 'Skicka exempelrapport', nextDate: today },
    { id: 'd_demo_3', title: 'Webbshop – kassabugg', streamId: 'forge', value: 3500, stage: 'offer', nextStep: 'Följ upp offert', nextDate: C.addDays(today, 2) },
    { id: 'd_demo_4', title: 'Måleri AB', streamId: 'bidsprint', value: 1900, stage: 'lead', nextStep: 'Hitta beslutsfattare', nextDate: C.addDays(today, 4) },
    { id: 'd_demo_5', title: 'Plugin-idé: bokningsexport', streamId: 'wp', value: 0, stage: 'lead', nextStep: 'Intervjua 3 användare', nextDate: C.addDays(today, 6) },
    { id: 'd_demo_6', title: 'Städbolag Väst', streamId: 'bidsprint', value: 1900, stage: 'paid', nextStep: '', nextDate: '' },
  ].map((d) => ({ ...d, createdAt: now.toISOString(), updatedAt: now.toISOString() }));
  s.savings = [
    { id: 's_demo_1', name: 'Buffert', target: 54000, saved: 31500 },
    { id: 's_demo_2', name: 'Sommarstuga-vecka', target: 12000, saved: 4200 },
  ];
  const lastYear = `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`;
  s.memories = [
    { id: 'm_demo_1', date: C.parseKey(lastYear) ? lastYear : C.addDays(today, -365), kidId: elsa.id, kind: 'quote', text: 'Pappa, när jag blir stor ska jag bli astronaut och bagare.' },
    { id: 'm_demo_2', date: C.addDays(today, -40), kidId: leo.id, kind: 'milestone', text: 'Cyklade utan stödhjul för första gången!' },
    { id: 'm_demo_3', date: C.addDays(today, -9), kidId: '', kind: 'moment', text: 'Familjebandet spelade in ”Kastrullrock” – Leo på trummor, Elsa sjöng.' },
    { id: 'm_demo_4', date: C.addDays(today, -4), kidId: elsa.id, kind: 'quote', text: 'Vet du att månen följer efter bilen?' },
    { id: 'm_demo_5', date: C.addDays(today, -2), kidId: leo.id, kind: 'moment', text: 'Hoppade i lövhögen tills vi var helt slut av skratt.' },
  ].map((m) => ({ ...m, createdAt: `${m.date}T19:00:00.000Z` }));
  s.weeks[C.weekKey(today)] = {
    wentWell: '',
    improve: '',
    top3: ['Pappa-dejt med Elsa på lördag', 'Två nya BidSprint-piloter', 'Träna tre gånger'],
    familyPlan: 'Lördag: pappa-dejt med Elsa. Söndag: skogsbingo med båda.',
    moneyPlan: 'Följ upp alla offerter före onsdag.',
    savedAt: now.toISOString(),
  };
  return C.normalizeState(s, now.toISOString());
}
