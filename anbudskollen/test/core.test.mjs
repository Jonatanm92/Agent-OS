import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import { makePdf } from "./helpers/pdf.mjs";
import { detectKind, extractDocument, splitIntoSections } from "../src/extract.mjs";
import { buildChunks, splitChunk } from "../src/chunk.mjs";
import { demoExtract } from "../src/demo.mjs";
import { buildReportView, deriveTitle, finalizeSynthesis, findDeadline, mergeExtractions } from "../src/report.mjs";
import { buildIcs, buildWorkbook, safeCell } from "../src/export.mjs";
import { createPayments } from "../src/payments.mjs";
import { LlmError, createAnthropicProvider, estimateCostUsd, parseJsonLoose } from "../src/llm.mjs";
import { buildExampleView } from "../src/example.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const tenderText = fs.readFileSync(path.join(here, "fixtures/upphandling-lokalvard.txt"), "utf8");

const req = (over = {}) => ({ ref: "", category: "KVALIFICERING", type: "SKA", text: "Krav", evidence: "", document: "a.pdf", page: 1, quote: "", ...over });

test("PDF extraction keeps pages and Swedish characters", async () => {
  const doc = await extractDocument({ originalname: "Upphandling lokalvård.pdf", buffer: makePdf(tenderText) });
  assert.equal(doc.kind, "pdf");
  assert.equal(doc.pages.length, 2);
  assert.equal(doc.pages[0].unit, "sida");
  assert.match(doc.pages[0].text, /Lokalvård för förskolor/);
  assert.match(doc.pages[1].text, /firmatecknare/);
  assert.equal(doc.warning, undefined);
});

test("XLSX and text files are extracted; unknown types are rejected", async () => {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Prisbilaga");
  sheet.addRow(["Objekt", "Pris per månad"]);
  sheet.addRow(["Förskolan Solen", 12500]);
  const xlsx = await extractDocument({ originalname: "Prisbilaga.xlsx", buffer: Buffer.from(await wb.xlsx.writeBuffer()) });
  assert.equal(xlsx.kind, "xlsx");
  assert.match(xlsx.pages[0].text, /Flik: Prisbilaga/);
  assert.match(xlsx.pages[0].text, /Förskolan Solen \| 12500/);

  const txt = await extractDocument({ originalname: "fragor.txt", buffer: Buffer.from("Fråga 1: Gäller kravet?\n\nSvar: Ja.") });
  assert.equal(txt.kind, "text");
  assert.equal(txt.pages[0].unit, "avsnitt");

  assert.equal(detectKind("virus.exe", Buffer.from("MZ")), null);
  await assert.rejects(extractDocument({ originalname: "bild.png", buffer: Buffer.from([0x89, 0x50]) }), /stöds inte/);
});

test("sections split long text without losing content", () => {
  const text = Array.from({ length: 40 }, (_, i) => `Stycke ${i} med text som ska bevaras.`).join("\n\n");
  const sections = splitIntoSections(text, 300);
  assert.ok(sections.length > 3);
  assert.equal(sections.join("\n\n").replace(/\s+/g, " "), text.replace(/\s+/g, " "));
});

