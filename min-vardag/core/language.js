/* Min vardag — språktolkning (regelmotor).
 *
 * Detta är en REGELMOTOR, inte en AI. Den beskrivs alltid så i gränssnittet.
 * Om en AI-anslutning finns används den i stället, men resultatet passerar
 * samma validering och visas som samma tydliga, ångerbara ändringsförslag.
 *
 * Grundregel: när det är oklart vilket barn eller vilket plagg som avses
 * ställer motorn en kort fråga — den gissar aldrig.
 */
(function (root) {
  const MV = root.MinVardag || (root.MinVardag = {});
  const U = MV.util, M = MV.model;

  /* ---------- ordlistor ---------- */

  const GARMENTS = [
    { id: 'tjocktroja', label: 'tjocktröja', plural: 'tjocktröjor', words: ['tjocktröja', 'tjocktröjor', 'tjocktroja', 'tjocktrojor', 'collegetröja', 'collegetröjor', 'sweatshirt', 'mysdress'] },
    { id: 'skaljacka', label: 'skaljacka', plural: 'skaljackor', words: ['skaljacka', 'skaljackor'] },
    { id: 'skalbyxa', label: 'skalbyxa', plural: 'skalbyxor', words: ['skalbyxa', 'skalbyxor', 'skalbyxan'] },
    { id: 'byxor', label: 'byxor', plural: 'byxor', pair: true, words: ['byxa', 'byxor', 'byxorna', 'mjukisbyxor', 'jeans'] },
    { id: 'jacka', label: 'jacka', plural: 'jackor', words: ['jacka', 'jackan', 'jackor'] },
    { id: 'troja', label: 'tröja', plural: 'tröjor', words: ['tröja', 'tröjan', 'tröjor'] },
    { id: 'regnklader', label: 'regnkläder', plural: 'regnkläder', words: ['regnkläder', 'regnstället', 'regnställ'] },
    { id: 'stovlar', label: 'stövlar', plural: 'stövlar', pair: true, words: ['stövlar', 'gummistövlar'] },
    { id: 'skor', label: 'skor', plural: 'skor', pair: true, words: ['sko', 'skor', 'skorna'] },
    { id: 'mossa', label: 'mössa', plural: 'mössor', words: ['mössa', 'mössan', 'mössor'] },
    { id: 'vantar', label: 'vantar', plural: 'vantar', pair: true, words: ['vantar', 'vante', 'handskar'] },
    { id: 'strumpor', label: 'strumpor', plural: 'strumpor', pair: true, words: ['strumpa', 'strumpor'] },
    { id: 'pyjamas', label: 'pyjamas', plural: 'pyjamasar', words: ['pyjamas', 'pyjamasar'] },
  ];

  /* Grupper som betyder flera plagg. */
  const GARMENT_GROUPS = {
    skalklader: { words: ['skalkläder', 'skalklader', 'skalset', 'skalställ', 'skalstall'], members: ['skaljacka', 'skalbyxa'] },
  };

  /* Vilka plaggtyper ett ord rimligen kan syfta på, i tur och ordning.
   * Först exakt träff, sedan en bredare tolkning — men bara som förslag. */
  const GARMENT_BROADER = {
    jacka: ['jacka', 'skaljacka'],
    troja: ['troja', 'tjocktroja'],
    byxor: ['byxor', 'skalbyxa'],
  };

  const NUMBERS = {
    en: 1, ett: 1, 'en till': 1, två: 2, tva: 2, 2: 2, tre: 3, 3: 3, fyra: 4, 4: 4, fem: 5, 5: 5, sex: 6, 6: 6,
  };

  const DONE_WORDS = ['köpt', 'köpte', 'köpta', 'inköpt', 'fixat', 'fixade', 'ordnat', 'ordnade', 'klar', 'klart', 'klara', 'beställt', 'beställde', 'hämtat', 'hämtade', 'gjort', 'avklarat', 'löst', 'löste'];
  const BLOCKED_WORDS = ['slut', 'slutsåld', 'slutsålt', 'fanns inte', 'hade inte', 'hittade inte', 'hann inte', 'blev inget', 'gick inte', 'orkade inte', 'missade', 'glömde', 'hann ej'];
  const NEED_WORDS = ['behöver', 'behövde', 'saknar', 'måste ha', 'ska ha', 'vill ha'];
  const TASK_WORDS = ['måste', 'ska', 'kom ihåg', 'glöm inte', 'behöver jag', 'jag ska', 'fixa', 'ta med', 'boka', 'ringa', 'tvätta', 'packa', 'handla'];
  const QUESTION_WORDS = ['vad ', 'vilka ', 'vilken ', 'hur ', 'när ', 'finns det', 'har jag'];

  /* ---------- små hjälpare ---------- */

  function findGarments(text) {
    const found = [];
    for (const key of Object.keys(GARMENT_GROUPS)) {
      const group = GARMENT_GROUPS[key];
      if (group.words.some((w) => text.includes(w))) {
        for (const m of group.members) if (!found.includes(m)) found.push(m);
      }
    }
    for (const g of GARMENTS) {
      if (g.words.some((w) => new RegExp(`(^|\\s)${w}(\\s|$)`).test(text))) {
        if (!found.includes(g.id)) found.push(g.id);
      }
    }
    return found;
  }

  function garmentInfo(id) {
    return GARMENTS.find((g) => g.id === id) || { id, label: id, plural: id };
  }

  function findChildren(state, text) {
    const hits = [];
    for (const child of state.children) {
      const name = U.normalize(child.name);
      if (!name) continue;
      if (new RegExp(`(^|\\s)${name}s?(\\s|$)`).test(text)) hits.push(child);
    }
    return hits;
  }

  function findQuantity(text, garmentWord) {
    // "två par byxor", "2 tjocktröjor", "ett par"
    const pair = /(\w+)\s+par\s/.exec(text);
    if (pair && NUMBERS[pair[1]]) return NUMBERS[pair[1]];
    for (const word of Object.keys(NUMBERS)) {
      if (new RegExp(`(^|\\s)${word}\\s+(par\\s+)?${garmentWord ? '' : ''}`).test(text)) {
        const re = new RegExp(`(^|\\s)${word}\\s+(par\\s+)?[a-zåäö]+`);
        if (re.test(text)) return NUMBERS[word];
      }
    }
    if (/\bfler\b|\bfler\s|\bnya\b|\bextra\b/.test(text)) return null; // antal okänt
    return 1;
  }

  function hasAny(text, words) {
    return words.some((w) => text.includes(w));
  }

  function isNegated(text, word) {
    const idx = text.indexOf(word);
    if (idx < 0) return false;
    const before = text.slice(Math.max(0, idx - 25), idx);
    return /\b(inte|ej|aldrig)\b/.test(before);
  }

  /** Dela upp texten i satser som kan tolkas var för sig. */
  function splitClauses(text) {
    const rough = text.split(/[.;!?]+|\bmen\b|,\s*(?=och\b)/).map((s) => s.trim()).filter(Boolean);
    const out = [];
    for (const clause of rough) {
      // "A behöver X och B behöver Y" delas; "skaljacka och skalbyxa" delas inte.
      const parts = clause.split(/\boch\b/);
      if (parts.length > 1) {
        let buffer = '';
        for (const part of parts) {
          const trimmed = part.trim();
          const startsNewStatement = hasAny(trimmed, NEED_WORDS) || /^(jag|han|hon|de)\b/.test(trimmed);
          if (startsNewStatement && buffer) { out.push(buffer.trim()); buffer = trimmed; }
          else buffer = buffer ? `${buffer} och ${trimmed}` : trimmed;
        }
        if (buffer) out.push(buffer.trim());
      } else {
        out.push(clause);
      }
    }
    return out.filter(Boolean);
  }

  /* ---------- matchning mot befintliga behov ---------- */

  /**
   * Hittar öppna behov som kan avses. Returnerar alltid ALLA rimliga
   * kandidater — urvalet görs av användaren när det är fler än en.
   */
  function matchNeeds(state, opts) {
    const open = M.openNeeds(state);
    const byChild = opts.childId ? open.filter((n) => n.childId === opts.childId) : open;
    if (!opts.garment) return byChild;

    const exact = byChild.filter((n) => n.garment === opts.garment);
    if (exact.length) return exact;

    const broader = GARMENT_BROADER[opts.garment] || [opts.garment];
    return byChild.filter((n) => broader.includes(n.garment));
  }

  function needLabel(state, need) {
    const name = M.childName(state, need.childId);
    const remaining = M.needRemaining(need);
    const count = need.qty > 1 ? `${remaining} av ${need.qty} kvar · ` : '';
    return `${name ? name + ': ' : ''}${need.title}${need.qty > 1 ? ` (${count.trim()})` : ''}`;
  }

  /* ---------- tolkning av en sats ---------- */

  function interpretClause(state, clause, ctx) {
    const text = U.normalize(clause);
    const ops = [];
    const questions = [];
    const today = ctx.dateKey;
    let handled = false;

    /* --- ork --- */
    if (/\b(låg ork|ingen ork|slut på energi|helt slut|utmattad|trött)\b/.test(text) || /orkar\s+inte/.test(text)) {
      ops.push({ op: 'day.energy', date: today, energy: 'lag' });
      handled = true;
    } else if (/\b(bra ork|god ork|pigg|full av energi|taggad)\b/.test(text)) {
      ops.push({ op: 'day.energy', date: today, energy: 'god' });
      handled = true;
    } else if (/\b(okej ork|hyfsad ork|helt ok)\b/.test(text)) {
      ops.push({ op: 'day.energy', date: today, energy: 'ok' });
      handled = true;
    }

    /* --- barnens närvaro --- */
    const presenceDate = /\bi morgon\b/.test(text) ? U.addDays(today, 1) : today;
    const namedChildren = findChildren(state, text);
    const mentionsAllChildren = /\bbarnen\b|\bungarna\b|\bkidsen\b/.test(text);
    const comingWords = /\b(kommer|är hos mig|har jag|hämtar jag|är här|sover här)\b/.test(text);
    const awayWords = /\b(är inte hos mig|är borta|barnfri|är hos)\b/.test(text) && !/hos mig/.test(text);

    if ((mentionsAllChildren || namedChildren.length) && (comingWords || awayWords)) {
      const value = awayWords ? 'nej' : 'ja';
      const targets = namedChildren.length ? namedChildren : state.children;
      if (targets.length) {
        for (const child of targets) {
          ops.push({ op: 'day.children', date: presenceDate, childId: child.id, value });
        }
        handled = true;
      }
    }

    /* --- arbetsdag --- */
    if (/\b(jobbar|arbetar|arbetsdag)\b/.test(text)) {
      const workDate = /\bi morgon\b/.test(text) ? U.addDays(today, 1) : today;
      ops.push({ op: 'day.work', date: workDate, value: isNegated(text, 'jobbar') || /\bledig\b/.test(text) ? 'nej' : 'ja' });
      handled = true;
    } else if (/\b(är ledig|har ledigt|semester)\b/.test(text)) {
      ops.push({ op: 'day.work', date: /\bi morgon\b/.test(text) ? U.addDays(today, 1) : today, value: 'nej' });
      handled = true;
    }

    /* --- storlek --- */
    const sizeMatch = /\b(storlek|stl)\s*(\d{2,3})\b/.exec(text) || /\b(\d{2,3})\s*\/\s*(\d{2,3})\b/.exec(text);
    if (sizeMatch && namedChildren.length === 1) {
      const value = sizeMatch[2] && sizeMatch[1] && sizeMatch[0].includes('/')
        ? `${sizeMatch[1]}/${sizeMatch[2]}` : sizeMatch[2] || sizeMatch[1];
      const isBody = /\b(lång|längd|cm|mäter|mätt)\b/.test(text);
      const brandMatch = /\b(lager\s*157|h&m|hm|polarn|kappahl|åhléns|didriksons|reima)\b/.exec(text);
      ops.push({
        op: 'size.set', childId: namedChildren[0].id,
        kind: isBody ? 'kropp' : 'marke',
        brand: isBody ? '' : (brandMatch ? brandMatch[0] : ''),
        label: isBody ? 'Kroppslängd' : 'Storlek',
        value: isBody ? `${value} cm` : value,
        preliminary: !/\b(uppmätt|verifierad|provad|testad)\b/.test(text),
      });
      handled = true;
    }

    /* --- klart / gick inte --- */
    // "hann jag inte" och "hann inte" ska båda fångas — ordföljden varierar.
    const BLOCKED_PATTERNS = /\b(hann|orkade|hittade|fanns|blev|kom)\s+(jag\s+|det\s+|vi\s+)?(inte|ej)\b|\bgick\s+(inte|ej)\b/;
    const saysDone = hasAny(text, DONE_WORDS) && !DONE_WORDS.some((w) => isNegated(text, w));
    const saysBlocked = hasAny(text, BLOCKED_WORDS) || BLOCKED_PATTERNS.test(text);

    if (saysDone || saysBlocked) {
      const garments = findGarments(text);
      const childId = namedChildren.length === 1 ? namedChildren[0].id : null;
      const garmentsToUse = garments.length ? garments : [null];

      for (const garment of garmentsToUse) {
        const candidates = matchNeeds(state, { garment, childId });
        const info = garment ? garmentInfo(garment) : null;
        const subject = info ? info.label : 'det du nämnde';

        if (candidates.length === 0) {
          if (garment) {
            ctx.unmatched.push(`Hittade inget öppet behov som matchar "${subject}".`);
          }
          continue;
        }
        if (candidates.length === 1) {
          const need = candidates[0];
          if (saysBlocked) {
            ops.push({ op: 'need.blocked', needId: need.id, note: blockedNote(text) });
          } else {
            ops.push({ op: 'need.done', needId: need.id, qty: 1 });
          }
          handled = true;
          continue;
        }
        // Flera möjliga — fråga kort i stället för att gissa.
        questions.push({
          id: U.makeId('fraga'),
          text: `Vilket barn gäller ${subject}?`,
          options: candidates.map((need) => ({
            id: need.id,
            label: needLabel(state, need),
            ops: saysBlocked
              ? [{ op: 'need.blocked', needId: need.id, note: blockedNote(text) }]
              : [{ op: 'need.done', needId: need.id, qty: 1 }],
          })),
          skipLabel: 'Hoppa över',
        });
        handled = true;
      }

      // "Det här hann jag inte" utan plagg — syftar troligen på dagens uppgifter.
      if (!garments.length && /\b(det här|detta|den där|det)\b/.test(text) && ctx.todayTaskOptions.length) {
        questions.push({
          id: U.makeId('fraga'),
          text: saysBlocked ? 'Vilken av dagens uppgifter hann du inte med?' : 'Vad blev klart?',
          options: ctx.todayTaskOptions.map((t) => ({
            id: t.id,
            label: t.title,
            ops: saysBlocked
              ? [{ op: 'task.move', taskId: t.id, to: 'vantar' }]
              : [{ op: 'task.done', taskId: t.id }],
          })),
          skipLabel: 'Ingen av dem',
        });
        handled = true;
      }
    }

    /* --- nya behov --- */
    if (!saysDone && !saysBlocked && hasAny(text, NEED_WORDS)) {
      const garments = findGarments(text);
      if (garments.length) {
        if (namedChildren.length === 1) {
          for (const garment of garments) {
            addNeedOp(ops, questions, state, namedChildren[0], garment, text, ctx);
          }
          handled = true;
        } else if (namedChildren.length === 0 && state.children.length) {
          // Vet inte vilket barn — fråga.
          for (const garment of garments) {
            const info = garmentInfo(garment);
            questions.push({
              id: U.makeId('fraga'),
              text: `Vem behöver ${info.plural}?`,
              options: state.children.map((child) => ({
                id: child.id,
                label: child.name,
                ops: [{
                  op: 'need.add', childId: child.id, garment,
                  title: needTitle(garment, findQuantity(text, info.label) || 1),
                  qty: findQuantity(text, info.label) || 1,
                }],
              })),
              skipLabel: 'Hoppa över',
            });
          }
          handled = true;
        } else if (namedChildren.length > 1) {
          for (const child of namedChildren) {
            for (const garment of garments) {
              addNeedOp(ops, questions, state, child, garment, text, ctx);
            }
          }
          handled = true;
        }
      }
    }

    /* --- syftning: "jag måste fixa det efter jobbet" ---
     * Prövas FÖRE den allmänna uppgiften, annars skulle samma mening ge två
     * uppgifter: en intetsägande ("Fixa det efter jobbet") och en riktig. */
    const refersToNeeds = hasAny(text, TASK_WORDS)
      && /\b(det|dem|dom|detta|allt)\b/.test(text)
      && ctx.pendingNeedRefs.length > 0;

    if (refersToNeeds) {
      const timing = readTiming(state, text, today);
      ops.push({
        op: 'task.addForNeeds',
        needRefs: ctx.pendingNeedRefs.slice(),
        minutes: 60,
        kind: 'inkop',
        earliest: timing.earliest,
        scheduledDate: timing.date,
        context: timing.context || 'butik',
      });
      handled = true;
    }

    /* --- ny uppgift --- */
    if (!handled && (hasAny(text, TASK_WORDS) || /^(kom ihåg|glöm inte)/.test(text))) {
      const timing = readTiming(state, text, today);
      ops.push({
        op: 'task.add',
        title: taskTitle(clause),
        minutes: 30,
        kind: 'uppgift',
        childId: namedChildren.length === 1 ? namedChildren[0].id : null,
        earliest: timing.earliest,
        scheduledDate: timing.date,
        context: timing.context,
      });
      handled = true;
    }

    return { ops, questions, handled, text };
  }

  function blockedNote(text) {
    if (/\bslut\b|slutsåld|slutsålt/.test(text)) return 'Slut i butiken';
    if (/hann\s+(jag\s+|vi\s+|det\s+)?(inte|ej)/.test(text)) return 'Hanns inte med';
    if (/orkade\s+(jag\s+|vi\s+)?(inte|ej)/.test(text)) return 'Orken räckte inte';
    if (/hittade inte|fanns inte|hade inte/.test(text)) return 'Fanns inte';
    if (/glömde/.test(text)) return 'Glömdes bort';
    return 'Blev inte av';
  }

  /** Räknebar etikett på riktig svenska: "1 par byxor", "2 tjocktröjor". */
  function countLabel(garment, qty) {
    const info = garmentInfo(garment);
    if (info.pair) return `${qty} par ${info.plural}`;
    if (qty > 1) return `${qty} ${info.plural}`;
    return info.label;
  }

  function needTitle(garment, qty) {
    const label = countLabel(garment, qty);
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  function addNeedOp(ops, questions, state, child, garment, text, ctx) {
    const info = garmentInfo(garment);
    const qty = findQuantity(text, info.label);
    const ref = U.makeId('ref');
    if (qty === null) {
      // Antalet är oklart ("fler byxor") — fråga hellre än att hitta på ett antal.
      questions.push({
        id: U.makeId('fraga'),
        text: `Hur många ${info.plural} behöver ${child.name}?`,
        options: [1, 2, 3].map((n) => ({
          id: `${child.id}-${n}`,
          label: countLabel(garment, n),
          ops: [{ op: 'need.add', ref, childId: child.id, garment, title: needTitle(garment, n), qty: n }],
        })),
        skipLabel: 'Hoppa över',
      });
    } else {
      ops.push({ op: 'need.add', ref, childId: child.id, garment, title: needTitle(garment, qty), qty });
    }
    ctx.pendingNeedRefs.push({ ref, childId: child.id, garment });
  }

  /** Tidsuttryck -> tidigast-tid, datum och sammanhang. Inga gissningar. */
  function readTiming(state, text, today) {
    const s = state.settings;
    const result = { earliest: '', date: '', context: '' };
    if (/efter jobbet|efter arbetet|efter jobb/.test(text)) {
      result.earliest = s.workEnd || '';
      result.context = 'butik';
    }
    if (/före jobbet|innan jobbet/.test(text)) result.earliest = s.wakeTime || '';
    if (/\bi kväll\b|\bikväll\b/.test(text)) result.earliest = result.earliest || '18:00';
    if (/\bi morgon\b|\bimorgon\b/.test(text)) result.date = U.addDays(today, 1);
    if (/\böveri?morgon\b/.test(text)) result.date = U.addDays(today, 2);
    if (/\bpå helgen\b|\bi helgen\b/.test(text)) {
      let d = today;
      for (let i = 0; i < 7; i++) { d = U.addDays(d, 1); if (U.weekday(d) === 6) break; }
      result.date = d;
    }
    if (/\bhandla\b|\bköpa\b|\bbutik\b|\baffären\b/.test(text)) result.context = result.context || 'butik';
    if (/\bringa\b|\bboka\b/.test(text)) result.context = 'telefon';
    return result;
  }

  /** Gör en läsbar uppgiftstitel av en sats. */
  function taskTitle(clause) {
    let title = String(clause).trim()
      .replace(/^(jag\s+)?(måste|ska|behöver|kom ihåg att|glöm inte att|glöm inte)\s+/i, '')
      .replace(/\s+/g, ' ');
    title = title.charAt(0).toUpperCase() + title.slice(1);
    return title.length > 80 ? `${title.slice(0, 77)}…` : title;
  }

  /* ---------- svar på rena frågor ---------- */

  function answerQuestion(state, text, ctx) {
    const t = U.normalize(text);
    if (/förbereda|förberedelse|inför i morgon|imorgon/.test(t)) return { kind: 'forberedelse' };
    if (/viktigast|vad ska jag göra|vad gör jag nu|härnäst/.test(t)) return { kind: 'nu' };
    if (/behöver.*(barnen|lo|sam|malte)|vad saknas|vad fattas/.test(t)) return { kind: 'behov' };
    return null;
  }

  /* ---------- publik ingång ---------- */

  /**
   * Tolkar fritext till ett förslag. Ändrar ALDRIG något själv —
   * returnerar bara ops och frågor som användaren får godkänna.
   */
  function interpret(state, input, now) {
    const dateKey = U.dateKey(now);
    const todayTaskOptions = M.openTasks(state)
      .filter((t) => !t.scheduledDate || t.scheduledDate <= dateKey)
      .slice(0, 6)
      .map((t) => ({ id: t.id, title: t.title }));

    const ctx = { dateKey, unmatched: [], pendingNeedRefs: [], todayTaskOptions };
    const clauses = splitClauses(input);
    const ops = [];
    const questions = [];
    let anyHandled = false;

    for (const clause of clauses) {
      const res = interpretClause(state, clause, ctx);
      ops.push(...res.ops);
      questions.push(...res.questions);
      if (res.handled) anyHandled = true;
    }

    const query = answerQuestion(state, input, ctx);

    return {
      mode: 'regler',
      input,
      ops,
      questions,
      query: !anyHandled && query ? query.kind : (query && !ops.length && !questions.length ? query.kind : null),
      unmatched: ctx.unmatched,
      understood: anyHandled || !!query,
    };
  }

  MV.language = {
    interpret, splitClauses, findGarments, findChildren, matchNeeds,
    garmentInfo, needTitle, countLabel, taskTitle, readTiming, GARMENTS, GARMENT_GROUPS,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
