// A tiny PDF writer: A4 pages, the standard Times/Helvetica fonts, text, lines and rectangles.
// Just enough for the roster sheet, with no external library or network access needed.
// Coordinates are in millimetres from the top-left corner, like jsPDF.
import { WIDTHS } from "./fontmetrics.js";

const PT = 72 / 25.4; // points per mm
const PAGE_W = 210, PAGE_H = 297;

const FONTS = {
  "times/normal": { res: "F1", base: "Times-Roman", widths: WIDTHS.times },
  "times/bold": { res: "F2", base: "Times-Bold", widths: WIDTHS.timesBold },
  "times/italic": { res: "F3", base: "Times-Italic", widths: WIDTHS.timesItalic },
  "helvetica/normal": { res: "F4", base: "Helvetica", widths: WIDTHS.helvetica },
};

// Unicode -> WinAnsi (cp1252) for the 0x80-0x9F block; everything else up to 0xFF maps 1:1.
const CP1252 = { "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86, "‡": 0x87, "ˆ": 0x88, "‰": 0x89, "Š": 0x8a, "‹": 0x8b, "Œ": 0x8c, "Ž": 0x8e, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "˜": 0x98, "™": 0x99, "š": 0x9a, "›": 0x9b, "œ": 0x9c, "ž": 0x9e, "Ÿ": 0x9f };

function toCodes(str) {
  const out = [];
  for (const ch of String(str)) {
    const c = ch.codePointAt(0);
    if (CP1252[ch]) out.push(CP1252[ch]);
    else if (c >= 32 && c <= 255 && !(c >= 0x80 && c <= 0x9f)) out.push(c);
    else if (ch === "×") out.push(0xd7);
    else out.push(63); // '?'
  }
  return out;
}

const num = (n) => (Math.round(n * 100) / 100).toString();

export class MiniPdf {
  constructor() {
    this.pages = [];
    this.font = FONTS["times/normal"];
    this.size = 12;
    this.lineWidth = 0.2;
    this.addPage();
  }
  addPage() { this.pages.push([]); this.cur = this.pages[this.pages.length - 1]; return this; }
  setFont(family, style = "normal") { this.font = FONTS[`${family}/${style}`] || FONTS["times/normal"]; return this; }
  setFontSize(pt) { this.size = pt; return this; }
  setLineWidth(mm) { this.lineWidth = mm; return this; }
  setDrawColor(g = 0) { this.cur.push(`${num(g / 255)} G`); return this; }
  setTextColor(g = 0) { this.cur.push(`${num(g / 255)} g`); return this; }

  // width of a string in mm at the current font and size
  getTextWidth(str) {
    let w = 0;
    for (const c of toCodes(str)) w += this.font.widths[c - 32] || 500;
    return (w / 1000) * this.size / PT;
  }

  splitTextToSize(str, maxW) {
    const lines = [];
    for (const para of String(str).split(/\n/)) {
      let line = "";
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const test = line ? `${line} ${word}` : word;
        if (this.getTextWidth(test) <= maxW || !line) line = test;
        else { lines.push(line); line = word; }
      }
      lines.push(line);
    }
    return lines;
  }

  text(str, x, y, opts = {}) {
    let tx = x;
    if (opts.align === "center") tx = x - this.getTextWidth(str) / 2;
    else if (opts.align === "right") tx = x - this.getTextWidth(str);
    const esc = toCodes(str).map((c) => {
      const ch = String.fromCharCode(c);
      return ch === "(" || ch === ")" || ch === "\\" ? "\\" + ch : ch;
    }).join("");
    this.cur.push(`BT /${this.font.res} ${num(this.size)} Tf ${num(tx * PT)} ${num((PAGE_H - y) * PT)} Td (${esc}) Tj ET`);
    return this;
  }
  line(x1, y1, x2, y2) {
    this.cur.push(`${num(this.lineWidth * PT)} w ${num(x1 * PT)} ${num((PAGE_H - y1) * PT)} m ${num(x2 * PT)} ${num((PAGE_H - y2) * PT)} l S`);
    return this;
  }
  rect(x, y, w, h) {
    this.cur.push(`${num(this.lineWidth * PT)} w ${num(x * PT)} ${num((PAGE_H - y - h) * PT)} ${num(w * PT)} ${num(h * PT)} re S`);
    return this;
  }

  // Returns the PDF file as a Uint8Array
  output(title = "Roster") {
    const objs = [];
    const add = (s) => { objs.push(s); return objs.length; };
    const catalogId = add(null), pagesId = add(null);
    const fontIds = {};
    for (const f of Object.values(FONTS)) {
      fontIds[f.res] = add(`<< /Type /Font /Subtype /Type1 /BaseFont /${f.base} /Encoding /WinAnsiEncoding >>`);
    }
    const fontRes = Object.entries(fontIds).map(([r, id]) => `/${r} ${id} 0 R`).join(" ");
    const pageIds = [];
    for (const p of this.pages) {
      const content = p.join("\n");
      const cId = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
      pageIds.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${num(PAGE_W * PT)} ${num(PAGE_H * PT)}] /Resources << /Font << ${fontRes} >> >> /Contents ${cId} 0 R >>`));
    }
    objs[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
    objs[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((i) => `${i} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
    const infoTitle = toCodes(title).map((c) => String.fromCharCode(c)).join("").replace(/[()\\]/g, "\\$&");
    const infoId = add(`<< /Title (${infoTitle}) /Producer (WHFB5e List Builder) >>`);

    let out = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";
    const offsets = [];
    objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
    for (const off of offsets) out += `${String(off).padStart(10, "0")} 00000 n \n`;
    out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
    return bytes;
  }
}