test("chunks carry document headers and can be split at page boundaries", () => {
  const docs = [
    { name: "a.pdf", pages: [1, 2, 3, 4].map((n) => ({ unit: "sida", n, text: "x".repeat(400) })) },
    { name: "b.pdf", pages: [{ unit: "sida", n: 1, text: "y".repeat(400) }] },
  ];
  const chunks = buildChunks(docs, 1000);
  assert.ok(chunks.length >= 2);
  for (const c of chunks) assert.match(c.text, /^\[DOKUMENT: /);
  assert.equal(chunks.reduce((s, c) => s + c.pages, 0), 5);
  const halves = splitChunk(chunks[0]);
  assert.equal(halves.length, 2);
  assert.match(halves[1].text, /^\[DOKUMENT: a\.pdf\]/);
  assert.equal(halves[0].pages + halves[1].pages, chunks[0].pages);
});

test("merge de-duplicates requirements, assigns ids and keeps the strictest type", () => {
  const merged = mergeExtractions(
    [
      { requirements: [req({ text: "Leverantören ska ha ISO 9001-certifikat", page: 3 }), req({ text: "Omsättning minst 6 mkr", page: 2 })] },
      { requirements: [req({ text: "Leverantören ska ha ISO 9001 certifikat", type: "BOR", page: 9, evidence: "Kopia" })], dates: [] },
    ],
    ["a.pdf"],
  );
  assert.equal(merged.requirements.length, 2);
  assert.deepEqual(merged.requirements.map((r) => r.id), ["K1", "K2"]);
  assert.equal(merged.requirements[0].text, "Omsättning minst 6 mkr");
  const iso = merged.requirements[1];
  assert.equal(iso.type, "SKA");
  assert.equal(iso.evidence, "Kopia");
  assert.deepEqual(iso.alsoAt, [{ document: "a.pdf", page: 9 }]);
});

test("conflicting deadlines pick the latest and raise an ambiguity", () => {
  const merged = mergeExtractions([
    { dates: [{ kind: "SISTA_ANBUDSDAG", label: "Sista anbudsdag", date: "2026-11-12", time: "23:59", document: "a", page: 1, quote: "" }] },
    { dates: [{ kind: "SISTA_ANBUDSDAG", label: "Ny sista anbudsdag", date: "2026-11-19", time: "", document: "qa", page: 1, quote: "" }, { kind: "OVRIGT", label: "Bad", date: "2026-02-31", time: "25:00", document: "x", page: 1, quote: "" }] },
  ]);
  assert.equal(findDeadline(merged.dates).date, "2026-11-19");
  assert.match(merged.ambiguities[0].issue, /Flera olika sista anbudsdagar/);
  const bad = merged.dates.find((d) => d.label === "Bad");
  assert.equal(bad.date, "");
  assert.equal(bad.time, "");
});

test("synthesis guards: passed deadline, missing ska-krav and no profile", () => {
  const requirements = [{ id: "K1", type: "SKA" }, { id: "K2", type: "BOR" }];
  const passed = finalizeSynthesis({ recommendation: "GO", score: 90 }, { requirements, daysLeft: -1, hasProfile: true });
  assert.equal(passed.recommendation, "AVSTA");
  assert.ok(passed.score <= 10);

  const missing = finalizeSynthesis(
    { recommendation: "GO", score: 88, assessments: [{ id: "K1", status: "SAKNAS", comment: "" }, { id: "K99", status: "UPPFYLLT", comment: "" }] },
    { requirements, daysLeft: 20, hasProfile: true },
  );
  assert.equal(missing.recommendation, "GO_MED_FORBEHALL");
  assert.equal(missing.score, 69);
  assert.deepEqual(missing.assessments.map((a) => a.id), ["K1"]);
  assert.match(missing.guards[0], /K1/);

  const generic = finalizeSynthesis({ recommendation: "GO", score: 140, assessments: [{ id: "K1", status: "UPPFYLLT", comment: "" }] }, { requirements, daysLeft: 20, hasProfile: false });
  assert.equal(generic.recommendation, "GO_MED_FORBEHALL");
  assert.equal(generic.score, 100);
  assert.deepEqual(generic.assessments, []);
});

function sampleAnalysis() {
  const requirements = Array.from({ length: 12 }, (_, i) => req({ text: `HEMLIGT-KRAV-${i} unikt innehåll nummer ${i}`, page: i + 1 }));
  const extraction = mergeExtractions([
    {
      requirements,
      dates: [{ kind: "SISTA_ANBUDSDAG", label: "Sista anbudsdag", date: "2099-01-10", time: "", document: "a.pdf", page: 1, quote: "" }, { kind: "TILLDELNING", label: "HEMLIGT-DATUM", date: "2099-02-10", time: "", document: "a.pdf", page: 1, quote: "" }],
      risks: [{ title: "Risk A", description: "första", severity: "HOG", document: "a.pdf", page: 1, quote: "" }, { title: "HEMLIG-RISK", description: "HEMLIG-RISKBESKRIVNING", severity: "LAG", document: "a.pdf", page: 2, quote: "" }],
      ambiguities: [{ issue: "HEMLIG-OKLARHET", suggested_question: "?", document: "a.pdf", page: 1 }],
    },
  ]);
  const synthesis = finalizeSynthesis(
    {
      summary: "Sammanfattning",
      recommendation: "GO",
      score: 75,
      score_reasons: [{ factor: "A", effect: "PLUS", explanation: "a" }],
      assessments: [{ id: "K1", status: "UPPFYLLT", comment: "ok" }, { id: "K12", status: "UPPFYLLT", comment: "HEMLIG-BEDOMNING" }],
      missing_evidence: [{ item: "HEMLIGT-UNDERLAG", why: "x", requirement_ids: [] }],
      questions: [{ question: "HEMLIG-FRAGA", reason: "x", requirement_ids: [] }],
      bid_outline: [{ section: "HEMLIG-DISPOSITION", contents: "x" }],
      final_checklist: ["HEMLIG-KONTROLL"],
      next_steps: ["HEMLIGT-STEG"],
    },
    { requirements: extraction.requirements, daysLeft: 30, hasProfile: true },
  );
  return { id: "a1", status: "klar", createdAt: new Date().toISOString(), documents: [{ name: "a.pdf", pages: 12, unit: "sida" }], extraction, synthesis: { ...synthesis, profileUsed: true } };
}

const offer = { pricing: { label: "995 kr", vatNote: "" }, invoiceEnabled: true, paymentsEnabled: true, previewRequirements: 3 };

test("locked view never leaks paid content", () => {
  const view = buildReportView({ analysis: sampleAnalysis(), access: { token: "tok" }, unlocked: false, ...offer });
  const json = JSON.stringify(view);
  assert.equal(view.requirements.length, 3);
  assert.equal(view.locked.requirements, 9);
  for (const secret of ["HEMLIGT-KRAV-5", "HEMLIGT-KRAV-11", "HEMLIG-RISK", "HEMLIGT-UNDERLAG", "HEMLIG-FRAGA", "HEMLIG-DISPOSITION", "HEMLIG-KONTROLL", "HEMLIGT-STEG", "HEMLIG-OKLARHET", "HEMLIGT-DATUM", "HEMLIG-BEDOMNING"]) {
    assert.ok(!json.includes(secret), `${secret} leaked`);
  }
  assert.deepEqual(view.synthesis.assessments.map((a) => a.id), ["K1"]);
  assert.equal(view.headline.recommendation, "GO");
  assert.equal(view.deadline.date, "2099-01-10");

  const full = buildReportView({ analysis: sampleAnalysis(), access: { token: "tok" }, unlocked: true, ...offer });
  assert.equal(full.requirements.length, 12);
  assert.ok(JSON.stringify(full).includes("HEMLIG-FRAGA"));
});

test("Excel export contains every sheet and neutralises formulas", async () => {
  const view = buildReportView({ analysis: sampleAnalysis(), access: { token: "tok" }, unlocked: true, ...offer });
  view.requirements[0].text = "=HYPERLINK(\"http://evil\")";
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await buildWorkbook(view));
  assert.deepEqual(wb.worksheets.map((w) => w.name), ["Sammanfattning", "Kravmatris", "Datum", "Risker", "Bevis att ta fram", "Frågor till myndigheten", "Anbudsstruktur & checklista"]);
  const matrix = wb.getWorksheet("Kravmatris");
  assert.equal(matrix.rowCount, 13);
  assert.equal(matrix.getRow(2).getCell(5).value, "'=HYPERLINK(\"http://evil\")");
  assert.equal(safeCell("+1"), "'+1");
  assert.equal(safeCell("ok"), "ok");
});

