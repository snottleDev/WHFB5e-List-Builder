// Points calculation, save calculation and list validation.
// Pure functions: no DOM access, so this module can be tested with Node.
import { extraPoints, extraName, extraType, checkItems } from "./magic.js";

export function findEntry(army, id) {
  return army.entries.find((e) => e.id === id);
}

export function variantOf(entry, sel) {
  if (!entry.variants) return null;
  return entry.variants.find((v) => v.id === sel.variant) || entry.variants[0];
}

function gearItem(army, id) {
  return army.equipment.find((g) => g.id === id);
}

function mountItem(army, id) {
  return army.mounts.find((m) => m.id === id);
}

// ---------- unit helpers ----------

export function unitSize(entry, sel) {
  if (entry.models) {
    return entry.models.reduce((n, m) => n + (sel.models?.[m.id] || 0) * (m.counts || 1), 0);
  }
  return sel.size || 0;
}

function perModelCost(entry, sel) {
  const v = variantOf(entry, sel);
  let c = v && v.cost != null ? v.cost : entry.cost || 0;
  for (const o of entry.options || []) {
    if ((o.per || "model") === "model" && !o.count && sel.options?.[o.id]) c += o.cost;
  }
  return c;
}

function crewCount(entry, sel) {
  let crew = entry.crew || 0;
  for (const o of entry.options || []) {
    if (o.addsCrew) crew += Number(sel.options?.[o.id] || 0);
  }
  return crew;
}

// Selected gear ids for a unit (used for boss pricing)
function unitGear(entry, sel) {
  let gear = [...(entry.bossGear || [])];
  for (const o of entry.options || []) {
    if (sel.options?.[o.id] && o.gear) {
      if (o.replacesGear) gear = gear.filter((g) => g !== o.replacesGear);
      gear.push(o.gear);
    }
  }
  return gear;
}

export function bossCost(army, entry, sel) {
  const boss = army.bossCosts?.[entry.race];
  let c = boss != null ? boss : 0;
  for (const g of unitGear(entry, sel)) c += gearItem(army, g)?.cost || 0;
  if (entry.bossMount) c += mountItem(army, entry.bossMount)?.cost || 0;
  for (const o of entry.bossOptions || []) if (sel.boss?.options?.[o.id]) c += o.cost;
  return c;
}

export function canHaveBoss(army, entry) {
  return entry.kind === "unit" && !entry.noCommand && !!entry.race && army.bossCosts?.[entry.race] != null;
}

// ---------- cost of one selection ----------
// Returns { total, byCategory: {catId: pts}, lines: [{label, pts}] }

