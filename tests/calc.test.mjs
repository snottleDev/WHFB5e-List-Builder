import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { selectionCost, computeSave, validate, listTotals, fmt } from "../js/calc.js";
import { attachMagic, pickerGroups } from "../js/magic.js";
const load = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const army = attachMagic(load("../data/armies/orcs-goblins.json"), [load("../data/magic/warhammer-magic.json")]);
let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok -", name); };

t("Kilhelm example: 26 Goblins, shields, spears, standard, musician = 98", () => {
  const sel = { entryId: "goblins", size: 26, options: { shields: true, spears: true }, standard: true, musician: true };
  assert.equal(selectionCost(army, sel).total, 98);
  assert.equal(computeSave(army, sel), "6+");
});
t("Stone troll = 65", () => assert.equal(selectionCost(army, { entryId: "trolls", size: 1, variant: "stone" }).total, 65));
t("Goblin warlord with shield = 51, save 6+", () => {
  const sel = { entryId: "warlord", variant: "goblin", gear: ["shield"] };
  assert.equal(selectionCost(army, sel).total, 51);
  assert.equal(computeSave(army, sel), "6+");
});
t("Orc boar boyz save 3+, boss cost 33+2+1+8 in characters", () => {
  const sel = { entryId: "orc-boar-boyz", size: 10, boss: { enabled: true } };
  const c = selectionCost(army, sel);
  assert.equal(computeSave(army, sel), "3+");
  assert.equal(c.byCategory.characters, 44);
  assert.equal(c.byCategory.mobs, 9 * 27);
});
t("Savage orc boar boyz 3+, savage orcs 6+ / 5+ with shields", () => {
  assert.equal(computeSave(army, { entryId: "savage-orc-boar-boyz", size: 5 }), "3+");
  assert.equal(computeSave(army, { entryId: "savage-orcs", size: 5 }), "6+");
  assert.equal(computeSave(army, { entryId: "savage-orcs", size: 5, options: { shields: true } }), "5+");
});
t("Orc warlord on boar with LA+shield: 110+8+3 = 121, save 3+", () => {
  const sel = { entryId: "warlord", variant: "orc", gear: ["light-armour", "shield"], mount: "mount:war-boar" };
  assert.equal(selectionCost(army, sel).total, 121);
  assert.equal(computeSave(army, sel), "3+");
});
t("Boar chariot w/ 1 extra crew, shields, scythes: 81+7.5+3+20", () => {
  const sel = { entryId: "orc-boar-chariot", size: 1, options: { "extra-crew": 1, shields: true, scythes: true } };
  assert.equal(selectionCost(army, sel).total, 111.5);
});
t("Night goblins 20 + 2 fanatics", () => {
  assert.equal(selectionCost(army, { entryId: "night-goblins", size: 20, options: { fanatics: 2 } }).total, 110);
});
t("Squig hunters 3 teams + 2 squigs = 64", () => {
  assert.equal(selectionCost(army, { entryId: "squig-hunters", models: { team: 3, squig: 2 } }).total, 64);
});
t("fmt halves", () => { assert.equal(fmt(66.5), "66½"); assert.equal(fmt(3), "3"); });
t("validation: empty-ish list flags warlord + mobs %", () => {
  const list = { points: 1000, selections: [{ uid: "a", entryId: "warlord", variant: "black-orc" }] };
  const msgs = validate(army, list).map((i) => i.msg).join("\n");
  assert.doesNotMatch(msgs, /exactly one Warlord/);
  assert.match(msgs, /Mobs: 0 pts/);
  assert.match(msgs, /Mob of Black Orcs/);
});
t("validation: hoppers limit", () => {
  const list = { points: 2000, selections: [
    { uid: "a", entryId: "night-goblins", size: 20 },
    { uid: "b", entryId: "squig-hoppers", size: 6 } ] };
  assert.match(validate(army, list).map((i) => i.msg).join("\n"), /maximum is 5/);
});
const msgs = (list) => validate(army, list).map((i) => i.msg).join("\n");
t("magic catalogue: 224 items + Evil Sun Banner; O&G sees its own items but not other armies'", () => {
  assert.equal(army.itemById.size, 225);
  const ids = pickerGroups(army, "magic").flatMap((g) => g.items.map((i) => i.id));
  assert.ok(ids.includes("morgor-the-mangler") && ids.includes("evil-sun-banner") && ids.includes("sword-of-might"));
  assert.ok(!ids.includes("fellblade") && !ids.includes("blessed-sword") && !ids.includes("runefang"));
});
t("Kilhelm warlord: 50 + shield 1 + Sword of Might 20 + Armour of Fortune 15 = 86", () => {
  const sel = { entryId: "warlord", variant: "goblin", gear: ["shield"], extras: [{ itemId: "sword-of-might" }, { itemId: "armour-of-fortune" }] };
  assert.equal(selectionCost(army, sel).total, 86);
});
t("magic standard counts to the unit, boss item to characters", () => {
  const sel = { entryId: "night-goblins", size: 20, standard: true, boss: { enabled: true }, extras: [{ itemId: "bad-moon-banner" }, { itemId: "sword-of-bork", onBoss: true }] };
  const c = selectionCost(army, sel);
  assert.equal(c.byCategory.characters, 15 + 10);
});
t("item warnings: allowance, two wards, arcana, race, duplicates, standard on non-BSB", () => {
  const list = { points: 3000, selections: [
    { uid: "a", entryId: "warlord", variant: "goblin", extras: [{ itemId: "black-amulet" }, { itemId: "dawnstone" }, { itemId: "power-scroll" }, { itemId: "battle-banner" }] },
    { uid: "b", entryId: "big-boss", variant: "orc", extras: [{ itemId: "mad-cap-mushrooms" }, { itemId: "dawnstone" }] },
    { uid: "c", entryId: "goblins", size: 20 } ] };
  const m = msgs(list);
  assert.match(m, /4 magic items, the maximum is 3/);
  assert.match(m, /more than one Ward/);
  assert.match(m, /Power Scroll is Wizard Arcana/);
  assert.match(m, /Battle Banner is a Magic Standard/);
  assert.match(m, /Mad Cap Mushrooms may only be used by Night Goblins/);
  assert.match(m, /Dawnstone is taken 2 times/);
});
t("shaman may take arcana; BSB may take a standard", () => {
  const list = { points: 3000, selections: [
    { uid: "a", entryId: "shaman", variant: "orc-2", extras: [{ itemId: "power-scroll" }] },
    { uid: "b", entryId: "battle-standard", variant: "orc", extras: [{ itemId: "battle-banner" }] },
    { uid: "c", entryId: "orc-boyz", size: 20 } ] };
  assert.doesNotMatch(msgs(list), /Arcana|is a Magic Standard/);
});
t("legacy hand-typed items still price", () => {
  assert.equal(selectionCost(army, { entryId: "warlord", variant: "goblin", extras: [{ name: "Old item", points: 12 }] }).total, 62);
});
// ---------- bestiary keywords ----------
import { defaultNotes } from "../js/calc.js";
t("O&G keywords: Goblins, Night Goblin warlord, Stone Trolls", () => {
  assert.equal(defaultNotes(army, { entryId: "goblins" }), "Animosity, Fear Elves");
  assert.equal(defaultNotes(army, { entryId: "warlord", variant: "night-goblin" }), "Fear Elves, Hate Dwarfs");
  assert.match(defaultNotes(army, { entryId: "trolls", variant: "stone" }), /Fear, Stupidity, Regenerate.*Magic resistance/);
});

