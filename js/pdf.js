// Roster rows (shared by the PDF, the text export and the on-screen profile table)
// and the A4 roster sheet PDF, laid out after the classic Warhammer roster sheet.
import { MiniPdf } from "./minipdf.js";
import { extraName } from "./magic.js";
import { findEntry, variantOf, selectionCost, computeSave, describeMount, unitSize, listTotals, fmt, canHaveBoss, defaultNotes, parentOf } from "./calc.js";

export function rosterRows(army, list) {
  const order = (s) => army.categories.findIndex((c) => c.id === findEntry(army, s.entryId)?.category);
  const sorted = list.selections.map((s, i) => [s, i]).sort((a, b) => order(a[0]) - order(b[0]) || a[1] - b[1]).map((x) => x[0]);
  return sorted.map((s) => {
    const e = findEntry(army, s.entryId);
    if (!e) return null;
    const v = variantOf(e, s);
    const lines = [];
    const profiles = [];
    let title;

    if (e.kind === "character") {
      const base = v?.name || e.name;
      title = s.name || base;
      if (s.name) lines.push(base);
      if (e.roles) {
        const r = e.roles.find((x) => x.id === s.role) || e.roles[0];
        lines.push(r.name.replace(/^as /, ""));
      }
      profiles.push({ name: base, profile: v?.profile || e.profile });
      for (const p of e.extraProfiles || []) profiles.push(p);
      for (const gid of s.gear || []) lines.push(army.equipment.find((g) => g.id === gid)?.name);
      for (const o of e.options || []) {
        if (!s.options?.[o.id]) continue;
        lines.push(o.name);
        if (o.extraProfile) profiles.push(o.extraProfile);
        if (o.mountProfile) profiles.push(o.mountProfile);
        for (const p of o.extraProfiles || []) profiles.push(p);
      }
      const m = describeMount(army, s.mount);
      if (m) {
        lines.push(m.kind === "chariot" ? `in ${m.name}` : `on ${m.name}`);
        if (m.profile) profiles.push({ name: m.name, profile: m.profile });
        if (m.profiles) for (const p of m.profiles.slice(1)) profiles.push(p);
      }
    } else if (e.kind === "monster") {
      title = s.name || v?.name || e.name;
      if (s.name || (s.size || 1) > 1) lines.push(`${s.size || 1} ${v?.name || e.name}`);
      profiles.push({ name: v?.name || e.name, profile: v?.profile || e.profile });
    } else {
      const size = unitSize(e, s);
      title = s.name || e.name;
      if (e.models) {
        for (const m of e.models) if (s.models?.[m.id]) lines.push(`${s.models[m.id]} ${m.name}`);
      } else {
        const single = size === 1 ? (v?.single || e.single) : null;
        lines.push(`${size} ${single || v?.name || e.name}`);
      }
      const parent = parentOf(list, s);
      if (parent) lines.push(`Detachment of ${parent.name || findEntry(army, parent.entryId).name}`);
      for (const p of e.profiles || []) profiles.push(p);
      if (s.standard) lines.push("Standard");
      if (s.musician) lines.push("Musician");
      if (s.boss?.enabled && canHaveBoss(army, e)) {
        lines.push((army.championName || "Boss") + (e.bossOptions || []).filter((o) => s.boss.options?.[o.id]).map((o) => ` (${o.name.toLowerCase()})`).join(""));
        const bp = army.bossProfiles?.[e.race];
        if (bp) profiles.push({ name: army.championName || "Boss", profile: bp });
      }
      for (const o of e.options || []) {
        const val = s.options?.[o.id];
        if (!val) continue;
        lines.push(o.count ? `${val} ${o.name}` : o.name);
        if (o.extraProfile) profiles.push(o.extraProfile);
      }
    }
    for (const x of s.extras || []) {
      const n = extraName(army, x);
      if (n) lines.push((x.onBoss ? `${army.championName || "Boss"}: ` : "") + n);
    }

    return {
      uid: s.uid,
      title,
      lines: lines.filter(Boolean),
      profiles,
      save: s.save || computeSave(army, s),
      notes: s.notes ?? defaultNotes(army, s),
      points: fmt(selectionCost(army, s).total),
    };
  }).filter(Boolean);
}

// ---------- PDF ----------
const MM = { left: 10, right: 200, top: 19, bottom: 272, headH: 9 };
const COLS = (() => {
  const x0 = MM.left, name = 45, stat = 6.4, save = 10, pts = 24;
  const statsX = x0 + name;
  const saveX = statsX + stat * 9;
  const notesX = saveX + save;
  const ptsX = MM.right - pts;
  return { x0, statsX, stat, saveX, notesX, ptsX, nameW: name, notesW: ptsX - notesX, ptsW: pts };
})();
const STAT_HEADS = ["M", "WS", "BS", "S", "T", "W", "I", "A", "Ld"];
const LINE = 5; // mm per text line
const FONT = 11;

