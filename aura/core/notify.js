/* Aura — notification architecture.
 *
 * Aura must not become a nagging app. A notification exists only when there
 * is a useful decision or action behind it:
 *   bad:  "Don't forget to be productive!"
 *   good: "You need to leave in about 20 minutes. Two things are still on
 *          today's plan. Move them?"
 *
 * This module decides WHAT would be worth saying and WHEN. Today the app
 * shows these as a single quiet line on the home screen (push delivery is
 * not available on this platform). A future push channel reads the same
 * candidates, so the rules live in one place.
 */
(function (root) {
  const A = root.Aura || (root.Aura = {});
  const U = A.util, M = A.model, It = A.items, P = A.planner, I = A.i18n;

  I.add({
    'nt.leave': ['Du behöver gå om ungefär {mins}. {n} sak står kvar på dagens plan. Flytta den?|Du behöver gå om ungefär {mins}. {n} saker står kvar på dagens plan. Flytta dem?', 'You need to leave in about {mins}. {n} thing is still on today\'s plan. Move it?|You need to leave in about {mins}. {n} things are still on today\'s plan. Move them?'],
    'nt.evening': ['{n} sak från i dag är inte klar. Flytta den till i morgon?|{n} saker från i dag är inte klara. Flytta dem till i morgon?', '{n} thing from today isn\'t done. Move it to tomorrow?|{n} things from today aren\'t done. Move them to tomorrow?'],
    'nt.followUp': ['Dags att följa upp: {title}.', 'Time to follow up: {title}.'],
    'nt.reminder': ['Påminnelse: {title}', 'Reminder: {title}'],
    'nt.act.move': ['Flytta', 'Move'],
    'nt.act.moveTomorrow': ['Till i morgon', 'To tomorrow'],
    'nt.act.keep': ['Behåll', 'Keep'],
    'nt.act.open': ['Öppna', 'Open'],
    'nt.act.done': ['Klart', 'Done'],
    'nt.act.evening': ['Kvällsavstämning', 'Evening reset'],
  });

  function candidates(state, now) {
    const style = state.prefs.notifications;
    if (style === 'off') return [];
    const key = U.dateKey(now);
    const day = M.getDay(state, key);
    const dismissed = new Set(day.dismissed || []);
    const plan = P.planDay(state, now);
    const out = [];

    /* leaving soon while things remain that will not fit before */
    if (plan.next && plan.next.away && plan.minutesUntilNext != null && plan.minutesUntilNext >= 10 && plan.minutesUntilNext <= 30) {
      const left = [...plan.buckets.must, ...plan.buckets.good]
        .filter((i) => (i.background ? 5 : i.minutes) > plan.minutesUntilNext - 5 && !(i.dueDate && i.dueDate <= key));
      if (left.length) {
        out.push({
          key: `leave:${plan.next.id}`, priority: 3,
          text: { key: 'nt.leave', params: { mins: I.duration(Math.round(plan.minutesUntilNext / 5) * 5), n: left.length } },
          actions: [
            { label: { key: 'nt.act.move' }, ops: left.map((i) => ({ op: 'item.schedule', id: i.id, date: P.nextGoodDay(state, key, i), rebuild: true })) },
            { label: { key: 'nt.act.keep' }, dismiss: true },
          ],
        });
      }
    }

    /* reminders whose time has come */
    for (const item of plan.buckets.must) {
      if (item.kind !== 'reminder') continue;
      const t = U.toMinutes(item.time);
      if (t === null || t > plan.nowMin || plan.nowMin - t > 180) continue;
      out.push({
        key: `rem:${item.id}`, priority: 4, text: { key: 'nt.reminder', params: { title: item.title } },
        actions: [
          { label: { key: 'nt.act.done' }, ops: [{ op: 'item.done', id: item.id }] },
          { label: { key: 'nt.act.moveTomorrow' }, ops: [{ op: 'item.postpone', id: item.id, to: 'tomorrow' }] },
        ],
      });
    }

    /* follow-ups that are due */
    for (const item of It.adminList(state, key).waiting) {
      if (item.followUp !== key) continue;
      out.push({
        key: `fu:${item.id}`, priority: 2, text: { key: 'nt.followUp', params: { title: item.title } },
        actions: [{ label: { key: 'nt.act.open' }, nav: { view: 'admin' } }],
      });
    }

    /* the evening: unfinished musts, once, and only before the evening reset */
    if (plan.nowMin >= plan.sleep - 90 && !day.evening) {
      const unfinished = plan.buckets.must.filter((i) => i.kind !== 'reminder' || !i.time);
      if (unfinished.length) {
        out.push({
          key: 'evening-unfinished', priority: 1, text: { key: 'nt.evening', params: { n: unfinished.length } },
          actions: [{ label: { key: 'nt.act.evening' }, nav: { view: 'evening' } }],
        });
      }
    }

    const visible = out.filter((c) => !dismissed.has(c.key)).sort((a, b) => b.priority - a.priority);
    return visible.slice(0, style === 'helpful' ? 2 : 1);
  }

  A.notify = { candidates };
})(typeof globalThis !== 'undefined' ? globalThis : this);
