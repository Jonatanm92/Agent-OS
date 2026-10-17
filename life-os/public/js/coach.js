// The coach: a built-in offline engine (rules over your own data, works with
// no network) plus an optional bridge to Agent OS for free-form questions.

import * as C from './core.js';
import { ACTIVITIES, DAD_TIPS, MISSIONS, MONEY_ACTIONS, STARTERS } from './content.js';

export const QUICK_PROMPTS = [
  { id: 'plan', label: 'Planera min dag', icon: '🗓️' },
  { id: 'weekend', label: 'Helgplan med barnen', icon: '🌳' },
  { id: 'money', label: 'Hjälp mig tjäna mer', icon: '💰' },
  { id: 'week', label: 'Hur går min vecka?', icon: '📈' },
  { id: 'stress', label: 'Jag är stressad', icon: '🫶' },
];

export function morningAdvice(checkin) {
  if (!checkin) return null;
  const { sleep, energy, mood } = checkin;
  if (mood <= 2) {
    return { tone: 'care', text: 'Tung start. Sänk ribban: en enda prioritering räcker idag. Säg till någon du litar på hur du mår – och det är okej att säga till barnen att pappa är trött men glad att vara med dem.' };
  }
  if (sleep <= 2) {
    return { tone: 'tip', text: 'Kort natt. Gör det viktigaste före lunch, inget kaffe efter 14 och sikta på säng 30 minuter tidigare ikväll.' };
  }
  if (energy <= 2) {
    return { tone: 'tip', text: 'Låg energi. Kör korta 25-minuterspass, gå ut tio minuter i dagsljus och välj en lugn aktivitet med barnen.' };
  }
  if (energy >= 4 && sleep >= 4) {
    return { tone: 'good', text: 'Full tank! Lägg dagens svåraste pengasteg i första fokusblocket – och spara lite energi till familjetiden.' };
  }
  return { tone: 'good', text: 'Stabil dag. Skydda ett fokusblock och en stund med barnen där mobilen ligger kvar i fickan.' };
}

function lowEnergy(day) {
  return Boolean(day && day.checkin && (day.checkin.energy <= 2 || day.checkin.sleep <= 2));
}

export function planDay(state, key) {
  const s = state.settings;
  const day = C.getDay(state, key) || C.emptyDay();
  const fw = C.FOCUS_WINDOWS[s.focusWindow] || C.FOCUS_WINDOWS.morning;
  const mission = C.dailyMission(MISSIONS, state, key);
  const action = C.dailyMoneyAction(MONEY_ACTIONS, state, key);
  const activity = C.pickDaily(C.suitableActivities(ACTIVITIES, state, key, { maxMinutes: 45 }), key, 'plan-activity');
  const pr = day.priorities;
  const tired = lowEnergy(day);
  const openHabit = C.activeHabits(state).find((h) => !day.habits[h.id]);
  const blocks = [
    {
      time: s.reminders.morning,
      title: 'Check-in',
      detail: day.checkin ? 'Klart ✓' : 'Sömn, energi och humör – och dagens tre: familj, pengar, jag.',
      area: 'self',
    },
    {
      time: fw.start,
      end: fw.end,
      title: tired ? 'Fokusblock (kort)' : 'Fokusblock',
      detail: [pr.money.text || (action ? action.text : 'Ditt viktigaste pengasteg.'), tired && 'Låg energi – kör 2 × 25 min med paus istället för ett långt pass.'].filter(Boolean).join(' · '),
      area: 'money',
    },
    {
      time: '12:00',
      title: 'Egen tid',
      detail: pr.self.text || (openHabit ? `${openHabit.icon} ${openHabit.name}` : 'Tio minuter ute utan mobil.'),
      area: 'self',
    },
    {
      time: s.familyStart,
      end: s.familyEnd,
      title: 'Familjetid – mobilen bort',
      detail: [pr.family.text, mission && `Uppdrag: ${mission.text}`, activity && `Idé: ${activity.title} (${activity.minutes} min).`].filter(Boolean).join(' · '),
      area: 'family',
    },
    {
      time: s.reminders.evening,
      title: 'Kvällsreflektion',
      detail: day.reflection ? 'Klart ✓' : 'Dagens vinst, tacksamhet, ett minne och morgondagens viktigaste.',
      area: 'self',
    },
  ];
  blocks.sort((a, b) => (C.minutesOfDay(a.time) ?? 0) - (C.minutesOfDay(b.time) ?? 0));
  return { blocks, tired };
}

