const DAY = 86_400_000;

function average(values) {
  const valid = values.filter((value) => Number.isFinite(value));
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
}

function dateValue(key) {
  const value = new Date(`${key}T12:00:00`).getTime();
  return Number.isFinite(value) ? value : 0;
}

function readableHabit(id) {
  return ({ outside: "dagsljus", move: "mjuk rörelse", unwind: "en lugn landning" })[id] || id;
}

function readableSymptom(id) {
  return ({ cramps: "mensvärk", tender: "ömhet", headache: "huvudvärk", bloating: "svullen känsla", "low-energy": "låg energi", irritable: "irritation", anxious: "oro", "low-mood": "nedstämdhet", sleep: "orolig sömn", appetite: "förändrad aptit" })[id] || "en kroppssignal";
}

export function personalInsights(logs = {}, rangeDays = 28, now = new Date()) {
  const days = [7, 28, 90].includes(Number(rangeDays)) ? Number(rangeDays) : 28;
  const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1)).getTime();
  const rangeEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - 1;
  const series = Object.entries(logs)
    .filter(([key]) => dateValue(key) >= cutoff && dateValue(key) <= rangeEnd)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, log]) => ({
      key,
      date: new Date(`${key}T12:00:00`),
      mood: Number(log.mood) || null,
      energy: Number(log.energy) || null,
      sleepHours: Number(log.sleepHours) || null,
      water: Number(log.water) || 0,
      habits: log.habits || {},
      symptoms: Array.isArray(log.symptoms) ? log.symptoms : [],
      checkIns: Array.isArray(log.checkIns) ? log.checkIns : []
    }));

  const logged = series.filter((day) => day.mood || day.energy || day.sleepHours || day.checkIns.length || day.symptoms.length);
  const moments = series.flatMap((day) => day.checkIns);
  const status = logged.length < 3 ? "new" : logged.length < 7 ? "emerging" : "supported";

  const rested = logged.filter((day) => day.sleepHours >= 7 && day.mood);
  const shortSleep = logged.filter((day) => day.sleepHours && day.sleepHours < 7 && day.mood);
  let helps = null;
  if (rested.length >= 2 && shortSleep.length >= 2) {
    const restedMood = average(rested.map((day) => day.mood));
    const shortMood = average(shortSleep.map((day) => day.mood));
    const direction = restedMood >= shortMood ? "högre" : "lägre";
    helps = {
      headline: "Sömn och dagsform verkar hänga ihop",
      observation: `På ${rested.length} loggade dagar med minst sju timmars sömn låg måendet ${direction} än på ${shortSleep.length} kortare nätter. Det är en ledtråd, inte ett bevis på orsak.`,
      evidence: `${rested.length + shortSleep.length} jämförbara dagar`
    };
  }

  if (!helps) {
    const candidates = ["outside", "move", "unwind"].map((habit) => {
      const yes = logged.filter((day) => day.habits[habit] && day.mood);
      const no = logged.filter((day) => !day.habits[habit] && day.mood);
      return { habit, yes, no, difference: (average(yes.map((day) => day.mood)) || 0) - (average(no.map((day) => day.mood)) || 0) };
    }).filter((item) => item.yes.length >= 2 && item.no.length >= 2).sort((a, b) => b.difference - a.difference);
    const best = candidates[0];
    if (best) {
      helps = {
        headline: `${readableHabit(best.habit)} är värd att följa`,
        observation: `På de ${best.yes.length} loggade dagarna med ${readableHabit(best.habit)} låg måendet ${best.difference >= 0 ? "oftare lite högre" : "inte tydligt högre"}. Prova igen och använd feedbacken för att se om mönstret håller.`,
        evidence: `${best.yes.length + best.no.length} jämförbara dagar`
      };
    }
  }

  if (!helps) {
    helps = status === "new"
      ? { headline: "Vi börjar utan att gissa", observation: "Några fler korta incheckningar behövs innan Aura kallar något ett mönster. Du får ändå ett användbart experiment redan nu.", evidence: `${logged.length} loggade dagar` }
      : { headline: "Din karta håller på att ta form", observation: "Det finns ännu ingen jämförelse med tillräckligt många liknande dagar. Fortsätt logga det som känns relevant — tomma dagar räknas inte som dåliga dagar.", evidence: `${logged.length} loggade dagar` };
  }

  const symptomCounts = {};
  series.forEach((day) => day.symptoms.forEach((id) => { symptomCounts[id] = (symptomCounts[id] || 0) + 1; }));
  const topSymptom = Object.entries(symptomCounts).sort((a, b) => b[1] - a[1])[0];
  const highStress = moments.filter((moment) => Number(moment.stress) >= 4).length;
  const repeats = topSymptom
    ? { headline: "En kroppssignal återkommer", observation: `${readableSymptom(topSymptom[0])} finns på ${topSymptom[1]} loggade dagar i perioden. Jämför den med sömn, stress och cykeldag innan du drar en slutsats.`, evidence: `${topSymptom[1]} tillfällen` }
    : highStress >= 2
      ? { headline: "Hög stress återkommer", observation: `${highStress} incheckningar hade hög stress. Nästa användbara fråga är vad som hjälpte efteråt — inte varför du “borde” ha känt annorlunda.`, evidence: `${highStress} stunder` }
      : { headline: "Inget återkommande behöver hittas ännu", observation: "Aura väntar hellre på mer data än hittar på ett mönster. Fortsätt med små, ärliga incheckningar.", evidence: `${moments.length} stunder` };

  const sleepAverage = average(logged.map((day) => day.sleepHours));
  const sparseMeals = moments.filter((moment) => moment.foodStatus === "empty").length;
  const experiment = sleepAverage && sleepAverage < 7
    ? { title: "Prova en mjuk kvällslandning i tre dagar", body: "Välj samma lilla sak varje kväll: dämpa ljuset, lägg undan en skärm eller gör te. Checka sedan bara om sömnen kändes lugnare.", measure: "Följ sömn + morgonkänsla" }
    : sparseMeals >= 2
      ? { title: "Prova ett enkelt mellanmål i tre dagar", body: "Välj en återkommande tid och något lätt som yoghurt, frukt, smörgås eller nötter. Se om eftermiddagens energi känns jämnare.", measure: "Följ energi + aptit" }
      : { title: "Prova tio minuters dagsljus i tre dagar", body: "Välj en rimlig tid och gå ut, sitt vid ett öppet fönster eller ta en kort promenad. Logga sedan om energin ändrades alls.", measure: "Följ energi + mående" };

  const feedback = moments.reduce((summary, moment) => {
    if (["better", "same", "worse"].includes(moment.feedback)) summary[moment.feedback] += 1;
    return summary;
  }, { better: 0, same: 0, worse: 0 });

  return { rangeDays: days, status, sampleDays: logged.length, moments: moments.length, series, helps, repeats, experiment, feedback };
}

