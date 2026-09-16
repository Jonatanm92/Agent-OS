/* Min vardag — verifiering av de krav som måste hålla.
 * Alla testpersoner är påhittade. Riktiga uppgifter finns inte i kod. */
const h = require('./harness.js');
const MV = h.loadCore();
const { suite, test, assert, equal, fixtureState, at } = h;
const U = MV.util, M = MV.model, P = MV.planner, L = MV.language, A = MV.apply;

const TODAY = '2026-09-16';      // onsdag
const TOMORROW = '2026-09-17';

function workdayState() {
  const s = fixtureState(MV);
  s.days[TODAY] = Object.assign(M.dayDefaults(), {
    work: 'ja',
    children: { barn_alva: 'ja', barn_noa: 'ja', barn_vide: 'nej' },
  });
  return s;
}

function addTask(state, fields) {
  const task = M.newTask(fields);
  state.tasks.push(task);
  return task;
}

/* ─────────────────────────────────────────────────────────── */
suite('1. Okänt schema ger inga påhittade lämningar eller hämtningar', () => {
  const state = fixtureState(MV);   // allt okänt
  const plan = P.planDay(state, at('05:30'));

  test('ingen lämning skapas när barnens närvaro är okänd', () => {
    assert(!plan.fixed.some((f) => f.id === 'lamning'), 'lämning skulle inte finnas');
  });
  test('ingen hämtning skapas när hämtningstid saknas', () => {
    assert(!plan.fixed.some((f) => f.id === 'hamtning'), 'hämtning skulle inte finnas');
  });
  test('inget arbetspass skapas när arbetsdagen är okänd', () => {
    assert(!plan.fixed.some((f) => f.id === 'arbete'), 'arbete skulle inte finnas');
  });
  test('appen frågar i stället för att gissa', () => {
    assert(plan.notes.some((n) => n.field === 'work'), 'saknar fråga om arbetsdag');
    assert(plan.notes.some((n) => n.field === 'children'), 'saknar fråga om barnen');
  });
  test('okänt är fortfarande ett giltigt värde', () => {
    equal(M.workdayFor(state, TODAY), 'okand');
    equal(M.childPresence(state, TODAY, 'barn_alva'), 'okand');
  });

  test('hämtning skapas först när tiden faktiskt angetts', () => {
    const s2 = workdayState();
    s2.settings.pickUpTime = '15:30';
    const p2 = P.planDay(s2, at('05:30'));
    assert(p2.fixed.some((f) => f.id === 'hamtning'), 'hämtning borde finnas nu');
    assert(p2.fixed.some((f) => f.id === 'lamning'), 'lämning borde finnas nu');
    const lamning = p2.fixed.find((f) => f.id === 'lamning');
    assert(!/Vide/.test(lamning.title), 'Vide är inte hos mig i dag och ska inte nämnas');
  });
});

/* ─────────────────────────────────────────────────────────── */
suite('2. Omplanering respekterar aktuell tid och fasta åtaganden', () => {
  test('en morgonplan innehåller morgonrutinen', () => {
    const plan = P.planDay(workdayState(), at('05:10'));
    assert(plan.fixed.some((f) => f.id === 'morgon'), 'morgonrutin saknas tidigt på dagen');
  });

  test('en eftermiddagsplan börjar inte med frukost eller morgonrutin', () => {
    const plan = P.planDay(workdayState(), at('16:30'));
    assert(!plan.fixed.some((f) => f.id === 'morgon'), 'morgonrutin ska inte återkomma på eftermiddagen');
    equal(plan.nowClock, '16:30');
  });

  test('inget planeras före aktuell tid', () => {
    const state = workdayState();
    state.settings.pickUpTime = '15:30';
    for (let i = 0; i < 5; i++) addTask(state, { title: `Uppgift ${i}`, minutes: 20 });
    const plan = P.planDay(state, at('17:20'));
    for (const p of plan.priorities) {
      assert(p.start >= U.toMinutes('17:20'), `${p.title} planerades ${U.toClock(p.start)}, före nu`);
    }
  });

  test('fasta åtaganden blockeras och planeras inte över', () => {
    const state = workdayState();
    for (let i = 0; i < 6; i++) addTask(state, { title: `Uppgift ${i}`, minutes: 45 });
    const plan = P.planDay(state, at('05:10'));
    const arbete = plan.fixed.find((f) => f.id === 'arbete');
    for (const p of plan.priorities) {
      assert(p.end <= arbete.start || p.start >= arbete.end,
        `${p.title} (${U.toClock(p.start)}–${U.toClock(p.end)}) krockar med arbetet`);
    }
  });

  test('marginal lämnas — dagen fylls inte helt', () => {
    const state = workdayState();
    for (let i = 0; i < 10; i++) addTask(state, { title: `Uppgift ${i}`, minutes: 60 });
    const plan = P.planDay(state, at('16:30'));
    assert(plan.plannedMinutes <= plan.freeMinutes * 0.75,
      `planerade ${plan.plannedMinutes} av ${plan.freeMinutes} lediga minuter`);
  });

  test('högst tre prioriteringar', () => {
    const state = workdayState();
    for (let i = 0; i < 12; i++) addTask(state, { title: `Uppgift ${i}`, minutes: 15 });
    const plan = P.planDay(state, at('16:30'));
    assert(plan.priorities.length <= 3, `fick ${plan.priorities.length} prioriteringar`);
  });

  test('sena kvällen fylls inte med flera aktiviteter', () => {
    const state = workdayState();
    state.settings.bedtime = '22:30';
    for (let i = 0; i < 6; i++) addTask(state, { title: `Uppgift ${i}`, minutes: 20 });
    const plan = P.planDay(state, at('20:10'));
    const late = plan.priorities.filter((p) => p.start >= U.toMinutes('20:00') && p.kind !== 'forberedelse');
    assert(late.length <= 1, `${late.length} aktiviteter efter 20:00`);
  });
});