test("calendar export is valid iCalendar with reminders on deadlines", () => {
  const view = buildReportView({ analysis: sampleAnalysis(), access: { token: "tok" }, unlocked: true, ...offer });
  const ics = buildIcs(view);
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /DTSTART;VALUE=DATE:20990110/);
  assert.match(ics, /TRIGGER:-P2D/);
  assert.ok(ics.split("\r\n").every((line) => Buffer.byteLength(line, "utf8") <= 75));
  assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, 2);
});

test("Stripe checkout is created with SEK price and verified per token", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (init.method === "POST") return new Response(JSON.stringify({ id: "cs_test_1", url: "https://checkout.stripe.com/c/1" }), { status: 200 });
    if (url.endsWith("cs_test_paid")) return new Response(JSON.stringify({ id: "cs_test_paid", payment_status: "paid", metadata: { access_token: "tok" }, amount_total: 124375, currency: "sek", customer_details: { email: "a@b.se" } }));
    return new Response(JSON.stringify({ id: "cs_test_open", payment_status: "unpaid", metadata: { access_token: "tok" } }));
  };
  const payments = createPayments({ stripe: { secretKey: "sk_test_x", apiBase: "https://api.stripe.test" }, pricing: { amountSek: 995 }, company: { brand: "Anbudskollen" }, fetchImpl });
  const session = await payments.createCheckout({ token: "tok", title: "Lokalvård", baseUrl: "https://app.se" });
  assert.equal(session.url, "https://checkout.stripe.com/c/1");
  const body = new URLSearchParams(calls[0].init.body);
  assert.equal(body.get("line_items[0][price_data][currency]"), "sek");
  assert.equal(body.get("line_items[0][price_data][unit_amount]"), "99500");
  assert.equal(body.get("metadata[access_token]"), "tok");
  assert.match(body.get("success_url"), /rapport\.html\?t=tok&session_id=\{CHECKOUT_SESSION_ID\}/);
  assert.equal(calls[0].init.headers.Authorization, "Bearer sk_test_x");

  assert.equal((await payments.verifySession("cs_test_paid", "tok")).email, "a@b.se");
  assert.equal(await payments.verifySession("cs_test_paid", "other-token"), null);
  assert.equal(await payments.verifySession("cs_test_open", "tok"), null);
  assert.equal(await payments.verifySession("not-a-session", "tok"), null);
});

