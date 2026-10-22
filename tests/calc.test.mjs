import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { selectionCost, computeSave, validate, listTotals, fmt } from "../js/calc.js";
const army = JSON.parse(readFileSync(new URL("../data/armies/orcs-goblins.json", import.meta.url)));
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
console.log(`${n} tests passed`);
