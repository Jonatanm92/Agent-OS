// Turns uploaded tender documents into page-addressable plain text so every
// extracted requirement can be traced back to "document + page".
import { extractText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";
import ExcelJS from "exceljs";

export const SUPPORTED_EXTENSIONS = [".pdf", ".docx", ".xlsx", ".txt", ".md", ".csv"];

// Word documents and plain text have no stable page numbers, so they are split
// into numbered sections of roughly one printed page each.
const SECTION_CHARS = 3500;

export function cleanText(text) {
  return String(text ?? "")
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function sanitizeFilename(name) {
  const base = String(name ?? "dokument")
    .normalize("NFC")
    .replace(/[\\/]/g, "_")
    .replace(/[\u0000-\u001f<>"'`]/g, "")
    .trim();
  return (base || "dokument").slice(0, 140);
}

function extensionOf(name) {
  const match = /\.[a-z0-9]+$/i.exec(name ?? "");
  return match ? match[0].toLowerCase() : "";
}

export function detectKind(name, buffer) {
  const ext = extensionOf(name);
  const head = buffer.subarray(0, 5).toString("latin1");
  if (head.startsWith("%PDF")) return "pdf";
  const isZip = buffer[0] === 0x50 && buffer[1] === 0x4b;
  if (isZip && ext === ".docx") return "docx";
  if (isZip && ext === ".xlsx") return "xlsx";
  if ([".txt", ".md", ".csv"].includes(ext)) return "text";
  return null;
}

export function splitIntoSections(text, size = SECTION_CHARS) {
  const clean = cleanText(text);
  if (!clean) return [];
  const paragraphs = clean.split(/\n\n+/);
  const sections = [];
  let current = "";
  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length + 2 > size) {
      sections.push(current);
      current = "";
    }
    if (paragraph.length > size) {
      // A single huge paragraph: hard-split on sentence boundaries.
      const sentences = paragraph.split(/(?<=[.!?:;])\s+/);
      for (const sentence of sentences) {
        if (current && current.length + sentence.length + 1 > size) {
          sections.push(current);
          current = "";
        }
        current = current ? `${current} ${sentence}` : sentence;
      }
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
  }
  if (current) sections.push(current);
  return sections;
}

async function extractPdf(buffer) {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: false });
  return text.map((pageText, index) => ({
    unit: "sida",
    n: index + 1,
    text: cleanText(pageText),
  }));
}

async function extractDocx(buffer) {
  const { value } = await mammoth.extractRawText({ buffer });
  return splitIntoSections(value).map((text, index) => ({ unit: "avsnitt", n: index + 1, text }));
}

function cellText(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text).join("");
    if ("text" in value) return String(value.text);
    if ("result" in value) return cellText(value.result);
    if ("formula" in value) return "";
  }
  return String(value);
}

async function extractXlsx(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const pages = [];
  workbook.eachSheet((sheet) => {
    const lines = [`Flik: ${sheet.name}`];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const values = (Array.isArray(row.values) ? row.values.slice(1) : [])
        .map(cellText)
        .map((v) => v.trim());
      if (values.some(Boolean)) lines.push(values.join(" | "));
    });
    splitIntoSections(lines.join("\n")).forEach((text) => {
      pages.push({ unit: "flik", n: pages.length + 1, text });
    });
  });
  return pages;
}

/**
 * @param {{originalname: string, buffer: Buffer}} file
 * @returns {Promise<{name: string, kind: string, pages: Array<{unit: string, n: number, text: string}>, chars: number, emptyPages: number, warning?: string}>}
 */
export async function extractDocument(file) {
  const name = sanitizeFilename(file.originalname);
  const kind = detectKind(name, file.buffer);
  if (!kind) {
    const error = new Error(
      `Filtypen för "${name}" stöds inte. Ladda upp PDF, Word (.docx), Excel (.xlsx) eller text.`,
    );
    error.status = 415;
    throw error;
  }
  let pages;
  try {
    if (kind === "pdf") pages = await extractPdf(file.buffer);
    else if (kind === "docx") pages = await extractDocx(file.buffer);
    else if (kind === "xlsx") pages = await extractXlsx(file.buffer);
    else pages = splitIntoSections(file.buffer.toString("utf8")).map((text, i) => ({ unit: "avsnitt", n: i + 1, text }));
  } catch (cause) {
    const error = new Error(`Kunde inte läsa "${name}". Är filen skadad eller lösenordsskyddad?`);
    error.status = 422;
    error.cause = cause;
    throw error;
  }
  const chars = pages.reduce((sum, page) => sum + page.text.length, 0);
  const emptyPages = pages.filter((page) => page.text.length < 20).length;
  const result = { name, kind, pages, chars, emptyPages };
  if (kind === "pdf" && pages.length > 0 && emptyPages / pages.length > 0.5) {
    result.warning = `"${name}" verkar vara inskannad (ingen läsbar text på ${emptyPages} av ${pages.length} sidor). Inskannade sidor kan inte analyseras – be myndigheten om en textbaserad PDF.`;
  }
  return result;
}

export function sourceLabel(unit, n) {
  if (unit === "sida") return `s. ${n}`;
  if (unit === "flik") return `del ${n}`;
  return `avsnitt ${n}`;
}