export function selectionCost(army, sel) {
  const entry = findEntry(army, sel.entryId);
  const out = { total: 0, byCategory: {}, lines: [] };
  if (!entry) return out;
  const add = (cat, pts, label) => {
    if (!pts) return;
    out.byCategory[cat] = (out.byCategory[cat] || 0) + pts;
    out.total += pts;
    out.lines.push({ label, pts, cat });
  };
  const cat = entry.category;

  if (entry.kind === "character") {
    const v = variantOf(entry, sel);
    add(cat, v ? v.cost : entry.cost, v ? v.name : entry.name);
    for (const gid of sel.gear || []) {
      const g = gearItem(army, gid);
      if (g) add(cat, g.cost, g.name);
    }
    for (const o of entry.options || []) if (sel.options?.[o.id]) add(cat, o.cost, o.name);
    const m = describeMount(army, sel.mount);
    if (m) add(cat, m.cost, m.name);
  } else if (entry.kind === "monster") {
    const v = variantOf(entry, sel);
    const each = v && v.cost != null ? v.cost : entry.cost;
    add(cat, each * (sel.size || 1), `${sel.size || 1} × ${v ? v.name : entry.name}`);
  } else {
    const size = unitSize(entry, sel);
    if (entry.models) {
      for (const m of entry.models) {
        const n = sel.models?.[m.id] || 0;
        if (n) add(cat, n * m.cost, `${n} ${m.name}`);
      }
    } else {
      const each = perModelCost(entry, sel);
      const hasBoss = sel.boss?.enabled && canHaveBoss(army, entry);
      const troopers = Math.max(0, size - (hasBoss ? 1 : 0));
      add(cat, troopers * each, `${troopers} × ${fmt(each)}`);
    }
    // per-unit / per-chariot / per-crew options
    const crew = crewCount(entry, sel);
    for (const o of entry.options || []) {
      const val = sel.options?.[o.id];
      if (!val) continue;
      const per = o.per || "model";
      if (per === "model" && !o.count) continue;
      const n = o.count ? Number(val) : 1;
      if (per === "unit") add(cat, n * o.cost, `${o.count ? n + " × " : ""}${o.name}`);
      else if (per === "chariot") add(cat, n * o.cost * size, `${o.name}`);
      else if (per === "crew") add(cat, o.cost * crew * size, `${o.name}`);
      else if (per === "model" && o.count) add(cat, n * o.cost * size, o.name);
    }
    if (!entry.noCommand) {
      const trooper = entry.trooperCost != null ? entry.trooperCost : perModelCost(entry, sel);
      // Standard bearers and musicians cost double an ordinary trooper (p.82):
      // the model is already counted in the unit size, so add one extra trooper cost.
      if (sel.standard) add(cat, trooper, "Standard bearer (double cost)");
      if (sel.musician) add(cat, trooper, "Musician (double cost)");
      if (sel.boss?.enabled && canHaveBoss(army, entry)) {
        add("characters", bossCost(army, entry, sel), `${army.races[entry.race]} Boss`);
      }
    }
  }
  for (const x of sel.extras || []) {
    // magic items belong with whoever carries them: a Boss's item counts as Characters
    const xcat = x.onBoss ? "characters" : cat;
    add(xcat, extraPoints(army, x), extraName(army, x) || "Item");
  }
  return out;
}

export function describeMount(army, mount) {
  if (!mount) return null;
  const [kind, id] = mount.split(":");
  if (kind === "mount") {
    const m = mountItem(army, id);
    return m && { name: m.name, cost: m.cost, profile: m.profile, kind, saveBonus: m.saveBonus || 0 };
  }
  if (kind === "monster") {
    const [mid, vid] = id.split("/");
    const e = findEntry(army, mid);
    if (!e) return null;
    const v = e.variants ? e.variants.find((x) => x.id === vid) || e.variants[0] : null;
    return { name: v ? v.name : e.name, cost: v && v.cost != null ? v.cost : e.cost, profile: v?.profile || e.profile, kind };
  }
  if (kind === "chariot") {
    const e = findEntry(army, id);
    return e && { name: e.name, cost: e.cost, kind, profiles: e.profiles };
  }
  return null;
}

// ---------- save ----------

export function computeSave(army, sel) {
  const entry = findEntry(army, sel.entryId);
  if (!entry) return "";
  if (entry.save) return entry.save;
  if (entry.kind === "monster") return "-";
  const armour = new Set(entry.armour || []);
  let cavalry = !!entry.cavalry;
  let bonus = entry.saveBonus || 0;
  for (const o of entry.options || []) if (sel.options?.[o.id] && o.armour) armour.add(o.armour);
  if (entry.kind === "character") {
    for (const gid of sel.gear || []) {
      const g = gearItem(army, gid);
      if (g?.armour) armour.add(g.armour);
    }
    const m = describeMount(army, sel.mount);
    if (m && m.kind === "mount") {
      cavalry = true;
      bonus += m.saveBonus;
    }
  }
  let save = 7; // 7 = no save
  const s = armour.has("shield"), l = armour.has("light"), h = armour.has("heavy");
  if (s && h) save = 4;
  else if ((s && l) || h) save = 5;
  else if (s || l) save = 6;
  if (cavalry) save -= 1;
  save -= bonus;
  if (save >= 7) return "-";
  return `${Math.max(save, 1)}+`;
}

