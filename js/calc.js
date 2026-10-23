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
    if ((o.per || "model") === "model" && !o.count && !o.perModel && sel.options?.[o.id]) c += o.cost;
  }
  return c;
}

// how many models a selection adds to a count: units/monsters by size, characters count as one
export function countOf(army, s, model) {
  const e = findEntry(army, s.entryId);
  if (!e) return 0;
  if (model) return s.models?.[model] || 0;
  return e.kind === "character" ? 1 : unitSize(e, s);
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

// Leader levels (e.g. Ogre Champion / Chief / War Chief): the chosen level, or the first one
export function bossLevel(entry, sel) {
  if (!entry.bossLevels) return null;
  return entry.bossLevels.find((l) => l.id === sel.boss?.level) || entry.bossLevels[0];
}

export function bossCost(army, entry, sel) {
  const level = bossLevel(entry, sel);
  const boss = level ? level.cost : entry.bossCost ?? army.bossCosts?.[entry.race];
  let c = boss != null ? boss : 0;
  for (const g of unitGear(entry, sel)) c += gearItem(army, g)?.cost || 0;
  if (entry.bossMount) c += mountItem(army, entry.bossMount)?.cost || 0;
  for (const o of entry.bossOptions || []) if (sel.boss?.options?.[o.id]) c += o.cost;
  return c;
}

export function bossName(army, entry, sel) {
  return bossLevel(entry, sel)?.name || entry.bossName || army.championName || "Boss";
}

export function bossProfile(army, entry, sel) {
  return bossLevel(entry, sel)?.profile || entry.bossProfile || army.bossProfiles?.[entry.race] || null;
}

export function canHaveBoss(army, entry) {
  if (entry.kind !== "unit" || entry.noCommand) return false;
  if (entry.bossCost != null || entry.bossLevels) return true;
  return !!entry.race && army.bossCosts?.[entry.race] != null;
}

// Champions' points: normally Characters; armies such as Chaos keep them with their unit
function bossCategory(army, cat) {
  return army.championCategory === "unit" ? cat : "characters";
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
      const replaced = sel.boss?.enabled && canHaveBoss(army, entry) ? entry.bossReplaces : null;
      for (const m of entry.models) {
        let n = sel.models?.[m.id] || 0;
        if (m.id === replaced) n = Math.max(0, n - 1); // the champion takes the place of one of these
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
      if (o.perModel) { // e.g. extra hand weapons for the Packmasters only
        const n = sel.models?.[o.perModel] || 0;
        if (n) add(cat, n * o.cost, o.name);
        continue;
      }
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
      // commandCost: the full price of a standard bearer or musician model (Daemons, e.g. 40 for a Bloodletter)
      const extra = entry.commandCost != null ? entry.commandCost - trooper : trooper;
      const how = entry.commandCost != null ? `${fmt(entry.commandCost)} pts` : "double cost";
      if (sel.standard && !entry.freeStandard && !entry.noStandard) add(cat, extra, `Standard bearer (${how})`);
      if (sel.musician && !entry.freeMusician && !entry.noMusician) add(cat, extra, `Musician (${how})`);
      if (sel.boss?.enabled && canHaveBoss(army, entry)) {
        const name = entry.bossLevels || entry.bossName || army.championName ? bossName(army, entry, sel) : `${army.races[entry.race]} Boss`;
        add(bossCategory(army, cat), bossCost(army, entry, sel), name);
      }
    }
  }
  for (const x of sel.extras || []) {
    // magic items belong with whoever carries them: a Boss's item counts as Characters
    const xcat = x.onBoss ? bossCategory(army, cat) : cat;
    let pts = extraPoints(army, x);
    if (!x.onBoss && entry.magicStandardFactor != null && extraType(army, x) === "standard") pts *= entry.magicStandardFactor;
    add(xcat, pts, extraName(army, x) || "Item");
  }
  return out;
}

