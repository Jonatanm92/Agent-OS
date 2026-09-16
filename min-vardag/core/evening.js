/* Min vardag — kväll och morgon.
 *
 * Syftet är att svara på "vad behöver jag förbereda inför i morgon?"
 * utan att skapa nya sysslor. Förberedelser härleds BARA ur bekräftade
 * fakta om morgondagen. Är inget bekräftat föreslås ingen förberedelse.
 * Är allt avbockat säger appen det — den hittar inte på mer.
 */
(function (root) {
  const MV = root.MinVardag || (root.MinVardag = {});
  const U = MV.util, M = MV.model, P = MV.planner;

  const MAX_GENERATED = 3;   // aldrig en lång kvällslista

  /**
   * @param {object} state
   * @param {Date} now
   * @returns {object} kvällsöversikt för morgondagen
   */
  function eveningPlan(state, now) {
    const s = state.settings;
    const today = U.dateKey(now);
    const tomorrow = U.addDays(today, 1);
    const nowMinutes = U.minutesOfDay(now);
    const day = M.getDay(state, today);
    const done = day.prepDone || [];

    const workday = M.workdayFor(state, tomorrow);
    const presence = M.presenceSummary(state, tomorrow);
    const hasChildren = presence.present.length > 0;
    const names = presence.present.map((c) => c.name).join(', ');

    const items = [];
    const notes = [];

    /* Förberedelser ur bekräftade fakta — inget annat. */
    if (hasChildren && workday === 'ja') {
      items.push({ key: 'vaska', label: `Packa väskan till ${names}`, why: 'Förskola i morgon', generated: true });
      items.push({ key: 'klader-barn', label: `Lägg fram kläder till ${names}`, why: 'Lämning 06.00 går fortare', generated: true });
    } else if (hasChildren) {
      items.push({ key: 'klader-barn', label: `Lägg fram kläder till ${names}`, why: 'Barnen är hos dig i morgon', generated: true });
    }
    if (workday === 'ja') {
      items.push({ key: 'egen-morgon', label: 'Förbered din egen morgon', why: `Du går upp ${s.wakeTime}`, generated: true });
    }

    /* Egna förberedelseuppgifter — dessa har du själv lagt in. */
    for (const task of M.openTasks(state)) {
      if (task.kind !== 'forberedelse') continue;
      if (task.scheduledDate && task.scheduledDate > tomorrow) continue;
      items.push({ key: `uppg:${task.id}`, label: task.title, why: 'Din egen förberedelse', taskId: task.id, generated: false });
    }

    /* Uppgifter i morgon som måste vara klara före arbetsdagens start. */
    for (const task of M.openTasks(state)) {
      if (task.scheduledDate !== tomorrow) continue;
      const earliest = U.toMinutes(task.earliest);
      const workStart = U.toMinutes(s.workStart);
      if (workday === 'ja' && earliest !== null && workStart !== null && earliest < workStart) {
        items.push({ key: `tidig:${task.id}`, label: `${task.title} (före jobbet)`, why: 'Ligger tidigt i morgon', taskId: task.id, generated: false });
      }
    }

    /* Öppna frågor i stället för antaganden. */
    if (workday === 'okand') {
      notes.push({ type: 'fraga', field: 'work', date: tomorrow, text: 'Jag vet inte om du arbetar i morgon.' });
    }
    if (presence.unknown.length) {
      notes.push({
        type: 'fraga', field: 'children', date: tomorrow,
        text: `Jag vet inte om ${presence.unknown.map((c) => c.name).join(', ')} är hos dig i morgon.`,
      });
    }

    /* Aldrig fler än ett par genererade punkter en kväll. */
    const generated = items.filter((i) => i.generated).slice(0, MAX_GENERATED);
    const own = items.filter((i) => !i.generated);
    const all = [...generated, ...own].map((item) => ({ ...item, done: done.includes(item.key) }));

    const remaining = all.filter((i) => !i.done);
    const bedtime = U.toMinutes(s.bedtime);
    const wake = U.toMinutes(s.wakeTime);
    const sleepHours = bedtime !== null && wake !== null
      ? Math.round(((24 * 60 - bedtime + wake) / 60) * 10) / 10 : null;

    let headline;
    if (all.length === 0) {
      headline = notes.length
        ? 'Inget att förbereda utifrån det jag vet om i morgon.'
        : 'Inget behöver förberedas inför i morgon.';
    } else if (remaining.length === 0) {
      headline = 'Allt är förberett inför i morgon.';
    } else if (remaining.length === 1) {
      headline = 'En sak kvar att förbereda.';
    } else {
      headline = `${remaining.length} saker kvar att förbereda.`;
    }

    return {
      date: today, tomorrow, headline,
      items: all, remaining: remaining.length, notes,
      isEvening: nowMinutes >= (U.toMinutes(s.eveningQuietFrom) ?? 1200),
      bedtimeHint: bedtime !== null
        ? `Du går upp ${s.wakeTime}. Läggdags ${s.bedtime} ger ${sleepHours} timmars sömn.`
        : '',
      tomorrowFixed: P.buildFixed(state, tomorrow, { nowMinutes: 0, isToday: false }).fixed
        .filter((f) => f.id !== 'morgon')
        .map((f) => ({ title: f.title, at: U.toClock(f.start) })),
    };
  }

  MV.evening = { eveningPlan };
})(typeof globalThis !== 'undefined' ? globalThis : this);
