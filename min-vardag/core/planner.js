/* Min vardag — dagsplanering.
 *
 * Principer som koden måste hålla:
 *  1. Planen börjar alltid vid aktuell tid. Inget som redan passerat föreslås.
 *  2. Fasta åtaganden tas aldrig bort. Vid låg ork visas i stället vad som lyfts ur.
 *  3. Okänt barnschema ger INGA påhittade lämningar eller hämtningar — bara en fråga.
 *  4. Ledig tid fylls inte. En andel lämnas alltid fri, och egen tid får plats.
 *  5. Appen hittar aldrig på nya uppgifter (städning, projekt) för att fylla luckor.
 */
(function (root) {
  const MV = root.MinVardag || (root.MinVardag = {});
  const U = MV.util, M = MV.model;

  const NOW_WINDOW_MIN = 45;   // "snart"-fönster för nästa fasta åtagande
  const MIN_SLOT_MIN = 15;     // kortare luckor än så planeras inte

  /* ---------- intervallhjälp ---------- */

  function subtract(intervals, busy) {
    let result = intervals;
    for (const b of busy) {
      const next = [];
      for (const it of result) {
        if (b.end <= it.start || b.start >= it.end) { next.push(it); continue; }
        if (b.start > it.start) next.push({ start: it.start, end: b.start });
        if (b.end < it.end) next.push({ start: b.end, end: it.end });
      }
      result = next;
    }
    return result.filter((it) => it.end - it.start >= MIN_SLOT_MIN);
  }

  function totalMinutes(intervals) {
    return intervals.reduce((sum, it) => sum + (it.end - it.start), 0);
  }

  /* ---------- dagens fasta åtaganden ---------- */

  /**
   * Bygger dagens fasta åtaganden ur bekräftade uppgifter.
   * Returnerar { fixed, notes } där notes är öppna frågor, inte antaganden.
   */
  function buildFixed(state, dateKey, options) {
    const s = state.settings;
    const fixed = [];
    const notes = [];
    const workday = M.workdayFor(state, dateKey);
    const presence = M.presenceSummary(state, dateKey);
    const hasChildren = presence.present.length > 0;

    const wake = U.toMinutes(s.wakeTime);
    const workStart = U.toMinutes(s.workStart);
    const workEnd = U.toMinutes(s.workEnd);
    const dropOff = U.toMinutes(s.dropOffTime);
    const pickUp = U.toMinutes(s.pickUpTime);

    // Morgonrutin visas bara om den inte redan passerat.
    if (wake !== null && options.nowMinutes < wake + 45 && options.isToday !== false) {
      fixed.push({
        id: 'morgon', title: 'Morgon: upp och igång', kind: 'rutin',
        start: wake, end: wake + 45, generated: true,
      });
    }

    // Lämning kräver BÅDE bekräftad arbetsdag och bekräftat att barn är hos mig.
    if (workday === 'ja' && hasChildren && dropOff !== null) {
      const names = presence.present.map((c) => c.name).join(', ');
      fixed.push({
        id: 'lamning', title: `Lämna på förskolan (${names})`, kind: 'barn',
        start: dropOff, end: dropOff + 30, generated: true, travel: true,
      });
    }

    if (workday === 'ja' && workStart !== null && workEnd !== null) {
      fixed.push({
        id: 'arbete', title: 'Arbete', kind: 'arbete',
        start: workStart, end: workEnd, generated: true, travel: true,
      });
    }

    // Hämtning bara om tiden faktiskt är angiven.
    if (hasChildren && pickUp !== null) {
      const names = presence.present.map((c) => c.name).join(', ');
      fixed.push({
        id: 'hamtning', title: `Hämta (${names})`, kind: 'barn',
        start: pickUp, end: pickUp + 30, generated: true, travel: true,
      });
    }

    // Engångsåtaganden för just detta datum.
    for (const c of state.commitments) {
      if (c.date !== dateKey) continue;
      const start = U.toMinutes(c.start);
      if (start === null) continue;
      const end = U.toMinutes(c.end);
      fixed.push({
        id: c.id, title: c.title, kind: c.kind || 'annat',
        start, end: end !== null && end > start ? end : start + 60,
        generated: false, travel: true,
      });
    }

    /* Öppna frågor — appen frågar hellre än gissar. */
    if (workday === 'okand') {
      notes.push({ id: 'fraga-arbete', type: 'fraga', text: 'Jag vet inte om du arbetar i dag.', field: 'work' });
    }
    if (presence.unknown.length > 0) {
      const names = presence.unknown.map((c) => c.name).join(', ');
      notes.push({
        id: 'fraga-barn', type: 'fraga', field: 'children',
        text: `Jag vet inte om ${names} är hos dig i dag.`,
      });
    }
    if (hasChildren && pickUp === null) {
      notes.push({
        id: 'fraga-hamtning', type: 'fraga', field: 'pickUp',
        text: 'Hämtningstid saknas, så jag har inte lagt in någon hämtning.',
      });
    }

    fixed.sort((a, b) => a.start - b.start);
    return { fixed, notes, workday, presence };
  }

  /* ---------- upptagen tid, inklusive marginaler ---------- */

  function buildBusy(state, fixed, window) {
    const s = state.settings;
    const busy = [];
    for (const f of fixed) {
      const pad = f.travel ? s.commuteMin : 10;   // resa och omställning
      busy.push({ start: f.start - pad, end: f.end + pad, reason: f.title });
    }
    // Måltider läggs bara ut när de inte redan ligger inom ett åtagande.
    for (const meal of s.meals || []) {
      const start = U.toMinutes(meal.time);
      if (start === null) continue;
      const end = start + (meal.minutes || 30);
      if (end <= window.start || start >= window.end) continue;
      const overlaps = busy.some((b) => start < b.end && end > b.start);
      if (!overlaps) busy.push({ start, end, reason: meal.label, meal: true });
    }
    return busy;
  }

  /* ---------- uppgiftsurval ---------- */

  function isCandidate(task, dateKey) {
    if (task.status !== 'oppen') return false;
    if (task.scheduledDate && task.scheduledDate > dateKey) return false;
    return true;
  }

  /**
   * Poängsätter en uppgift för i dag. Högre = viktigare.
   * Poängen driver ordningen; den visas aldrig för användaren som betyg.
   */
  function score(task, ctx) {
    let points = 10;
    const reasons = [];

    if (task.deadline) {
      const days = U.daysBetween(ctx.dateKey, task.deadline);
      if (days < 0) { points += 130; reasons.push('Tidsgränsen har passerat'); }
      else if (days === 0) { points += 110; reasons.push('Tidsgräns i dag'); }
      else if (days === 1) { points += 65; reasons.push('Tidsgräns i morgon'); }
      else if (days <= 4) { points += 30; reasons.push(`Tidsgräns om ${days} dagar`); }
      else points += 10;
    }
    if (task.mustToday) { points += 90; reasons.push('Måste göras i dag'); }
    if (task.scheduledDate && task.scheduledDate < ctx.dateKey) { points += 40; reasons.push('Låg kvar sedan tidigare'); }
    if (task.scheduledDate === ctx.dateKey) points += 25;
    if (task.kind === 'forberedelse') { points += ctx.isEvening ? 55 : 15; if (ctx.isEvening) reasons.push('Förbereder morgondagen'); }
    if (task.kind === 'inkop' && task.childId) { points += 22; reasons.push('Barnens behov'); }
    if (task.kind === 'egen') { points += ctx.energy === 'lag' ? 6 : 18; reasons.push('Din egen tid'); }

    // Missade förslag ska inte stapla sig ovanpå nästa dag. Utan tidsgräns
    // sjunker en uppgift som redan föreslagits, i stället för att tränga sig före.
    if (task.lastOfferedDate && task.lastOfferedDate < ctx.dateKey && !task.deadline && !task.mustToday) {
      points -= 18;
    }
    // Kort uppgift är lättare att få gjord sent på dagen.
    if (ctx.remainingMinutes < 120 && task.minutes <= 20) points += 8;

    return { points, reasons };
  }

  /** Vid låg ork: vad som är nödvändigt ansvar och vad som kan vänta. */
  function isEssential(task) {
    return !!(task.mustToday || task.deadline || task.kind === 'forberedelse');
  }

  /* ---------- huvudfunktionen ---------- */

  /**
   * @param {object} state
   * @param {Date} now
   * @returns {object} plan
   */
  function planDay(state, now) {
    const s = state.settings;
    const dateKey = U.dateKey(now);
    const nowMinutes = U.minutesOfDay(now);
    const energy = M.energyFor(state, dateKey);
    const capacity = (M.ENERGY[energy] || M.ENERGY.okand).capacity;
    const day = M.getDay(state, dateKey);

    const { fixed, notes, workday, presence } = buildFixed(state, dateKey, { nowMinutes, isToday: true });

    const wake = U.toMinutes(s.wakeTime) ?? 300;
    const bedtime = U.toMinutes(s.bedtime) ?? 1290;
    const quietFrom = U.toMinutes(s.eveningQuietFrom) ?? 1200;

    // Planen börjar vid aktuell tid — aldrig tidigare.
    const windowStart = Math.max(U.roundUp5(nowMinutes), wake);
    const windowEnd = Math.max(windowStart, bedtime);
    const window = { start: windowStart, end: windowEnd };

    const busy = buildBusy(state, fixed, window);
    const free = subtract([{ start: windowStart, end: windowEnd }], busy);
    const freeMinutes = totalMinutes(free);
    const isEvening = nowMinutes >= quietFrom;

    // Tidsbudget: orken skalar, och en andel av tiden lämnas alltid fri.
    const budget = Math.floor(freeMinutes * capacity * (1 - s.minFreeMarginPct));
    const maxPriorities = energy === 'lag' ? 1 : s.maxPriorities;

    const ctx = { dateKey, energy, isEvening, remainingMinutes: windowEnd - windowStart };
    const candidates = state.tasks
      .filter((t) => isCandidate(t, dateKey))
      .map((t) => {
        const sc = score(t, ctx);
        return { task: t, points: sc.points, reasons: sc.reasons };
      })
      .sort((a, b) => b.points - a.points);

    const priorities = [];
    const moved = [];
    const slots = free.map((it) => ({ start: it.start, end: it.end }));
    let used = 0;
    let eveningCount = 0;

    for (const cand of candidates) {
      const task = cand.task;
      const minutes = Math.min(task.minutes, 120);

      if (day.skipped.includes(task.id)) {
        moved.push({ taskId: task.id, title: task.title, reason: 'Du flyttade den i dag' });
        continue;
      }
      // Låg ork prövas FÖRE takregeln, så att skälet som visas är det sanna:
      // det lyftes ur på grund av orken, inte för att listan råkade bli full.
      if (energy === 'lag' && !isEssential(task)) {
        moved.push({ taskId: task.id, title: task.title, reason: 'Låg ork — kan vänta' });
        continue;
      }
      if (energy === 'lag' && task.load === 'tung' && !task.mustToday) {
        moved.push({ taskId: task.id, title: task.title, reason: 'Låg ork — för tungt i dag' });
        continue;
      }
      if (priorities.length >= maxPriorities) {
        moved.push({ taskId: task.id, title: task.title, reason: 'Ryms inte bland dagens prioriteringar' });
        continue;
      }
      if (used + minutes > budget) {
        moved.push({ taskId: task.id, title: task.title, reason: 'Dagen är redan full nog' });
        continue;
      }

      const earliest = U.toMinutes(task.earliest);
      const slot = slots.find((sl) => {
        const start = Math.max(sl.start, earliest ?? sl.start);
        if (start + minutes > sl.end) return false;
        if (start >= quietFrom && task.kind !== 'forberedelse' && eveningCount >= 1) return false;
        return true;
      });
      if (!slot) {
        moved.push({ taskId: task.id, title: task.title, reason: 'Ingen lucka som passar i dag' });
        continue;
      }

      const start = Math.max(slot.start, earliest ?? slot.start);
      if (start >= quietFrom) eveningCount += 1;
      priorities.push({
        taskId: task.id, title: task.title, minutes,
        start, end: start + minutes,
        childId: task.childId, kind: task.kind,
        why: cand.reasons[0] || '',
      });
      slot.start = start + minutes + 10;   // liten paus mellan uppgifter
      used += minutes;
    }

    priorities.sort((a, b) => a.start - b.start);

    // Skyddad tid: egen tid eller återhämtning, aldrig påhittade sysslor.
    const leftover = subtract(free, priorities.map((p) => ({ start: p.start - 5, end: p.end + 5 })));
    const leftoverMinutes = totalMinutes(leftover);
    let reserved = null;
    const biggest = leftover.slice().sort((a, b) => (b.end - b.start) - (a.end - a.start))[0];
    if (biggest && biggest.end - biggest.start >= 45 && biggest.start < quietFrom) {
      const idea = (s.ownTime || []).find((o) => !o.disabled);
      reserved = energy === 'lag'
        ? { title: 'Återhämtning', detail: 'Ta det lugnt. Det räcker i dag.', start: biggest.start, minutes: Math.min(60, biggest.end - biggest.start) }
        : {
          title: idea ? idea.label : 'Egen tid',
          detail: idea ? 'Din egen tid — flytta gärna om det passar bättre senare.' : 'Ledig tid som är din. Appen fyller den inte åt dig.',
          start: biggest.start, minutes: Math.min(idea && idea.minutes ? idea.minutes : 60, biggest.end - biggest.start),
        };
    }

    const nowCard = buildNowCard({ fixed, priorities, nowMinutes, state, dateKey, energy, reserved, windowEnd });

    // Diskret översikt: resten av dagen + närmaste tidsgränser.
    const later = [];
    for (const f of fixed) {
      if (f.end > nowMinutes && !(nowCard.fixedId === f.id)) {
        later.push({ type: 'fast', title: f.title, at: U.toClock(f.start) });
      }
    }
    for (const p of priorities) {
      if (!nowCard.taskId || p.taskId !== nowCard.taskId) {
        later.push({ type: 'uppgift', title: p.title, at: U.toClock(p.start), taskId: p.taskId });
      }
    }
    const upcoming = state.tasks
      .filter((t) => t.status === 'oppen' && t.deadline && t.deadline > dateKey)
      .sort((a, b) => a.deadline.localeCompare(b.deadline))
      .slice(0, 3)
      .map((t) => ({ type: 'tidsgrans', title: t.title, at: U.relativeDay(t.deadline, dateKey), taskId: t.id }));

    return {
      dateKey, nowMinutes, nowClock: U.toClock(nowMinutes), energy, workday,
      presence, fixed, notes, nowCard, priorities, moved, reserved, later, upcoming,
      freeMinutes, plannedMinutes: used,
      marginMinutes: Math.max(0, leftoverMinutes - (reserved ? reserved.minutes : 0)),
      generatedAt: now.toISOString(),
    };
  }

  /** "Gör det här nu" — exakt en tydlig nästa handling. */
  function buildNowCard(args) {
    const { fixed, priorities, nowMinutes, energy, reserved, windowEnd } = args;

    const running = fixed.find((f) => f.start <= nowMinutes && f.end > nowMinutes);
    if (running) {
      return {
        type: 'pagaende', fixedId: running.id, title: running.title,
        detail: `Pågår nu, till ${U.toClock(running.end)}.`, action: null,
      };
    }
    const soon = fixed.find((f) => f.start > nowMinutes && f.start - nowMinutes <= NOW_WINDOW_MIN);
    if (soon) {
      const min = soon.start - nowMinutes;
      return {
        type: 'snart', fixedId: soon.id, title: soon.title,
        detail: `Om ${min} min (${U.toClock(soon.start)}). Gör dig klar.`, action: null,
      };
    }
    const next = priorities.find((p) => p.end > nowMinutes);
    if (next) {
      const startsIn = next.start - nowMinutes;
      return {
        type: 'uppgift', taskId: next.taskId, title: next.title,
        minutes: next.minutes,
        detail: startsIn > 10
          ? `Planerad ${U.toClock(next.start)} · ${U.duration(next.minutes)}. Du kan börja nu om du vill.`
          : `Nu · ${U.duration(next.minutes)}.`,
        action: 'klar',
      };
    }
    if (reserved) {
      return {
        type: 'egen', title: reserved.title, detail: reserved.detail, action: null,
      };
    }
    if (nowMinutes >= windowEnd) {
      return { type: 'kvall', title: 'Dagen är slut', detail: 'Inget mer behöver göras i dag.', action: null };
    }
    return {
      type: 'fritt',
      title: energy === 'lag' ? 'Vila. Det räcker så.' : 'Inget måste göras nu',
      detail: energy === 'lag'
        ? 'Dagens nödvändiga ansvar är hanterat.'
        : 'Ingen uppgift är planerad just nu. Tiden är din.',
      action: null,
    };
  }

  MV.planner = { planDay, buildFixed, subtract, totalMinutes, score, isEssential };
})(typeof globalThis !== 'undefined' ? globalThis : this);