// ---------- Empire ----------
const emp = attachMagic(load("../data/armies/empire.json"), [load("../data/magic/warhammer-magic.json")]);
const emsg = (list) => validate(emp, list).map((i) => i.msg).join("\n");
t("Empire: Knights Panther 2+, White Wolf 3+, Pistoliers 5+, Outriders 4+", () => {
  assert.equal(computeSave(emp, { entryId: "knights-panther", size: 5 }), "2+");
  assert.equal(computeSave(emp, { entryId: "white-wolf", size: 5 }), "3+");
  assert.equal(computeSave(emp, { entryId: "pistoliers", size: 5 }), "5+");
  assert.equal(computeSave(emp, { entryId: "outriders", size: 5 }), "4+");
  assert.equal(computeSave(emp, { entryId: "reiksguard", size: 5 }), "4+");
});
t("Empire: halberdiers 20, LA + shields, standard, musician, champion", () => {
  const sel = { entryId: "halberdiers", size: 20, options: { "light-armour": true, shields: true }, standard: true, musician: true, boss: { enabled: true } };
  const c = selectionCost(emp, sel);
  assert.equal(c.byCategory.regiments, 19 * 10 + 10 + 10);
  assert.equal(c.byCategory.characters, 30 + 2 + 2 + 1); // champion + halberd + LA + shield
});
t("Empire: hero on barded warhorse with HA + shield = 65+3+4+3+1, save 2+", () => {
  const sel = { entryId: "hero", gear: ["heavy-armour", "shield", "barding"], mount: "mount:warhorse" };
  assert.equal(selectionCost(emp, sel).total, 76);
  assert.equal(computeSave(emp, sel), "2+");
});
t("Empire: Karl Franz with Hammer + Seal = 285; Elector saves 3+/2+", () => {
  const kf = { entryId: "karl-franz", extras: [{ itemId: "the-hammer-of-sigmar" }, { itemId: "the-silver-seal" }] };
  assert.equal(selectionCost(emp, kf).total, 285);
  assert.equal(computeSave(emp, { entryId: "aldebrand-ludenhof" }), "3+");
  assert.equal(computeSave(emp, { entryId: "boris-todbringer" }), "2+");
});
t("Empire: general required, runefang limit, steam tank cap, hot pot needs halflings", () => {
  const list = { points: 5000, selections: [
    { uid: "a", entryId: "hero", extras: [{ itemId: "runefang" }] },
    { uid: "b", entryId: "hero", extras: [{ itemId: "runefang" }] },
    { uid: "c", entryId: "aldebrand-ludenhof", extras: [{ itemId: "runefang" }] },
    { uid: "d", entryId: "steam-tanks", size: 5 },
    { uid: "e", entryId: "steam-tanks", size: 4 },
    { uid: "f", entryId: "hot-pot", size: 1 } ] };
  const m = emsg(list);
  assert.match(m, /exactly one General/);
  assert.match(m, /only one character may carry a Runefang .*\(currently 2\)/);
  assert.match(m, /Steam Tanks: 9 in the army, the maximum is 8/);
  assert.match(m, /Hot Pot requires at least one Halfling/);
  assert.doesNotMatch(m, /Runefang is taken/);
});
t("Empire: detachments", () => {
  const list = { points: 2000, selections: [
    { uid: "g", entryId: "general" },
    { uid: "p", entryId: "halberdiers", size: 20 },
    { uid: "d1", entryId: "hand-gunners", size: 10, parent: "p" },
    { uid: "d2", entryId: "crossbowmen", size: 11, parent: "p", standard: true },
    { uid: "d3", entryId: "archers", size: 5, parent: "p" },
    { uid: "k", entryId: "knights-panther", size: 5, parent: "p" } ] };
  const m = emsg(list);
  assert.match(m, /at most half the size of its regiment \(10\)/);
  assert.match(m, /may not include a standard bearer/);
  assert.match(m, /4 detachments, the maximum is 2/);
  assert.match(m, /only state troops may form detachments/);
  assert.doesNotMatch(m, /Hand Gunners: a detachment may be at most/);
});
t("Empire: special-character items and mounted-only gear", () => {
  const list = { points: 3000, selections: [
    { uid: "g", entryId: "general", gear: ["lance"], extras: [{ itemId: "fearfrost" }] },
    { uid: "t", entryId: "tzarina-katarin", extras: [{ itemId: "fearfrost" }] },
    { uid: "h", entryId: "halberdiers", size: 20 } ] };
  const m = emsg(list);
  assert.match(m, /General of the Empire: Fearfrost is Tzarina Katarin only/);
  assert.match(m, /Lance can only be used by a mounted model/);
  assert.match(m, /Tzarina requires at least one unit of Kislev/);
});
console.log(`${n} tests passed`);