/* ─────────────────────────────────────────────────────────── */
suite('3. Låg ork ger en lättare plan, utan att dölja vad som händer', () => {
  function withTasks() {
    const state = workdayState();
    addTask(state, { title: 'Hämta paket', minutes: 30, load: 'medel' });
    addTask(state, { title: 'Storstäda garaget', minutes: 90, load: 'tung' });
    addTask(state, { title: 'Ringa tandläkaren', minutes: 15, load: 'latt' });
    addTask(state, { title: 'Läkarintyg', minutes: 20, deadline: TODAY, load: 'medel' });
    return state;
  }

  const normal = P.planDay(withTasks(), at('16:30'));
  const low = (() => { const s = withTasks(); s.days[TODAY].energy = 'lag'; return P.planDay(s, at('16:30')); })();

  test('låg ork ger färre prioriteringar', () => {
    assert(low.priorities.length < normal.priorities.length,
      `låg: ${low.priorities.length}, normal: ${normal.priorities.length}`);
  });
  test('nödvändigt ansvar med tidsgräns finns kvar', () => {
    assert(low.priorities.some((p) => p.title === 'Läkarintyg'), 'tidsgränsad uppgift försvann');
  });
  test('det som lyfts ur visas med skäl', () => {
    assert(low.moved.length > 0, 'inget redovisas som flyttat');
    assert(low.moved.every((m) => !!m.reason), 'flyttade poster saknar skäl');
    assert(low.moved.some((m) => /låg ork/i.test(m.reason)), 'inget skäl nämner orken');
  });
  test('fasta åtaganden tas aldrig bort vid låg ork', () => {
    equal(low.fixed.length, normal.fixed.length);
  });
  test('vid låg ork reserveras återhämtning, inte fler sysslor', () => {
    if (low.reserved) equal(low.reserved.title, 'Återhämtning');
  });
  test('appen hittar inte på städning för att fylla ledig tid', () => {
    const state = workdayState();          // inga uppgifter alls
    const plan = P.planDay(state, at('16:30'));
    equal(plan.priorities.length, 0);
    if (plan.reserved) assert(!/städ|projekt/i.test(plan.reserved.title), 'föreslog en påhittad syssla');
  });
});

/* ─────────────────────────────────────────────────────────── */
suite('4. Delvis genomförda inköp hanteras korrekt', () => {
  function stateWithNeed() {
    const s = fixtureState(MV);
    s.needs.push(Object.assign(M.newNeed({ childId: 'barn_alva', title: '2 byxor', garment: 'byxor', qty: 2 }), { id: 'behov_byxor' }));
    return s;
  }

  test('ett av två köpta lämnar resten kvar', () => {
    const r = A.applyOps(stateWithNeed(), [{ op: 'need.done', needId: 'behov_byxor', qty: 1 }], at('17:00'));
    const need = r.state.needs[0];
    equal(need.doneQty, 1);
    equal(need.status, 'behover', 'behovet ska inte vara bekräftat klart');
    equal(M.needRemaining(need), 1);
  });

  test('beskrivningen säger hur mycket som återstår', () => {
    const text = A.describeOp(stateWithNeed(), { op: 'need.done', needId: 'behov_byxor', qty: 1 });
    assert(/1 kvar/.test(text), `fick: ${text}`);
  });

  test('båda köpta ger bekräftat klart', () => {
    let s = stateWithNeed();
    s = A.applyOps(s, [{ op: 'need.done', needId: 'behov_byxor', qty: 1 }], at('17:00')).state;
    s = A.applyOps(s, [{ op: 'need.done', needId: 'behov_byxor', qty: 1 }], at('17:10')).state;
    equal(s.needs[0].status, 'bekraftat');
    equal(M.needRemaining(s.needs[0]), 0);
  });

  test('"var slut" håller behovet öppet och noterar orsaken', () => {
    const r = A.applyOps(stateWithNeed(), [{ op: 'need.blocked', needId: 'behov_byxor', note: 'Slut i butiken' }], at('17:00'));
    equal(r.state.needs[0].status, 'behover');
    equal(r.state.needs[0].doneQty, 0);
    equal(r.state.needs[0].note, 'Slut i butiken');
  });

  test('ett inköpsförslag är inte ett genomfört köp', () => {
    const s = stateWithNeed();
    const r = A.applyOps(s, [{ op: 'task.addForNeeds', needIds: ['behov_byxor'], earliest: '16:00' }], at('09:00'));
    equal(r.state.needs[0].status, 'planerat', 'planerat är inte bekräftat');
    equal(r.state.needs[0].doneQty, 0);
    equal(r.state.tasks.length, 1);
  });
});

