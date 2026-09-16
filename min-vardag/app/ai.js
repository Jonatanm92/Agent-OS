/* Min vardag — AI-tolkning (valfri).
 *
 * ÄRLIGHET ÄR KRAVET HÄR:
 *  - Finns ingen AI-anslutning används regelmotorn, och det står "regeltolkning".
 *  - En regelmotor kallas aldrig AI.
 *  - AI:ns svar är OTILLFÖRLITLIG INDATA. Varje ändring valideras mot verkliga
 *    id:n innan den ens visas som förslag, och inget tillämpas utan godkännande.
 */
(function (root) {
  const MV = root.MinVardag || (root.MinVardag = {});
  const U = MV.util, M = MV.model;

  const ai = { sample: null, checked: false, available: false, lastError: null };

  async function probe() {
    if (ai.checked) return ai.available;
    ai.checked = true;
    try {
      const sample = await root.claude?.use?.('sample');
      ai.sample = sample || null;
      ai.available = !!sample;
    } catch (error) {
      ai.sample = null; ai.available = false;
      ai.lastError = (error && error.code) || 'okant';
    }
    return ai.available;
  }

  /** Kompakt bild av läget. Bara det som behövs för att tolka meningen. */
  function context(state, now) {
    const dateKey = U.dateKey(now);
    return {
      idag: dateKey,
      veckodag: U.dayName(dateKey),
      klockan: U.toClock(U.minutesOfDay(now)),
      imorgon: U.addDays(dateKey, 1),
      arbetstid: { start: state.settings.workStart, slut: state.settings.workEnd },
      barn: state.children.map((c) => ({ id: c.id, namn: c.name })),
      oppnaBehov: M.openNeeds(state).map((n) => ({
        id: n.id, barn: M.childName(state, n.childId), vad: n.title,
        plagg: n.garment, antal: n.qty, klara: n.doneQty, status: n.status,
      })),
      oppnaUppgifter: M.openTasks(state).slice(0, 25).map((t) => ({
        id: t.id, vad: t.title, minuter: t.minutes, datum: t.scheduledDate || null, tidigast: t.earliest || null,
      })),
    };
  }

  const SYSTEM = `Du är tolkningsdelen i appen "Min vardag" – en lugn, praktisk vardagsassistent för en svensk pappa.
Din enda uppgift är att omvandla hans fritext till konkreta, granskningsbara ändringar. Du utför inget själv.

Svara ENDAST med JSON i denna form:
{"summary": "en mening på svenska", "ops": [...], "questions": [...]}

Tillåtna ops (exakt dessa namn och fält):
{"op":"need.add","childId":"<id>","title":"<text>","garment":"<plaggtyp|null>","qty":<heltal>}
{"op":"need.done","needId":"<id>","qty":<heltal>}
{"op":"need.blocked","needId":"<id>","note":"<kort orsak>"}
{"op":"need.status","needId":"<id>","status":"behover|planerat|bekraftat"}
{"op":"task.add","title":"<text>","minutes":<heltal>,"kind":"uppgift|inkop|forberedelse|egen","childId":"<id|null>","earliest":"HH:MM|","scheduledDate":"ÅÅÅÅ-MM-DD|","context":"hemma|ute|butik|telefon|var som helst"}
{"op":"task.done","taskId":"<id>"}
{"op":"task.move","taskId":"<id>","to":"senare|imorgon|vantar"}
{"op":"task.reduce","taskId":"<id>","minutes":<heltal>}
{"op":"day.energy","date":"ÅÅÅÅ-MM-DD","energy":"lag|ok|god|okand"}
{"op":"day.children","date":"ÅÅÅÅ-MM-DD","childId":"<id>","value":"ja|nej|okand"}
{"op":"day.work","date":"ÅÅÅÅ-MM-DD","value":"ja|nej|okand"}
{"op":"size.set","childId":"<id>","kind":"kropp|marke","brand":"<märke|>","label":"<text>","value":"<text>","preliminary":true}

Frågor ställs när något är oklart:
{"text":"<kort fråga>","options":[{"label":"<kort svar>","ops":[<ops ovan>]}]}

Regler du MÅSTE följa:
1. Gissa aldrig vilket barn eller vilket plagg som avses. Är det flera möjliga – ställ en fråga med ett alternativ per möjlighet, och lägg INGA ops utanför frågan för den saken.
2. Använd bara id:n som finns i sammanhanget. Hitta aldrig på id:n.
3. Ett inköpsförslag är inte ett genomfört köp. Sätt "bekraftat" bara när han uttryckligen säger att något är köpt eller klart.
4. Är bara en del klar ("jackan är köpt, byxorna var slut") – markera den klara delen och lämna resten öppen med need.blocked.
5. Hitta aldrig på städning, projekt, priser, lagerstatus eller tider han inte nämnt.
6. Vet du inte om han arbetar eller har barnen – låt det vara okänt eller fråga. Skapa aldrig lämningar eller hämtningar på eget bevåg.
7. Inga omdömen om honom som förälder, inga poäng, ingen skuld. Kort och konkret svenska.
8. Förstår du inte meningen: returnera tomma ops och questions och skriv det i summary.`;

  /* ---------- validering: AI:ns svar är otillförlitlig indata ---------- */

  const NEED_OPS = { 'need.done': 1, 'need.blocked': 1, 'need.status': 1, 'need.qty': 1, 'need.remove': 1 };
  const TASK_OPS = { 'task.done': 1, 'task.move': 1, 'task.reduce': 1, 'task.remove': 1 };
  const ALLOWED = {
    'need.add': 1, 'task.add': 1, 'task.addForNeeds': 1, 'day.energy': 1,
    'day.children': 1, 'day.work': 1, 'size.set': 1,
  };

  function clean(op, state, dateKey) {
    if (!op || typeof op !== 'object' || typeof op.op !== 'string') return null;
    const name = op.op;
    if (!ALLOWED[name] && !NEED_OPS[name] && !TASK_OPS[name]) return null;

    // Id:n måste finnas på riktigt.
    if (NEED_OPS[name] && !state.needs.some((n) => n.id === op.needId)) return null;
    if (TASK_OPS[name] && !state.tasks.some((t) => t.id === op.taskId)) return null;
    if ((name === 'need.add' || name === 'day.children' || name === 'size.set')
      && !M.childById(state, op.childId)) return null;
    if (name === 'task.add' && op.childId && !M.childById(state, op.childId)) op.childId = null;

    const date = (value) => (/^\d{4}-\d{2}-\d{2}$/.test(value) ? value : dateKey);
    const clock = (value) => (U.toMinutes(value) !== null ? value : '');
    const int = (value, min, max, fallback) => {
      const n = Math.round(Number(value));
      return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
    };
    const text = (value, max) => String(value == null ? '' : value).slice(0, max).trim();

    switch (name) {
      case 'need.add':
        if (!text(op.title, 80)) return null;
        return { op: name, childId: op.childId, title: text(op.title, 80), garment: op.garment || null, qty: int(op.qty, 1, 20, 1) };
      case 'need.done':
        return { op: name, needId: op.needId, qty: int(op.qty, 1, 20, 1) };
      case 'need.blocked':
        return { op: name, needId: op.needId, note: text(op.note, 60) || 'Blev inte av' };
      case 'need.status':
        return M.NEED_STATUS[op.status] ? { op: name, needId: op.needId, status: op.status } : null;
      case 'need.qty':
        return { op: name, needId: op.needId, qty: int(op.qty, 1, 20, 1) };
      case 'need.remove':
        return { op: name, needId: op.needId };
      case 'task.add':
        if (!text(op.title, 90)) return null;
        return {
          op: name, title: text(op.title, 90), minutes: int(op.minutes, 5, 240, 30),
          kind: ['uppgift', 'inkop', 'forberedelse', 'egen'].includes(op.kind) ? op.kind : 'uppgift',
          childId: op.childId || null, earliest: clock(op.earliest),
          scheduledDate: /^\d{4}-\d{2}-\d{2}$/.test(op.scheduledDate) ? op.scheduledDate : '',
          context: text(op.context, 20) || 'var som helst', source: 'assistent',
        };
      case 'task.done':
        return { op: name, taskId: op.taskId };
      case 'task.move':
        return ['senare', 'imorgon', 'vantar'].includes(op.to) ? { op: name, taskId: op.taskId, to: op.to } : null;
      case 'task.reduce':
        return { op: name, taskId: op.taskId, minutes: int(op.minutes, 10, 120, 15) };
      case 'task.remove':
        return { op: name, taskId: op.taskId };
      case 'day.energy':
        return M.ENERGY[op.energy] ? { op: name, date: date(op.date), energy: op.energy } : null;
      case 'day.children':
        return M.TRISTATE.includes(op.value) ? { op: name, date: date(op.date), childId: op.childId, value: op.value } : null;
      case 'day.work':
        return M.TRISTATE.includes(op.value) ? { op: name, date: date(op.date), value: op.value } : null;
      case 'size.set':
        if (!text(op.value, 30)) return null;
        return {
          op: name, childId: op.childId, kind: op.kind === 'kropp' ? 'kropp' : 'marke',
          brand: op.kind === 'kropp' ? '' : text(op.brand, 40),
          label: text(op.label, 40) || 'Storlek', value: text(op.value, 30),
          preliminary: op.preliminary !== false,
        };
      default:
        return null;
    }
  }

  function validate(raw, state, dateKey) {
    const ops = Array.isArray(raw.ops) ? raw.ops.map((o) => clean(o, state, dateKey)).filter(Boolean) : [];
    const questions = [];
    for (const q of Array.isArray(raw.questions) ? raw.questions : []) {
      if (!q || typeof q.text !== 'string') continue;
      const options = (Array.isArray(q.options) ? q.options : [])
        .map((o) => ({
          id: U.makeId('alt'),
          label: String(o && o.label || '').slice(0, 70).trim(),
          ops: (Array.isArray(o && o.ops) ? o.ops : []).map((x) => clean(x, state, dateKey)).filter(Boolean),
        }))
        .filter((o) => o.label && o.ops.length);
      if (options.length >= 2) {
        questions.push({ id: U.makeId('fraga'), text: String(q.text).slice(0, 140), options, skipLabel: 'Hoppa över' });
      }
    }
    return { ops, questions, summary: String(raw.summary || '').slice(0, 200) };
  }

  /* ---------- publik ingång ---------- */

  /**
   * Tolkar fritext. Använder AI om den finns och är påslagen,
   * annars regelmotorn. Resultatet bär alltid med sig vilket som gällde.
   */
  async function interpret(state, input, now) {
    const rules = MV.language.interpret(state, input, now);
    const useAi = state.settings.aiOptIn !== false && await probe();
    if (!useAi) {
      return Object.assign(rules, { mode: 'regler', aiError: ai.lastError });
    }

    try {
      const payload = {
        laget: context(state, now),
        text: String(input).slice(0, 1200),
      };
      const answer = await ai.sample.json(
        [{ role: 'user', content: `${SYSTEM}\n\nSammanhang:\n${JSON.stringify(payload.laget)}\n\nHan skrev:\n"""${payload.text}"""` }],
        { modelTier: 'default' },
      );
      const checked = validate(answer || {}, state, U.dateKey(now));
      if (!checked.ops.length && !checked.questions.length) {
        // AI gav inget användbart — regelmotorn kan ändå ha förstått något.
        if (rules.ops.length || rules.questions.length) {
          return Object.assign(rules, { mode: 'regler', aiNote: 'AI hittade ingen ändring — regeltolkning användes.' });
        }
        return { mode: 'ai', input, ops: [], questions: [], summary: checked.summary, query: rules.query, unmatched: [], understood: false };
      }
      return {
        mode: 'ai', input, ops: checked.ops, questions: checked.questions,
        summary: checked.summary, query: null, unmatched: [], understood: true,
      };
    } catch (error) {
      ai.lastError = (error && error.code) || 'okant';
      // Vid t.ex. rate_limited eller nekat samtycke: fall tillbaka, och säg det.
      return Object.assign(rules, {
        mode: 'regler',
        aiNote: error && error.code === 'not_granted'
          ? 'AI-tolkning nekades i webbläsaren — regeltolkning användes.'
          : 'AI-tolkningen gick inte att nå — regeltolkning användes.',
        aiError: ai.lastError,
      });
    }
  }

  function status() {
    return {
      checked: ai.checked,
      available: ai.available,
      error: ai.lastError,
      label: ai.available ? 'AI ansluten' : 'Ingen AI — regeltolkning',
    };
  }

  MV.ai = { probe, interpret, status, validate, context };
})(typeof globalThis !== 'undefined' ? globalThis : this);
