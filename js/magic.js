// Magic items: catalogue loading, availability per army, pricing and rule checks.
//
// An army file declares
//   "magic": { "tags": [...], "pools": [{ id, name, catalogues: [...], allowance }], "items": [...] }
// - tags: which army-restricted items it may use ("Orcs & Goblins only" items carry tag "orcs-goblins")
// - pools: separate allowances. Most armies have one pool ("magic", allowance key "magicItems").
//   Chaos gifts or Dwarf runes can be added as extra pools with their own catalogue and allowance key.
// - items: army-book items that are not in the shared catalogue
//
// A selection's extras are stored as { itemId, pool?, onBoss? } or, for anything not in a catalogue,
// { custom: true, name, points, type?, onBoss? }. Older lists store { name, points }; these still work.

export function attachMagic(army, catalogues) {
  const conf = army.magic || { tags: [], pools: [], items: [] };
  const tags = new Set(conf.tags || []);
  const excluded = new Set(conf.excludeItems || []);
  army.itemById = new Map();
  army.itemTypes = {};
  army.magicPools = (conf.pools || []).map((p) => ({ ...p, items: [] }));
  const poolFor = (catId) => army.magicPools.find((p) => (p.catalogues || []).includes(catId));

  const add = (item, pool, catalogue) => {
    const usable = (!item.tags || item.tags.some((t) => tags.has(t))) && !(item.excludeTags || []).some((t) => tags.has(t)) && !excluded.has(item.id);
    const it = { ...item, pool: pool?.id || "magic", catalogue: catalogue?.id || army.id, usable };
    army.itemById.set(it.id, it);
    if (usable && pool) pool.items.push(it);
  };
  for (const cat of catalogues) {
    // Dwarf runes are not items but parts of runic items the player puts together (see runicName below)
    if (cat.kind === "runes") {
      army.runes = { ...cat, byId: new Map(cat.runes.map((r) => [r.id, r])) };
      continue;
    }
    Object.assign(army.itemTypes, cat.types || {});
    const pool = poolFor(cat.id);
    for (const item of cat.items) add(item, pool, cat);
  }
  const ownPool = army.magicPools.find((p) => p.id === "magic") || army.magicPools[0];
  for (const item of conf.items || []) add(item, ownPool, null);
  for (const p of army.magicPools) p.items.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  return army;
}

export function extraItem(army, x) {
  return x.itemId ? army.itemById?.get(x.itemId) || null : null;
}
export function extraPoints(army, x) {
  if (x.runic) return runicPoints(army, x);
  const it = extraItem(army, x);
  return it ? it.points : Number(x.points) || 0;
}
export function extraName(army, x) {
  if (x.runic) return runicName(army, x);
  const it = extraItem(army, x);
  return it ? it.name : x.name || "";
}
export function extraType(army, x) {
  if (x.runic) return army.runes?.forms?.[x.runic]?.itemType || x.runic;
  const it = extraItem(army, x);
  return it ? it.type : x.type || (x.kind === "standard" ? "standard" : null);
}

// ---------- Dwarf runic items ----------
// A runic item is an extra { runic: form, runes: [runeId, ...], label? } where form is weapon, armour,
// talisman, standard or engineering. Its points are the sum of its runes; runes may repeat.
export function runeOf(army, id) {
  return army.runes?.byId.get(id) || null;
}
export function runicPoints(army, x) {
  return (x.runes || []).reduce((n, id) => n + (runeOf(army, id)?.points || 0), 0);
}
// "Rune of Fury ×2, Rune of Cleaving" in the order first chosen
export function runeList(army, ids) {
  const counts = new Map();
  for (const id of ids || []) counts.set(id, (counts.get(id) || 0) + 1);
  return [...counts].map(([id, n]) => `${runeOf(army, id)?.name || id}${n > 1 ? ` ×${n}` : ""}`).join(", ");
}
export function runicName(army, x) {
  const form = army.runes?.forms?.[x.runic]?.name || "Runic item";
  const runes = runeList(army, x.runes);
  return `${x.label || form}${runes ? ` (${runes})` : ""}`;
}
// Runes that may go on an item of this form, grouped for a picker
export function runeGroups(army, form, ctx = {}) {
  const f = army.runes?.forms?.[form];
  if (!f) return [];
  const all = army.runes.runes.filter((r) => r.type === f.runes
    && (!r.machines || !ctx.entryId || r.machines.includes(ctx.entryId))
    && (!r.runesmithOnly || ctx.runesmith)
    && (!r.battleStandardOnly || ctx.canStandard));
  return [
    { name: "Master runes (one per item, once per army)", runes: all.filter((r) => r.master) },
    { name: army.runes.types[f.runes]?.name || "Runes", runes: all.filter((r) => !r.master) },
  ].filter((g) => g.runes.length);
}

