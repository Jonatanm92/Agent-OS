/* Min vardag — rutiner och packlistor.
 *
 * En rutin skrivs in EN gång och återkommer sedan av sig själv. Avbockningen
 * sparas per datum, så listan nollställs till nästa dag utan att du gör något.
 *
 * Appen skapar aldrig rutiner åt dig. Färdiga förslag finns, men de läggs
 * bara till när du själv väljer det.
 */
(function (root) {
  const MV = root.MinVardag || (root.MinVardag = {});
  const U = MV.util, M = MV.model;

  /** Gäller rutinen denna dag? Veckodag och barnens närvaro avgör. */
  function appliesOn(state, routine, dateKey) {
    if (!routine.active) return false;
    if (Array.isArray(routine.weekdays) && routine.weekdays.length
      && !routine.weekdays.includes(U.weekday(dateKey))) return false;
    if (routine.requiresChildren) {
      const presence = M.presenceSummary(state, dateKey);
      if (!presence.present.length) return false;
    }
    return true;
  }

  /**
   * Rutinerna för ett visst tillfälle, med dagens avbockning inlagd.
   * @param {'morgon'|'kvall'} when
   */
  function forDate(state, dateKey, when) {
    const day = M.getDay(state, dateKey);
    return (state.routines || [])
      .filter((r) => r.when === when && appliesOn(state, r, dateKey))
      .map((routine) => {
        const done = day.routineDone[routine.id] || [];
        const items = routine.items.map((item) => ({ ...item, done: done.includes(item.id) }));
        const remaining = items.filter((i) => !i.done).length;
        return { routine, items, remaining, total: items.length, complete: remaining === 0 && items.length > 0 };
      });
  }

  /** Kort sammanfattning för en dag: "Morgonrutin · 2 av 5 kvar". */
  function summary(state, dateKey, when) {
    const list = forDate(state, dateKey, when);
    if (!list.length) return null;
    const remaining = list.reduce((sum, r) => sum + r.remaining, 0);
    const total = list.reduce((sum, r) => sum + r.total, 0);
    return {
      when, remaining, total, groups: list,
      complete: remaining === 0,
      label: remaining === 0
        ? (when === 'morgon' ? 'Morgonrutinen är klar' : 'Kvällsrutinen är klar')
        : `${remaining} av ${total} kvar`,
    };
  }

  /** Packlistor som är relevanta en viss dag, med avbockning. */
  function packForDate(state, dateKey) {
    const day = M.getDay(state, dateKey);
    const presence = M.presenceSummary(state, dateKey);
    const presentIds = presence.present.map((c) => c.id);
    return (state.packLists || [])
      .filter((list) => !list.childId || presentIds.includes(list.childId))
      .map((list) => {
        const done = day.packDone[list.id] || [];
        const items = list.items.map((item) => ({ ...item, done: done.includes(item.id) }));
        const remaining = items.filter((i) => !i.done).length;
        return {
          list, items, remaining, total: items.length,
          complete: remaining === 0 && items.length > 0,
          childName: list.childId ? M.childName(state, list.childId) : '',
        };
      });
  }

  /* --- Färdiga förslag. Läggs BARA till när du själv väljer dem. --- */

  const ROUTINE_TEMPLATES = [
    {
      key: 'morgon-egen', name: 'Min morgon', when: 'morgon', requiresChildren: false,
      items: ['Duscha och klä på mig', 'Frukost', 'Ta med matlåda och nycklar'],
    },
    {
      key: 'morgon-barn', name: 'Morgon med barnen', when: 'morgon', requiresChildren: true,
      items: ['Väcka barnen', 'Frukost tillsammans', 'Påklädning', 'Väskor med i hallen'],
    },
    {
      key: 'kvall-egen', name: 'Kvällsrutin', when: 'kvall', requiresChildren: false,
      items: ['Diska och plocka undan', 'Lägg fram kläder till i morgon', 'Telefonen på laddning'],
    },
    {
      key: 'kvall-barn', name: 'Kväll med barnen', when: 'kvall', requiresChildren: true,
      items: ['Middag', 'Borsta tänder', 'Läsa saga', 'Släcka och gonatt'],
    },
  ];

  const PACK_TEMPLATES = [
    { key: 'forskola', name: 'Förskola', items: ['Extrakläder', 'Blöjor', 'Napp och gosedjur', 'Regnkläder och stövlar'] },
    { key: 'overnattning', name: 'Övernattning', items: ['Pyjamas', 'Tandborste', 'Gosedjur', 'Ombyte'] },
    { key: 'utflykt', name: 'Utflykt', items: ['Matsäck', 'Vatten', 'Extra tröja', 'Första hjälpen'] },
  ];

  MV.routines = {
    forDate, summary, packForDate, appliesOn,
    ROUTINE_TEMPLATES, PACK_TEMPLATES,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