// ---------- formatting ----------

export function fmt(n) {
  const whole = Math.floor(n + 1e-9);
  const frac = n - whole;
  if (Math.abs(frac) < 1e-9) return String(whole);
  if (Math.abs(frac - 0.5) < 1e-9) return whole === 0 ? "½" : `${whole}½`;
  return n.toFixed(2);
}

// ---------- whole list ----------

export function listTotals(army, list) {
  const byCategory = {};
  let total = 0;
  for (const c of army.categories) byCategory[c.id] = 0;
  for (const sel of list.selections) {
    const c = selectionCost(army, sel);
    total += c.total;
    for (const [k, v] of Object.entries(c.byCategory)) byCategory[k] = (byCategory[k] || 0) + v;
  }
  return { total, byCategory };
}

function selectionTags(army, sel) {
  const entry = findEntry(army, sel.entryId);
  if (!entry) return [];
  let tags = [...(entry.tags || [])];
  if (entry.roles) {
    const r = entry.roles.find((x) => x.id === sel.role) || entry.roles[0];
    tags.push(...r.tags);
  }
  for (const o of entry.options || []) if (sel.options?.[o.id] && o.tags) tags.push(...o.tags);
  return tags;
}

function selectionRace(army, sel) {
  const entry = findEntry(army, sel.entryId);
  if (!entry) return null;
  const v = variantOf(entry, sel);
  return v?.race || entry.race || null;
}

// A "Mob of race X": a unit in the core troop category with that race
function hasMobOfRace(army, list, race) {
  const core = army.categories.find((c) => c.min)?.id;
  return list.selections.some((s) => {
    const e = findEntry(army, s.entryId);
    return e && e.kind === "unit" && e.category === core && e.race === race;
  });
}

