import { findEntry, variantOf, selectionCost, computeSave, listTotals, validate, fmt, canHaveBoss, bossCost, unitSize } from "./calc.js";
import { exportPdf, rosterRows } from "./pdf.js";
import { attachMagic, extraItem, pickerGroups, usedType, runeOf, runicPoints, runeGroups } from "./magic.js";
import { itemContext, defaultNotes, parentOf, attachedParent, bossName, retinueValue, isWarlord, selLabel } from "./calc.js";

const STORE_KEY = "whfb5e.lists.v1";
const app = document.getElementById("app");
const armies = {}; // id -> army data
let armyIndex = [];
const open = new Set(); // expanded selection uids

// ---------- storage ----------
function loadLists() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; } catch { return []; }
}
function saveLists(lists) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(lists)); } catch (e) { console.warn("Could not save", e); }
}
let lists = loadLists();
function getList(id) { return lists.find((l) => l.id === id); }
function persist() { saveLists(lists); }
const uid = () => Math.random().toString(36).slice(2, 10);

async function loadArmy(id) {
  if (armies[id]) return armies[id];
  const meta = armyIndex.find((a) => a.id === id);
  const res = await fetch(`data/armies/${meta.file}`, { cache: "no-cache" });
  let army = await res.json();
  // armies sharing one entry list (Realm of Chaos) point to it with "base"; their own keys win
  if (army.base) army = { ...(await (await fetch(`data/armies/${army.base}`, { cache: "no-cache" })).json()), ...army };
  const catIds = [...new Set([...(army.magic?.pools || []).flatMap((p) => p.catalogues || []), ...(army.magic?.runes ? [army.magic.runes] : [])])];
  const catalogues = await Promise.all(catIds.map((c) => fetch(`data/magic/${c}.json`, { cache: "no-cache" }).then((r) => r.json())));
  armies[id] = attachMagic(army, catalogues);
  return armies[id];
}

// ---------- tiny DOM helper ----------
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else if (k === "value") el.value = v;
    else if (k === "checked") el.checked = !!v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

