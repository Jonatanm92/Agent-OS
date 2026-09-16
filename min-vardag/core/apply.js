/* Min vardag — tillämpning av ändringar.
 *
 * Varje ändring beskrivs i klartext INNAN den sker, och kan ångras efteråt.
 * Ingenting här hittar på nya ändringar: bara de ops som användaren godkänt.
 *
 * Viktig skillnad som koden håller isär:
 *   planerat  = inplanerat, men inte gjort
 *   bekräftat = faktiskt genomfört, bekräftat av Jonatan
 * Ett inköpsförslag blir aldrig automatiskt ett genomfört köp.
 */
(function (root) {
  const MV = root.MinVardag || (root.MinVardag = {});
  const U = MV.util, M = MV.model;

  function findNeed(state, id) { return state.needs.find((n) => n.id === id) || null; }
  function findTask(state, id) { return state.tasks.find((t) => t.id === id) || null; }

  /** Kort, mänsklig beskrivning av vad en ändring gör. Visas före godkännande. */
  function describeOp(state, op) {
    const name = (id) => M.childName(state, id) || 'okänt barn';
    switch (op.op) {
      case 'need.add':
        return `Lägg till behov: ${op.title} till ${name(op.childId)}`;
      case 'need.done': {
        const need = findNeed(state, op.needId);
        if (!need) return 'Markera inköp som klart';
        const after = Math.min(need.qty, need.doneQty + (op.qty || 1));
        return after >= need.qty
          ? `Bekräfta klart: ${need.title} till ${name(need.childId)}`
          : `Bekräfta ${after} av ${need.qty}: ${need.title} till ${name(need.childId)} (${need.qty - after} kvar)`;
      }
      case 'need.blocked': {
        const need = findNeed(state, op.needId);
        return need
          ? `Kvar att ordna: ${need.title} till ${name(need.childId)} — ${op.note || 'blev inte av'}`
          : 'Notera att något inte blev av';
      }
      case 'need.status': {
        const need = findNeed(state, op.needId);
        const label = (M.NEED_STATUS[op.status] || {}).label || op.status;
        return need ? `Sätt "${need.title}" till: ${label}` : `Ändra status till ${label}`;
      }
      case 'need.qty': {
        const need = findNeed(state, op.needId);
        return need ? `Ändra antal för "${need.title}" till ${op.qty}` : 'Ändra antal';
      }
      case 'need.remove': {
        const need = findNeed(state, op.needId);
        return need ? `Ta bort behov: ${need.title} (${name(need.childId)})` : 'Ta bort behov';
      }
      case 'task.add':
        return `Lägg till uppgift: ${op.title}${op.earliest ? ` (tidigast ${op.earliest})` : ''}${op.scheduledDate ? ` — ${U.relativeDay(op.scheduledDate, U.dateKey(new Date()))}` : ''}`;
      case 'task.addForNeeds': {
        const names = uniqueNames(state, op.needRefs || [], op.needIds || []);
        return `Lägg till uppgift: Handla kläder${names ? ` till ${names}` : ''}${op.earliest ? ` (tidigast ${op.earliest})` : ''}`;
      }
      case 'task.done': {
        const task = findTask(state, op.taskId);
        return task ? `Markera klar: ${task.title}` : 'Markera uppgift som klar';
      }
      case 'task.move': {
        const task = findTask(state, op.taskId);
        const where = { senare: 'senare i dag', imorgon: 'i morgon', vantar: 'Kan vänta' }[op.to] || op.to;
        return task ? `Flytta "${task.title}" till ${where}` : `Flytta uppgift till ${where}`;
      }
      case 'task.reduce': {
        const task = findTask(state, op.taskId);
        return task ? `Gör mindre: "${task.title}" kortas till ${op.minutes} min` : 'Korta ned uppgiften';
      }
      case 'task.remove': {
        const task = findTask(state, op.taskId);
        return task ? `Ta bort uppgift: ${task.title}` : 'Ta bort uppgift';
      }
      case 'day.energy':
        return `Sätt ork ${U.relativeDay(op.date, U.dateKey(new Date()))} till: ${(M.ENERGY[op.energy] || {}).label || op.energy}`;
      case 'day.children': {
        const label = { ja: 'är hos dig', nej: 'är inte hos dig', okand: 'okänt' }[op.value] || op.value;
        return `${name(op.childId)} ${label} ${U.relativeDay(op.date, U.dateKey(new Date()))}`;
      }
      case 'day.work': {
        const label = { ja: 'arbetsdag', nej: 'ledig', okand: 'okänt' }[op.value] || op.value;
        return `Markera ${U.relativeDay(op.date, U.dateKey(new Date()))} som ${label}`;
      }
      case 'size.set':
        return op.kind === 'kropp'
          ? `Kroppsmått för ${name(op.childId)}: ${op.label} ${op.value}${op.preliminary ? ' (preliminärt)' : ''}`
          : `Storlek för ${name(op.childId)}${op.brand ? ` hos ${op.brand}` : ''}: ${op.value}${op.preliminary ? ' (preliminär provstorlek)' : ''}`;
      case 'prep.done':
        return `Bocka av förberedelse: ${op.label}`;
      default:
        return 'Okänd ändring (hoppas över)';
    }
  }

  function uniqueNames(state, refs, ids) {
    const childIds = new Set();
    for (const r of refs) if (r.childId) childIds.add(r.childId);
    for (const id of ids) { const n = findNeed(state, id); if (n && n.childId) childIds.add(n.childId); }
    return Array.from(childIds).map((id) => M.childName(state, id)).filter(Boolean).join(' och ');
  }

  /** Vilka ops som kräver att något faktiskt finns kvar att ändra. */
  function isApplicable(state, op) {
    switch (op.op) {
      case 'need.done': case 'need.blocked': case 'need.status':
      case 'need.qty': case 'need.remove':
        return !!findNeed(state, op.needId);
      case 'task.done': case 'task.move': case 'task.reduce': case 'task.remove':
        return !!findTask(state, op.taskId);
      case 'need.add':
        return !!op.childId && !!op.title;
      case 'day.children':
        return !!M.childById(state, op.childId);
      case 'size.set':
        return !!M.childById(state, op.childId) && !!op.value;
      default:
        return true;
    }
  }

  /**
   * Tillämpar en lista ops på en KOPIA av state.
   * @returns {{state: object, applied: string[], skipped: string[]}}
   */
  function applyOps(state, ops, now) {
    const next = U.clone(state);
    const applied = [];
    const skipped = [];
    const stamp = (now || new Date()).toISOString();
    const dateKey = U.dateKey(now || new Date());
    const refMap = {};   // ref -> skapat behovs-id

    for (const op of ops || []) {
      if (!isApplicable(next, op)) { skipped.push(describeOp(state, op)); continue; }
      const description = describeOp(next, op);

      switch (op.op) {
        case 'need.add': {
          const need = M.newNeed({
            childId: op.childId, title: op.title, garment: op.garment,
            qty: op.qty, status: 'behover', note: op.note || '',
          });
          need.createdAt = stamp; need.updatedAt = stamp;
          next.needs.push(need);
          if (op.ref) refMap[op.ref] = need.id;
          break;
        }
        case 'need.done': {
          const need = findNeed(next, op.needId);
          need.doneQty = Math.min(need.qty, (need.doneQty || 0) + (op.qty || 1));
          // Bekräftat klart först när HELA behovet är täckt.
          need.status = need.doneQty >= need.qty ? 'bekraftat' : need.status;
          need.updatedAt = stamp;
          need.history.push({ at: stamp, event: 'bekraftat', qty: need.doneQty, note: op.note || '' });
          break;
        }
        case 'need.blocked': {
          const need = findNeed(next, op.needId);
          need.note = op.note || need.note;
          // Status ändras INTE: behovet står kvar tills det verkligen är ordnat.
          if (need.status === 'planerat') need.status = 'behover';
          need.updatedAt = stamp;
          need.history.push({ at: stamp, event: 'blockerat', note: op.note || '' });
          break;
        }
        case 'need.status': {
          const need = findNeed(next, op.needId);
          if (M.NEED_STATUS[op.status]) {
            need.status = op.status;
            if (op.status === 'bekraftat') need.doneQty = need.qty;
            if (op.status === 'behover' && need.doneQty >= need.qty) need.doneQty = 0;
            need.updatedAt = stamp;
            need.history.push({ at: stamp, event: op.status, note: op.note || '' });
          }
          break;
        }
        case 'need.qty': {
          const need = findNeed(next, op.needId);
          need.qty = Math.max(1, Number(op.qty) || 1);
          need.doneQty = Math.min(need.doneQty, need.qty);
          if (need.doneQty < need.qty && need.status === 'bekraftat') need.status = 'behover';
          need.updatedAt = stamp;
          break;
        }
        case 'need.remove': {
          next.needs = next.needs.filter((n) => n.id !== op.needId);
          break;
        }
        case 'task.add': {
          const task = M.newTask(Object.assign({}, op, { source: op.source || 'assistent' }));
          task.createdAt = stamp;
          next.tasks.push(task);
          break;
        }
        case 'task.addForNeeds': {
          const needIds = (op.needRefs || []).map((r) => refMap[r.ref]).filter(Boolean)
            .concat(op.needIds || []);
          const names = uniqueNames(next, op.needRefs || [], op.needIds || []);
          const task = M.newTask({
            title: `Handla kläder${names ? ` till ${names}` : ''}`,
            kind: 'inkop', minutes: op.minutes || 60,
            context: op.context || 'butik',
            earliest: op.earliest || '', scheduledDate: op.scheduledDate || '',
            needIds, source: 'assistent', load: 'medel',
          });
          task.createdAt = stamp;
          next.tasks.push(task);
          // Behoven är nu PLANERADE — inte köpta.
          for (const id of needIds) {
            const need = findNeed(next, id);
            if (need && need.status === 'behover') {
              need.status = 'planerat';
              need.updatedAt = stamp;
              need.history.push({ at: stamp, event: 'planerat', note: 'Inplanerat, ännu inte köpt' });
            }
          }
          break;
        }
        case 'task.done': {
          const task = findTask(next, op.taskId);
          task.status = 'klar'; task.doneAt = stamp;
          break;
        }
        case 'task.move': {
          const task = findTask(next, op.taskId);
          if (op.to === 'imorgon') { task.scheduledDate = U.addDays(dateKey, 1); task.status = 'oppen'; }
          else if (op.to === 'vantar') { task.status = 'vilande'; task.scheduledDate = ''; }
          else { // senare i dag
            task.scheduledDate = dateKey;
            task.earliest = op.earliest || U.toClock(U.minutesOfDay(now || new Date()) + 120);
          }
          task.lastOfferedDate = dateKey;
          const day = next.days[dateKey] || M.dayDefaults();
          if (op.to === 'senare') { /* stannar i dag */ }
          else { day.skipped = Array.from(new Set([...(day.skipped || []), task.id])); }
          next.days[dateKey] = day;
          break;
        }
        case 'task.reduce': {
          const task = findTask(next, op.taskId);
          const reduced = Math.max(10, Math.round((op.minutes || task.minutes / 2) / 5) * 5);
          task.minutes = reduced;
          task.load = task.load === 'tung' ? 'medel' : 'latt';
          break;
        }
        case 'task.remove': {
          next.tasks = next.tasks.filter((t) => t.id !== op.taskId);
          break;
        }
        case 'day.energy': {
          const day = next.days[op.date] || M.dayDefaults();
          day.energy = M.ENERGY[op.energy] ? op.energy : 'okand';
          next.days[op.date] = day;
          break;
        }
        case 'day.children': {
          const day = next.days[op.date] || M.dayDefaults();
          day.children = Object.assign({}, day.children, { [op.childId]: op.value });
          next.days[op.date] = day;
          break;
        }
        case 'day.work': {
          const day = next.days[op.date] || M.dayDefaults();
          day.work = M.TRISTATE.includes(op.value) ? op.value : 'okand';
          next.days[op.date] = day;
          break;
        }
        case 'size.set': {
          const existing = next.sizes.find((s) => s.childId === op.childId
            && s.kind === op.kind
            && (s.brand || '') === (op.brand || '')
            && (s.label || '') === (op.label || ''));
          if (existing) {
            existing.value = String(op.value);
            existing.preliminary = op.preliminary !== false;
            existing.note = op.note || existing.note;
            existing.updatedAt = stamp;
          } else {
            const size = M.newSize(op);
            size.updatedAt = stamp;
            next.sizes.push(size);
          }
          break;
        }
        case 'prep.done': {
          const day = next.days[op.date || dateKey] || M.dayDefaults();
          day.prepDone = Array.from(new Set([...(day.prepDone || []), op.key]));
          next.days[op.date || dateKey] = day;
          break;
        }
        case 'prep.undone': {
          const day = next.days[op.date || dateKey] || M.dayDefaults();
          day.prepDone = (day.prepDone || []).filter((k) => k !== op.key);
          next.days[op.date || dateKey] = day;
          break;
        }
        default:
          skipped.push(`Okänd ändring: ${op.op}`);
          continue;
      }
      applied.push(description);
    }

    next.updatedAt = stamp;
    return { state: next, applied, skipped };
  }

  /** Markerar vilka uppgifter som faktiskt föreslagits i dag, så att
   *  missade förslag inte staplas ovanpå morgondagens plan. */
  function markOffered(state, taskIds, dateKey) {
    const next = U.clone(state);
    for (const task of next.tasks) {
      if (taskIds.includes(task.id)) task.lastOfferedDate = dateKey;
    }
    return next;
  }

  MV.apply = { applyOps, describeOp, isApplicable, markOffered };
})(typeof globalThis !== 'undefined' ? globalThis : this);