/* ─────────────────────────────────────────────────────────── */
suite('5. Oklara instruktioner ändrar inte fel uppgifter', () => {
  function twoJackets() {
    const s = fixtureState(MV);
    s.needs.push(Object.assign(M.newNeed({ childId: 'barn_alva', title: 'Skaljacka', garment: 'skaljacka', qty: 1 }), { id: 'behov_a' }));
    s.needs.push(Object.assign(M.newNeed({ childId: 'barn_noa', title: 'Skaljacka', garment: 'skaljacka', qty: 1 }), { id: 'behov_n' }));
    s.needs.push(Object.assign(M.newNeed({ childId: 'barn_alva', title: '2 byxor', garment: 'byxor', qty: 2 }), { id: 'behov_b1' }));
    s.needs.push(Object.assign(M.newNeed({ childId: 'barn_vide', title: '2 byxor', garment: 'byxor', qty: 2 }), { id: 'behov_b2' }));
    return s;
  }

  const state = twoJackets();
  const result = L.interpret(state, 'Jackan är köpt, men byxorna var slut.', at('17:30'));

  test('inget tillämpas automatiskt när det är oklart', () => {
    equal(result.ops.length, 0, `oväntade automatiska ändringar: ${JSON.stringify(result.ops)}`);
  });
  test('appen frågar vilket barn jackan gäller', () => {
    const q = result.questions.find((x) => /jacka/i.test(x.text));
    assert(q, 'ingen fråga om jackan');
    equal(q.options.length, 2);
    assert(q.options.some((o) => /Alva/.test(o.label)) && q.options.some((o) => /Noa/.test(o.label)));
  });
  test('appen frågar vilket barn byxorna gäller', () => {
    const q = result.questions.find((x) => /byx/i.test(x.text));
    assert(q, 'ingen fråga om byxorna');
    equal(q.options.length, 2);
  });
  test('rätt sak markeras klar och rätt sak står kvar när jag svarar', () => {
    const jacket = result.questions.find((x) => /jacka/i.test(x.text));
    const pickNoa = jacket.options.find((o) => /Noa/.test(o.label));
    const trousers = result.questions.find((x) => /byx/i.test(x.text));
    const pickAlva = trousers.options.find((o) => /Alva/.test(o.label));

    const after = A.applyOps(state, [...pickNoa.ops, ...pickAlva.ops], at('17:35')).state;
    equal(after.needs.find((n) => n.id === 'behov_n').status, 'bekraftat', 'Noas jacka skulle bli klar');
    equal(after.needs.find((n) => n.id === 'behov_a').status, 'behover', 'Alvas jacka ska INTE röras');
    equal(after.needs.find((n) => n.id === 'behov_b1').status, 'behover', 'byxorna står kvar');
    equal(after.needs.find((n) => n.id === 'behov_b1').note, 'Slut i butiken');
    equal(after.needs.find((n) => n.id === 'behov_b2').status, 'behover', 'Vides byxor ska inte röras');
  });
  test('ursprungligt tillstånd är orört (grunden för ångra)', () => {
    equal(state.needs.find((n) => n.id === 'behov_n').status, 'behover');
  });
  test('"det här hann jag inte" frågar vilken uppgift som avses', () => {
    const s = fixtureState(MV);
    addTask(s, { title: 'Tvätta överdragskläder' });
    addTask(s, { title: 'Boka tid hos frisören' });
    const r = L.interpret(s, 'Det här hann jag inte.', at('20:00'));
    equal(r.ops.length, 0);
    assert(r.questions.length >= 1, 'borde fråga vilken uppgift');
    assert(r.questions[0].options.length >= 2);
  });
});

