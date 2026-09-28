const clean = (value, maxLength) => String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);

export function summarizeCoachResponse(response = {}) {
  return clean([
    response.headline,
    response.reflection,
    response.firstStep?.title && response.firstStep?.body ? `Första steg: ${response.firstStep.title}. ${response.firstStep.body}` : ""
  ].filter(Boolean).join(" "), 700);
}

export function buildCoachPriorTurns(entry = {}) {
  const opening = clean(entry.aiOpening || (entry.aiCoach?.mode !== "followup" ? summarizeCoachResponse(entry.aiCoach) : ""), 700);
  const followups = (Array.isArray(entry.aiTurns) ? entry.aiTurns : []).map((turn) => ({
    user: clean(turn?.user, 500),
    assistant: clean(turn?.assistant, 700)
  })).filter((turn) => turn.user || turn.assistant).slice(-3);
  return [...(opening ? [{ user: "", assistant: opening }] : []), ...followups].slice(-4);
}

export function coachTranscriptPatch(entry = {}, response = {}, question = "") {
  const existingOpening = clean(entry.aiOpening, 700);
  const opening = existingOpening
    || (question ? summarizeCoachResponse(entry.aiCoach) : summarizeCoachResponse(response));
  const turns = Array.isArray(entry.aiTurns) ? entry.aiTurns : [];
  const nextTurns = question
    ? [...turns, { user: clean(question, 500), assistant: summarizeCoachResponse(response) }].slice(-4)
    : turns.slice(-4);
  return { aiOpening: opening, aiTurns: nextTurns };
}

export function coachTranscriptView(entry = {}) {
  if (entry.aiCoach?.mode !== "followup") return { opening: "", previousTurns: [], currentUser: "" };
  const turns = Array.isArray(entry.aiTurns) ? entry.aiTurns : [];
  const current = turns.at(-1) || null;
  return {
    opening: clean(entry.aiOpening, 700),
    previousTurns: turns.slice(0, -1),
    currentUser: clean(current?.user, 500)
  };
}
