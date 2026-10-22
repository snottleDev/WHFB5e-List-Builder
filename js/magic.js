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
  army.itemById = new Map();
  army.itemTypes = {};
  army.magicPools = (conf.pools || []).map((p) => ({ ...p, items: [] }));
  const poolFor = (catId) => army.magicPools.find((p) => (p.catalogues || []).includes(catId));

  const add = (item, pool, catalogue) => {
    const usable = (!item.tags || item.tags.some((t) => tags.has(t))) && !(item.excludeTags || []).some((t) => tags.has(t));
    const it = { ...item, pool: pool?.id || "magic", catalogue: catalogue?.id || army.id, usable };
    army.itemById.set(it.id, it);
    if (usable && pool) pool.items.push(it);
  };
  for (const cat of catalogues) {
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
  const it = extraItem(army, x);
  return it ? it.points : Number(x.points) || 0;
}
export function extraName(army, x) {
  const it = extraItem(army, x);
  return it ? it.name : x.name || "";
}
export function extraType(army, x) {
  const it = extraItem(army, x);
  return it ? it.type : x.type || (x.kind === "standard" ? "standard" : null);
}

// Items for a picker, grouped by type, in the order the catalogue lists the types.
export function pickerGroups(army, poolId, { standardsOnly = false, noStandards = false, entryId = null } = {}) {
  const pool = army.magicPools.find((p) => p.id === poolId);
  if (!pool) return [];
  const groups = [];
  for (const [type, def] of Object.entries(army.itemTypes)) {
    if (standardsOnly && type !== "standard") continue;
    if (noStandards && type === "standard") continue;
    const items = pool.items.filter((i) => i.type === type && (!i.entries || i.entries.includes(entryId)));
    if (items.length) groups.push({ type, name: def.name, items });
  }
  return groups;
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
      }
    }
    const groups = [
      { who: ctx.label, items: extras.filter((x) => !x.onBoss), races: ctx.races || [ctx.race], wizard: ctx.wizard, canStandard: ctx.canStandard, kind: ctx.kind },
      { who: `${ctx.label} ${army.championName || "Boss"}`, items: extras.filter((x) => x.onBoss), races: ctx.races || [ctx.race], wizard: false, canStandard: false, kind: "boss" },
    ];
    for (const g of groups) {
      const wards = g.items.filter((x) => extraType(army, x) === "ward");
      if (wards.length > 1) warn(`${g.who}: a model may never have more than one Ward (Warhammer Magic p.38).`, s.uid);
      for (const x of g.items) {
        const it = extraItem(army, x);
        const type = extraType(army, x);
        const name = extraName(army, x) || "Unnamed item";
        if (type === "standard" && g.kind !== "unit" && !g.canStandard)
          warn(`${g.who}: ${name} is a Magic Standard; only standard bearers and the Battle Standard Bearer may carry one.`, s.uid);
        if (g.kind === "unit" && !x.onBoss && type && type !== "standard")
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
        taken.set(it.id, (taken.get(it.id) || 0) + 1);
      }
    }
  }
  for (const [id, n] of taken) {
    const it = army.itemById.get(id);
    if (n > 1 && !it.multiple) warn(`${it.name} is taken ${n} times; each magic item may normally be taken only once per army.`);
  }
  return issues;
}