export function planToMarkdown(plan) {
  const lines = ['## Din plan för idag', ''];
  for (const b of plan.blocks) {
    lines.push(`- **${b.time}${b.end ? `–${b.end}` : ''} · ${b.title}** – ${b.detail}`);
  }
  lines.push('', '_Ändra tider under Inställningar → Rytm._');
  return lines.join('\n');
}

function pickDistinct(list, key, salt, n) {
  const pool = list.slice();
  const out = [];
  let i = 0;
  while (pool.length && out.length < n) {
    const item = C.pickDaily(pool, key, `${salt}-${i}`);
    out.push(item);
    pool.splice(pool.indexOf(item), 1);
    i += 1;
  }
  return out;
}

export function weekendPlan(state, key) {
  if (!state.kids.length) {
    return 'Lägg till dina barn under **Inställningar → Barn** så kan jag föreslå aktiviteter som passar deras åldrar.';
  }
  const out = C.suitableActivities(ACTIVITIES, state, key, { place: 'ute', minMinutes: 40 });
  const inside = C.suitableActivities(ACTIVITIES, state, key, { place: 'inne' });
  const short = C.suitableActivities(ACTIVITIES, state, key, { maxMinutes: 20 });
  const [a] = pickDistinct(out, key, 'wk-out', 1);
  const [b] = pickDistinct(inside.filter((x) => !a || x.id !== a.id), key, 'wk-in', 1);
  const [c] = pickDistinct(short.filter((x) => (!a || x.id !== a.id) && (!b || x.id !== b.id)), key, 'wk-short', 1);
  const starter = C.starterFor(STARTERS, state, key, 3);
  const tip = C.pickDaily(DAD_TIPS, key, 'wk-tip');
  const lines = ['## Helgplan', ''];
  if (a) lines.push(`- **Lördag förmiddag (ute):** ${a.title} – ${a.desc}`);
  if (b) lines.push(`- **Om det regnar / eftermiddag (inne):** ${b.title} – ${b.desc}`);
  if (c) lines.push(`- **Snabb kvällsstund:** ${c.title} – ${c.desc}`);
  if (state.kids.length > 1) lines.push(`- **1:1-tid:** ge varje barn 30 minuter ensam med dig. Låt dem välja.`);
  if (starter) lines.push('', `**Middagsfråga:** ${starter.text}`);
  lines.push('', `**Påminnelse:** ${tip}`);
  return lines.join('\n');
}

export function moneyCoach(state, key) {
  const mk = C.monthKey(key);
  const goal = state.settings.monthlyIncomeGoal;
  const earned = C.incomeForMonth(state, mk);
  const f = C.moneyForecast(goal, earned, key);
  const pipe = C.pipelineSummary(state.deals, key);
  const stats = C.streamStats(state, mk).filter((s) => s.rate != null).sort((a, b) => b.rate - a.rate);
  const lines = ['## Pengar just nu', ''];
  if (goal > 0) {
    lines.push(`- **${C.formatMonth(mk)}:** ${C.formatSek(earned)} av ${C.formatSek(goal)} (${Math.round(f.pct * 100)} %).`);
    lines.push(f.reached
      ? '- **Målet är nått.** Allt över nu är buffert eller frihet – bestäm vilket innan pengarna bestämmer åt dig.'
      : `- **Behov:** ${C.formatSek(f.perWeek)} per vecka resten av månaden (${C.formatSek(f.perDay)}/dag). Nuvarande takt: ${C.formatSek(f.pace)}.`);
  } else {
    lines.push('- Sätt ett **månadsmål** under Inställningar → Pengar så kan jag räkna takt och behov.');
  }
  if (pipe.openCount) lines.push(`- **Pipeline:** ${pipe.openCount} öppna affärer, viktat värde ${C.formatSek(pipe.weighted)}.`);
  if (stats.length) lines.push(`- **Bäst betalt per timme:** ${stats[0].name} (${C.formatSek(stats[0].rate)}/h). Lägg nästa timme där om du kan.`);
  lines.push('', '### Tre steg idag', '');
  const steps = [];
  for (const d of pipe.overdue.slice(0, 2)) steps.push(`Följ upp **${d.title}** – nästa steg var ”${d.nextStep || 'kontakt'}” (${d.nextDate}).`);
  const offer = pipe.open.filter((d) => d.stage === 'offer').sort((a, b) => b.value - a.value)[0];
  if (offer && !pipe.overdue.includes(offer)) steps.push(`Ring om offerten **${offer.title}** (${C.formatSek(offer.value)}). En vänlig fråga om beslutsdatum räcker.`);
  const actions = pickDistinct(C.eligibleMoneyActions(MONEY_ACTIONS, state), key, 'coach-money', 3);
  for (const a of actions) {
    if (steps.length >= 3) break;
    steps.push(a.text);
  }
  steps.slice(0, 3).forEach((s, i) => lines.push(`${i + 1}. ${s}`));
  return lines.join('\n');
}