// Items for a picker, grouped by type, in the order the catalogue lists the types.
export function pickerGroups(army, poolId, { standardsOnly = false, noStandards = false, entryId = null, onlyType = null } = {}) {
  const pool = army.magicPools.find((p) => p.id === poolId);
  if (!pool) return [];
  const groups = [];
  for (const [type, def] of Object.entries(army.itemTypes)) {
    if (standardsOnly && type !== "standard") continue;
    if (noStandards && type === "standard") continue;
    if (onlyType && type !== onlyType) continue;
    const items = pool.items.filter((i) => i.type === type && (!i.entries || i.entries.includes(entryId)));
    if (items.length) groups.push({ type, name: def.name, items });
  }
  return groups;
}

// For a pool whose items must share one type (bloodlines): the type the list already uses, if any
export function usedType(army, list, poolId) {
  const pool = army.magicPools.find((p) => p.id === poolId);
  if (!pool?.oneType) return null;
  for (const s of list.selections) {
    const e = army.entries.find((x) => x.id === s.entryId);
    if (e?.[pool.oneType]) return e[pool.oneType];
    for (const x of s.extras || []) { const it = extraItem(army, x); if (it?.pool === poolId) return it.type; }
  }
  return null;
}

// Rule checks. `ctx` describes the selection: { label, uid, kind, race, wizard, canStandard, allowance }
export function checkItems(army, list, ctxFor) {
  const issues = [];
  const warn = (msg, uid) => issues.push({ msg, uid });
  const taken = new Map(); // itemId -> count

  for (const s of list.selections) {
    const ctx = ctxFor(s);
    if (!ctx) continue;
    const extras = s.extras || [];
    // allowance per pool (characters) and per Boss
    if (ctx.kind === "character") {
      for (const pool of army.magicPools) {
        const mine = extras.filter((x) => (extraItem(army, x)?.pool || x.pool || "magic") === pool.id);
        const allowed = ctx.allowance?.[pool.allowance] ?? 0;
        if (mine.length > allowed) warn(`${ctx.label}: ${mine.length} ${pool.name.toLowerCase()}, the maximum is ${allowed}.`, s.uid);
        // e.g. every Vampire must take at least one power
        if (pool.min && allowed > 0 && mine.length < pool.min)
          warn(`${ctx.label}: must have at least ${pool.min} ${pool.min === 1 ? pool.name.toLowerCase().replace(/s$/, "") : pool.name.toLowerCase()} (has ${mine.length}).`, s.uid);
      }
    }
    // the same item twice on one model
    const ids = extras.filter((x) => x.itemId).map((x) => `${x.onBoss ? "b" : "m"}|${x.itemId}`);
    for (const id of new Set(ids.filter((x, i) => ids.indexOf(x) !== i)))
      warn(`${ctx.label}: ${army.itemById.get(id.slice(2))?.name || "an item"} is chosen twice for the same model.`, s.uid);
    for (const need of army.magic?.itemNeeds || []) {
      if (extras.some((x) => !x.onBoss && x.itemId === need.item) && !extras.some((x) => need.needs.includes(x.itemId)))
        warn(`${ctx.label}: ${need.message}.`, s.uid);
    }
    // Dwarfs: one magic item of each kind per model, magic item cards and runic items together (Dwarfs p.24)
    if (army.magic?.onePerKind) {
      for (const onBoss of [false, true]) {
        const kinds = new Map();
        for (const x of extras.filter((e) => !!e.onBoss === onBoss)) {
          const k = army.magic.onePerKind[extraType(army, x)];
          if (k) kinds.set(k, (kinds.get(k) || 0) + 1);
        }
        const who = onBoss ? `${ctx.label} ${army.championName || "Boss"}` : ctx.label;
        for (const [k, n] of kinds) if (n > 1) warn(`${who}: ${n} magic items of the same kind (${k}); a model may carry only one of each kind (Dwarfs p.24).`, s.uid);
      }
    }
    // characters limited to some kinds of item (a Slayer Champion may only have a magic weapon)
    if (ctx.itemTypes) for (const x of extras) {
      const t = extraType(army, x);
      if (t && !ctx.itemTypes.includes(t)) warn(`${ctx.label}: may only carry a magic ${ctx.itemTypes.join(" or ")}, not ${extraName(army, x) || "this item"}.`, s.uid);
    }
    for (const x of extras.filter((e) => e.runic)) issues.push(...checkRunicItem(army, x, ctx, s, x.onBoss));
    const groups = [
      { who: ctx.label, items: extras.filter((x) => !x.onBoss), races: ctx.races || [ctx.race], wizard: ctx.wizard, canStandard: ctx.canStandard, kind: ctx.kind },
      { who: `${ctx.label} ${army.championName || "Boss"}`, items: extras.filter((x) => x.onBoss), races: ctx.races || [ctx.race], wizard: false, canStandard: false, kind: "boss" },
    ];
    for (const g of groups) {
      const wards = g.items.filter((x) => extraType(army, x) === "ward" || extraItem(army, x)?.ward);
      if (wards.length > 1) warn(`${g.who}: a model may never have more than one Ward (Warhammer Magic p.38).`, s.uid);
      for (const x of g.items) {
        const it = extraItem(army, x);
        const type = extraType(army, x);
        const name = extraName(army, x) || "Unnamed item";
        if (type === "standard" && g.kind !== "unit" && !g.canStandard)
          warn(`${g.who}: ${name} is a Magic Standard; only standard bearers and the Battle Standard Bearer may carry one.`, s.uid);
        if (g.kind === "unit" && !x.onBoss && type && type !== "standard" && type !== "engineering")
          warn(`${g.who}: ${name} is not a Magic Standard.`, s.uid);
        if (!it) continue;
        if (g.kind !== "boss" && (ctx.allowedItems || []).includes(it.id)) { taken.set(it.id, (taken.get(it.id) || 0) + 1); continue; }
        if (!it.usable) warn(`${g.who}: ${it.name} is not available to this army (${it.only || "restricted"}).`, s.uid);
        if (army.itemTypes[it.type]?.wizardOnly && !g.wizard) warn(`${g.who}: ${it.name} is Wizard Arcana and can only be used by wizards.`, s.uid);
        if (it.notWizard && g.wizard) warn(`${g.who}: ${it.name} cannot be used by a wizard.`, s.uid);
        if (it.entries && (g.kind === "boss" || !it.entries.includes(ctx.entryId))) warn(`${g.who}: ${it.name} is ${it.only || "a special character's item"}.`, s.uid);
        if (it.races && !g.races.some((r) => it.races.includes(r))) {
          const who = it.races.filter((r) => army.races?.[r]).map((r) => army.racePlurals?.[r] || `${army.races[r]}s`).join(" or ") || it.only;
          warn(`${g.who}: ${it.name} may only be used by ${who} (${it.only}).`, s.uid);
        }
        if (it.gods && g.kind !== "boss" && !it.gods.includes(ctx.god || "unaligned"))
          warn(`${g.who}: ${it.name} is ${it.only || "restricted to another god"}.`, s.uid);
        if (it.variants && (g.kind === "boss" || !it.variants.includes(ctx.variant)))
          warn(`${g.who}: ${it.name} is ${it.only || "not available to this character"}.`, s.uid);
        if (it.onFoot && g.kind !== "boss" && ctx.mounted)
          warn(`${g.who}: ${it.name} can only be used by a model on foot.`, s.uid);
        taken.set(it.id, (taken.get(it.id) || 0) + 1);
      }
    }
  }
  // pools whose items must all be of one type across the army (all Vampires share one bloodline);
  // special characters bring their own type in the entry field the pool names (e.g. "bloodline")
  for (const pool of army.magicPools) {
    if (!pool.oneType) continue;
    const types = new Map(); // type -> first carrier
    for (const s of list.selections) {
      const ctx = ctxFor(s);
      if (!ctx) continue;
      const own = [ctx.typeOf?.[pool.oneType], ...(s.extras || []).filter((x) => extraItem(army, x)?.pool === pool.id).map((x) => extraItem(army, x).type)];
      for (const t of own) if (t && !types.has(t)) types.set(t, ctx.label);
    }
    if (types.size > 1) {
      const name = (t) => army.itemTypes[t]?.name || t;
      warn(`${pool.oneTypeMessage || `${pool.name}: all must be of one type.`} Found ${[...types].map(([t, who]) => `${name(t)} (${who})`).join(", ")}.`);
    }
  }
  if (army.runes) issues.push(...checkRunesArmyWide(army, list, ctxFor));
  for (const [id, n] of taken) {
    const it = army.itemById.get(id);
    if (n > 1 && !it.multiple) warn(`${it.name} is taken ${n} times; each magic item may normally be taken only once per army.`);
  }
  return issues;
}

