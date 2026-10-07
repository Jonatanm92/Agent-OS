// Packs page-addressed text into model-sized chunks. Every chunk restates the
// document header so the model can always cite "document + page" correctly.

const UNIT_MARK = { sida: "SIDA", avsnitt: "AVSNITT", flik: "DEL" };

export function pageMarker(unit, n) {
  return `[${UNIT_MARK[unit] ?? "AVSNITT"} ${n}]`;
}

/**
 * @param {Array<{name: string, pages: Array<{unit: string, n: number, text: string}>}>} documents
 * @param {number} maxChars
 * @returns {Array<{text: string, chars: number, pages: number, documents: string[]}>}
 */
export function buildChunks(documents, maxChars) {
  const chunks = [];
  let current = null;

  const start = () => ({ parts: [], chars: 0, pages: 0, documents: [], lastDoc: null });
  const flush = () => {
    if (current && current.pages > 0) {
      const text = current.parts.join("");
      chunks.push({ text, chars: text.length, pages: current.pages, documents: current.documents });
    }
    current = start();
  };

  current = start();
  for (const doc of documents) {
    for (const page of doc.pages) {
      if (!page.text || !page.text.trim()) continue;
      const piece = `${pageMarker(page.unit, page.n)}\n${page.text}\n\n`;
      const header = `[DOKUMENT: ${doc.name}]\n`;
      const needsHeader = current.lastDoc !== doc.name;
      const addition = (needsHeader ? header.length : 0) + piece.length;
      if (current.pages > 0 && current.chars + addition > maxChars) {
        flush();
      }
      if (current.lastDoc !== doc.name) {
        current.parts.push(`${current.pages > 0 ? "\n" : ""}${header}`);
        current.chars += header.length;
        current.lastDoc = doc.name;
        if (!current.documents.includes(doc.name)) current.documents.push(doc.name);
      }
      current.parts.push(piece);
      current.chars += piece.length;
      current.pages += 1;
    }
  }
  flush();
  return chunks;
}

// Splits one chunk in two at a page boundary (used when a model response for a
// very dense chunk would exceed the output limit).
export function splitChunk(chunk) {
  const markers = [...chunk.text.matchAll(/^\[(?:SIDA|AVSNITT|DEL) \d+\]$/gm)];
  if (markers.length < 2) return null;
  const middle = markers[Math.floor(markers.length / 2)].index;
  const firstText = chunk.text.slice(0, middle);
  let secondText = chunk.text.slice(middle);
  // Carry the active document header into the second half.
  const headers = [...firstText.matchAll(/^\[DOKUMENT: .*\]$/gm)];
  const lastHeader = headers.length ? headers[headers.length - 1][0] : null;
  if (lastHeader && !secondText.startsWith("[DOKUMENT:")) secondText = `${lastHeader}\n${secondText}`;
  const half = (text) => ({
    text,
    chars: text.length,
    pages: (text.match(/^\[(?:SIDA|AVSNITT|DEL) \d+\]$/gm) ?? []).length,
    documents: chunk.documents,
  });
  return [half(firstText), half(secondText)];
}