export function stressHelp() {
  return [
    '## Ta det i tre steg',
    '',
    '1. **Andas i fyrkant:** 4 sekunder in, håll 4, 4 sekunder ut, håll 4. Fyra varv.',
    '2. **Töm huvudet:** skriv ned allt som snurrar. Välj EN sak att göra nu – resten får vänta till imorgon.',
    '3. **Rör på dig:** tio minuter ute, gärna med barnen. ”Pappa behöver lite luft – vill du följa med?”',
    '',
    'Sänk ribban idag. En prioritering räcker, och det är okej att be om hjälp.',
    '',
    '_Om stressen sitter i under flera veckor eller påverkar sömnen mycket – prata med vårdcentralen eller ring 1177._',
  ].join('\n');
}

export function weekCoach(state, key) {
  const wk = C.weekKey(key);
  const summary = C.weekSummary(state, wk, key);
  const prev = C.weekSummary(state, C.shiftWeek(wk, -1), key);
  const insights = C.weeklyInsights(summary, prev, state);
  const lines = [
    `## Vecka ${C.weekNumber(wk)} hittills`,
    '',
    `- **Snittpoäng:** ${summary.avgScore}/100 · **Fokus:** ${C.formatMinutes(summary.focusMinutes)} · **Pappatid:** ${C.formatMinutes(summary.dadMinutes)}`,
    `- **Inkomst:** ${C.formatSek(summary.income)} · **Pengasteg:** ${summary.moneyDone} · **Pappa-uppdrag:** ${summary.missionsDone}`,
    '',
  ];
  if (insights.length) {
    lines.push('### Det här ser jag', '');
    for (const i of insights) lines.push(`- ${i.text}`);
  } else {
    lines.push('Logga några dagar till så ser jag mönster i sömn, energi, pappatid och pengar.');
  }
  return lines.join('\n');
}

export function routeIntent(text) {
  const t = String(text || '').toLowerCase();
  if (/stress|trött|orkar|ångest|överväldig|panik/.test(t)) return 'stress';
  if (/helg|aktivitet|lek|hitta på|utflykt|regn/.test(t)) return 'weekend';
  if (/pengar|tjäna|inkomst|sälj|kund|offert|lön|ekonomi|spara/.test(t)) return 'money';
  if (/vecka|hur går|statistik|mönster/.test(t)) return 'week';
  if (/plan|dag|schema|idag/.test(t)) return 'plan';
  return null;
}

export function offlineReply(intent, state, key) {
  switch (intent) {
    case 'plan': return planToMarkdown(planDay(state, key));
    case 'weekend': return weekendPlan(state, key);
    case 'money': return moneyCoach(state, key);
    case 'stress': return stressHelp();
    case 'week': return weekCoach(state, key);
    default:
      return 'Den inbyggda coachen svarar på snabbvalen ovan (dagsplan, helg, pengar, vecka, stress). Koppla **Agent OS** under Inställningar → Coach för fria frågor till en AI-modell.';
  }
}

// ── Agent OS bridge ──────────────────────────────────────────────────────────