// Rules for one runic item (Dwarfs pp.24-30)
function checkRunicItem(army, x, ctx, s, onBoss) {
  const issues = [];
  const who = onBoss ? `${ctx.label} ${army.championName || "Boss"}` : ctx.label;
  const name = army.runes.forms[x.runic]?.name || "Runic item";
  const warn = (msg) => issues.push({ msg: `${who}: ${name}: ${msg}`, uid: s.uid });
  const form = army.runes.forms[x.runic];
  const runes = (x.runes || []).map((id) => runeOf(army, id)).filter(Boolean);
  if (!runes.length) warn("no runes chosen yet.");
  if (runes.length > 3) warn(`${runes.length} runes; no item may carry more than three (Rule of Three, p.24).`);
  for (const r of runes) if (form && r.type !== form.runes) warn(`${r.name} is not one of the ${army.runes.types[form.runes]?.name.toLowerCase()} (Rule of Form, p.24).`);
  const masters = runes.filter((r) => r.master);
  if (masters.length > 1) warn("more than one master rune on one item (p.24).");
  const count = (id) => runes.filter((r) => r.id === id).length;
  for (const r of new Set(runes)) {
    if (r.maxPerItem && count(r.id) > r.maxPerItem) warn(`${r.name} may be used only once on an item (p.${r.page}).`);
    if (r.master && count(r.id) > 1) warn(`${r.name} may be used only once (p.24).`);
    if (r.alone && runes.length > 1) warn(`${r.name} cannot be combined with any other armour rune (p.${r.page}).`);
    if (r.battleStandardOnly && (onBoss || !ctx.canStandard)) warn(`${r.name} may only be placed on the battle standard (p.${r.page}).`);
    if (r.runesmithOnly && (onBoss || !ctx.runesmith)) warn(`${r.name} may only be used by a Runesmith (p.${r.page}).`);
    if (r.machines && !r.machines.includes(ctx.entryId)) warn(`${r.name} is ${r.only} (p.${r.page}).`);
  }
  if (x.runic === "armour" && !onBoss && ctx.kind === "character" && !ctx.hasArmour)
    warn("armour runes need armour or a shield to be inscribed on (p.27).");
  if (x.runic === "standard" && ctx.kind === "character" && !ctx.canStandard)
    warn("only the Battle Standard Bearer or a unit's standard bearer may carry a runic standard (p.28).");
  if (x.runic === "engineering" && !ctx.engineering) warn("engineering runes can only be inscribed on Dwarf war machines (p.29).");
  return issues;
}

