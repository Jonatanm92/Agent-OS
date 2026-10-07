// Tiny PDF writer for tests: renders plain text into real, text-based PDF
// pages (Helvetica, WinAnsiEncoding) so the PDF extraction path is exercised
// end to end without binary fixtures.

const WINANSI = { "–": 0x96, "—": 0x97, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "€": 0x80 };

function encode(text) {
  const bytes = [];
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (WINANSI[ch]) bytes.push(WINANSI[ch]);
    else if (code < 256) bytes.push(code);
    else bytes.push(0x3f);
  }
  return Buffer.from(bytes)
    .toString("latin1")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function wrap(line, width = 95) {
  const out = [];
  let current = "";
  for (const word of line.split(" ")) {
    if (current && current.length + word.length + 1 > width) {
      out.push(current);
      current = word;
    } else current = current ? `${current} ${word}` : word;
  }
  out.push(current);
  return out;
}

export function makePdf(text, linesPerPage = 48) {
  const lines = text.split("\n").flatMap((line) => (line ? wrap(line) : [""]));
  const pages = [];
  for (let i = 0; i < lines.length; i += linesPerPage) pages.push(lines.slice(i, i + linesPerPage));

  const objects = [];
  const add = (body) => {
    objects.push(body);
    return objects.length;
  };
  const catalogId = add(null);
  const pagesId = add(null);
  const fontId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const pageIds = [];
  for (const pageLines of pages) {
    const ops = ["BT", "/F1 10 Tf", "14 TL", "50 800 Td"];
    for (const line of pageLines) ops.push(`(${encode(line)}) Tj T*`);
    ops.push("ET");
    const stream = ops.join("\n");
    const contentId = add(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
    pageIds.push(
      add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`),
    );
  }
  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  let out = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) out += `${String(offset).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}