export function buildCoachContext(state, key) {
  const s = state.settings;
  const day = C.getDay(state, key) || C.emptyDay();
  const kids = state.kids
    .map((k) => {
      const age = C.formatAge(C.ageParts(k.birthdate, key));
      return s.coach.shareNames ? `${k.name} (${age})` : age;
    })
    .filter(Boolean);
  const mk = C.monthKey(key);
  const earned = C.incomeForMonth(state, mk);
  const summary = C.weekSummary(state, C.weekKey(key), key);
  const pipe = C.pipelineSummary(state.deals, key);
  const mission = C.dailyMission(MISSIONS, state, key);
  const action = C.dailyMoneyAction(MONEY_ACTIONS, state, key);
  const lines = [
    'Du är min personliga coach i appen Life OS. Svara på svenska, varmt men rakt på sak, max cirka 200 ord, gärna med punktlistor och konkreta nästa steg.',
    'Mina tre områden är familj (jag vill vara den bästa pappan jag kan vara), pengar (öka inkomsten och tryggheten) och jag själv (hälsa och energi).',
    'Ge aldrig medicinska, juridiska eller finansiella råd som ersätter en expert; hänvisa till 1177 eller vårdcentralen vid oro för hälsan.',
    '',
    `Datum: ${C.formatDateLong(key)} (vecka ${C.isoWeek(key).week}).`,
    kids.length ? `Barn: ${kids.join(', ')}.` : 'Barn: inte angivet.',
    s.monthlyIncomeGoal ? `Månadens inkomstmål: ${C.formatSek(s.monthlyIncomeGoal)}, intjänat hittills: ${C.formatSek(earned)}.` : `Intjänat denna månad: ${C.formatSek(earned)}.`,
    `Inkomstströmmar: ${s.streams.map((x) => x.name).join(', ')}.`,
  ];
  if (day.checkin) lines.push(`Dagens check-in: sömn ${day.checkin.sleep}/5, energi ${day.checkin.energy}/5, humör ${day.checkin.mood}/5${day.checkin.intention ? `, intention: ”${day.checkin.intention}”` : ''}.`);
  const pr = C.AREAS.map((a) => (day.priorities[a.id].text ? `${a.name}: ${day.priorities[a.id].text}${day.priorities[a.id].done ? ' (klar)' : ''}` : '')).filter(Boolean);
  if (pr.length) lines.push(`Dagens tre: ${pr.join(' · ')}.`);
  if (mission) lines.push(`Dagens pappa-uppdrag: ${mission.text}`);
  if (action) lines.push(`Dagens pengasteg: ${action.text}`);
  lines.push(`Veckan hittills: fokus ${C.formatMinutes(summary.focusMinutes)}, pappatid ${C.formatMinutes(summary.dadMinutes)}, vanor ${summary.habitRate == null ? '–' : `${Math.round(summary.habitRate * 100)} %`}, snittenergi ${summary.avgEnergy == null ? '–' : C.formatDecimal(summary.avgEnergy)}.`);
  if (pipe.openCount) {
    lines.push(`Öppna affärer (${pipe.openCount}, viktat ${C.formatSek(pipe.weighted)}): ${pipe.open.slice(0, 5).map((d) => `${d.title} – ${C.stageById(d.stage).name}, ${C.formatSek(d.value)}${d.nextDate ? `, nästa steg ${d.nextDate}` : ''}`).join('; ')}.`);
  }
  return lines.join('\n');
}

export async function askAgentOs({ question, state, key, conversationId, settings, serverToken, fetchImpl = fetch }) {
  const coach = settings.coach;
  const direct = String(coach.agentOsUrl || '').trim().replace(/\/+$/, '');
  const message = conversationId ? question : `${buildCoachContext(state, key)}\n\nMin fråga: ${question}`;
  const body = { message, agentId: coach.agentId || 'free-claude-code', useMemory: false, agentic: false };
  if (conversationId) body.conversationId = conversationId;
  const url = direct ? `${direct}/api/chat` : './api/coach';
  const headers = { 'content-type': 'application/json' };
  if (direct && coach.agentOsToken) headers['x-agentos-token'] = coach.agentOsToken;
  if (!direct && serverToken) headers['x-life-os-token'] = serverToken;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000);
  try {
    const res = await fetchImpl(url, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal });
    const text = await res.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text.slice(0, 300) }; }
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    const reply = String(data.reply || '').trim();
    if (!reply) throw new Error('Tomt svar från Agent OS');
    return { reply, conversationId: data.conversationId || conversationId || null, model: data.model || '' };
  } finally {
    clearTimeout(timeout);
  }
}