// Master runes once per army (Jealous Runes) and no two items with the same runes (Rule of Pride), p.24.
// Special characters' own runic items count too.
function checkRunesArmyWide(army, list, ctxFor) {
  const issues = [];
  const items = []; // { who, uid, runes: [ids] }
  for (const s of list.selections) {
    const ctx = ctxFor(s);
    if (!ctx) continue;
    for (const x of (s.extras || []).filter((e) => e.runic)) items.push({ who: ctx.label, uid: s.uid, runes: x.runes || [] });
    for (const it of ctx.fixedRunic || []) items.push({ who: ctx.label, uid: s.uid, runes: it.runes, fixed: true });
  }
  const masters = new Map();
  for (const it of items) for (const id of new Set(it.runes)) {
    const r = runeOf(army, id);
    if (r?.master) masters.set(id, [...(masters.get(id) || []), it.who]);
  }
  for (const [id, whos] of masters) if (whos.length > 1)
    issues.push({ msg: `${runeOf(army, id).name} is used ${whos.length} times (${whos.join(", ")}); each master rune may be used only once on the battlefield (p.24).` });
  const combos = new Map();
  for (const it of items) {
    if (!it.runes.length) continue;
    const key = [...it.runes].sort().join("+");
    if (it.runes.every((id) => runeOf(army, id)?.prideExempt)) continue; // a lone Rune of Stone
    combos.set(key, [...(combos.get(key) || []), it]);
  }
  for (const [, its] of combos) if (its.length > 1)
    issues.push({ msg: `${runeList(army, its[0].runes)}: the same combination of runes is on ${its.length} items (${its.map((i) => i.who).join(", ")}); no two items may carry the same runes (Rule of Pride, p.24).` });
  return issues;
}