export function validate(army, list) {
  const issues = [];
  const warn = (msg, uid) => issues.push({ msg, uid });
  const { total, byCategory } = listTotals(army, list);
  const limit = list.points;

  if (total > limit) warn(`Army is ${fmt(total - limit)} points over the ${limit} point limit.`);

  for (const c of army.categories) {
    const pts = byCategory[c.id] || 0;
    const pct = limit ? (pts / limit) * 100 : 0;
    if (c.max != null && pts > (limit * c.max) / 100)
      warn(`${c.name}: ${fmt(pts)} pts (${pct.toFixed(1)}%) exceeds the ${c.max}% maximum of ${fmt((limit * c.max) / 100)} pts.`);
    if (c.min != null && pts < (limit * c.min) / 100)
      warn(`${c.name}: ${fmt(pts)} pts (${pct.toFixed(1)}%) is below the ${c.min}% minimum of ${fmt((limit * c.min) / 100)} pts.`);
  }

  // per-entry maximums (0-1 choices, special characters)
  const counts = {};
  for (const s of list.selections) counts[s.entryId] = (counts[s.entryId] || 0) + 1;
  for (const [id, n] of Object.entries(counts)) {
    const e = findEntry(army, id);
    if (e?.max != null && n > e.max) warn(`${e.name}: ${n} taken, the maximum is ${e.max}.`);
  }

  // army-wide rules from data
  const tagCount = (tag) => list.selections.filter((s) => selectionTags(army, s).includes(tag)).length;
  for (const r of army.rules || []) {
    if (r.type === "exactlyTag" && tagCount(r.tag) !== r.count) warn(`${r.message} (currently ${tagCount(r.tag)})`);
    if (r.type === "maxTag" && tagCount(r.tag) > r.count) warn(`${r.message} (currently ${tagCount(r.tag)})`);
    if (r.type === "perUnits") {
      const have = list.selections.filter((s) => s.entryId === r.entry).reduce((n, s) => n + unitSize(findEntry(army, r.entry), s), 0);
      const units = list.selections.filter((s) => r.per.includes(s.entryId)).length;
      if (have > units * r.max) warn(`${r.message} You have ${have}, the maximum is ${units * r.max}.`);
    }
  }

  // per-selection checks
  const magicStdCount = {};
  for (const s of list.selections) {
    const e = findEntry(army, s.entryId);
    if (!e) continue;
    const label = s.name || e.name;
    if (e.requiresOwnRace) {
      const race = selectionRace(army, s);
      if (race && !hasMobOfRace(army, list, race))
        warn(`${label}: requires at least one Mob of ${army.races[race]}s.`, s.uid);
    }
    for (const req of e.requires || []) {
      const ok = req.race ? hasMobOfRace(army, list, req.race) : list.selections.some((x) => x.entryId === req.entry);
      if (!ok) warn(`${label}: ${req.message}`, s.uid);
    }
    if (e.kind === "unit") {
      const size = unitSize(e, s);
      if (e.minSize && size < e.minSize) warn(`${label}: ${size} ${e.sizeLabel || "models"}, the minimum is ${e.minSize}.`, s.uid);
      if (e.ratio) {
        const a = s.models?.[e.ratio.model] || 0, b = s.models?.[e.ratio.per] || 0;
        if (a > b * e.ratio.max) warn(`${label}: ${e.ratio.message}`, s.uid);
      }
      const ms = (s.extras || []).filter((x) => !x.onBoss && extraType(army, x) === "standard");
      if (ms.length) {
        if (!e.magicStandard) warn(`${label}: this unit may not carry a Magic Standard.`, s.uid);
        if (ms.length > 1) warn(`${label}: only one Magic Standard per unit.`, s.uid);
        if (ms.length && !s.standard) warn(`${label}: a Magic Standard needs a standard bearer.`, s.uid);
        magicStdCount[e.id] = (magicStdCount[e.id] || 0) + 1;
      }
      const bossItems = (s.extras || []).filter((x) => x.onBoss);
      if (bossItems.length && !canHaveBoss(army, e)) warn(`${label}: this unit has no Boss to carry a magic item.`, s.uid);
      if (bossItems.length > 1) warn(`${label}: a Boss may carry only one magic item.`, s.uid);
      if (bossItems.length && !s.boss?.enabled) warn(`${label}: has a Boss magic item but no Boss.`, s.uid);
    }
    if (e.kind === "character") {
      const g = s.gear || [];
      if (g.includes("double-handed-weapon") && g.includes("halberd"))
        warn(`${label}: cannot wield both a double-handed weapon and a halberd.`, s.uid);
      const missile = g.filter((id) => gearItem(army, id)?.group === "missile");
      if (missile.length > 1) warn(`${label}: more than one missile weapon selected.`, s.uid);
    }
  }
  for (const [id, n] of Object.entries(magicStdCount)) {
    const e = findEntry(army, id);
    if (e.magicStandard === "one" && n > 1) warn(`${e.name}: only one Mob of this type may carry a Magic Standard (${n} do).`);
  }
  if (army.itemById) issues.push(...checkItems(army, list, (s) => itemContext(army, s)));
  return issues;
}

// Who is carrying the items of a selection, for the magic item checks
export function itemContext(army, s) {
  const e = findEntry(army, s.entryId);
  if (!e) return null;
  const v = variantOf(e, s);
  const tags = selectionTags(army, s);
  return {
    label: s.name || v?.name || e.name,
    uid: s.uid,
    kind: e.kind,
    race: v?.race || e.race || null,
    wizard: !!(v?.wizard ?? e.wizard),
    canStandard: e.kind === "character" && tags.includes("bsb"),
    allowance: { magicItems: v?.magicItems ?? e.magicItems ?? 0, ...(v?.allowances || e.allowances || {}) },
  };
}