/* ─────────────────────────────────────────────────────────── */
suite('6. Huvudflödet: berätta ett behov → plan → genomfört → status', () => {
  const state = workdayState();
  const first = L.interpret(state, 'Alva behöver fler byxor och Noa behöver skalkläder. Jag måste fixa det efter jobbet.', at('09:00'));

  test('skalkläder tolkas som både skaljacka och skalbyxa', () => {
    const garments = first.ops.filter((o) => o.op === 'need.add').map((o) => o.garment);
    assert(garments.includes('skaljacka'), `fick: ${garments}`);
    assert(garments.includes('skalbyxa'), `fick: ${garments}`);
  });
  test('behoven kopplas till rätt barn', () => {
    const adds = first.ops.filter((o) => o.op === 'need.add');
    assert(adds.every((o) => o.childId === 'barn_noa'), 'skalkläderna ska höra till Noa');
  });
  test('"fler byxor" ger en kort fråga om antal i stället för en gissning', () => {
    const q = first.questions.find((x) => /hur många/i.test(x.text));
    assert(q, `ingen antalsfråga; frågor: ${JSON.stringify(first.questions.map((x) => x.text))}`);
    assert(/Alva/.test(q.text));
  });
  test('"efter jobbet" ger en inköpsuppgift tidigast när arbetsdagen slutar', () => {
    const task = first.ops.find((o) => o.op === 'task.addForNeeds');
    assert(task, 'ingen inköpsuppgift skapades');
    equal(task.earliest, '16:00');
    equal(task.context, 'butik');
  });
  test('meningen ger EN inköpsuppgift, inte en extra intetsägande', () => {
    const tasks = first.ops.filter((o) => o.op === 'task.add' || o.op === 'task.addForNeeds');
    equal(tasks.length, 1, `fick: ${JSON.stringify(tasks.map((t) => t.title || t.op))}`);
  });
  test('antal skrivs på begriplig svenska', () => {
    const q = first.questions.find((x) => /hur många/i.test(x.text));
    assert(q.options.some((o) => o.label === '1 par byxor'), `fick: ${q.options.map((o) => o.label).join(', ')}`);
    equal(L.needTitle('byxor', 2), '2 par byxor');
    equal(L.needTitle('tjocktroja', 2), '2 tjocktröjor');
    equal(L.needTitle('skaljacka', 1), 'Skaljacka');
  });

  const applied = A.applyOps(state, [
    ...first.ops,
    ...first.questions[0].options.find((o) => /^2 par byxor$/.test(o.label)).ops,
  ], at('09:00')).state;

  test('behoven blir planerade — inte bekräftade', () => {
    assert(applied.needs.length >= 3, `fick ${applied.needs.length} behov`);
    assert(applied.needs.every((n) => n.status !== 'bekraftat'), 'inget får vara bekräftat ännu');
  });
  test('inköpsuppgiften hamnar efter arbetsdagen i planen', () => {
    const plan = P.planDay(applied, at('09:00'));
    const shopping = plan.priorities.find((p) => /Handla/.test(p.title));
    assert(shopping, `inköpet saknas i planen: ${JSON.stringify(plan.priorities.map((p) => p.title))}`);
    assert(shopping.start >= U.toMinutes('16:00'), `planerades ${U.toClock(shopping.start)}`);
  });
  test('samma information behöver inte skrivas in igen nästa dag', () => {
    const tomorrow = P.planDay(applied, new Date(at('09:00').getTime() + 86400000));
    assert(applied.needs.length >= 3, 'behoven finns kvar');
    assert(tomorrow.dateKey === TOMORROW);
  });
});

/* ─────────────────────────────────────────────────────────── */
suite('7. Ork, närvaro och storlekar via fritext', () => {
  test('"Jag har låg ork" sänker dagens ork', () => {
    const r = L.interpret(fixtureState(MV), 'Jag har låg ork i dag.', at('15:00'));
    const op = r.ops.find((o) => o.op === 'day.energy');
    assert(op, 'ingen orkändring');
    equal(op.energy, 'lag');
    equal(op.date, TODAY);
  });
  test('"Barnen kommer till mig i kväll" sätter närvaro i dag', () => {
    const r = L.interpret(fixtureState(MV), 'Barnen kommer till mig i kväll.', at('15:00'));
    const ops = r.ops.filter((o) => o.op === 'day.children');
    equal(ops.length, 3);
    assert(ops.every((o) => o.value === 'ja' && o.date === TODAY));
  });
  test('storlek hos ett märke sparas som preliminär provstorlek', () => {
    const r = L.interpret(fixtureState(MV), 'Alva har storlek 110 på Lager 157.', at('15:00'));
    const op = r.ops.find((o) => o.op === 'size.set');
    assert(op, 'ingen storlek tolkad');
    equal(op.kind, 'marke');
    equal(op.value, '110');
    equal(op.preliminary, true);
  });
  test('kroppsmått hålls åtskilt från märkesstorlek', () => {
    const s = fixtureState(MV);
    const r = A.applyOps(s, [
      { op: 'size.set', childId: 'barn_alva', kind: 'kropp', label: 'Kroppslängd', value: '108 cm', preliminary: false },
      { op: 'size.set', childId: 'barn_alva', kind: 'marke', brand: 'Lager 157', label: 'Storlek', value: '110', preliminary: true },
    ], at('15:00'));
    equal(r.state.sizes.length, 2);
    const body = r.state.sizes.find((x) => x.kind === 'kropp');
    const brand = r.state.sizes.find((x) => x.kind === 'marke');
    equal(body.brand, '', 'kroppsmått ska inte ha märke');
    equal(brand.brand, 'Lager 157');
    equal(brand.preliminary, true);
  });
});