// ---------- routing ----------
window.addEventListener("hashchange", route);
async function route() {
  const m = location.hash.match(/^#\/list\/(\w+)/);
  if (m && getList(m[1])) {
    const list = getList(m[1]);
    await loadArmy(list.armyId);
    renderEditor(list);
  } else renderHome();
}

// ---------- home ----------
function renderHome() {
  const nameIn = h("input", { type: "text", placeholder: "e.g. The Endless Horde", value: "" });
  const armySel = h("select", {}, armyIndex.map((a) => h("option", { value: a.id }, a.name)));
  const ptsIn = h("input", { type: "number", value: 2000, min: 0, step: 50 });
  const fileIn = h("input", { type: "file", accept: "application/json", style: "display:none", onchange: importJson });

  const create = () => {
    const list = { id: uid(), name: nameIn.value.trim() || "Untitled army", armyId: armySel.value, points: Number(ptsIn.value) || 2000, selections: [], created: Date.now() };
    lists.unshift(list); persist();
    location.hash = `#/list/${list.id}`;
  };

  const rows = lists.map((l) => {
    const meta = armyIndex.find((a) => a.id === l.armyId);
    return h("tr", {},
      h("td", {}, h("a", { href: `#/list/${l.id}` }, l.name)),
      h("td", {}, meta ? meta.name : l.armyId),
      h("td", {}, `${l.points} pts`),
      h("td", { class: "actions" },
        h("button", { class: "btn small ghost", onclick: () => { const c = structuredClone(l); c.id = uid(); c.name += " (copy)"; lists.unshift(c); persist(); renderHome(); } }, "Duplicate"),
        h("button", { class: "btn small ghost", onclick: () => { if (confirm(`Delete "${l.name}"?`)) { lists = lists.filter((x) => x !== l); persist(); renderHome(); } } }, "Delete")));
  });

  app.replaceChildren(
    h("section", { class: "panel" },
      h("h2", {}, "New army list"),
      h("div", { class: "form-row" },
        h("label", {}, "Name", nameIn),
        h("label", {}, "Army", armySel),
        h("label", {}, "Points", ptsIn),
        h("button", { class: "btn primary", onclick: create }, "Create list"))),
    h("section", { class: "panel" },
      h("div", { class: "cat-head" }, h("h2", {}, "Your lists"),
        h("div", {}, fileIn, h("button", { class: "btn small", onclick: () => fileIn.click() }, "Import list (.json)"))),
      lists.length ? h("table", { class: "lists" },
        h("thead", {}, h("tr", {}, h("th", {}, "Name"), h("th", {}, "Army"), h("th", {}, "Points"), h("th", {}))),
        h("tbody", {}, rows))
        : h("p", { class: "empty" }, "No lists yet. Lists are saved in this browser.")));
}

function importJson(e) {
  const f = e.target.files[0];
  if (!f) return;
  f.text().then((txt) => {
    try {
      const l = JSON.parse(txt);
      if (!l.armyId || !Array.isArray(l.selections)) throw new Error("Not a list file");
      l.id = uid(); lists.unshift(l); persist(); renderHome();
    } catch (err) { alert("Could not import: " + err.message); }
  });
}

// ---------- editor ----------
let current = null; // { list, army }

function renderEditor(list) {
  const army = armies[list.armyId];
  current = { list, army };
  const fileName = (list.name || "army").replace(/[^\w\- ]+/g, "").trim() || "army";

  const head = h("div", { class: "ed-head" },
    h("div", { class: "ed-title" },
      h("a", { href: "#/", class: "btn small ghost" }, "← Lists"),
      h("input", { type: "text", class: "name", value: list.name, "aria-label": "List name",
        oninput: (e) => { list.name = e.target.value; persist(); } }),
      h("span", {}, army.name, " · "),
      h("input", { type: "number", value: list.points, min: 0, step: 50, "aria-label": "Points limit",
        oninput: (e) => { list.points = Number(e.target.value) || 0; persist(); refreshSummary(); } }),
      h("span", {}, "pts")),
    h("div", { class: "ed-actions" },
      h("button", { class: "btn primary", onclick: () => exportPdf(army, list) }, "Export PDF"),
      h("button", { class: "btn", onclick: (e) => copyText(army, list, e.target) }, "Copy as text"),
      h("button", { class: "btn", onclick: () => download(`${fileName}.json`, JSON.stringify(list, null, 2), "application/json") }, "Save .json")));

  const summary = h("div", { class: "sticky", id: "summary" });
  const warnings = h("div", { id: "warnings" });
  const cats = army.categories.map((c) => renderCategory(army, list, c));
  app.replaceChildren(head, summary, warnings, ...cats,
    h("p", { class: "note" }, `Source: ${army.source}. Points are shown exactly; halves (½) are not rounded.`));
  refreshSummary();
}

function renderCategory(army, list, cat) {
  const entries = army.entries.filter((e) => e.category === cat.id);
  const normal = entries.filter((e) => !e.special), special = entries.filter((e) => e.special);
  const sel = h("select", { "aria-label": `Add to ${cat.name}` },
    h("option", { value: "" }, `Add ${cat.name.toLowerCase()}…`),
    h("optgroup", { label: cat.name }, normal.map((e) => h("option", { value: e.id }, entryLabel(e)))),
    special.length ? h("optgroup", { label: "Special characters" }, special.map((e) => h("option", { value: e.id }, entryLabel(e)))) : null);
  sel.addEventListener("change", () => {
    if (!sel.value) return;
    const s = newSelection(army, findEntry(army, sel.value));
    list.selections.push(s); open.add(s.uid); persist();
    renderEditor(list);
    document.getElementById(`sel-${s.uid}`)?.scrollIntoView({ block: "center" });
  });
  const limit = cat.max != null ? `max ${cat.max}%` : cat.min != null ? `min ${cat.min}%` : "";
  return h("section", { class: "cat" },
    h("div", { class: "cat-head" }, h("h2", {}, cat.name), h("span", { class: "meta", id: `cat-meta-${cat.id}` }, limit), h("div", { class: "adder" }, sel)),
    list.selections.filter((s) => findEntry(army, s.entryId)?.category === cat.id).map((s) => renderCard(army, list, s)));
}

function entryLabel(e) {
  let pts = "";
  if (e.cost != null) pts = ` (${fmt(e.cost)} pts${e.kind === "unit" && !e.noCommand ? "/model" : ""})`;
  return `${e.max === 1 ? "0-1 " : ""}${e.name}${pts}`;
}

function newSelection(army, e) {
  const s = { uid: uid(), entryId: e.id, options: {}, extras: [] };
  if (e.variants) s.variant = e.variants[0].id;
  if (e.roles) s.role = e.roles[0].id;
  if (e.kind === "character") s.gear = [];
  if (e.kind === "unit") {
    if (e.models) { s.models = {}; for (const m of e.models) s.models[m.id] = m.id === "team" ? 3 : 0; }
    else s.size = e.minSize || 1;
    if (!e.noCommand) s.boss = { enabled: false, options: {} };
  }
  if (e.kind === "monster") s.size = 1;
  for (const id of e.startingItems || []) s.extras.push({ itemId: id });
  return s;
}

function titleOf(army, s) {
  const e = findEntry(army, s.entryId);
  const v = variantOf(e, s);
  if (s.parent && current) {
    const p = parentOf(current.list, s);
    if (p) return `${unitSize(e, s)} ${v?.name || e.name} – detachment of ${p.name || findEntry(army, p.entryId).name}`;
  }
  if (s.attachedTo && current) {
    const p = attachedParent(current.list, s);
    const base = e.kind === "character" ? (v?.name || e.name) : `${unitSize(e, s)} ${v?.name || e.name}`;
    if (p) return `${base} – ${(e.attachTo.label || "with").toLowerCase()} ${selLabel(army, p)}`;
  }
  if (e.kind === "unit" && !e.noCommand) return `${unitSize(e, s)} ${v?.name || e.name}`;
  if (e.kind === "unit" || e.kind === "monster") return `${s.size} × ${v?.name || e.name}`;
  return v?.name || e.name;
}

function renderCard(army, list, s) {
  const e = findEntry(army, s.entryId);
  const cost = selectionCost(army, s);
  const isOpen = open.has(s.uid);
  const change = () => { persist(); renderEditor(list); };

  const headEl = h("div", { class: "card-head", onclick: (ev) => {
      if (ev.target.closest("button")) return;
      isOpen ? open.delete(s.uid) : open.add(s.uid); renderEditor(list);
    } },
    h("span", { "aria-hidden": "true" }, isOpen ? "▾" : "▸"),
    h("div", { class: "t" }, h("b", {}, s.name || titleOf(army, s)), s.name ? h("small", {}, titleOf(army, s)) : h("small", {}, `p.${e.page}`)),
    h("span", { class: "pts" }, `${fmt(cost.total)} pts`),
    h("button", { class: "btn small ghost", title: "Duplicate", onclick: () => {
      const c = structuredClone(s); c.uid = uid();
      list.selections.splice(list.selections.indexOf(s) + 1, 0, c); change(); } }, "Copy"),
    h("button", { class: "btn small ghost", title: "Remove", onclick: () => {
      list.selections = list.selections.filter((x) => x !== s); change(); } }, "Remove"));

  const card = h("article", { class: "card", id: `sel-${s.uid}` }, headEl);
  if (!isOpen) return card;

  const body = h("div", { class: "card-body" });
  const field = (label, ...kids) => h("div", { class: "field" }, h("span", { class: "lbl" }, label), ...kids);

  body.append(field("Name",
    h("input", { type: "text", value: s.name || "", placeholder: "Custom name (optional)",
      oninput: (ev) => { s.name = ev.target.value; persist(); } , onchange: change })));

  if (e.variants) {
    body.append(field(e.variantsLabel || "Type",
      h("select", { onchange: (ev) => { s.variant = ev.target.value; change(); } },
        e.variants.map((v) => h("option", { value: v.id, selected: v.id === s.variant ? true : null },
          `${v.name}${v.cost != null ? ` (${fmt(v.cost)})` : ""}`)))));
  }
  if (e.roles) {
    body.append(field("Role",
      h("select", { onchange: (ev) => { s.role = ev.target.value; change(); } },
        e.roles.map((r) => h("option", { value: r.id, selected: r.id === s.role ? true : null }, r.name)))));
  }

  // size
  if (e.kind === "unit" || e.kind === "monster") {
    if (e.models) {
      body.append(field("Models", e.models.map((m) =>
        h("label", { class: "opt" }, `${m.name} (${m.cost} pts${m.counts > 1 ? `, counts as ${m.counts}` : ""})`,
          h("input", { type: "number", min: 0, value: s.models[m.id] || 0, onchange: (ev) => { s.models[m.id] = Math.max(0, Number(ev.target.value) || 0); change(); } })))));
    } else {
      body.append(field(e.sizeLabel ? e.sizeLabel[0].toUpperCase() + e.sizeLabel.slice(1) : (e.kind === "monster" ? "Number" : "Models"),
        h("input", { type: "number", min: 1, value: s.size, onchange: (ev) => { s.size = Math.max(0, Number(ev.target.value) || 0); change(); } }),
        e.kind === "unit" && !e.noCommand ? h("small", { class: "note" }, `including leader, standard, musician and ${(army.championName || "Boss").toLowerCase()}`) : null));
    }
  }

  // detachments (Empire state troops)
  if (e.stateTroops && (army.rules || []).some((r) => r.type === "detachments")) {
    const parents = list.selections.filter((x) => x !== s && !x.parent && findEntry(army, x.entryId)?.stateTroops);
    body.append(field("Detachment",
      h("select", { onchange: (ev) => {
          s.parent = ev.target.value || undefined;
          if (s.parent) { s.standard = false; s.musician = false; if (s.boss) s.boss.enabled = false; }
          change(); } },
        h("option", { value: "" }, "Independent regiment"),
        parents.map((p) => h("option", { value: p.uid, selected: p.uid === s.parent ? true : null },
          `Detachment of: ${p.name || titleOf(army, p)}`))),
      h("small", { class: "note" }, "max half the size of its regiment; no standard, musician or champion")));
  }

  // units or characters that go with a regiment (Skaven war teams, Assassins, Undead Champions)
  if (e.attachTo) {
    const a = e.attachTo;
    const parents = list.selections.filter((x) => x !== s && a.entries.includes(x.entryId));
    body.append(field(a.label || "With",
      h("select", { onchange: (ev) => {
          s.attachedTo = ev.target.value || undefined;
          if (s.attachedTo && e.kind === "unit" && !a.retinue) { s.standard = false; s.musician = false; if (s.boss) s.boss.enabled = false; }
          change(); } },
        h("option", { value: "" }, a.required ? "— choose a regiment —" : (a.alone || "On its own")),
        parents.map((p) => h("option", { value: p.uid, selected: p.uid === s.attachedTo ? true : null }, p.name || titleOf(army, p)))),
      a.hint ? h("small", { class: "note" }, a.hint) : null));
  }

  // options
  const opts = e.options || [];
  if (opts.length) {
    const groups = {};
    const parts = [];
    for (const o of opts) {
      const priceTxt = `${o.cost >= 0 ? "+" : ""}${fmt(o.cost)}${perLabel(o, e)}`;
      if (o.count) {
        parts.push(h("label", { class: "opt" }, `${o.name}`, h("small", {}, priceTxt),
          h("input", { type: "number", min: 0, max: o.max ?? null, value: s.options[o.id] || 0,
            onchange: (ev) => { s.options[o.id] = Math.max(0, Number(ev.target.value) || 0); change(); } })));
      } else if (o.group) {
        groups[o.group] = groups[o.group] || [];
        groups[o.group].push(o);
        if (groups[o.group].length === 1) parts.push(groups[o.group]); // placeholder by reference
      } else {
        parts.push(h("label", { class: "opt" },
          h("input", { type: "checkbox", checked: !!s.options[o.id], onchange: (ev) => { s.options[o.id] = ev.target.checked; change(); } }),
          o.name, h("small", {}, priceTxt)));
      }
    }
    const rendered = parts.map((p) => {
      if (!Array.isArray(p)) return p;
      const name = `g-${s.uid}-${p[0].group}`;
      return h("span", { class: "opt" }, h("select", { name, onchange: (ev) => {
          for (const o of p) s.options[o.id] = o.id === ev.target.value; change(); } },
        h("option", { value: "" }, e.groupLabels?.[p[0].group] || (p[0].group === "weapon" ? "Standard weapons" : "None")),
        p.map((o) => h("option", { value: o.id, selected: s.options[o.id] ? true : null }, `${o.name} (+${fmt(o.cost)})`))));
    });
    body.append(field("Options", rendered));
  }

  // command (detachments have none)
  if (e.kind === "unit" && !e.noCommand && !s.parent && (!s.attachedTo || e.attachTo?.retinue)) {
    const cmd = [];
    if (!e.noStandard) cmd.push(h("label", { class: "opt" }, h("input", { type: "checkbox", checked: !!s.standard, onchange: (ev) => { s.standard = ev.target.checked; change(); } }), "Standard"));
    if (!e.noMusician) cmd.push(h("label", { class: "opt" }, h("input", { type: "checkbox", checked: !!s.musician, onchange: (ev) => { s.musician = ev.target.checked; change(); } }), "Musician"));
    if (canHaveBoss(army, e)) {
      const from = army.championCategory === "unit" ? "" : ", from Characters";
      if (e.bossLevels) {
        // a choice of leader (e.g. Ogre Champion, Chief or War Chief)
        const cur = s.boss?.enabled ? (s.boss.level || e.bossLevels[0].id) : "";
        cmd.push(h("span", { class: "opt" }, h("select", { "aria-label": "Leader", onchange: (ev) => {
            s.boss = s.boss || { options: {} };
            s.boss.enabled = !!ev.target.value; s.boss.level = ev.target.value || undefined; change(); } },
          h("option", { value: "" }, "No leader"),
          e.bossLevels.map((l) => h("option", { value: l.id, selected: l.id === cur ? true : null },
            `${l.name} (${fmt(bossCost(army, e, { ...s, boss: { ...s.boss, level: l.id } }))} pts${l.minSize ? `, unit of ${l.minSize}+` : ""})`)))));
      } else {
        cmd.push(h("label", { class: "opt" }, h("input", { type: "checkbox", checked: !!s.boss?.enabled,
          onchange: (ev) => { s.boss = s.boss || { options: {} }; s.boss.enabled = ev.target.checked; change(); } }),
          bossName(army, e, s), h("small", {}, `${fmt(bossCost(army, e, s))} pts${from}`)));
      }
      for (const o of e.bossOptions || []) {
        if (s.boss?.enabled) cmd.push(h("label", { class: "opt" }, h("input", { type: "checkbox", checked: !!s.boss.options?.[o.id],
          onchange: (ev) => { s.boss.options = s.boss.options || {}; s.boss.options[o.id] = ev.target.checked; change(); } }), `${bossName(army, e, s)}: ${o.name.toLowerCase()}`, h("small", {}, `+${o.cost}`)));
      }
    }
    if (cmd.length) body.append(field("Command", cmd));
  }

  // Chaos Warlords: how much their retinue is worth
  if (isWarlord(army, s) && (army.rules || []).some((r) => r.type === "retinues")) {
    const ret = retinueValue(army, list, s), own = cost.total;
    body.append(field("Retinue", h("span", { class: ret >= own ? "" : "warn-text" },
      `${fmt(ret)} pts in units attached to this Warlord; needs at least ${fmt(own)} pts`)));
  }

  // character gear & mounts
  if (e.kind === "character") {
    if (e.equipmentList) {
      body.append(field("Equipment", h("small", { class: "note" }, `${e.equipmentText}, plus:`),
        army.equipment.filter((g) => !g.troopOnly && (!g.races || g.races.includes(variantOf(e, s)?.race || e.race))).map((g) => h("label", { class: "opt" },
          h("input", { type: "checkbox", checked: (s.gear || []).includes(g.id), onchange: (ev) => {
            s.gear = (s.gear || []).filter((x) => x !== g.id); if (ev.target.checked) s.gear.push(g.id); change(); } }),
          g.name, h("small", {}, `+${g.cost}`)))));
    } else if (e.equipmentText) {
      body.append(field("Equipment", h("span", {}, e.equipmentText)));
    }
    const mountOpts = mountOptions(army, e, s);
    if (mountOpts.length > 1) {
      body.append(field("Mount",
        h("select", { onchange: (ev) => { s.mount = ev.target.value || null; change(); } },
          mountOpts.map(([val, label]) => h("option", { value: val, selected: (s.mount || "") === val ? true : null }, label)))));
    }
  }

  // magic items / standards (placeholder until magic item cards are added)
  body.append(renderExtras(army, e, s, change, list));

  // roster details
  const autoSave = computeSave(army, s);
  body.append(field("Save",
    h("input", { type: "text", value: s.save ?? "", placeholder: autoSave, style: "width:90px",
      oninput: (ev) => { s.save = ev.target.value || undefined; persist(); } }),
    h("small", { class: "note" }, `calculated: ${autoSave} — type to override`)));
  body.append(field("Notes",
    h("textarea", { placeholder: defaultNotes(army, s) || "Special rules shown in the roster's Notes column",
      oninput: (ev) => { s.notes = ev.target.value; persist(); } }, s.notes ?? defaultNotes(army, s))));

  body.append(renderProfiles(army, s));
  body.append(h("div", { class: "breakdown" }, cost.lines.map((l) => `${l.label}: ${fmt(l.pts)}${l.cat !== e.category ? ` (${catName(army, l.cat)})` : ""}`).join(" · ")));
  if (e.notes) body.append(h("p", { class: "note" }, e.notes));
  body.append(h("p", { class: "note" }, `Army book p.${e.page}`));

  card.append(body);
  return card;
}

function perLabel(o, e) {
  if (e.kind === "character") return "";
  if (o.perModel) return ` per ${(e.models.find((m) => m.id === o.perModel)?.name || o.perModel).replace(/s$/, "").toLowerCase()}`;
  const per = o.per || "model";
  if (per === "model" && e.sizeLabel) return " each";
  return { model: "/model", unit: " each", chariot: "/chariot", crew: "/crewman" }[per] || "";
}
function catName(army, id) { return army.categories.find((c) => c.id === id)?.name || id; }

function mountOptions(army, e, s) {
  const out = [["", "On foot"]];
  const race = variantOf(e, s)?.race || e.race;
  if (e.mountChart) {
    for (const m of army.mounts) if (!m.specialOnly && (!m.races || m.races.includes(race))) out.push([`mount:${m.id}`, `${m.name} (+${m.cost})`]);
  }
  for (const id of e.mounts || []) {
    const m = army.mounts.find((x) => x.id === id);
    if (m && (!m.races || m.races.includes(race))) out.push([`mount:${m.id}`, `${m.name} (+${m.cost})`]);
  }
  if (e.chariots) {
    for (const id of army.characterChariots || []) {
      const c = findEntry(army, id);
      out.push([`chariot:${c.id}`, `${c.name} (+${fmt(c.cost)})`]);
    }
  }
  if (e.monsters) {
    for (const m of army.entries.filter((x) => x.kind === "monster" && !x.notMount)) {
      if (m.variants) for (const v of m.variants) out.push([`monster:${m.id}/${v.id}`, `${v.name} (+${v.cost ?? m.cost})`]);
      else out.push([`monster:${m.id}`, `${m.name} (+${m.cost})`]);
    }
  }
  return out;
}

function renderExtras(army, e, s, change, list = null) {
  s.extras = s.extras || [];
  const ctx = itemContext(army, s);
  const isChar = e.kind === "character";
  const canStd = e.kind === "unit" && e.magicStandard;
  const bossOk = e.kind === "unit" && s.boss?.enabled && e.bossItems !== false;
  const engineering = !!(army.runes && e.engineering);
  if (!isChar && !canStd && !bossOk && !engineering && !s.extras.length) return document.createDocumentFragment();

  const typeName = (t) => army.itemTypes?.[t]?.name?.replace(/s$/, "") || (t === "standard" ? "Magic Standard" : "Item");
  const rows = s.extras.map((x, i) => {
    const it = extraItem(army, x);
    const remove = h("button", { class: "btn small ghost", title: "Remove", onclick: () => { s.extras.splice(i, 1); change(); } }, "×");
    const who = x.onBoss ? `${army.championName || "Boss"} · ` : "";
    if (x.runic) return runicRow(army, e, s, x, ctx, who, remove, change);
    if (it) {
      return h("div", { class: "extras-row item" },
        h("b", {}, it.name), h("span", { class: "pts-sm" }, `${fmt(it.points)} pts`),
        h("small", {}, `${who}${typeName(it.type)}${it.only ? ` · ${it.only}` : ""}${it.uses ? ` · ${it.uses === 1 ? "one use" : `${it.uses} uses`}` : ""} · ${it.book || "WM"} p.${it.page}`),
        remove);
    }
    return h("div", { class: "extras-row" },
      h("input", { type: "text", value: x.name || "", placeholder: "Item name", oninput: (ev) => { x.name = ev.target.value; persist(); }, onchange: change }),
      h("input", { type: "number", value: x.points ?? 0, min: 0, "aria-label": "points", onchange: (ev) => { x.points = Number(ev.target.value) || 0; change(); } }),
      h("small", {}, `${who}custom ${x.kind === "standard" || x.type === "standard" ? "magic standard" : "item"}`),
      remove);
  });

  // one picker per purpose; "custom" adds a free-text row for anything not in the catalogue
  const picker = (label, opts, make, pool = "magic") => {
    // pools that must share one type (Vampire bloodlines) only offer the type the army already uses
    const onlyType = list ? usedType(army, list, pool) : null;
    const groups = pickerGroups(army, pool, { ...opts, entryId: e.id, onlyType });
    const sel = h("select", { "aria-label": label },
      h("option", { value: "" }, label),
      groups.map((g) => h("optgroup", { label: g.name },
        g.items.map((it) => h("option", { value: it.id }, `${it.name} (${fmt(it.points)})${it.only ? ` – ${it.only}` : ""}`)))),
      h("optgroup", { label: "Other" }, h("option", { value: "__custom" }, "Custom item (type name and points)…")));
    sel.addEventListener("change", () => {
      if (!sel.value) return;
      s.extras.push(sel.value === "__custom" ? { custom: true, name: "", points: 0, ...make(true) } : { itemId: sel.value, ...make(false) });
      change();
    });
    return sel;
  };
  const pickers = [];
  if (isChar) {
    const v = variantOf(e, s);
    const allowed = v?.magicItems ?? e.magicItems ?? 0;
    const poolOf = (x) => extraItem(army, x)?.pool || x.pool || "magic";
    const used = s.extras.filter((x) => !x.onBoss && poolOf(x) === "magic").length;
    // other pools (e.g. Daemonic Rewards) get their own picker when the character has an allowance for them
    const others = (army.magicPools || []).filter((p) => p.id !== "magic" && (ctx.allowance?.[p.allowance] || 0) > 0);
    if (allowed > 0 || !others.length)
      pickers.push(picker(`+ Magic item (${used}/${allowed})`, ctx.canStandard ? {} : { noStandards: true }, (custom) => (custom ? { kind: "item" } : {})));
    for (const p of others) {
      const n = s.extras.filter((x) => poolOf(x) === p.id).length;
      pickers.push(picker(`+ ${p.name.replace(/s$/, "")} (${n}/${ctx.allowance[p.allowance]})`, {}, (custom) => (custom ? { kind: "item", pool: p.id } : {}), p.id));
    }
  }
  if (canStd) pickers.push(picker("+ Magic standard", { standardsOnly: true }, (custom) => (custom ? { kind: "standard", type: "standard" } : {})));
  // Dwarf runic items: an empty item of the chosen kind, then runes are added to it one by one
  if (army.runes) {
    const forms = army.runes.forms;
    const runicPicker = (label, ids, extra = {}) => {
      const sel = h("select", { "aria-label": label }, h("option", { value: "" }, label),
        ids.map((id) => h("option", { value: id }, `${forms[id].name} (${army.runes.types[forms[id].runes].name.toLowerCase()})`)));
      sel.addEventListener("change", () => { if (sel.value) { s.extras.push({ runic: sel.value, runes: [], ...extra }); change(); } });
      return sel;
    };
    const allowed = (ids) => ids.filter((id) => !ctx.itemTypes || ctx.itemTypes.includes(forms[id].itemType));
    if (isChar) pickers.push(runicPicker("+ Runic item", allowed(["weapon", "armour", "talisman", ...(ctx.canStandard ? ["standard"] : [])])));
    if (canStd) pickers.push(runicPicker("+ Runic standard", ["standard"]));
    if (bossOk) pickers.push(runicPicker(`+ ${army.championName || "Boss"} runic item`, ["weapon", "armour", "talisman"], { onBoss: true }));
    if (engineering) pickers.push(runicPicker("+ Engineering runes", ["engineering"]));
  }
  if (bossOk) pickers.push(picker(`+ ${army.championName || "Boss"} magic item (max 1)`, { noStandards: true }, (custom) => (custom ? { kind: "item", onBoss: true } : { onBoss: true })));
  return h("div", { class: "field" }, h("span", { class: "lbl" }, "Magic"),
    h("div", { class: "extras" }, rows, h("div", { class: "extras-row" }, pickers)));
}

// One runic item: its runes as removable chips, a picker for the next rune, and the item's total
function runicRow(army, e, s, x, ctx, who, remove, change) {
  x.runes = x.runes || [];
  const form = army.runes.forms[x.runic];
  const chips = x.runes.map((id, j) => {
    const r = runeOf(army, id);
    return h("span", { class: "rune" }, r?.name || id, h("small", {}, ` ${fmt(r?.points || 0)}`),
      h("button", { class: "btn small ghost", title: "Remove rune", onclick: () => { x.runes.splice(j, 1); change(); } }, "×"));
  });
  const groups = runeGroups(army, x.runic, { ...ctx, canStandard: ctx.canStandard && !x.onBoss, runesmith: ctx.runesmith && !x.onBoss });
  const add = h("select", { "aria-label": "Add rune" }, h("option", { value: "" }, x.runes.length >= 3 ? "Three runes (the maximum)" : "+ Rune"),
    groups.map((g) => h("optgroup", { label: g.name }, g.runes.map((r) =>
      h("option", { value: r.id }, `${r.name} (${fmt(r.points)}) – ${r.effect}${r.only ? `; ${r.only}` : ""}`)))));
  add.addEventListener("change", () => { if (add.value) { x.runes.push(add.value); change(); } });
  return h("div", { class: "extras-row item runic" },
    h("input", { type: "text", value: x.label || "", placeholder: form?.name || "Runic item", "aria-label": "Item name",
      title: "Optional name, e.g. Rune axe", oninput: (ev) => { x.label = ev.target.value || undefined; persist(); }, onchange: change }),
    h("span", { class: "pts-sm" }, `${fmt(runicPoints(army, x))} pts`),
    h("small", {}, `${who}${form?.name || "Runic item"} · up to three runes · Dw p.${army.runes.types[form?.runes]?.page || 24}`),
    remove,
    h("div", { class: "runes" }, chips, add));
}

function renderProfiles(army, s) {
  const rows = rosterRows(army, { selections: [s] })[0]?.profiles || [];
  const heads = ["", "M", "WS", "BS", "S", "T", "W", "I", "A", "Ld"];
  return h("table", { class: "profiles" },
    h("thead", {}, h("tr", {}, heads.map((x) => h("th", {}, x)))),
    h("tbody", {}, rows.map((r) => h("tr", {}, h("td", {}, r.name), r.profile.map((v) => h("td", {}, v))))));
}

// ---------- summary / warnings ----------
function refreshSummary() {
  if (!current) return;
  const { list, army } = current;
  const { total, byCategory } = listTotals(army, list);
  const summary = document.getElementById("summary");
  if (!summary) return;
  // armies with limits over several categories (Chaos warband / allies) show those instead
  const groups = army.limits
    ? army.limits.map((g) => ({ name: g.name, min: g.min, max: g.max, pts: g.categories.reduce((n, id) => n + (byCategory[id] || 0), 0) }))
    : army.categories.map((c) => ({ ...c, pts: byCategory[c.id] || 0 }));
  const chips = groups.map((c) => {
    const pts = c.pts;
    const pct = list.points ? (pts / list.points) * 100 : 0;
    const bad = (c.max != null && pct > c.max) || (c.min != null && pct < c.min);
    const ref = c.max ?? 100;
    return h("div", { class: `cat-chip${bad ? " bad" : ""}` },
      h("b", {}, c.name), ` ${fmt(pts)} · ${pct.toFixed(0)}% `, h("small", {}, c.max != null ? `(max ${c.max}%)` : c.min != null ? `(min ${c.min}%)` : ""),
      h("div", { class: "bar" }, h("i", { style: `width:${Math.min(100, (pct / ref) * 100)}%` })));
  });
  summary.replaceChildren(h("div", { class: "totals" },
    h("span", { class: `total-big${total > list.points ? " over" : ""}` }, `${fmt(total)} / ${list.points} pts`), ...chips));

  const issues = validate(army, list);
  const w = document.getElementById("warnings");
  w.replaceChildren(issues.length
    ? h("ul", { class: "warnings" }, issues.map((i) => h("li", {}, i.msg)))
    : h("p", { class: "allgood" }, "✓ No problems found."));
  const flagged = new Set(issues.map((i) => i.uid).filter(Boolean));
  document.querySelectorAll(".card").forEach((c) => c.classList.toggle("has-warn", flagged.has(c.id.slice(4))));
}

// ---------- text export ----------
function listAsText(army, list) {
  const { total } = listTotals(army, list);
  const out = [`${list.name} — ${army.name}, ${fmt(total)}/${list.points} pts`, ""];
  for (const r of rosterRows(army, list)) {
    out.push(`${r.title} — ${r.points} pts`);
    for (const l of r.lines) out.push(`  ${l}`);
    if (r.notes) out.push(`  [${r.notes}]`);
  }
  out.push("", `TOTAL ${fmt(total)} pts`);
  return out.join("\n");
}
function copyText(army, list, btn) {
  const txt = listAsText(army, list);
  navigator.clipboard?.writeText(txt).then(() => { btn.textContent = "Copied ✓"; setTimeout(() => (btn.textContent = "Copy as text"), 1500); },
    () => download(`${list.name}.txt`, txt, "text/plain"));
}
function download(name, content, type) {
  const a = h("a", { href: URL.createObjectURL(new Blob([content], { type })), download: name });
  document.body.append(a); a.click(); a.remove();
}

// ---------- boot ----------
(async function boot() {
  try {
    armyIndex = await (await fetch("data/armies/index.json", { cache: "no-cache" })).json();
  } catch (e) {
    app.replaceChildren(h("p", {}, "Could not load army data. If you opened index.html directly from disk, run a local web server instead (see README)."));
    return;
  }
  route();
})();
