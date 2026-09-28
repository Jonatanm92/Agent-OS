/* Aura — AI (optional, on the viewer's own Claude account).
 *
 * HONESTY IS THE REQUIREMENT HERE:
 *  - With no AI connection the rules are used, and the interface says "rules".
 *  - A rule engine is never called AI. An AI answer is never faked.
 *  - AI output is UNTRUSTED INPUT: every item and every proposed change is
 *    validated against real ids and the model's own shapes before it is even
 *    shown, and nothing is applied without the user confirming it.
 *
 * PRIVACY: only what the task needs is sent — titles, times and counts from
 * today's plan. Never notes, reflections, cycle data, or the people list.
 * The user can turn AI off entirely in Settings.
 */
(function (root) {
  const A = root.Aura || (root.Aura = {});
  const U = A.util, M = A.model, It = A.items, P = A.planner, I = A.i18n, PF = A.platform;

  const ai = { sample: null, checked: false, available: false, lastError: null, probing: null };

  I.add({
    'ai.err.notGranted': ['Claude fick inte användas på den här sidan. Aura använder sina inbyggda regler i stället.', "Claude wasn't allowed on this page. Aura is using its built-in rules instead."],
    'ai.err.disabled': ['Claude är inte tillgängligt för det här kontot. De inbyggda reglerna används.', "Claude isn't available for this account. The built-in rules are used."],
    'ai.err.rate': ['Claude är upptaget eller så är din användning slut för stunden. Försök igen om en stund — reglerna fungerar ändå.', 'Claude is busy or your usage limit is reached. Try again in a while — the rules still work.'],
    'ai.err.session': ['Du behöver logga in igen för att använda Claude.', 'You need to sign in again to use Claude.'],
    'ai.err.failed': ['AI-svaret kom inte fram. De inbyggda reglerna användes i stället.', "The AI answer didn't come through. The built-in rules were used instead."],
    'ai.err.off': ['AI är avstängt i inställningarna.', 'AI is turned off in Settings.'],
    'ai.err.none': ['Ingen AI-anslutning här. Aura använder sina inbyggda regler.', 'No AI connection here. Aura is using its built-in rules.'],
  });

  function enabled(state) { return !!(state && state.prefs.ai && state.prefs.ai.enabled !== false); }

  async function probe() {
    if (ai.checked) return ai.available;
    if (ai.probing) return ai.probing;
    ai.probing = PF.use('sample', 9000).then((sample) => {
      ai.sample = sample || null;
      ai.available = !!sample;
      ai.checked = true;
      return ai.available;
    });
    return ai.probing;
  }

  async function ready(state) { return enabled(state) && probe(); }

  function errorKey(code) {
    switch (code) {
      case 'not_granted': case 'not_declared': case 'capability_disabled': case 'capability_removed': return 'ai.err.notGranted';
      case 'sampling_disabled': return 'ai.err.disabled';
      case 'rate_limited': return 'ai.err.rate';
      case 'session_expired': return 'ai.err.session';
      case 'cancelled': return '';
      default: return 'ai.err.failed';
    }
  }

  function remember(error) {
    const code = (error && error.code) || 'upstream_error';
    ai.lastError = code;
    if (['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'].includes(code)) ai.available = false;
    return code;
  }

  function status(state) {
    if (!enabled(state)) return { on: false, available: false, checked: true, key: 'ai.err.off' };
    if (!ai.checked) return { on: true, available: false, checked: false, key: '' };
    if (!ai.available) return { on: true, available: false, checked: true, key: ai.lastError ? errorKey(ai.lastError) : 'ai.err.none' };
    return { on: true, available: true, checked: true, key: '' };
  }

  function langName(state) { return state.prefs.language === 'sv' ? 'Swedish' : 'English'; }

  /* ---------------- context: the least that is useful ---------------- */

  function contextFor(state, now) {
    const key = U.dateKey(now);
    const plan = P.planDay(state, now);
    const b = plan.buckets;
    const pulse = M.pulseFor(state, key);
    const brief = (i) => {
      const o = { id: i.id, title: i.title, kind: i.kind, minutes: i.minutes };
      if (i.dueDate) o.due = i.dueDate;
      if (i.date && i.date !== key) o.planned = i.date;
      if (i.energy !== 'medium') o.energy = i.energy;
      if (i.postponed) o.postponed = i.postponed;
      return o;
    };
    return {
      now: `${I.weekdayName(U.weekday(key))} ${key} ${U.toClock(plan.nowMin)}`,
      mode: A.engine.effectiveMode(state, key),
      pulse: pulse ? { energy: pulse.energy, mood: pulse.mood, stress: pulse.stress, sleep: pulse.sleep } : null,
      today: {
        must: b.must.slice(0, 12).map(brief),
        good: b.good.slice(0, 12).map(brief),
        canWait: b.later.slice(0, 12).map(brief),
        doneToday: b.done.slice(0, 8).map((i) => i.title),
      },
      fixed: plan.fixed.filter((f) => f.end > plan.nowMin).map((f) => ({ title: f.title, at: U.toClock(f.start), until: U.toClock(f.end) })),
      freeMinutesLeft: plan.freeMinutes,
      leaveInMinutes: plan.next && plan.next.away ? plan.minutesUntilNext : null,
      postponedOften: state.items.filter((i) => i.status === 'open' && i.postponed >= 2).slice(0, 8).map(brief),
      waitingFor: It.adminList(state, key).waiting.slice(0, 8).map((i) => ({ id: i.id, title: i.title, followUp: i.followUp })),
      projects: state.projects.filter((p) => p.status === 'active').slice(0, 8).map((p) => {
        const n = It.nextAction(state, p.id);
        return { title: p.title, outcome: p.outcome, next: n ? { id: n.id, title: n.title } : null };
      }),
      routines: state.routines.filter((r) => r.active).map((r) => r.name).slice(0, 8),
      counts: { shopping: It.shoppingList(state).count, inbox: It.inbox(state).length },
      prefs: { wake: state.prefs.wake, sleep: state.prefs.sleep, density: state.prefs.density, tone: state.prefs.tone },
    };
  }

  /* ---------------- brain dump parsing ---------------- */

  function parsePrompt(state, text, now) {
    const key = U.dateKey(now);
    const people = (state.people || []).map((p) => p.name).filter(Boolean);
    return `You turn a person's messy brain dump into separate, structured things for a calm personal assistant app.
Today is ${I.weekdayName(U.weekday(key))} ${key}, the time is ${U.toClock(U.minutesOfDay(now))}. The user writes in ${langName(state)}; keep titles in the user's language, short (at most about 6 words): a verb first for tasks, only the product for shopping.

Reply with only JSON in exactly this shape:
{"items":[{"kind":"task|shopping|admin|chore|reminder|event|note|idea","title":"...","date":"YYYY-MM-DD or empty","dueDate":"YYYY-MM-DD or empty","time":"HH:MM or empty","minutes":10,"energy":"light|medium|heavy","category":"...","background":false,"recur":null,"forPerson":"","confidence":0.9}]}

Rules:
- One entry per separate thing. Never merge two things. Never add anything that was not said.
- shopping = something to buy. admin = appointments, calls, forms, payments, subscriptions, deliveries, school. chore = a recurring household task. reminder = something to remember (birthdays, presents). event = a commitment at a clock time. note = information to keep. idea = maybe/someday.
- date = the day it is planned for. dueDate = a deadline ("by Friday"; "this week" means the coming Friday).
- Only set time if a clock time was said. Only set recur ({"unit":"day|week|month","every":1,"weekdays":[0-6]}) if repetition was said.
- shopping category: produce, dairy, bread, meat, pantry, frozen, drinks, household, hygiene, pharmacy, baby, clothing, pets, other. admin category: appointment, call, form, payment, subscription, delivery, school, household, other.
- background = true only for things that run by themselves once started (washing machine, dishwasher).
- forPerson only if one of these names is mentioned: ${people.length ? people.join(', ') : '(none)'}.
- When unsure of the kind, give your best guess with confidence below 0.6.

Text:
"""${String(text).slice(0, 3000)}"""`;
  }

  const KINDS = ['task', 'shopping', 'admin', 'chore', 'reminder', 'event', 'note', 'idea'];

  function cleanCandidate(raw, state, today) {
    if (!raw || typeof raw !== 'object') return null;
    const title = String(raw.title == null ? '' : raw.title).replace(/\s+/g, ' ').trim().slice(0, 140);
    if (title.length < 2) return null;
    const kind = KINDS.includes(raw.kind) ? raw.kind : 'task';
    const dateOk = (d) => U.isDateKey(d) && U.daysBetween(today, d) >= -1 && U.daysBetween(today, d) <= 400;
    const est = A.parse.estimate(` ${U.normalize(title)} `, kind === 'event' ? 'task' : kind);
    let category = String(raw.category || '');
    if (kind === 'shopping') category = M.SHOP_CATEGORIES.includes(category) ? category : (A.parse.productCategory(title) || 'other');
    else if (kind === 'admin') category = M.ADMIN_CATEGORIES.includes(category) ? category : 'other';
    else if (kind === 'chore') category = 'home';
    else category = '';
    const people = (state.people || []).map((p) => p.name);
    const minutes = Number(raw.minutes);
    const c = {
      tempId: U.makeId('cand'), kind, title, raw: '',
      date: dateOk(raw.date) ? raw.date : '', dueDate: dateOk(raw.dueDate) ? raw.dueDate : '',
      time: U.toMinutes(raw.time) !== null ? U.toClock(U.toMinutes(raw.time)) : '',
      recur: raw.recur ? M.normRecur(raw.recur) : null,
      minutes: kind === 'event' ? (Number.isFinite(minutes) && minutes >= 15 ? Math.min(480, Math.round(minutes)) : 60)
        : Number.isFinite(minutes) && minutes > 0 ? U.clamp(Math.round(minutes), 1, 480) : est.minutes,
      energy: M.ENERGIES.includes(raw.energy) ? raw.energy : est.energy,
      context: kind === 'admin' && category === 'call' ? 'phone' : (category === 'home' ? 'home' : 'anywhere'),
      background: raw.background === true,
      category, adminStatus: kind === 'admin' ? 'action' : '',
      forPerson: people.includes(raw.forPerson) ? raw.forPerson : '',
      confidence: Number.isFinite(Number(raw.confidence)) ? U.clamp(Number(raw.confidence), 0, 1) : 0.7,
    };
    if (c.kind === 'event' && !c.time) { c.kind = 'task'; c.minutes = est.minutes; }
    if (c.kind === 'task' && c.recur) { c.kind = 'chore'; c.category = 'home'; }
    c.review = A.parse.needsReview(c);
    c.hint = c.kind === 'event' ? 'cap.hintEvent' : (c.kind === 'reminder' && !c.date && !c.dueDate) ? 'cap.hintWhen' : c.confidence < 0.6 ? 'cap.hintKind' : '';
    return c;
  }

  /**
   * Brain dump → candidates. Uses AI when available and allowed; otherwise,
   * or when AI fails, the rules. The result always says which was used.
   */
  async function parseDump(state, text, now, opts) {
    const rules = A.parse.parse(state, text, now);
    if (rules.question) return Object.assign(rules, { mode: 'rules' });
    if (!(await ready(state))) return Object.assign(rules, { mode: 'rules', note: status(state).key });
    try {
      const answer = await ai.sample.json(parsePrompt(state, text, now), { modelTier: 'quick', signal: opts && opts.signal });
      const today = U.dateKey(now);
      const list = Array.isArray(answer) ? answer : (answer && Array.isArray(answer.items) ? answer.items : []);
      const candidates = list.map((x) => cleanCandidate(x, state, today)).filter(Boolean).slice(0, 40);
      if (!candidates.length) return Object.assign(rules, { mode: 'rules', note: rules.candidates.length ? 'ai.err.failed' : '' });
      return { mode: 'ai', candidates, question: false };
    } catch (error) {
      const code = remember(error);
      if (code === 'cancelled') return Object.assign(rules, { mode: 'rules', cancelled: true });
      return Object.assign(rules, { mode: 'rules', note: errorKey(code) });
    }
  }

  /* ---------------- coach ---------------- */

  function coachRules(state) {
    return `You are Aura, a calm and practical everyday assistant inside the user's own planning app. Be adult, concise and warm without being sugary. Never preachy, never motivational slogans, no emoji. Reply in ${langName(state)}${state.prefs.tone === 'direct' ? ', in a direct and brief style' : ''}.
The goal is useful action, not conversation: prefer ONE concrete next step, based on the plan below. At most about 80 words.
You may propose changes; the user confirms them before anything happens. Only when changes would clearly help, end with one line:
<actions>[...]</actions>
containing a JSON array that uses only these shapes and only ids that appear in the context:
{"op":"done","id":"..."}
{"op":"move","id":"...","to":"tomorrow|later|nextweek|YYYY-MM-DD"}
{"op":"bucket","id":"...","bucket":"must|good|later"}
{"op":"add","title":"...","kind":"task|shopping|admin|reminder","date":"YYYY-MM-DD or empty","minutes":15}
{"op":"smaller","id":"...","first":"a 5-15 minute first step","minutes":10}
{"op":"mode","mode":"low|chaos|normal"}
Do not diagnose anything, and give no medical, legal or financial advice beyond everyday practicality. If the user seems to be in crisis, say kindly that Aura is a planning tool and suggest contacting someone they trust or local emergency services.`;
  }

  function cleanAction(raw, state, today) {
    if (!raw || typeof raw !== 'object') return null;
    const exists = (id) => !!M.itemById(state, String(id || ''));
    switch (raw.op) {
      case 'done': return exists(raw.id) ? { op: 'item.done', id: raw.id } : null;
      case 'move': {
        if (!exists(raw.id)) return null;
        const to = ['tomorrow', 'later', 'nextweek', 'weekend'].includes(raw.to) ? raw.to
          : (U.isDateKey(raw.to) && raw.to > today && U.daysBetween(today, raw.to) <= 120 ? raw.to : null);
        return to ? { op: 'item.postpone', id: raw.id, to } : null;
      }
      case 'bucket': return exists(raw.id) && ['must', 'good', 'later'].includes(raw.bucket) ? { op: 'item.bucket', id: raw.id, bucket: raw.bucket } : null;
      case 'add': {
        const title = String(raw.title || '').replace(/\s+/g, ' ').trim().slice(0, 120);
        if (title.length < 2) return null;
        const kind = ['task', 'shopping', 'admin', 'reminder'].includes(raw.kind) ? raw.kind : 'task';
        const date = U.isDateKey(raw.date) && raw.date >= today && U.daysBetween(today, raw.date) <= 120 ? raw.date : '';
        const minutes = U.clamp(Math.round(Number(raw.minutes) || 15), 1, 240);
        return { op: 'item.add', item: { kind, title, date, minutes, source: 'coach' } };
      }
      case 'smaller': {
        if (!exists(raw.id)) return null;
        const first = String(raw.first || '').replace(/\s+/g, ' ').trim().slice(0, 100);
        if (first.length < 2) return null;
        return { op: 'item.split', id: raw.id, first, minutes: U.clamp(Math.round(Number(raw.minutes) || 10), 3, 30) };
      }
      case 'mode': return ['low', 'chaos', 'normal'].includes(raw.mode) ? { op: 'day.mode', date: today, mode: raw.mode === 'normal' ? '' : raw.mode } : null;
      default: return null;
    }
  }

  function splitReply(text) {
    const m = /<actions>([\s\S]*?)(<\/actions>|$)/i.exec(text);
    if (!m) return { reply: text.trim(), rawActions: [] };
    let rawActions = [];
    try { const parsed = JSON.parse(m[1].trim()); rawActions = Array.isArray(parsed) ? parsed : []; } catch (e) { rawActions = []; }
    return { reply: text.slice(0, m.index).trim(), rawActions };
  }

  /**
   * One coach turn. `turns` are [{role, content}] the page keeps (Claude keeps nothing).
   * onText receives the visible reply so far (without the actions line).
   */
  async function coach(state, turns, now, opts) {
    if (!(await ready(state))) return { ok: false, key: status(state).key };
    const today = U.dateKey(now);
    const intro = `${coachRules(state)}\n\nThe user's plan right now (ids are internal, never show them):\n${JSON.stringify(contextFor(state, now))}`;
    const recent = turns.slice(-10).map((t) => ({ role: t.role, content: String(t.content).slice(0, 2000) }));
    const input = [{ role: 'user', content: intro }, ...recent];
    if (input[input.length - 1].role !== 'user') return { ok: false, key: 'ai.err.failed' };
    try {
      const res = await ai.sample(input, {
        modelTier: 'default', cache: false, signal: opts && opts.signal,
        onText: ({ text }) => { if (opts && opts.onText) opts.onText(splitReply(text).reply); },
      });
      const { reply, rawActions } = splitReply(res.text || '');
      const actions = rawActions.map((a) => cleanAction(a, state, today)).filter(Boolean).slice(0, 8);
      return { ok: true, reply: reply || '…', actions, truncated: !!res.truncated };
    } catch (error) {
      const code = remember(error);
      return { ok: false, key: errorKey(code), cancelled: code === 'cancelled', partial: error && error.text ? splitReply(error.text).reply : '' };
    }
  }

  A.ai = {
    probe, ready, enabled, status, errorKey, contextFor, parseDump, parsePrompt, cleanCandidate,
    coach, coachRules, cleanAction, splitReply,
    _reset() { ai.sample = null; ai.checked = false; ai.available = false; ai.lastError = null; ai.probing = null; },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