/* ─────────────────────────────────────────────────────────── */
suite('8. Ångra, rättelse och radering', () => {
  test('tillämpning ändrar aldrig originalet — ångra kan återställa', () => {
    const before = fixtureState(MV);
    before.needs.push(Object.assign(M.newNeed({ childId: 'barn_alva', title: 'Mössa', garment: 'mossa', qty: 1 }), { id: 'behov_m' }));
    const snapshot = JSON.stringify(before);
    const after = A.applyOps(before, [{ op: 'need.done', needId: 'behov_m' }], at('12:00')).state;
    equal(JSON.stringify(before), snapshot, 'originalet ändrades');
    equal(after.needs[0].status, 'bekraftat');
    const undone = JSON.parse(snapshot);
    equal(undone.needs[0].status, 'behover', 'ångra återställer');
  });

  test('en felaktig markering kan rättas', () => {
    let s = fixtureState(MV);
    s.needs.push(Object.assign(M.newNeed({ childId: 'barn_alva', title: '2 byxor', garment: 'byxor', qty: 2 }), { id: 'b' }));
    s = A.applyOps(s, [{ op: 'need.status', needId: 'b', status: 'bekraftat' }], at('12:00')).state;
    equal(s.needs[0].doneQty, 2);
    s = A.applyOps(s, [{ op: 'need.status', needId: 'b', status: 'behover' }], at('12:05')).state;
    equal(s.needs[0].status, 'behover');
    equal(s.needs[0].doneQty, 0, 'rättelsen ska nollställa antalet');
  });

  test('behov och uppgifter kan raderas helt', () => {
    let s = fixtureState(MV);
    s.needs.push(Object.assign(M.newNeed({ childId: 'barn_alva', title: 'Vantar', qty: 1 }), { id: 'v' }));
    const task = addTask(s, { title: 'Ringa förskolan' });
    s = A.applyOps(s, [{ op: 'need.remove', needId: 'v' }, { op: 'task.remove', taskId: task.id }], at('12:00')).state;
    equal(s.needs.length, 0);
    equal(s.tasks.length, 0);
  });

  test('ändringar på något som inte längre finns hoppas över i stället för att krascha', () => {
    const s = fixtureState(MV);
    const r = A.applyOps(s, [{ op: 'need.done', needId: 'finns_inte' }], at('12:00'));
    equal(r.applied.length, 0);
    equal(r.skipped.length, 1);
  });
});

/* ─────────────────────────────────────────────────────────── */
suite('9. Uppgifter och status finns kvar efter omladdning', () => {
  test('sparat tillstånd överlever en tur genom JSON', () => {
    let s = workdayState();
    s.needs.push(M.newNeed({ childId: 'barn_alva', title: '2 tjocktröjor', garment: 'tjocktroja', qty: 2 }));
    const task = addTask(s, { title: 'Handla kläder', minutes: 60, earliest: '16:00' });
    s = A.applyOps(s, [
      { op: 'need.done', needId: s.needs[0].id, qty: 1 },
      { op: 'task.done', taskId: task.id },
      { op: 'day.energy', date: TODAY, energy: 'lag' },
    ], at('17:00')).state;

    const reloaded = M.migrate(JSON.parse(JSON.stringify(s)));
    equal(reloaded.needs[0].doneQty, 1);
    equal(reloaded.needs[0].status, 'behover');
    equal(reloaded.tasks[0].status, 'klar');
    equal(M.energyFor(reloaded, TODAY), 'lag');
    equal(M.workdayFor(reloaded, TODAY), 'ja');
  });

  test('ofullständigt eller skadat sparat tillstånd kraschar inte', () => {
    const recovered = M.migrate({ needs: null, tasks: [{ title: 'trasig' }], settings: { wakeTime: '04:30' } });
    equal(recovered.needs.length, 0);
    equal(recovered.settings.wakeTime, '04:30');
    equal(recovered.settings.bedtime, '21:30', 'saknade inställningar fylls i');
    assert(Array.isArray(recovered.children));
  });
});

/* ─────────────────────────────────────────────────────────── */
suite('10. Missade förslag staplas inte på morgondagen', () => {
  test('en uppgift som redan föreslagits tränger sig inte före en ny', () => {
    const ctx = { dateKey: TODAY, energy: 'ok', isEvening: false, remainingMinutes: 600 };
    const stale = M.newTask({ title: 'Gammal', minutes: 30 });
    stale.lastOfferedDate = '2026-09-15';
    const fresh = M.newTask({ title: 'Ny', minutes: 30 });
    assert(P.score(stale, ctx).points < P.score(fresh, ctx).points, 'gammalt förslag ska sjunka');
  });

  test('men en tidsgräns väger fortfarande tyngst', () => {
    const ctx = { dateKey: TODAY, energy: 'ok', isEvening: false, remainingMinutes: 600 };
    const urgent = M.newTask({ title: 'Med tidsgräns', minutes: 30, deadline: TODAY });
    urgent.lastOfferedDate = '2026-09-15';
    const fresh = M.newTask({ title: 'Ny', minutes: 30 });
    assert(P.score(urgent, ctx).points > P.score(fresh, ctx).points, 'tidsgräns ska väga tyngre');
  });

  test('flyttad uppgift kommer inte tillbaka samma dag', () => {
    const state = workdayState();
    const task = addTask(state, { title: 'Ringa försäkringen', minutes: 20 });
    const moved = A.applyOps(state, [{ op: 'task.move', taskId: task.id, to: 'imorgon' }], at('16:00')).state;
    const plan = P.planDay(moved, at('16:30'));
    assert(!plan.priorities.some((p) => p.taskId === task.id), 'uppgiften dök upp igen samma dag');
  });
});