function fakeClient(responses) {
  const calls = [];
  const stream = (params) => {
    calls.push(params);
    const next = responses.shift();
    return { finalMessage: async () => (typeof next === "function" ? next(params) : next) };
  };
  return { calls, client: { messages: { stream }, beta: { messages: { stream } } } };
}

const message = (text, stop_reason = "end_turn") => ({ content: [{ type: "thinking", thinking: "" }, { type: "text", text }], stop_reason, usage: { input_tokens: 1000, output_tokens: 200 }, model: "claude-opus-5-5" });

test("Anthropic provider sends structured-output requests with fallbacks", async () => {
  const llm = { model: "claude-opus-5-5", maxOutputTokens: 48000, extractEffort: "medium", synthesisEffort: "high", fallbacks: "default" };
  const { calls, client } = fakeClient([message('{"requirements":[],"dates":[],"facts":[],"risks":[],"ambiguities":[],"changes":[]}')]);
  const provider = createAnthropicProvider(llm, client);
  const result = await provider.extract({ text: "[DOKUMENT: a]\n[SIDA 1]\nText" }, 0, 1);
  assert.deepEqual(result.data.requirements, []);
  const params = calls[0];
  assert.equal(params.model, "claude-opus-5-5");
  assert.equal(params.output_config.effort, "medium");
  assert.equal(params.output_config.format.type, "json_schema");
  assert.equal(params.output_config.format.schema.additionalProperties, false);
  assert.deepEqual(params.betas, ["server-side-fallback-2026-07-01"]);
  assert.equal(params.fallbacks, "default");
  assert.equal(params.thinking, undefined);
  assert.match(params.messages[0].content, /Utdrag 1 av 1/);

  const off = fakeClient([message('{"a":1}')]);
  await createAnthropicProvider({ ...llm, fallbacks: "off" }, off.client).synthesize({ digest: {}, profile: null, today: "2026-10-07", daysLeft: 3 });
  assert.equal(off.calls[0].fallbacks, undefined);
  assert.equal(off.calls[0].output_config.effort, "high");
  assert.match(off.calls[0].messages[0].content, /INGEN FÖRETAGSPROFIL/);
});

