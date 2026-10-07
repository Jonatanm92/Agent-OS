// Pure functions that turn raw model output into a consistent report, apply
// deterministic safety guards and decide what an unpaid viewer may see.
import {
  ASSESSMENT_STATUSES,
  CATEGORIES,
  DATE_KINDS,
  FACT_KEYS,
  RECOMMENDATIONS,
  REQUIREMENT_TYPES,
  SEVERITIES,
} from "./prompts.mjs";

const asString = (v, max = 2000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const asPage = (v) => (Number.isInteger(v) && v > 0 ? v : Number.isFinite(Number(v)) && Number(v) > 0 ? Math.trunc(Number(v)) : 0);
const pick = (v, allowed, fallback) => (allowed.includes(v) ? v : fallback);
const list = (v) => (Array.isArray(v) ? v : []);

export function normalizeKey(text) {
  return asString(text)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wordSet(text) {
  return new Set(normalizeKey(text).split(" ").filter((w) => w.length > 2 || /\d/.test(w)));
}

// Thresholds, amounts and counts change a requirement's meaning, so two texts
// are only merged when they mention exactly the same numbers.
function numbersOf(text) {
  return (asString(text).match(/\d+(?:[ .,]\d+)*/g) ?? []).map((n) => n.replace(/[ .,]/g, "")).sort().join("|");
}

const isValidTime = (v) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

export function similarity(a, b) {
  const A = wordSet(a);
  const B = wordSet(b);
  if (!A.size || !B.size) return 0;
  let shared = 0;
  for (const w of A) if (B.has(w)) shared += 1;
  return shared / (A.size + B.size - shared);
}

export function isValidIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

const TYPE_RANK = { SKA: 0, UTVARDERING: 1, BOR: 2, INFO: 3 };

/**
 * Merges the per-chunk extraction results (in document order) into one
 * de-duplicated extraction with stable requirement ids K1..Kn.
 */
export function mergeExtractions(parts, documentOrder = []) {
  const docIndex = (name) => {
    const i = documentOrder.indexOf(name);
    return i === -1 ? documentOrder.length : i;
  };

  const requirements = [];
  for (const part of parts) {
    for (const raw of list(part?.requirements)) {
      const req = {
        ref: asString(raw.ref, 40),
        category: pick(raw.category, CATEGORIES, "OVRIGT"),
        type: pick(raw.type, REQUIREMENT_TYPES, "INFO"),
        text: asString(raw.text, 600),
        evidence: asString(raw.evidence, 400),
        document: asString(raw.document, 160),
        page: asPage(raw.page),
        quote: asString(raw.quote, 300),
      };
      if (!req.text) continue;
      const duplicate = requirements.find(
        (other) =>
          normalizeKey(other.text) === normalizeKey(req.text) ||
          (other.category === req.category && numbersOf(other.text) === numbersOf(req.text) && similarity(other.text, req.text) >= 0.82),
      );
      if (duplicate) {
        // Keep the strictest type and remember the extra source.
        if (TYPE_RANK[req.type] < TYPE_RANK[duplicate.type]) duplicate.type = req.type;
        if (!duplicate.evidence && req.evidence) duplicate.evidence = req.evidence;
        duplicate.alsoAt = duplicate.alsoAt ?? [];
        if (duplicate.alsoAt.length < 5 && (duplicate.document !== req.document || duplicate.page !== req.page)) {
          duplicate.alsoAt.push({ document: req.document, page: req.page });
        }
        continue;
      }
      requirements.push(req);
    }
  }
  requirements.sort((a, b) => docIndex(a.document) - docIndex(b.document) || a.page - b.page);
  requirements.forEach((req, i) => {
    req.id = `K${i + 1}`;
  });

  const dates = [];
  for (const part of parts) {
    for (const raw of list(part?.dates)) {
      const date = asString(raw.date, 10);
      const item = {
        kind: pick(raw.kind, DATE_KINDS, "OVRIGT"),
        label: asString(raw.label, 200),
        date: isValidIsoDate(date) ? date : "",
        time: isValidTime(asString(raw.time, 5)) ? asString(raw.time, 5) : "",
        document: asString(raw.document, 160),
        page: asPage(raw.page),
        quote: asString(raw.quote, 300),
      };
      if (!item.label && !item.date) continue;
      const dup = dates.find((d) => d.kind === item.kind && d.date === item.date && d.time === item.time && (item.date || normalizeKey(d.label) === normalizeKey(item.label)));
      if (!dup) dates.push(item);
    }
  }
  dates.sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999") || a.time.localeCompare(b.time));

  const facts = [];
  for (const part of parts) {
    for (const raw of list(part?.facts)) {
      const fact = {
        key: pick(raw.key, FACT_KEYS, "OVRIGT"),
        value: asString(raw.value, 400),
        document: asString(raw.document, 160),
        page: asPage(raw.page),
      };
      if (!fact.value) continue;
      if (facts.some((f) => f.key === fact.key && normalizeKey(f.value) === normalizeKey(fact.value))) continue;
      facts.push(fact);
    }
  }

  const risks = [];
  for (const part of parts) {
    for (const raw of list(part?.risks)) {
      const risk = {
        title: asString(raw.title, 140),
        description: asString(raw.description, 600),
        severity: pick(raw.severity, SEVERITIES, "MEDEL"),
        document: asString(raw.document, 160),
        page: asPage(raw.page),
        quote: asString(raw.quote, 300),
      };
      if (!risk.title) continue;
      if (risks.some((r) => normalizeKey(r.title) === normalizeKey(risk.title) && similarity(r.description, risk.description) > 0.5)) continue;
      risks.push(risk);
    }
  }
  const severityRank = { HOG: 0, MEDEL: 1, LAG: 2 };
  risks.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

  const ambiguities = [];
  for (const part of parts) {
    for (const raw of list(part?.ambiguities)) {
      const item = {
        issue: asString(raw.issue, 600),
        suggested_question: asString(raw.suggested_question, 600),
        document: asString(raw.document, 160),
        page: asPage(raw.page),
      };
      if (item.issue && !ambiguities.some((a) => similarity(a.issue, item.issue) > 0.8)) ambiguities.push(item);
    }
  }

  const changes = [];
  for (const part of parts) {
    for (const raw of list(part?.changes)) {
      const item = { description: asString(raw.description, 600), document: asString(raw.document, 160), page: asPage(raw.page) };
      if (item.description) changes.push(item);
    }
  }

  // Several different submission deadlines usually mean a Q&A or correction
  // moved it. Use the latest one, and tell the reader to verify.
  const deadlines = [...new Set(dates.filter((d) => d.kind === "SISTA_ANBUDSDAG" && d.date).map((d) => d.date))];
  if (deadlines.length > 1) {
    ambiguities.unshift({
      issue: `Flera olika sista anbudsdagar förekommer i underlaget (${deadlines.join(", ")}). Den senaste används i rapporten.`,
      suggested_question: "Kan ni bekräfta vilken sista anbudsdag som gäller efter eventuella rättelser?",
      document: "",
      page: 0,
    });
  }

  return { requirements, dates, facts, risks, ambiguities, changes };
}

export function findDeadline(dates) {
  const candidates = list(dates).filter((d) => d.kind === "SISTA_ANBUDSDAG" && d.date);
  if (!candidates.length) return null;
  return candidates.reduce((latest, d) => (`${d.date} ${d.time}` > `${latest.date} ${latest.time}` ? d : latest));
}

export function todayInSweden(now = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm" }).format(now);
}

export function daysBetween(fromIso, toIso) {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}

/** Compact view of the extraction that the synthesis pass reasons over. */
export function buildDigest(extraction, documents) {
  return {
    documents: documents.map((d) => ({ name: d.name, pages: d.pages })),
    facts: extraction.facts.map(({ key, value }) => ({ key, value })),
    dates: extraction.dates.map(({ kind, label, date, time }) => ({ kind, label, date, time })),
    requirements: extraction.requirements.map(({ id, type, category, text, evidence }) => ({ id, type, category, text, evidence })),
    risks: extraction.risks.map(({ title, severity, description }) => ({ title, severity, description })),
    ambiguities: extraction.ambiguities.map(({ issue, suggested_question }) => ({ issue, suggested_question })),
    changes: extraction.changes.map(({ description }) => ({ description })),
  };
}

/** Normalises the synthesis output and enforces hard, non-negotiable rules. */
export function finalizeSynthesis(raw, { requirements, daysLeft, hasProfile }) {
  const ids = new Set(requirements.map((r) => r.id));
  const skaIds = new Set(requirements.filter((r) => r.type === "SKA").map((r) => r.id));
  const result = {
    summary: asString(raw?.summary, 2000),
    recommendation: pick(raw?.recommendation, RECOMMENDATIONS, "MER_INFO"),
    score: Math.max(0, Math.min(100, Math.round(Number(raw?.score) || 0))),
    score_reasons: list(raw?.score_reasons)
      .map((r) => ({ factor: asString(r.factor, 120), effect: pick(r.effect, ["PLUS", "MINUS", "NEUTRAL"], "NEUTRAL"), explanation: asString(r.explanation, 500) }))
      .filter((r) => r.factor),
    key_facts: list(raw?.key_facts).map((f) => ({ label: asString(f.label, 80), value: asString(f.value, 400) })).filter((f) => f.label && f.value),
    assessments: hasProfile
      ? list(raw?.assessments)
          .map((a) => ({ id: asString(a.id, 12), status: pick(a.status, ASSESSMENT_STATUSES, "OKLART"), comment: asString(a.comment, 500) }))
          .filter((a) => ids.has(a.id))
      : [],
    missing_evidence: list(raw?.missing_evidence)
      .map((m) => ({ item: asString(m.item, 300), why: asString(m.why, 500), requirement_ids: list(m.requirement_ids).filter((id) => ids.has(id)) }))
      .filter((m) => m.item),
    questions: list(raw?.questions)
      .map((q) => ({ question: asString(q.question, 600), reason: asString(q.reason, 500), requirement_ids: list(q.requirement_ids).filter((id) => ids.has(id)) }))
      .filter((q) => q.question),
    bid_outline: list(raw?.bid_outline).map((b) => ({ section: asString(b.section, 160), contents: asString(b.contents, 800) })).filter((b) => b.section),
    final_checklist: list(raw?.final_checklist).map((c) => asString(c, 300)).filter(Boolean),
    next_steps: list(raw?.next_steps).map((c) => asString(c, 300)).filter(Boolean),
    guards: [],
  };

  // Dedupe assessments by id (first wins).
  const seen = new Set();
  result.assessments = result.assessments.filter((a) => (seen.has(a.id) ? false : seen.add(a.id)));

  if (daysLeft !== null && daysLeft < 0) {
    result.recommendation = "AVSTA";
    result.score = Math.min(result.score, 10);
    result.guards.push("Sista anbudsdag har passerat – det går inte längre att lämna anbud.");
  }
  const missingSka = result.assessments.filter((a) => a.status === "SAKNAS" && skaIds.has(a.id));
  if (result.recommendation === "GO" && missingSka.length > 0) {
    result.recommendation = "GO_MED_FORBEHALL";
    result.score = Math.min(result.score, 69);
    result.guards.push(
      `${missingSka.length} skall-krav verkar inte uppfyllas enligt företagsprofilen (${missingSka.map((a) => a.id).join(", ")}). Ett ouppfyllt skall-krav leder normalt till att anbudet förkastas.`,
    );
  }
  if (!hasProfile && result.recommendation === "GO") {
    result.recommendation = "GO_MED_FORBEHALL";
    result.guards.push("Bedömningen är generell eftersom ingen företagsprofil angavs.");
  }
  return result;
}

export function countBy(items, key) {
  const out = {};
  for (const item of items) out[item[key]] = (out[item[key]] ?? 0) + 1;
  return out;
}

/**
 * Builds the JSON the report page receives. Locked content is never sent to
 * an unpaid viewer – only counts – so it cannot be read from the network tab.
 */
export function buildReportView({ analysis, access, unlocked, previewRequirements, pricing, invoiceEnabled, paymentsEnabled }) {
  const base = {
    token: access.token,
    status: analysis.status,
    progress: analysis.progress ?? null,
    error: analysis.status === "fel" ? analysis.error ?? "Analysen misslyckades." : null,
    createdAt: analysis.createdAt,
    engine: analysis.engine ?? null,
    documents: (analysis.documents ?? []).map(({ name, pages, unit, warning }) => ({ name, pages, unit, warning: warning ?? null })),
    unlocked,
    label: access.label ?? "",
    offer: { priceLabel: pricing.label, vatNote: pricing.vatNote, paymentsEnabled, invoiceEnabled },
    invoiceRequested: Boolean(access.invoiceRequest),
    hasProfile: Boolean(access.synthesis?.profileUsed ?? analysis.synthesis?.profileUsed),
    personalizing: access.personalizing ?? false,
    personalizeError: access.personalizeError ?? null,
  };
  if (analysis.status !== "klar" || !analysis.extraction) return base;

  const extraction = analysis.extraction;
  const synthesis = access.synthesis ?? analysis.synthesis ?? null;
  const requirements = extraction.requirements;
  const deadline = findDeadline(extraction.dates);

  const stats = {
    requirements: requirements.length,
    byType: countBy(requirements, "type"),
    byCategory: countBy(requirements, "category"),
    risks: extraction.risks.length,
    highRisks: extraction.risks.filter((r) => r.severity === "HOG").length,
    questions: synthesis?.questions?.length ?? 0,
    missingEvidence: synthesis?.missing_evidence?.length ?? 0,
    ambiguities: extraction.ambiguities.length,
    assessments: countBy(synthesis?.assessments ?? [], "status"),
    pages: (analysis.documents ?? []).reduce((sum, d) => sum + (d.pages ?? 0), 0),
  };

  const headline = synthesis
    ? {
        summary: synthesis.summary,
        recommendation: synthesis.recommendation,
        score: synthesis.score,
        key_facts: synthesis.key_facts,
        guards: synthesis.guards ?? [],
        profileUsed: Boolean(synthesis.profileUsed),
        title: synthesis.title ?? analysis.title ?? "",
      }
    : null;

  if (unlocked) {
    return {
      ...base,
      headline,
      stats,
      deadline,
      dates: extraction.dates,
      requirements,
      risks: extraction.risks,
      ambiguities: extraction.ambiguities,
      changes: extraction.changes,
      synthesis,
    };
  }

  // Preview: enough to prove the value, not enough to replace the purchase.
  const preview = requirements.filter((r) => r.type === "SKA").slice(0, previewRequirements);
  return {
    ...base,
    headline,
    stats,
    deadline,
    dates: extraction.dates.filter((d) => ["SISTA_ANBUDSDAG", "SISTA_FRAGEDAG", "AVTALSSTART"].includes(d.kind)),
    requirements: preview,
    risks: extraction.risks.slice(0, 1),
    synthesis: synthesis
      ? {
          score_reasons: synthesis.score_reasons.slice(0, 3),
          // Show the verdict for the free rows only – a taste of the full check.
          assessments: (synthesis.assessments ?? []).filter((a) => preview.some((r) => r.id === a.id)),
          missing_evidence: [],
          questions: [],
          bid_outline: [],
          final_checklist: [],
          next_steps: [],
        }
      : null,
    locked: {
      requirements: Math.max(0, requirements.length - preview.length),
      risks: Math.max(0, extraction.risks.length - 1),
      dates: Math.max(0, extraction.dates.length - extraction.dates.filter((d) => ["SISTA_ANBUDSDAG", "SISTA_FRAGEDAG", "AVTALSSTART"].includes(d.kind)).length),
      missingEvidence: stats.missingEvidence,
      questions: stats.questions,
      ambiguities: stats.ambiguities,
      bidOutline: synthesis?.bid_outline?.length ?? 0,
      checklist: synthesis?.final_checklist?.length ?? 0,
    },
  };
}

export function deriveTitle(extraction, fallback = "") {
  const facts = extraction?.facts ?? [];
  const usable = (v) => (v && v.length <= 120 ? v : "");
  const name = usable(facts.find((f) => f.key === "UPPHANDLINGENS_NAMN")?.value);
  const buyer = usable(facts.find((f) => f.key === "UPPHANDLANDE_ORGANISATION")?.value);
  if (name && buyer) return `${name} – ${buyer}`;
  if (name) return name;
  const doc = fallback.replace(/\.[a-z0-9]+$/i, "");
  if (buyer) return doc ? `${doc} – ${buyer}` : buyer;
  return doc;
}