/* ─────────────────────────────────────────────────────────── */
suite('11. Kväll och morgon', () => {
  test('okänd morgondag ger inga påhittade förberedelser', () => {
    const e = MV.evening.eveningPlan(fixtureState(MV), at('20:00'));
    equal(e.items.length, 0);
    assert(e.notes.length > 0, 'borde fråga i stället');
    assert(/Inget att förbereda/.test(e.headline), e.headline);
  });

  test('bekräftad förskoledag i morgon ger konkreta förberedelser', () => {
    const s = fixtureState(MV);
    s.days[TOMORROW] = Object.assign(M.dayDefaults(), { work: 'ja', children: { barn_alva: 'ja', barn_noa: 'ja', barn_vide: 'nej' } });
    const e = MV.evening.eveningPlan(s, at('20:00'));
    assert(e.items.some((i) => i.key === 'vaska'), 'väskan saknas');
    assert(e.items.some((i) => /Alva, Noa/.test(i.label)), 'fel barn i förberedelserna');
    assert(!e.items.some((i) => /Vide/.test(i.label)), 'Vide är inte här i morgon');
  });

  test('högst tre genererade punkter — inga långa kvällslistor', () => {
    const s = fixtureState(MV);
    s.days[TOMORROW] = Object.assign(M.dayDefaults(), { work: 'ja', children: { barn_alva: 'ja', barn_noa: 'ja', barn_vide: 'ja' } });
    const e = MV.evening.eveningPlan(s, at('20:30'));
    assert(e.items.filter((i) => i.generated).length <= 3, 'för många kvällspunkter');
  });

  test('när allt är avbockat säger appen det i stället för att hitta på mer', () => {
    let s = fixtureState(MV);
    s.days[TOMORROW] = Object.assign(M.dayDefaults(), { work: 'ja', children: { barn_alva: 'ja' } });
    const first = MV.evening.eveningPlan(s, at('20:00'));
    for (const item of first.items) {
      s = A.applyOps(s, [{ op: 'prep.done', date: TODAY, key: item.key }], at('20:05')).state;
    }
    const after = MV.evening.eveningPlan(s, at('20:10'));
    equal(after.remaining, 0);
    equal(after.headline, 'Allt är förberett inför i morgon.');
    equal(after.items.length, first.items.length, 'inga nya uppgifter fick uppfinnas');
  });

  test('uppgångstiden 05.00 respekteras i läggdagsrådet', () => {
    const e = MV.evening.eveningPlan(fixtureState(MV), at('20:00'));
    assert(/05:00/.test(e.bedtimeHint), e.bedtimeHint);
  });
});

/* ─────────────────────────────────────────────────────────── */
suite('12. "Gör det här nu" utgår alltid från klockan', () => {
  test('pågående åtagande visas som pågående', () => {
    const plan = P.planDay(workdayState(), at('09:00'));
    equal(plan.nowCard.type, 'pagaende');
    equal(plan.nowCard.title, 'Arbete');
  });
  test('ett åtagande som börjar snart visas med nedräkning', () => {
    const s = workdayState();
    const plan = P.planDay(s, at('05:45'));
    assert(['snart', 'pagaende'].includes(plan.nowCard.type), plan.nowCard.type);
  });
  test('utan planerade uppgifter pressas ingenting fram', () => {
    const s = workdayState();
    const plan = P.planDay(s, at('19:00'));
    assert(['fritt', 'egen', 'kvall'].includes(plan.nowCard.type), plan.nowCard.type);
    assert(!/städ/i.test(plan.nowCard.title));
  });
  test('vid låg ork är nästa handling vila, inte press', () => {
    const s = workdayState();
    s.days[TODAY].energy = 'lag';
    const plan = P.planDay(s, at('19:00'));
    assert(/Vila|Återhämtning/.test(plan.nowCard.title), plan.nowCard.title);
  });
});