export function buildPdf(army, list) {
  const doc = new MiniPdf();
  const rows = rosterRows(army, list);
  const { total } = listTotals(army, list);

  let y = startPage(doc, list.name);
  rows.forEach((r) => {
    doc.setFont("times", "normal"); doc.setFontSize(FONT);
    const nameLines = r.lines.flatMap((l) => doc.splitTextToSize(l, COLS.nameW - 3));
    doc.setFont("times", "bold");
    const titleLines = doc.splitTextToSize(r.title, COLS.nameW - 3);
    doc.setFont("times", "normal");
    const notesLines = r.notes ? doc.splitTextToSize(r.notes, COLS.notesW - 3) : [];
    // stat block starts on the line after the title (as on the original sheet)
    const statStart = nameLines.length ? titleLines.length : titleLines.length - 1;
    const height = Math.max(titleLines.length + nameLines.length, statStart + Math.max(r.profiles.length, notesLines.length, 1)) * LINE + 3;

    if (y + height > MM.bottom - 1) {
      finishPage(doc, null);
      doc.addPage();
      y = startPage(doc, list.name);
    }
    let ty = y + LINE;
    doc.setFont("times", "bold");
    titleLines.forEach((t) => { doc.text(t, COLS.x0 + 1.5, ty); ty += LINE; });
    doc.setFont("times", "normal");
    nameLines.forEach((t) => { doc.text(t, COLS.x0 + 1.5, ty); ty += LINE; });

    const sy = y + LINE * (statStart + 1);
    r.profiles.forEach((p, i) => {
      p.profile.forEach((v, c) => {
        doc.text(String(v), COLS.statsX + COLS.stat * c + COLS.stat / 2, sy + i * LINE, { align: "center" });
      });
    });
    doc.setFontSize(FONT - 1);
    // long saves such as "4+/5+" break after the slash, like the hand-written original
    const saveLines = String(r.save || "-").replace(/\//g, "/ ").split(" ").filter(Boolean);
    saveLines.forEach((t, i) => doc.text(t, COLS.saveX + 5, sy + i * LINE, { align: "center" }));
    doc.setFontSize(FONT);
    notesLines.forEach((t, i) => doc.text(t, COLS.notesX + 1.5, sy + i * LINE));
    doc.text(`${r.points}pts`, COLS.ptsX + 2, sy);
    y += height;
  });
  finishPage(doc, total);
  return doc.output(list.name || "Roster");
}

export function exportPdf(army, list) {
  const bytes = buildPdf(army, list);
  const file = (list.name || "roster").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "roster";
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  a.download = `${file}.pdf`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

function startPage(doc, name) {
  doc.setDrawColor(0); doc.setTextColor(0);
  doc.setFont("times", "bold"); doc.setFontSize(21);
  // shrink the heading if needed so it clears the name box
  const maxW = 108 - MM.left - 3;
  doc.setFontSize(Math.min(21, 21 * maxW / doc.getTextWidth("WARHAMMER ROSTER SHEET")));
  doc.text("WARHAMMER ROSTER SHEET", MM.left, 14);
  // list name box
  doc.setLineWidth(0.3);
  doc.rect(108, 6.5, MM.right - 108, 9);
  doc.setFont("times", "normal"); doc.setFontSize(13);
  const n = doc.splitTextToSize(name || "", MM.right - 108 - 4)[0] || "";
  doc.text(n, (108 + MM.right) / 2, 12.8, { align: "center" });

  // frame + header row
  doc.setLineWidth(0.5);
  doc.rect(MM.left, MM.top, MM.right - MM.left, MM.bottom - MM.top);
  doc.line(MM.left, MM.top + MM.headH, MM.right, MM.top + MM.headH);
  doc.setLineWidth(0.25);
  doc.line(MM.left, MM.top + MM.headH + 0.7, MM.right, MM.top + MM.headH + 0.7);
  const vx = [COLS.statsX, ...STAT_HEADS.slice(1).map((_, i) => COLS.statsX + COLS.stat * (i + 1)), COLS.saveX, COLS.notesX, COLS.ptsX];
  doc.setLineWidth(0.3);
  vx.forEach((x) => doc.line(x, MM.top, x, MM.bottom));
  const hy = MM.top + 6;
  doc.setFont("times", "normal"); doc.setFontSize(10.5);
  doc.text("Models/Unit", COLS.x0 + 1.5, hy);
  STAT_HEADS.forEach((s, i) => doc.text(s, COLS.statsX + COLS.stat * i + COLS.stat / 2, hy, { align: "center" }));
  doc.setFontSize(8.5);
  doc.text("Save", COLS.saveX + 5, hy, { align: "center" });
  doc.setFontSize(10.5);
  doc.text("Notes", COLS.notesX + COLS.notesW / 2, hy, { align: "center" });
  doc.text("Point Value", COLS.ptsX + COLS.ptsW / 2, hy, { align: "center" });
  return MM.top + MM.headH + 1;
}

function finishPage(doc, total) {
  doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(60);
  doc.text("Warhammer is a registered trademark of Games Workshop Ltd.", MM.left, 280);
  doc.text("Unofficial roster generated with WHFB5e List Builder.", MM.left, 283);
  doc.setTextColor(0);
  if (total == null) {
    doc.setFont("times", "italic"); doc.setFontSize(11);
    doc.text("continued overleaf", MM.right, 282, { align: "right" });
    return;
  }
  doc.setFont("times", "bold"); doc.setFontSize(20);
  doc.text("TOTAL", 157, 284, { align: "right" });
  doc.setLineWidth(0.3);
  doc.rect(160, 277, MM.right - 160, 9);
  doc.setFont("times", "normal"); doc.setFontSize(13);
  doc.text(`${fmt(total)}pts`, (160 + MM.right) / 2, 283.2, { align: "center" });
}
