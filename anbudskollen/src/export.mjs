// Downloadable deliverables: Excel requirement matrix and calendar file.
import ExcelJS from "exceljs";
import { sourceLabel } from "./extract.mjs";

export const TYPE_LABELS = { SKA: "Ska-krav", BOR: "Bör-krav", UTVARDERING: "Utvärdering", INFO: "Info" };
export const CATEGORY_LABELS = {
  KVALIFICERING: "Kvalificering",
  UTESLUTNING: "Uteslutning",
  TJANST: "Tjänst/vara",
  AVTAL: "Avtalsvillkor",
  UTVARDERING: "Utvärdering",
  ANBUDETS_FORM: "Anbudets form",
  OVRIGT: "Övrigt",
};
export const STATUS_LABELS = { UPPFYLLT: "Uppfyllt", TROLIGEN: "Troligen", OKLART: "Oklart", SAKNAS: "Saknas" };
export const SEVERITY_LABELS = { HOG: "Hög", MEDEL: "Medel", LAG: "Låg" };
export const RECOMMENDATION_LABELS = {
  GO: "GO – lämna anbud",
  GO_MED_FORBEHALL: "GO med förbehåll",
  AVSTA: "AVSTÅ",
  MER_INFO: "Behöver mer information",
};

// Prevent spreadsheet formula injection from document text.
export function safeCell(value) {
  const s = String(value ?? "");
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

function unitFor(view, documentName) {
  return view.documents?.find((d) => d.name === documentName)?.unit ?? "sida";
}

function source(view, documentName, page) {
  if (!documentName) return "";
  return page ? `${documentName}, ${sourceLabel(unitFor(view, documentName), page)}` : documentName;
}

function styleHeader(sheet) {
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3A5F" } };
  header.alignment = { vertical: "middle", wrapText: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } };
}

function wrapAll(sheet) {
  sheet.eachRow((row, i) => {
    if (i > 1) row.alignment = { vertical: "top", wrapText: true };
  });
}

export async function buildWorkbook(view, brand = "Anbudskollen") {
  const wb = new ExcelJS.Workbook();
  wb.creator = brand;
  wb.created = new Date();
  const synthesis = view.synthesis ?? {};
  const assessments = new Map((synthesis.assessments ?? []).map((a) => [a.id, a]));

  const summary = wb.addWorksheet("Sammanfattning");
  summary.columns = [{ header: "Fält", key: "k", width: 28 }, { header: "Värde", key: "v", width: 100 }];
  summary.addRow({ k: "Rekommendation", v: RECOMMENDATION_LABELS[view.headline?.recommendation] ?? "" });
  summary.addRow({ k: "Poäng (0–100)", v: view.headline?.score ?? "" });
  summary.addRow({ k: "Sammanfattning", v: safeCell(view.headline?.summary) });
  for (const f of view.headline?.key_facts ?? []) summary.addRow({ k: safeCell(f.label), v: safeCell(f.value) });
  for (const g of view.headline?.guards ?? []) summary.addRow({ k: "Observera", v: safeCell(g) });
  for (const r of synthesis.score_reasons ?? []) summary.addRow({ k: `${r.effect === "PLUS" ? "+" : r.effect === "MINUS" ? "−" : "•"} ${safeCell(r.factor)}`, v: safeCell(r.explanation) });
  summary.addRow({ k: "Genererad", v: new Date().toISOString().slice(0, 16).replace("T", " ") });
  summary.addRow({ k: "Ansvar", v: "Beslutsstöd, inte juridisk rådgivning. Kontrollera alltid mot källdokumenten." });
  styleHeader(summary);
  wrapAll(summary);

  const matrix = wb.addWorksheet("Kravmatris");
  matrix.columns = [
    { header: "ID", key: "id", width: 7 },
    { header: "Ref", key: "ref", width: 9 },
    { header: "Typ", key: "type", width: 12 },
    { header: "Kategori", key: "category", width: 15 },
    { header: "Krav", key: "text", width: 60 },
    { header: "Bevis att lämna", key: "evidence", width: 38 },
    { header: "Källa", key: "source", width: 30 },
    { header: "Citat", key: "quote", width: 50 },
    { header: "Bedömning", key: "status", width: 12 },
    { header: "Kommentar", key: "comment", width: 40 },
    { header: "Ansvarig", key: "owner", width: 14 },
    { header: "Klar", key: "done", width: 8 },
  ];
  for (const r of view.requirements ?? []) {
    const a = assessments.get(r.id);
    matrix.addRow({
      id: r.id,
      ref: safeCell(r.ref),
      type: TYPE_LABELS[r.type] ?? r.type,
      category: CATEGORY_LABELS[r.category] ?? r.category,
      text: safeCell(r.text),
      evidence: safeCell(r.evidence),
      source: safeCell(source(view, r.document, r.page)),
      quote: safeCell(r.quote),
      status: a ? STATUS_LABELS[a.status] : "",
      comment: safeCell(a?.comment ?? ""),
      owner: "",
      done: "",
    });
  }
  styleHeader(matrix);
  wrapAll(matrix);

  const dates = wb.addWorksheet("Datum");
  dates.columns = [
    { header: "Händelse", key: "label", width: 40 },
    { header: "Datum", key: "date", width: 14 },
    { header: "Tid", key: "time", width: 8 },
    { header: "Källa", key: "source", width: 30 },
    { header: "Citat", key: "quote", width: 60 },
  ];
  for (const d of view.dates ?? []) dates.addRow({ label: safeCell(d.label), date: d.date, time: d.time, source: safeCell(source(view, d.document, d.page)), quote: safeCell(d.quote) });
  styleHeader(dates);
  wrapAll(dates);

  const risks = wb.addWorksheet("Risker");
  risks.columns = [
    { header: "Risk", key: "title", width: 30 },
    { header: "Nivå", key: "severity", width: 9 },
    { header: "Beskrivning", key: "description", width: 60 },
    { header: "Källa", key: "source", width: 30 },
    { header: "Citat", key: "quote", width: 50 },
  ];
  for (const r of view.risks ?? []) risks.addRow({ title: safeCell(r.title), severity: SEVERITY_LABELS[r.severity], description: safeCell(r.description), source: safeCell(source(view, r.document, r.page)), quote: safeCell(r.quote) });
  styleHeader(risks);
  wrapAll(risks);

  const evidence = wb.addWorksheet("Bevis att ta fram");
  evidence.columns = [
    { header: "Underlag", key: "item", width: 45 },
    { header: "Varför", key: "why", width: 60 },
    { header: "Krav", key: "ids", width: 14 },
    { header: "Ansvarig", key: "owner", width: 14 },
    { header: "Klar", key: "done", width: 8 },
  ];
  for (const m of synthesis.missing_evidence ?? []) evidence.addRow({ item: safeCell(m.item), why: safeCell(m.why), ids: m.requirement_ids.join(", "), owner: "", done: "" });
  styleHeader(evidence);
  wrapAll(evidence);

  const questions = wb.addWorksheet("Frågor till myndigheten");
  questions.columns = [
    { header: "Fråga", key: "q", width: 70 },
    { header: "Bakgrund", key: "r", width: 60 },
    { header: "Krav", key: "ids", width: 14 },
  ];
  for (const q of synthesis.questions ?? []) questions.addRow({ q: safeCell(q.question), r: safeCell(q.reason), ids: q.requirement_ids.join(", ") });
  styleHeader(questions);
  wrapAll(questions);

  const plan = wb.addWorksheet("Anbudsstruktur & checklista");
  plan.columns = [{ header: "Punkt", key: "a", width: 45 }, { header: "Innehåll", key: "b", width: 80 }];
  for (const b of synthesis.bid_outline ?? []) plan.addRow({ a: safeCell(b.section), b: safeCell(b.contents) });
  plan.addRow({});
  plan.addRow({ a: "SLUTKONTROLL FÖRE INLÄMNING", b: "" }).font = { bold: true };
  for (const c of synthesis.final_checklist ?? []) plan.addRow({ a: "☐", b: safeCell(c) });
  plan.addRow({});
  plan.addRow({ a: "NÄSTA STEG", b: "" }).font = { bold: true };
  for (const s of synthesis.next_steps ?? []) plan.addRow({ a: "→", b: safeCell(s) });
  styleHeader(plan);
  wrapAll(plan);

  return wb.xlsx.writeBuffer();
}