/* ─────────────────────────────────────────────────────────── */
suite('13. Återkommande åtaganden', () => {
  const R = MV.recurring;

  function withTraining() {
    const s = workdayState();                       // 2026-09-16 är en onsdag (veckodag 3)
    s.recurring.push(M.newRecurring({ title: 'Styrketräning', kind: 'egen', weekdays: [3, 5], start: '19:00', end: '20:00' }));
    return s;
  }

  test('infaller på vald veckodag', () => {
    const items = R.forDate(withTraining(), TODAY);
    equal(items.length, 1);
    equal(items[0].title, 'Styrketräning');
  });
  test('infaller inte på andra dagar', () => {
    equal(R.forDate(withTraining(), TOMORROW).length, 0, 'torsdag ska vara tom');
  });
  test('syns bland dagens fasta åtaganden', () => {
    const plan = P.planDay(withTraining(), at('16:30'));
    assert(plan.fixed.some((f) => f.title === 'Styrketräning'), 'saknas i planen');
  });
  test('blockeras inte över av andra uppgifter', () => {
    const s = withTraining();
    for (let i = 0; i < 6; i++) addTask(s, { title: `Uppgift ${i}`, minutes: 45 });
    const plan = P.planDay(s, at('16:30'));
    const training = plan.fixed.find((f) => f.title === 'Styrketräning');
    for (const pri of plan.priorities) {
      assert(pri.end <= training.start || pri.start >= training.end,
        `${pri.title} krockar med träningen`);
    }
  });
  test('gör inte dagen till arbetsdag av sig själv', () => {
    const s = fixtureState(MV);
    s.recurring.push(M.newRecurring({ title: 'Gitarr', weekdays: [3], start: '20:00' }));
    equal(M.workdayFor(s, TODAY), 'okand', 'arbetsdagen ska fortfarande vara okänd');
  });
  test('ett barnbundet åtagande hoppas över när barnet inte är här', () => {
    const s = fixtureState(MV);
    s.recurring.push(M.newRecurring({ title: 'Simskola', weekdays: [3], start: '17:00', childIds: ['barn_alva'] }));
    equal(R.forDate(s, TODAY).length, 0, 'okänd närvaro ska inte ge något åtagande');
    s.days[TODAY] = Object.assign(M.dayDefaults(), { children: { barn_alva: 'ja' } });
    equal(R.forDate(s, TODAY).length, 1, 'nu är barnet här');
  });
  test('pausat åtagande infaller inte', () => {
    let s = withTraining();
    s = A.applyOps(s, [{ op: 'recurring.toggle', id: s.recurring[0].id }], at('12:00')).state;
    equal(R.forDate(s, TODAY).length, 0);
  });
  test('beskrivs på läsbar svenska', () => {
    equal(R.describe({ weekdays: [1, 2, 3, 4, 5], start: '07:00' }), 'Vardagar 07:00');
    equal(R.describe({ weekdays: [3], start: '19:00' }), 'Onsdagar 19:00');
    equal(R.describe({ weekdays: [0, 6], start: '' }), 'Helger');
  });
});

/* ─────────────────────────────────────────────────────────── */
suite('14. Veckoöversikt', () => {
  test('sju dagar framåt, med i dag först', () => {
    const week = MV.recurring.weekOverview(workdayState(), at('08:00'), 7);
    equal(week.length, 7);
    equal(week[0].dateKey, TODAY);
    equal(week[0].isToday, true);
    equal(week[1].dateKey, TOMORROW);
  });
  test('okända dagar redovisas som okända', () => {
    const week = MV.recurring.weekOverview(fixtureState(MV), at('08:00'), 7);
    assert(week.every((d) => d.work === 'okand'), 'arbetsdagar ska vara okända');
    assert(week.every((d) => d.unknownChildren.length === 3), 'barnens dagar ska vara okända');
    assert(week.every((d) => d.present.length === 0), 'inga barn ska antas vara här');
  });
  test('tidsgränser syns på rätt dag', () => {
    const s = workdayState();
    addTask(s, { title: 'Lämna in blankett', deadline: TOMORROW });
    const week = MV.recurring.weekOverview(s, at('08:00'), 7);
    equal(week[1].deadlines.length, 1);
    equal(week[1].deadlines[0].title, 'Lämna in blankett');
    equal(week[0].deadlines.length, 0);
  });
});