export function describeMount(army, mount) {
  if (!mount) return null;
  const [kind, id] = mount.split(":");
  if (kind === "mount") {
    const m = mountItem(army, id);
    return m && { name: m.name, cost: m.cost, profile: m.profile, profiles: m.profiles, kind, saveBonus: m.saveBonus || 0, noCavalry: !!m.noCavalry, chariot: !!m.chariot };
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
  const v0 = variantOf(entry, sel);
  for (const o of entry.options || []) if (sel.options?.[o.id] && o.save) return o.save;
  if (v0?.save) return v0.save;
  if (entry.save) return entry.save;
  if (entry.kind === "monster") return "-";
  const armour = new Set(entry.armour || []);
  let cavalry = !!entry.cavalry;
  let bonus = entry.saveBonus || 0;
  for (const o of entry.options || []) {
    if (!sel.options?.[o.id]) continue;
    if (o.armour) armour.add(o.armour);
    if (o.replacesArmour) armour.delete(o.replacesArmour);
    if (o.cavalry) cavalry = true;
    if (o.saveBonus) bonus += o.saveBonus;
  }
  if (entry.kind === "character") {
    for (const gid of sel.gear || []) {
      const g = gearItem(army, gid);
      if (g?.armour) armour.add(g.armour);
    }
    const m = describeMount(army, sel.mount);
    if (m && m.kind === "mount" && !m.noCavalry) {
      cavalry = true;
      bonus += m.saveBonus;
    }
    // barding only counts for a model on a horse-type mount
    if (armour.has("barding") && cavalry) bonus += 1;
  }
  let save = 7; // 7 = no save
  const s = armour.has("shield"), l = armour.has("light"), h = armour.has("heavy");
  const natural = v0?.naturalSave ?? entry.naturalSave;
  if (armour.has("chaos")) {
    // Chaos armour: 4+, combines with a shield (3+) and a mount as normal
    save = s ? 3 : 4;
  } else if (natural) {
    // Lizardmen: scaly skin gives a base save; light armour and a shield each improve it by 1
    save = natural - (l ? 1 : 0) - (s ? 1 : 0);
  } else if (s && h) save = 4;
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

// The Chaos god a selection serves: from its variant (Greater Daemons), entry (Daemon units)
// or a chosen Mark of Chaos option; null = unaligned
export function selectionGod(army, sel) {
  const entry = findEntry(army, sel.entryId);
  if (!entry) return null;
  const v = variantOf(entry, sel);
  if (v?.god) return v.god;
  if (entry.god) return entry.god;
  for (const o of entry.options || []) if (o.god && sel.options?.[o.id]) return o.god;
  return null;
}

// An attachment that makes a model part of another unit (war teams, champions) rather than
// a Chaos retinue, whose units stay separate regiments
function isPartOfUnit(army, s) {
  if (!s.attachedTo) return false;
  return !findEntry(army, s.entryId)?.attachTo?.retinue;
}

// Points of a Warlord's retinue: everything attached to him as retinue, and what is attached to those
export function retinueValue(army, list, warlord) {
  let total = 0;
  const seen = new Set([warlord.uid]);
  const walk = (parent) => {
    for (const s of list.selections) {
      if (s.attachedTo !== parent.uid || seen.has(s.uid)) continue;
      if (!findEntry(army, s.entryId)?.attachTo?.retinue) continue;
      seen.add(s.uid);
      total += selectionCost(army, s).total;
      walk(s);
    }
  };
  walk(warlord);
  return total;
}

// The Warlord at the top of a chain of retinue attachments
function retinueRoot(list, s) {
  let cur = s;
  const seen = new Set();
  while (cur?.attachedTo && !seen.has(cur.uid)) {
    seen.add(cur.uid);
    const p = list.selections.find((x) => x.uid === cur.attachedTo);
    if (!p) return null;
    cur = p;
  }
  return cur;
}

export function isWarlord(army, s) {
  return selectionTags(army, s).includes("warlord");
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
  // limits over several categories together (Chaos: the main warband 75%+, allies up to 25%)
  for (const g of army.limits || []) {
    const pts = g.categories.reduce((n, id) => n + (byCategory[id] || 0), 0);
    const pct = limit ? (pts / limit) * 100 : 0;
    if (g.max != null && pts > (limit * g.max) / 100)
      warn(`${g.name}: ${fmt(pts)} pts (${pct.toFixed(1)}%) exceeds the ${g.max}% maximum of ${fmt((limit * g.max) / 100)} pts.`);
    if (g.min != null && pts < (limit * g.min) / 100)
      warn(`${g.name}: ${fmt(pts)} pts (${pct.toFixed(1)}%) is below the ${g.min}% minimum of ${fmt((limit * g.min) / 100)} pts.`);
  }

  // per-entry maximums (0-1 choices, special characters)
  const counts = {};
  for (const s of list.selections) counts[s.entryId] = (counts[s.entryId] || 0) + 1;
  for (const [id, n] of Object.entries(counts)) {
    const e = findEntry(army, id);
    if (e?.max != null && n > e.max) warn(`${e.name}: ${n} taken, the maximum is ${e.max}.`);
    if (e?.maxModels != null) {
      const total = list.selections.filter((s) => s.entryId === id).reduce((t, s) => t + unitSize(e, s), 0);
      if (total > e.maxModels) warn(`${e.name}: ${total} in the army, the maximum is ${e.maxModels}.`);
    }
  }

  // army-wide rules from data
  const tagCount = (tag) => list.selections.filter((s) => selectionTags(army, s).includes(tag)).length;
  for (const r of army.rules || []) {
    if (r.type === "exactlyTag" && tagCount(r.tag) !== r.count) warn(`${r.message} (currently ${tagCount(r.tag)})`);
    if (r.type === "maxTag" && tagCount(r.tag) > r.count) warn(`${r.message} (currently ${tagCount(r.tag)})`);
    if (r.type === "perUnits") {
      const entries = Array.isArray(r.entry) ? r.entry : [r.entry];
      const mine = list.selections.filter((s) => entries.includes(s.entryId));
      const have = r.units ? mine.length : mine.reduce((n, s) => n + countOf(army, s, r.model), 0);
      // a "per" id may name one variant, e.g. "battle-standard:thrall" counts only Vampire Thrall standard bearers
      const counts = (s) => r.per.includes(s.entryId) || (s.variant && r.per.includes(`${s.entryId}:${s.variant}`));
      const units = list.selections.filter((s) => counts(s) && !isPartOfUnit(army, s)).length;
      const allowed = Math.max(r.atLeast || 0, units * r.max);
      if (have > allowed) warn(`${r.message} You have ${have}, the maximum is ${allowed}.`);
    }
    if (r.type === "perPoints") {
      // e.g. one Banshee for every full 1,000 points in the army
      const entries = Array.isArray(r.entry) ? r.entry : [r.entry];
      const have = list.selections.filter((s) => entries.includes(s.entryId)).reduce((n, s) => n + countOf(army, s), 0);
      const allowed = Math.floor(limit / r.per) * (r.max || 1);
      if (have > allowed) warn(`${r.message} You have ${have}, the maximum is ${allowed}.`);
    }
    if (r.type === "unitsBySize") {
      // e.g. up to five warpfire teams form one unit, 6-10 up to two units, and so on
      for (const id of r.entries) {
        const units = list.selections.filter((s) => s.entryId === id && !isPartOfUnit(army, s));
        const models = units.reduce((n, s) => n + countOf(army, s), 0);
        const allowed = Math.max(1, Math.ceil(models / (r.per || 5)));
        if (units.length > allowed) warn(`${findEntry(army, id).name}: ${models} in ${units.length} units, at most ${allowed} unit${allowed > 1 ? "s" : ""}. ${r.message}`);
      }
    }
    if (r.type === "requireEntry" && !list.selections.some((s) => (Array.isArray(r.entry) ? r.entry : [r.entry]).includes(s.entryId)))
      warn(r.message);
    if (r.type === "minCategoryIf" && list.selections.some((s) => s.entryId === r.entry)) {
      const pts = byCategory[r.category] || 0;
      if (pts < (limit * r.min) / 100) warn(`${r.message} (currently ${fmt(pts)} pts)`);
    }
    if (r.type === "itemLimit") {
      const carriers = list.selections.filter((s) => !r.exceptEntries.includes(s.entryId) && (s.extras || []).some((x) => x.itemId === r.item));
      if (carriers.length > r.max) warn(`${r.message} (currently ${carriers.length})`);
    }
    if (r.type === "detachments") issues.push(...checkDetachments(army, list, r));
    if (r.type === "retinues") issues.push(...checkRetinues(army, list, r));
    if (r.type === "requiresGeneral") {
      // e.g. a Chaos Battle Standard Bearer only if the General is a Champion of Chaos or Sorcerer
      const general = list.selections.find((s) => selectionTags(army, s).includes("general"));
      for (const s of list.selections.filter((x) => r.entries.includes(x.entryId))) {
        if (general && !r.general.includes(general.entryId)) warn(`${s.name || findEntry(army, s.entryId).name}: ${r.message}`, s.uid);
      }
    }
    if (r.type === "generalFrom") {
      // Chaos: the General must be one of the main warband's Warlords, not an ally
      for (const s of list.selections.filter((x) => selectionTags(army, x).includes("general")))
        if (!r.categories.includes(findEntry(army, s.entryId)?.category)) warn(`${selLabel(army, s)}: ${r.message}`, s.uid);
    }
    if (r.type === "maxUnits") {
      // e.g. one unit of Harpies, any number if the General is a Beastman Warlord
      const general = list.selections.find((s) => selectionTags(army, s).includes("general"));
      const free = general && (r.unlessGeneral || []).includes(general.entryId);
      const n = list.selections.filter((s) => s.entryId === r.entry).length;
      if (!free && n > r.max) warn(`${r.message} (currently ${n})`);
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
    for (const req of [...(e.requires || []), ...(variantOf(e, s)?.requires || [])]) {
      const ok = req.race ? hasMobOfRace(army, list, req.race)
        : req.entries ? list.selections.some((x) => req.entries.includes(x.entryId))
        : list.selections.some((x) => x.entryId === req.entry);
      if (!ok) warn(`${label}: ${req.message}`, s.uid);
    }
    for (const rg of e.requiredGroups || []) {
      if (!(e.options || []).some((o) => o.group === rg.group && s.options?.[o.id])) warn(`${label}: ${rg.message}`, s.uid);
    }
    if (e.requireStandard && !s.standard) warn(`${label}: ${e.requireStandard}`, s.uid);
    // options that need another option (a Juggernaut needs the Mark of Khorne, barding needs a Chaos Steed)
    for (const o of e.options || []) {
      if (!s.options?.[o.id] || !o.requires) continue;
      const need = Array.isArray(o.requires) ? o.requires : [o.requires];
      if (!need.some((id) => s.options?.[id])) {
        const names = need.map((id) => e.options.find((x) => x.id === id)?.name || id).join(" or ");
        warn(`${label}: ${o.name} needs ${names}.`, s.uid);
      }
    }
    if (e.kind === "unit") {
      const size = unitSize(e, s);
      if (e.minSize && size < e.minSize && !isPartOfUnit(army, s)) warn(`${label}: ${size} ${e.sizeLabel || "models"}, the minimum is ${e.minSize}.`, s.uid);
      const lvl = s.boss?.enabled ? bossLevel(e, s) : null;
      if (lvl?.minSize && size < lvl.minSize) warn(`${label}: an ${lvl.name} may only lead a unit of at least ${lvl.minSize} models.`, s.uid);
      if ((s.standard && e.noStandard) || (s.musician && e.noMusician)) warn(`${label}: this unit may not have a standard bearer or musician.`, s.uid);
      if (e.bossItems === false && (s.extras || []).some((x) => x.onBoss)) warn(`${label}: its ${bossName(army, e, s)} may not carry magic items.`, s.uid);
      if (e.ratio) {
        const a = s.models?.[e.ratio.model] || 0, b = s.models?.[e.ratio.per] || 0;
        if (a > b * e.ratio.max || (e.ratio.min && a < b * e.ratio.min)) warn(`${label}: ${e.ratio.message}`, s.uid);
      }
      const ms = (s.extras || []).filter((x) => !x.onBoss && extraType(army, x) === "standard");
      if (ms.length) {
        if (!e.magicStandard) warn(`${label}: this unit may not carry a Magic Standard.`, s.uid);
        if (ms.length > 1) warn(`${label}: only one Magic Standard per unit.`, s.uid);
        if (ms.length && !s.standard && !e.noCommand) warn(`${label}: a Magic Standard needs a standard bearer.`, s.uid);
        magicStdCount[e.id] = (magicStdCount[e.id] || 0) + 1;
      }
      const bossItems = (s.extras || []).filter((x) => x.onBoss);
      const champ = army.championName || "Boss";
      if (bossItems.length && !canHaveBoss(army, e)) warn(`${label}: this unit has no ${champ} to carry a magic item.`, s.uid);
      if (bossItems.length > 1) warn(`${label}: a ${champ} may carry only one magic item.`, s.uid);
      if (bossItems.length && !s.boss?.enabled) warn(`${label}: has a ${champ} magic item but no ${champ}.`, s.uid);
    }
    if (e.kind === "character") {
      const g = s.gear || [];
      if (g.includes("double-handed-weapon") && g.includes("halberd"))
        warn(`${label}: cannot wield both a double-handed weapon and a halberd.`, s.uid);
      const missile = g.filter((id) => gearItem(army, id)?.group === "missile");
      if (missile.length > 1) warn(`${label}: more than one missile weapon selected.`, s.uid);
      const mt = describeMount(army, s.mount);
      if (mt?.kind === "monster" && e.monsterRaces && !e.monsterRaces.includes(selectionRace(army, s)))
        warn(`${label}: only a ${e.monsterRaces.map((r) => army.races[r]).join(" or ")} may ride a monster.`, s.uid);
      if (!isMounted(army, s)) for (const id of g) {
        const it = gearItem(army, id);
        if (it?.mountedOnly) warn(`${label}: ${it.name.replace(/ \(mounted only\)/, "")} can only be used by a mounted model.`, s.uid);
      }
    }
  }
  for (const [id, n] of Object.entries(magicStdCount)) {
    const e = findEntry(army, id);
    if (e.magicStandard === "one" && n > 1) warn(`${e.name}: only one Mob of this type may carry a Magic Standard (${n} do).`);
  }
  issues.push(...checkAttached(army, list));
  if (army.itemById) issues.push(...checkItems(army, list, (s) => itemContext(army, s)));
  return issues;
}

// Units or characters that go with a regiment (Skaven war teams, hidden Assassins, Undead Champions).
// entry.attachTo = { entries, label, required?, maxModels?, maxUnits?, maxFraction? }
export function attachedParent(list, s) {
  return s.attachedTo ? list.selections.find((x) => x.uid === s.attachedTo) || null : null;
}
function checkAttached(army, list) {
  const issues = [];
  const warn = (msg, uid) => issues.push({ msg, uid });
  const per = new Map(); // `${entryId}|${parentUid}` -> {units, models}
  for (const s of list.selections) {
    const e = findEntry(army, s.entryId);
    const a = e?.attachTo;
    if (!a) continue;
    const label = s.name || e.name;
    const p = attachedParent(list, s);
    if (!p) {
      if (s.attachedTo) warn(`${label}: the regiment it was with is no longer in the list.`, s.uid);
      else if (a.required) warn(`${label}: ${a.requiredMessage || "must go with a regiment"}.`, s.uid);
      continue;
    }
    const pe = findEntry(army, p.entryId);
    if (!a.entries.includes(p.entryId)) warn(`${label}: cannot go with ${pe?.name || "that unit"}.`, s.uid);
    if (a.maxFraction && unitSize(e, s) > unitSize(pe, p) * a.maxFraction)
      warn(`${label}: may be at most ${a.maxFraction === 0.5 ? "half" : `${a.maxFraction * 100}%`} the size of ${p.name || pe.name} (${Math.floor(unitSize(pe, p) * a.maxFraction)}).`, s.uid);
    const key = `${e.id}|${p.uid}`;
    const t = per.get(key) || { units: 0, models: 0, e, p, pe };
    t.units += 1; t.models += countOf(army, s);
    per.set(key, t);
  }
  // Chaos retinues
  for (const s of list.selections) {
    const e = findEntry(army, s.entryId);
    const a = e?.attachTo;
    const p = a && attachedParent(list, s);
    if (!p) continue;
    const label = selLabel(army, s);
    const pe = findEntry(army, p.entryId);
    const who = selLabel(army, p);
    if (a.requiresSibling) {
      // e.g. chariots need a unit of Chaos Warriors, Knights, Marauders or Marauder Horsemen in the same retinue
      const ok = list.selections.some((x) => x !== s && x.attachedTo === p.uid && a.requiresSibling.entries.includes(x.entryId));
      if (!ok) warn(`${label}: ${a.requiresSibling.message}`, s.uid);
    }
    if (a.sameGod) {
      // a Greater Daemon (or Daemon Prince with a Mark) only takes Daemons of his own god
      const root = retinueRoot(list, s);
      const mine = selectionGod(army, s), theirs = root && selectionGod(army, root);
      if (mine && theirs && mine !== theirs) warn(`${label}: Daemons of ${cap(mine)} cannot join the retinue of ${selLabel(army, root)} (${cap(theirs)}).`, s.uid);
    }
    if (a.inGeneralRetinue) {
      const root = retinueRoot(list, s);
      if (root && !selectionTags(army, root).includes("general")) warn(`${label}: must be part of the General's retinue.`, s.uid);
    }
    if (a.leadsUnit && selectionGod(army, s) !== selectionGod(army, p))
      warn(`${label}: must lead a unit of his own kind (${who} is not).`, s.uid);
    if (a.leadsUnit && p.boss?.enabled) warn(`${who}: the ${e.name} replaces the unit's normal Champion, so it cannot have both.`, p.uid);
    if (a.leadsUnit && e.leadsMounted != null) {
      const mounted = !!findEntry(army, p.entryId)?.mounted;
      const rides = (e.options || []).some((o) => o.group === "steed" && s.options?.[o.id]);
      if (mounted !== rides) warn(`${label}: must ride his god's steed if, and only if, his unit does.`, s.uid);
    }
  }
  for (const { units, models, e, p, pe } of per.values()) {
    const who = p.name || pe.name;
    if (e.attachTo.maxModels != null && models > e.attachTo.maxModels) warn(`${who}: ${models} ${e.name} with it, the maximum is ${e.attachTo.maxModels}.`, p.uid);
    if (e.attachTo.perParentModels) {
      const max = Math.floor(unitSize(pe, p) / e.attachTo.perParentModels);
      if (models > max) warn(`${who}: ${models} ${e.name} with it, the maximum is ${max} (one per ${e.attachTo.perParentModels} models).`, p.uid);
    }
    if (e.attachTo.maxUnits != null && units > e.attachTo.maxUnits) warn(`${who}: ${units} units of ${e.name} with it, the maximum is ${e.attachTo.maxUnits}.`, p.uid);
  }
  return issues;
}

const cap = (s) => s[0].toUpperCase() + s.slice(1);
// A name for warnings: custom name, else the character's variant (e.g. "Bloodthirster of Khorne"), else the entry
export function selLabel(army, s) {
  const e = findEntry(army, s.entryId);
  if (s.name) return s.name;
  return (e?.kind === "character" && variantOf(e, s)?.name) || e?.name || "";
}

// Chaos: every Warlord needs a retinue worth at least as many points as he is
function checkRetinues(army, list, r) {
  const issues = [];
  let summoned = 0;
  for (const s of list.selections) {
    if (!isWarlord(army, s)) continue;
    const e = findEntry(army, s.entryId);
    const own = selectionCost(army, s).total;
    const ret = retinueValue(army, list, s);
    const label = selLabel(army, s);
    if (ret === 0 && e.summonable && r.summoned) {
      summoned++;
      if (summoned > r.summoned) issues.push({ msg: `${label}: only ${r.summoned} Greater Daemon may be summoned without a retinue.`, uid: s.uid });
      continue;
    }
    if (ret < own) issues.push({ msg: `${label}: retinue is worth ${fmt(ret)} pts; it must be worth at least ${fmt(own)} pts, the Warlord's own value.`, uid: s.uid });
  }
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
    entryId: e.id,
    kind: e.kind,
    race: v?.race || e.race || null,
    // e.g. Krell and Settra may use items meant for Liches, Vampires or Necromancers
    races: [v?.race || e.race, ...(e.itemRaces || [])].filter(Boolean),
    allowedItems: e.allowedItems || [],
    god: selectionGod(army, s),
    variant: v?.id || null,
    mounted: isMounted(army, s) || !!s.mount,
    typeOf: e.bloodline ? { bloodline: e.bloodline } : {},
    wizard: !!(v?.wizard ?? e.wizard),
    canStandard: e.kind === "character" && tags.includes("bsb"),
    allowance: { magicItems: v?.magicItems ?? e.magicItems ?? 0, ...(v?.allowances || e.allowances || {}) },
  };
}

export function isMounted(army, s) {
  const e = findEntry(army, s.entryId);
  if (e?.cavalry) return true;
  if ((e?.options || []).some((o) => o.cavalry && s.options?.[o.id])) return true;
  const m = describeMount(army, s.mount);
  return !!m && !m.noCavalry;
}

// Default text for the roster's Notes column: entry rules plus variant (race/type) rules
export function defaultNotes(army, s) {
  const e = findEntry(army, s.entryId);
  if (!e) return "";
  const v = variantOf(e, s);
  return [e.rulesText, v?.rulesText].filter(Boolean).join(", ");
}

// Empire-style detachments: a state troop unit attached to another state troop regiment
export function parentOf(list, s) {
  return s.parent ? list.selections.find((x) => x.uid === s.parent) || null : null;
}
function checkDetachments(army, list, r) {
  const issues = [];
  const warn = (msg, uid) => issues.push({ msg, uid });
  const byParent = new Map();
  for (const s of list.selections) {
    if (!s.parent) continue;
    const e = findEntry(army, s.entryId);
    const label = s.name || e?.name || "Detachment";
    const p = parentOf(list, s);
    if (!p) { warn(`${label}: its parent regiment is no longer in the list.`, s.uid); continue; }
    const pe = findEntry(army, p.entryId);
    if (!e?.stateTroops || !pe?.stateTroops) warn(`${label}: only state troops may form detachments of state troop regiments.`, s.uid);
    if (p.parent) warn(`${label}: a detachment cannot be attached to another detachment.`, s.uid);
    if (unitSize(e, s) > unitSize(pe, p) / 2) warn(`${label}: a detachment may be at most half the size of its regiment (${Math.floor(unitSize(pe, p) / 2)}).`, s.uid);
    if (s.standard || s.musician) warn(`${label}: a detachment may not include a standard bearer or musician.`, s.uid);
    if (s.boss?.enabled) warn(`${label}: a detachment may not have a ${army.championName || "champion"}.`, s.uid);
    byParent.set(p.uid, (byParent.get(p.uid) || 0) + 1);
  }
  for (const [uid, n] of byParent) {
    if (n > r.max) {
      const p = list.selections.find((x) => x.uid === uid);
      warn(`${p.name || findEntry(army, p.entryId).name}: ${n} detachments, the maximum is ${r.max}.`, uid);
    }
  }
  return issues;
}