function icsEscape(text) {
  return String(text ?? "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");
}

function foldLine(line) {
  // RFC 5545: lines longer than 75 octets are folded.
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts = [];
  let current = "";
  for (const ch of line) {
    if (Buffer.byteLength(current + ch, "utf8") > (parts.length ? 74 : 75)) {
      parts.push(current);
      current = ch;
    } else current += ch;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

export function buildIcs(view, brand = "Anbudskollen", host = "anbudskollen.se") {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const title = view.headline?.title || "Upphandling";
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:-//${brand}//Upphandlingsdatum//SV`, "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  (view.dates ?? [])
    .filter((d) => d.date)
    .forEach((d, i) => {
      const day = d.date.replace(/-/g, "");
      lines.push("BEGIN:VEVENT");
      lines.push(`UID:${view.token}-${i}@${host}`);
      lines.push(`DTSTAMP:${stamp}`);
      if (d.time) {
        const t = d.time.replace(":", "");
        lines.push(`DTSTART;TZID=Europe/Stockholm:${day}T${t}00`);
        lines.push(`DTEND;TZID=Europe/Stockholm:${day}T${t}00`);
      } else {
        const next = new Date(`${d.date}T00:00:00Z`);
        next.setUTCDate(next.getUTCDate() + 1);
        lines.push(`DTSTART;VALUE=DATE:${day}`);
        lines.push(`DTEND;VALUE=DATE:${next.toISOString().slice(0, 10).replace(/-/g, "")}`);
      }
      lines.push(`SUMMARY:${icsEscape(`${d.label || "Datum"} – ${title}`)}`);
      lines.push(`DESCRIPTION:${icsEscape(`${d.quote || ""}\nKälla: ${d.document || ""}${d.page ? ` (${d.page})` : ""}`)}`);
      if (["SISTA_ANBUDSDAG", "SISTA_FRAGEDAG"].includes(d.kind)) {
        lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsEscape(d.label)}`, "TRIGGER:-P2D", "END:VALARM");
      }
      lines.push("END:VEVENT");
    });
  lines.push("END:VCALENDAR");
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}