/* ─────────────────────────────────────────────────────────── */
suite('15. Rutiner återkommer utan att skrivas in på nytt', () => {
  const Rt = MV.routines;

  function withRoutine() {
    const s = workdayState();
    s.routines.push(M.newRoutine({ name: 'Kvällsrutin', when: 'kvall', items: ['Diska', 'Lägg fram kläder'] }));
    return s;
  }

  test('rutinen finns utan att skrivas in varje dag', () => {
    const s = withRoutine();
    equal(Rt.forDate(s, TODAY, 'kvall').length, 1);
    equal(Rt.forDate(s, TOMORROW, 'kvall').length, 1);
    equal(Rt.forDate(s, U.addDays(TODAY, 30), 'kvall').length, 1);
  });

  test('avbockning gäller bara den dagen — listan nollställs i morgon', () => {
    let s = withRoutine();
    const routine = s.routines[0];
    s = A.applyOps(s, [{ op: 'routine.item', date: TODAY, routineId: routine.id, itemId: routine.items[0].id, done: true }], at('20:00')).state;

    equal(Rt.forDate(s, TODAY, 'kvall')[0].remaining, 1, 'en kvar i dag');
    equal(Rt.forDate(s, TOMORROW, 'kvall')[0].remaining, 2, 'i morgon ska allt vara obockat igen');
  });

  test('avbockning går att ångra', () => {
    let s = withRoutine();
    const routine = s.routines[0];
    const item = routine.items[0].id;
    s = A.applyOps(s, [{ op: 'routine.item', date: TODAY, routineId: routine.id, itemId: item, done: true }], at('20:00')).state;
    s = A.applyOps(s, [{ op: 'routine.item', date: TODAY, routineId: routine.id, itemId: item, done: false }], at('20:01')).state;
    equal(Rt.forDate(s, TODAY, 'kvall')[0].remaining, 2);
  });

  test('sammanfattningen säger när allt är klart', () => {
    let s = withRoutine();
    const routine = s.routines[0];
    for (const item of routine.items) {
      s = A.applyOps(s, [{ op: 'routine.item', date: TODAY, routineId: routine.id, itemId: item.id, done: true }], at('20:00')).state;
    }
    const sum = Rt.summary(s, TODAY, 'kvall');
    equal(sum.complete, true);
    equal(sum.label, 'Kvällsrutinen är klar');
  });

  test('en rutin som kräver barn visas inte när inga barn är här', () => {
    const s = fixtureState(MV);
    s.routines.push(M.newRoutine({ name: 'Kväll med barnen', when: 'kvall', items: ['Saga'], requiresChildren: true }));
    equal(Rt.forDate(s, TODAY, 'kvall').length, 0, 'okänd närvaro ska inte ge rutinen');
    s.days[TODAY] = Object.assign(M.dayDefaults(), { children: { barn_alva: 'ja' } });
    equal(Rt.forDate(s, TODAY, 'kvall').length, 1);
  });

  test('veckodagsfilter respekteras', () => {
    const s = fixtureState(MV);
    s.routines.push(M.newRoutine({ name: 'Bara fredag', when: 'morgon', items: ['Sopor'], weekdays: [5] }));
    equal(Rt.forDate(s, TODAY, 'morgon').length, 0, 'onsdag');
    equal(Rt.forDate(s, '2026-09-18', 'morgon').length, 1, 'fredag');
  });

  test('appen skapar inga rutiner åt mig', () => {
    equal(fixtureState(MV).routines.length, 0);
    assert(Rt.ROUTINE_TEMPLATES.length > 0, 'förslag ska finnas att välja');
  });
});

/* ─────────────────────────────────────────────────────────── */
suite('16. Packlistor', () => {
  const Rt = MV.routines;

  function withPack() {
    const s = fixtureState(MV);
    s.days[TODAY] = Object.assign(M.dayDefaults(), { children: { barn_alva: 'ja', barn_noa: 'nej' } });
    s.packLists.push(M.newPackList({ name: 'Förskola', childId: 'barn_alva', items: ['Extrakläder', 'Blöjor'] }));
    s.packLists.push(M.newPackList({ name: 'Förskola', childId: 'barn_noa', items: ['Extrakläder'] }));
    return s;
  }

  test('bara listor för barn som faktiskt är här visas', () => {
    const lists = Rt.packForDate(withPack(), TODAY);
    equal(lists.length, 1);
    equal(lists[0].childName, 'Alva');
  });

  test('avbockning räknas och nollställs nästa dag', () => {
    let s = withPack();
    const list = s.packLists[0];
    s = A.applyOps(s, [{ op: 'pack.item', date: TODAY, listId: list.id, itemId: list.items[0].id, done: true }], at('19:00')).state;
    equal(Rt.packForDate(s, TODAY)[0].remaining, 1);
    s.days[TOMORROW] = Object.assign(M.dayDefaults(), { children: { barn_alva: 'ja' } });
    equal(Rt.packForDate(s, TOMORROW)[0].remaining, 2, 'ny dag, ny lista');
  });

  test('en lista utan barn gäller alla dagar', () => {
    const s = fixtureState(MV);
    s.packLists.push(M.newPackList({ name: 'Gympapåse', childId: null, items: ['Skor'] }));
    equal(Rt.packForDate(s, TODAY).length, 1);
  });

  test('punkter kan läggas till och tas bort', () => {
    let s = withPack();
    const id = s.packLists[0].id;
    s = A.applyOps(s, [{ op: 'pack.addItem', listId: id, label: 'Regnkläder' }], at('19:00')).state;
    equal(s.packLists[0].items.length, 3);
    const removed = s.packLists[0].items[2].id;
    s = A.applyOps(s, [{ op: 'pack.removeItem', listId: id, itemId: removed }], at('19:01')).state;
    equal(s.packLists[0].items.length, 2);
  });
});

process.exitCode = h.report() ? 0 : 1;