test("Anthropic provider maps refusals, truncation and bad JSON to errors", async () => {
  const llm = { model: "claude-opus-5-5", maxOutputTokens: 100, extractEffort: "low", synthesisEffort: "low", fallbacks: "off" };
  const { client } = fakeClient([message("", "refusal"), message("{", "max_tokens"), message("inte json")]);
  const provider = createAnthropicProvider(llm, client);
  await assert.rejects(provider.extract({ text: "x" }, 0, 1), (e) => e instanceof LlmError && e.code === "refusal");
  await assert.rejects(provider.extract({ text: "x" }, 0, 1), (e) => e instanceof LlmError && e.code === "max_tokens");
  await assert.rejects(provider.extract({ text: "x" }, 0, 1), (e) => e instanceof LlmError && e.code === "invalid_json");
  assert.deepEqual(parseJsonLoose('Här är svaret: {"ok":true}'), { ok: true });
  assert.equal(estimateCostUsd("claude-opus-5-5", { input_tokens: 1_000_000, output_tokens: 100_000 }), 6);
});

test("demo engine finds requirements, deadlines and risks in the fixture", () => {
  const out = demoExtract(`[DOKUMENT: a.pdf]\n[SIDA 1]\n${tenderText}`);
  const ska = out.requirements.filter((r) => r.type === "SKA");
  assert.ok(ska.length >= 20, `found ${ska.length}`);
  const deadline = out.dates.find((d) => d.kind === "SISTA_ANBUDSDAG");
  assert.equal(deadline.date, "2026-11-12");
  assert.equal(deadline.time, "23:59");
  assert.ok(out.risks.some((r) => r.title === "Vite"));
  assert.ok(out.facts.some((f) => f.key === "DIARIENUMMER" && f.value === "KS 2026/1187"));
});

test("example report stays current and demonstrates the ska-krav guard", () => {
  const view = buildExampleView("2026-10-07");
  assert.equal(view.unlocked, true);
  assert.equal(view.deadline.date, "2026-11-12");
  assert.equal(view.requirements.length, 32);
  assert.equal(view.headline.recommendation, "GO_MED_FORBEHALL");
  assert.equal(view.headline.guards.length, 1);
  const later = buildExampleView("2027-06-01");
  assert.equal(later.deadline.date, "2027-07-07");
  assert.ok(later.synthesis.assessments.every((a) => /^K\d+$/.test(a.id)));
});

test("titles fall back to the document name when facts are unusable", () => {
  assert.equal(deriveTitle({ facts: [{ key: "UPPHANDLINGENS_NAMN", value: "Lokalvård" }, { key: "UPPHANDLANDE_ORGANISATION", value: "Kommunen" }] }), "Lokalvård – Kommunen");
  assert.equal(deriveTitle({ facts: [{ key: "UPPHANDLANDE_ORGANISATION", value: "x".repeat(300) }] }, "Underlag.pdf"), "Underlag");
});

test("requirements that differ only in numbers are kept apart", () => {
  const merged = mergeExtractions([{ requirements: [req({ text: "Minst 2 referensuppdrag inom lokalvård" }), req({ text: "Minst 3 referensuppdrag inom lokalvård" }), req({ text: "Minst 3 referensuppdrag inom lokalvård." })] }]);
  assert.equal(merged.requirements.length, 2);
});