export function getActiveExperiment(value, now = new Date()) {
  if (!value || typeof value !== "object") return null;
  const startedAt = typeof value.startedAt === "string" ? value.startedAt : "";
  const started = Date.parse(startedAt);
  const days = Number.isFinite(Number(value.days)) ? Math.min(14, Math.max(1, Number(value.days))) : 3;
  const title = typeof value.title === "string" ? value.title.trim() : "";
  const body = typeof value.body === "string" ? value.body.trim() : "";
  const measure = typeof value.measure === "string" ? value.measure.trim() : "";
  if (!Number.isFinite(started) || !title || !body || !measure) return null;
  const completedDates = Array.isArray(value.completedDates)
    ? [...new Set(value.completedDates.filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)))].slice(0, days)
    : [];
  // Tre försök ska vara möjliga även om en dag hoppas över. Testet ligger därför
  // kvar i högst tio dagar i stället för att försvinna efter tre kalenderdygn.
  if (now.getTime() < started || now.getTime() - started >= 10 * DAY) return null;
  return { title, body, measure, startedAt, days, completedDates };
}

function experimentDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function experimentProgress(value, now = new Date()) {
  const experiment = getActiveExperiment(value, now);
  if (!experiment) return null;
  const today = experimentDateKey(now);
  return {
    ...experiment,
    completed: experiment.completedDates.length,
    remaining: Math.max(0, experiment.days - experiment.completedDates.length),
    doneToday: experiment.completedDates.includes(today),
    readyForFeedback: experiment.completedDates.length >= experiment.days
  };
}

export function markExperimentDay(value, now = new Date()) {
  const experiment = getActiveExperiment(value, now);
  if (!experiment) return null;
  const today = experimentDateKey(now);
  return {
    ...value,
    completedDates: [...new Set([...experiment.completedDates, today])].slice(0, experiment.days)
  };
}
