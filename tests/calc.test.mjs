import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { selectionCost, computeSave, validate, listTotals, fmt } from "../js/calc.js";
import { rosterRows } from "../js/pdf.js";
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
// ---------- Skaven ----------
const sk = attachMagic(load("../data/armies/skaven.json"), [load("../data/magic/warhammer-magic.json")]);
const smsg = (list) => validate(sk, list).map((i) => i.msg).join("\n");
t("Skaven: clanrats 5+, stormvermin 6+ / 5+ with shields, warpfire 5+", () => {
  assert.equal(computeSave(sk, { entryId: "clanrats", size: 20 }), "5+");
  assert.equal(computeSave(sk, { entryId: "stormvermin", size: 20 }), "6+");
  assert.equal(computeSave(sk, { entryId: "stormvermin", size: 20, options: { shields: true } }), "5+");
  assert.equal(computeSave(sk, { entryId: "warpfire-throwers", size: 1 }), "5+");
});
t("Skaven: 20 clanrats, spears, std, mus, champion = 19*6.5+13 regiments, 27+2+1+1 characters", () => {
  const c = selectionCost(sk, { entryId: "clanrats", size: 20, options: { spears: true }, standard: true, musician: true, boss: { enabled: true } });
  assert.equal(c.byCategory.regiments, 19 * 6.5 + 6.5 + 6.5);
  assert.equal(c.byCategory.characters, 27 + 2 + 1 + 1);
});
t("Skaven: rat ogre pack 2 masters + 6 ogres + AHW = 20+258+2; champion replaces a packmaster", () => {
  assert.equal(selectionCost(sk, { entryId: "rat-ogre-pack", models: { packmaster: 2, ogre: 6 }, options: { "additional-hand-weapon": true } }).total, 280);
  const c = selectionCost(sk, { entryId: "rat-ogre-pack", models: { packmaster: 2, ogre: 6 }, boss: { enabled: true } });
  assert.equal(c.byCategory.regiments, 10 + 258);
  assert.equal(c.byCategory.characters, 27 + 2);
  assert.match(smsg({ points: 2000, selections: [{ uid: "a", entryId: "rat-ogre-pack", models: { packmaster: 1, ogre: 7 } }] }), /1 to 6 Rat Ogres/);
});
t("Skaven: attached teams, assassins, censer bearers", () => {
  const list = { points: 3000, selections: [
    { uid: "w", entryId: "warlord" },
    { uid: "c", entryId: "clanrats", size: 20 },
    { uid: "g", entryId: "globadiers", size: 3, attachedTo: "c" },
    { uid: "f1", entryId: "warpfire-throwers", size: 1, attachedTo: "c" },
    { uid: "f2", entryId: "warpfire-throwers", size: 1, attachedTo: "c" },
    { uid: "a", entryId: "assassins", size: 1, attachedTo: "c" },
    { uid: "m", entryId: "plague-monks", size: 20 },
    { uid: "b", entryId: "censer-bearers", size: 11, attachedTo: "m" },
    { uid: "b2", entryId: "censer-bearers", size: 5 } ] };
  const m = smsg(list);
  assert.match(m, /Clanrat Warriors: 3 Clan Skryre Poison Wind Globadiers with it, the maximum is 2/);
  assert.match(m, /2 Clan Skryre Warpfire Thrower Teams with it, the maximum is 1/);
  assert.match(m, /at most half the size of Clan Pestilens Plague Monks \(10\)/);
  assert.match(m, /must accompany a regiment of Plague Monks/);
  assert.doesNotMatch(m, /Globadiers: 3 models, the minimum/);
  assert.doesNotMatch(m, /Assassins/);
});
t("Skaven: Ikit war machine minimum, swarm half price, bell per seer, war team units", () => {
  const list = { points: 2000, selections: [
    { uid: "i", entryId: "ikit-claw", extras: [{ itemId: "storm-daemon" }] },
    { uid: "c", entryId: "clanrats", size: 30 },
    { uid: "s", entryId: "rat-swarms", models: { half: 2, full: 1 } },
    { uid: "b", entryId: "screaming-bell", size: 1 },
    { uid: "j1", entryId: "jezzails", size: 2 }, { uid: "j2", entryId: "jezzails", size: 2 } ] };
  const m = smsg(list);
  assert.match(m, /Ikit Claw as General you must spend at least 25%/);
  assert.match(m, /Half-price Rat Swarms.*You have 2, the maximum is 1/);
  assert.match(m, /One Screaming Bell for each Grey Seer/);
  assert.match(m, /Jezzail Teams: 4 in 2 units, at most 1 unit/);
  assert.doesNotMatch(m, /Storm-Daemon/);
  assert.equal(selectionCost(sk, list.selections[2]).total, 200);
});
t("Skaven: clan-only items", () => {
  const list = { points: 3000, selections: [
    { uid: "w", entryId: "warlord", extras: [{ itemId: "rod-of-corruption" }] },
    { uid: "p", entryId: "plague-priest", extras: [{ itemId: "liber-bubonicus" }] },
    { uid: "m", entryId: "plague-monks", size: 20 },
    { uid: "q", entryId: "queek", role: "general", extras: [{ itemId: "dwarf-gouger" }, { itemId: "warpstone-armour" }] },
    { uid: "c", entryId: "clanrats", size: 20 } ] };
  const m = smsg(list);
  assert.match(m, /Skaven Warlord: Rod of Corruption may only be used by Plague Monks/);
  assert.doesNotMatch(m, /Liber Bubonicus/);
  assert.match(m, /exactly one General.*\(currently 2\)/);
  assert.equal(computeSave(sk, list.selections[3]), "5+");
});
// ---------- Undead ----------
const ud = attachMagic(load("../data/armies/undead.json"), [load("../data/magic/warhammer-magic.json")]);
const umsg = (list) => validate(ud, list).map((i) => i.msg).join("\n");
t("Undead: horsemen 6+ / 4+ with LA+shield, skeletons LA+shield 5+, HA alone 5+, wights on steeds 5+, HA steeds 4+", () => {
  assert.equal(computeSave(ud, { entryId: "skeleton-horsemen", size: 5 }), "6+");
  assert.equal(computeSave(ud, { entryId: "skeleton-horsemen", size: 5, options: { "light-armour": true, shields: true } }), "4+");
  assert.equal(computeSave(ud, { entryId: "skeleton-warriors", size: 20, options: { "light-armour": true, shields: true } }), "5+");
  assert.equal(computeSave(ud, { entryId: "skeleton-warriors", size: 20, options: { "heavy-armour": true } }), "5+");
  assert.equal(computeSave(ud, { entryId: "wights", size: 5, options: { steeds: true } }), "5+");
  assert.equal(computeSave(ud, { entryId: "wights", size: 5, options: { steeds: true, "heavy-armour": true } }), "4+");
});
t("Undead: 20 skeletons LA+shield+spears, std, mus = 20*12 + 24; chariots 2 with LA+scythes", () => {
  assert.equal(selectionCost(ud, { entryId: "skeleton-warriors", size: 20, options: { "light-armour": true, shields: true, spears: true }, standard: true, musician: true }).total, 264);
  assert.equal(selectionCost(ud, { entryId: "undead-chariots", size: 2, options: { "light-armour": true, scythes: true } }).total, 2 * 56 + 2 * 2 * 2 + 2 * 20);
});
t("Undead: necromancer lord in scythed chariot with lance + LA = 410+60+2+2, chariot is not cavalry, lance warns", () => {
  const sel = { uid: "g", entryId: "general", variant: "necromancer-lord", mount: "mount:undead-chariot-scythed", gear: ["lance", "light-armour"] };
  assert.equal(selectionCost(ud, sel).total, 474);
  assert.equal(computeSave(ud, sel), "6+");
  assert.match(umsg({ points: 3000, selections: [sel] }), /Lance can only be used by a mounted model/);
});
t("Undead: champions lead a regiment, one each", () => {
  const list = { points: 2000, selections: [
    { uid: "g", entryId: "general" },
    { uid: "s", entryId: "skeleton-warriors", size: 20 },
    { uid: "c1", entryId: "champion", variant: "wight", attachedTo: "s" },
    { uid: "c2", entryId: "champion", variant: "wraith", attachedTo: "s" },
    { uid: "c3", entryId: "champion" } ] };
  const m = umsg(list);
  assert.match(m, /Skeleton Warriors: 2 units of Undead Champion with it, the maximum is 1/);
  assert.match(m, /must lead a regiment of Skeletons/);
  assert.equal(selectionCost(ud, list.selections[3]).byCategory.characters, 75);
});
t("Undead: race-restricted items, Krell and Settra exceptions, Isabella needs Vlad, wraith units", () => {
  const list = { points: 5000, selections: [
    { uid: "g", entryId: "general", variant: "vampire-lord", extras: [{ itemId: "book-of-nagash" }, { itemId: "the-carstein-ring" }] },
    { uid: "k", entryId: "krell", extras: [{ itemId: "the-tomb-blade-of-arkhan" }] },
    { uid: "st", entryId: "settra", extras: [{ itemId: "staff-of-osiris" }, { itemId: "tomb-kings-crown" }] },
    { uid: "i", entryId: "isabella" },
    { uid: "w1", entryId: "wraiths", size: 2 }, { uid: "w2", entryId: "wraiths", size: 2 } ] };
  const m = umsg(list);
  assert.match(m, /Vampire Lord: Book of Nagash may only be used by Necromancers/);
  assert.doesNotMatch(m, /Carstein Ring/);
  assert.doesNotMatch(m, /Krell/);
  assert.doesNotMatch(m, /Settra/);
  assert.match(m, /Isabella may only be included if the army also includes Vlad/);
  assert.match(m, /Wraiths: 4 in 2 units, at most 1 unit/);
});
// ---------- High Elves ----------
const he = attachMagic(load("../data/armies/high-elves.json"), [load("../data/magic/warhammer-magic.json")]);
const hmsg = (list) => validate(he, list).map((i) => i.msg).join("\n");
t("High Elves: saves (Dragon Princes 2+, Silver Helms 5+/4+ with shields/2+ all options, White Lions shields)", () => {
  assert.equal(computeSave(he, { entryId: "dragon-princes", size: 5 }), "2+");
  assert.equal(computeSave(he, { entryId: "silver-helms", size: 5 }), "5+");
  assert.equal(computeSave(he, { entryId: "silver-helms", size: 5, options: { shields: true } }), "4+");
  assert.equal(computeSave(he, { entryId: "silver-helms", size: 5, options: { shields: true, "heavy-armour": true, barding: true } }), "2+");
  assert.equal(computeSave(he, { entryId: "white-lions", size: 10, options: { shields: true } }), "5+/3+");
  assert.equal(computeSave(he, { entryId: "spearmen", size: 20 }), "5+");
});
t("High Elves: Dragon Princes free standard, half-price magic standard; White Lions free command", () => {
  const dp = selectionCost(he, { entryId: "dragon-princes", size: 6, standard: true, musician: true, extras: [{ itemId: "war-banner" }] });
  assert.equal(dp.total, 6 * 43 + 43 + 12.5);
  assert.equal(selectionCost(he, { entryId: "white-lions", size: 10, standard: true, musician: true }).total, 160);
  assert.match(hmsg({ points: 2000, selections: [{ uid: "d", entryId: "dragon-princes", size: 5 }] }), /must include a standard bearer/);
});
t("High Elves: champion on Silver Helms = 48 + LA 2 + lance 2 + steed 3; bolt throwers and shadow warriors limits", () => {
  assert.equal(selectionCost(he, { entryId: "silver-helms", size: 5, boss: { enabled: true } }).byCategory.characters, 55);
  const list = { points: 3000, selections: [
    { uid: "g", entryId: "general" }, { uid: "s", entryId: "spearmen", size: 20 },
    { uid: "b1", entryId: "bolt-throwers", size: 2 }, { uid: "b2", entryId: "bolt-throwers", size: 1 },
    { uid: "w1", entryId: "shadow-warriors", size: 10 }, { uid: "w2", entryId: "shadow-warriors", size: 10 } ] };
  const m = hmsg(list);
  assert.match(m, /Repeater Bolt Throwers.*You have 3, the maximum is 2/);
  assert.match(m, /Shadow Warriors.*You have 2, the maximum is 1/);
});
t("High Elves: general in a Tiranoc chariot = 160 + 84; Imrik on a Great Dragon = 875", () => {
  assert.equal(selectionCost(he, { entryId: "general", mount: "chariot:tiranoc-chariots" }).total, 244);
  assert.equal(selectionCost(he, { entryId: "imrik", variant: "great" }).total, 875);
});
// ---------- Lizardmen ----------
const lz = attachMagic(load("../data/armies/lizardmen.json"), [load("../data/magic/warhammer-magic.json")]);
const lmsg = (list) => validate(lz, list).map((i) => i.msg).join("\n");
t("Lizardmen: scaly-skin saves (Saurus 4+, Temple Guard 5+/4+, Skinks 6+/5+, Cold One Riders 3+, Terradons 5+, Skink Hero on Cold One 3+)", () => {
  assert.equal(computeSave(lz, { entryId: "saurus", size: 10 }), "4+");
  assert.equal(computeSave(lz, { entryId: "temple-guard", size: 10 }), "5+");
  assert.equal(computeSave(lz, { entryId: "temple-guard", size: 10, options: { shields: true } }), "4+");
  assert.equal(computeSave(lz, { entryId: "skinks", size: 10 }), "6+");
  assert.equal(computeSave(lz, { entryId: "skinks", size: 10, options: { javelins: true } }), "5+");
  assert.equal(computeSave(lz, { entryId: "cold-one-riders", size: 5 }), "3+");
  assert.equal(computeSave(lz, { entryId: "terradons", size: 2 }), "5+");
  assert.equal(computeSave(lz, { entryId: "hero", variant: "skink", gear: ["shield"], mount: "mount:cold-one" }), "3+");
});
t("Lizardmen: Slann general with battle standard, temple guard and terradon limits, kroxigor per 8 skinks", () => {
  assert.equal(selectionCost(lz, { entryId: "slann-general", variant: "master", options: { "battle-standard": true } }).total, 475);
  const list = { points: 3000, selections: [
    { uid: "g", entryId: "slann-general" },
    { uid: "t1", entryId: "temple-guard", size: 10 }, { uid: "t2", entryId: "temple-guard", size: 10 },
    { uid: "r1", entryId: "terradons", size: 2 }, { uid: "r2", entryId: "terradons", size: 2 },
    { uid: "s", entryId: "skinks", size: 15 }, { uid: "k", entryId: "kroxigor", size: 2, attachedTo: "s" },
    { uid: "st", entryId: "stegadons", size: 4 } ] };
  const m = lmsg(list);
  assert.match(m, /Temple Guard.*You have 2, the maximum is 1/);
  assert.match(m, /Terradons.*You have 2, the maximum is 1/);
  assert.match(m, /2 Kroxigor with it, the maximum is 1/);
  assert.match(m, /Stegadons.*You have 4, the maximum is 3/);
  assert.match(lmsg({ points: 3000, selections: [{ uid: "k", entryId: "lord-kroak" }] }), /a living Slann Mage-Priest must be General/);
});
t("Lizardmen: saurus heroes cannot use skink-only gear, champions per race", () => {
  assert.equal(selectionCost(lz, { entryId: "cold-one-riders", size: 5, boss: { enabled: true } }).byCategory.characters, 20 + 1 + 1 + 10);
  assert.equal(selectionCost(lz, { entryId: "saurus", size: 10, boss: { enabled: true } }).byCategory.characters, 33);
});
// ---------- Bretonnia ----------
const br = attachMagic(load("../data/armies/bretonnia.json"), [load("../data/magic/warhammer-magic.json")]);
const bmsg = (list) => validate(br, list).map((i) => i.msg).join("\n");
t("Bretonnia: knights 2+, free standard and musician, knightly champion 35 + gear + horse", () => {
  const sel = { entryId: "knights-of-the-realm", size: 8, standard: true, musician: true, boss: { enabled: true } };
  const c = selectionCost(br, sel);
  assert.equal(computeSave(br, sel), "2+");
  assert.equal(c.byCategory.knights, 7 * 39);
  assert.equal(c.byCategory.characters, 35 + 2 + 3 + 1 + 4 + 3);
  assert.equal(selectionCost(br, { entryId: "grail-knights", size: 5, boss: { enabled: true } }).byCategory.characters, 50 + 13);
});
t("Bretonnia: virtues, squires per knight unit, commoner and character limits", () => {
  const gen = { uid: "g", entryId: "general", mount: "mount:warhorse", gear: ["lance", "heavy-armour", "shield", "barding"], options: { "v1-grail": true, "v2-joust": true } };
  assert.equal(selectionCost(br, gen).total, 100 + 3 + 2 + 3 + 1 + 4 + 15 + 15);
  assert.equal(computeSave(br, gen), "2+");
  const list = { points: 2000, selections: [
    { uid: "h", entryId: "hero" }, { uid: "k", entryId: "knights-errant", size: 6 },
    { uid: "s1", entryId: "squires", size: 10 }, { uid: "s2", entryId: "squires", size: 10 },
    { uid: "b", entryId: "bowmen", size: 120 } ] };
  const m = bmsg(list);
  assert.match(m, /Hero: a Bretonnian Knight character must have/);
  assert.match(m, /regiments of Squires.*You have 2, the maximum is 1/);
  assert.match(m, /Commoners: .* exceeds the 50% maximum/);
  assert.match(m, /exactly one General/);
});
t("Bretonnia: special characters (Repanse is General and BSB, Bertrand leads Bowmen of Bergerac)", () => {
  const list = { points: 3000, selections: [
    { uid: "r", entryId: "repanse" }, { uid: "a", entryId: "armand" },
    { uid: "bw", entryId: "bowmen", size: 10, options: { bergerac: true } }, { uid: "be", entryId: "bertrand", attachedTo: "bw" },
    { uid: "k", entryId: "knights-errant", size: 6 } ] };
  const m = bmsg(list);
  assert.match(m, /Only one Battle Standard.*\(currently 2\)/);
  assert.doesNotMatch(m, /exactly one General/);
  assert.equal(selectionCost(br, list.selections[2]).total, 90);
});
// ---------- Chaos Dwarfs ----------
const cd = attachMagic(load("../data/armies/chaos-dwarfs.json"), [load("../data/magic/warhammer-magic.json")]);
const cmsg = (list) => validate(cd, list).map((i) => i.msg).join("\n");
t("Chaos Dwarfs: saves (warriors 4+, blunderbusses 5+, bull centaurs 5+, wolf riders 5+)", () => {
  assert.equal(computeSave(cd, { entryId: "warriors", size: 10 }), "4+");
  assert.equal(computeSave(cd, { entryId: "blunderbusses", size: 10 }), "5+");
  assert.equal(computeSave(cd, { entryId: "bull-centaurs", size: 5 }), "5+");
  assert.equal(computeSave(cd, { entryId: "wolf-riders", size: 5 }), "5+");
});
t("Chaos Dwarfs: warriors required, hobgoblin hero needs hobgoblins, only Chaos Dwarfs ride monsters, Chaos items", () => {
  const list = { points: 2000, selections: [
    { uid: "g", entryId: "general", variant: "sorcerer-lord", mount: "monster:lammasu", extras: [{ itemId: "chaos-runeblade" }, { itemId: "staff-of-nurgle" }] },
    { uid: "h", entryId: "hero", variant: "hobgoblin", mount: "monster:wyvern" },
    { uid: "o", entryId: "orcs", size: 20 } ] };
  const m = cmsg(list);
  assert.match(m, /at least one unit of Chaos Dwarf Warriors/);
  assert.match(m, /Hobgoblin Hero requires at least one unit of Hobgoblins/);
  assert.match(m, /only a Chaos Dwarf may ride a monster/);
  assert.match(m, /Staff of Nurgle is not available/);
  assert.doesNotMatch(m, /Chaos Runeblade/);
  assert.equal(selectionCost(cd, list.selections[0]).total, 328 + 200 + 45 + 100);
});
t("Chaos Dwarfs: champions by race, Zhatan on a Great Taurus", () => {
  assert.equal(selectionCost(cd, { entryId: "warriors", size: 10, boss: { enabled: true } }).byCategory.characters, 48 + 3 + 1 + 2);
  assert.equal(selectionCost(cd, { entryId: "wolf-riders", size: 5, boss: { enabled: true } }).byCategory.characters, 27 + 1 + 4);
  assert.equal(selectionCost(cd, { entryId: "zhatan", options: { taurus: true } }).total, 397);
});
// ---------- Chaos (Realm of Chaos) ----------
const loadChaos = (id) => attachMagic({ ...load("../data/armies/chaos-realm.json"), ...load(`../data/armies/${id}.json`) }, [load("../data/magic/warhammer-magic.json"), load("../data/magic/daemonic-rewards.json")]);
const cw = loadChaos("chaos-warriors"), cb = loadChaos("chaos-beastmen"), cdm = loadChaos("chaos-daemons");
const vmsg = (a, list) => validate(a, list).map((i) => i.msg).join("\n");
t("Chaos: Khorne Lord on Juggernaut with shield and lance = 373, save 2+; Knights in Chaos armour 1+; Warriors 3+", () => {
  const lord = { entryId: "champion", variant: "lord", role: "general", gear: ["shield", "lance"], options: { "mark-khorne": true, juggernaut: true } };
  assert.equal(selectionCost(cw, lord).total, 373);
  assert.equal(computeSave(cw, lord), "2+");
  assert.equal(computeSave(cw, { entryId: "chaos-knights", size: 5 }), "2+");
  assert.equal(computeSave(cw, { entryId: "chaos-knights", size: 5, options: { "chaos-armour": true } }), "1+");
  assert.equal(computeSave(cw, { entryId: "chaos-warriors", size: 10, options: { "chaos-armour": true, shields: true } }), "3+");
  assert.equal(computeSave(cw, { entryId: "sorcerer", options: { unaligned: true } }), "4+");
});
t("Chaos: free command for Knights and Warriors, Marauder leader priced like his unit, champions count with their unit", () => {
  assert.equal(selectionCost(cw, { entryId: "chaos-knights", size: 5, standard: true, musician: true, options: { "chaos-armour": true } }).total, 400);
  const m = selectionCost(cw, { entryId: "marauders", size: 10, standard: true, options: { flail: true }, boss: { enabled: true } });
  assert.equal(m.total, 9 * 13 + 13 + 22);
  assert.equal(m.byCategory["w-retinues"], m.total);
  assert.equal(selectionCost(cw, { entryId: "chaos-hounds", size: 6, boss: { enabled: true, options: { "chaos-armour": true } } }).total, 5 * 12 + 31);
});
t("Chaos: retinue must be worth the Warlord; chariots and Ogres need core units; Juggernaut needs the Mark", () => {
  const list = { points: 2000, selections: [
    { uid: "g", entryId: "champion", variant: "lord", role: "general", gear: [], options: { "mark-khorne": true, juggernaut: true } },
    { uid: "w", entryId: "chaos-warriors", size: 10, attachedTo: "g", options: {} },
    { uid: "s", entryId: "sorcerer", variant: "sorcerer", gear: [], options: { "steed-of-slaanesh": true } },
    { uid: "c", entryId: "warrior-chariots", size: 1, attachedTo: "s", options: {} },
    { uid: "o1", entryId: "ogres", size: 3, attachedTo: "s", options: {} },
    { uid: "h", entryId: "chaos-hounds", size: 5, options: {} } ] };
  const m = vmsg(cw, list);
  assert.match(m, /Chaos Lord: retinue is worth 240 pts; it must be worth at least 370 pts/);
  assert.match(m, /Chaos Chariots \(Chaos Warrior crew\): a retinue may only include chariots/);
  assert.match(m, /Ogres: a retinue may only include Ogres/);
  assert.match(m, /Steed of Slaanesh needs Mark of Slaanesh/);
  assert.match(m, /Chaos Hounds: must be part of a Warlord's retinue/);
  assert.doesNotMatch(m, /Sorcerer: retinue/);
});
t("Chaos: Ogre leader levels, 75% warband / 25% allies, large monster riders", () => {
  assert.equal(selectionCost(cw, { entryId: "ogres", size: 7, boss: { enabled: true, level: "chief" }, options: {} }).total, 6 * 40 + 240);
  const list = { points: 1000, selections: [
    { uid: "g", entryId: "champion", variant: "champion", role: "general", gear: [], options: {} },
    { uid: "o", entryId: "ogres", size: 5, attachedTo: "g", boss: { enabled: true, level: "chief" }, options: {} },
    { uid: "d", entryId: "dragon", variant: "great", size: 1, attachedTo: "g" },
    { uid: "x", entryId: "hydra", size: 1, attachedTo: "b" },
    { uid: "b", entryId: "chieftain", variant: "chief", gear: [] } ] };
  const m = vmsg(cw, list);
  assert.match(m, /Ogre Chief may only lead a unit of at least 7/);
  assert.match(m, /Allies: .* exceeds the 25% maximum/);
  assert.match(m, /Chaos Warrior warband: .* below the 75% minimum/);
  assert.match(m, /Hydra: cannot go with Beastman Chieftain/);
  assert.equal(listTotals(cw, list).byCategory.host, 600 + 225);
});
t("Chaos: one summoned Greater Daemon without a retinue; Harpies limit depends on the General; BSB needs the right General", () => {
  const list = { points: 3000, selections: [
    { uid: "g", entryId: "sorcerer", role: "general", gear: [], options: {} },
    { uid: "d1", entryId: "greater-daemon", variant: "lord-of-change" },
    { uid: "d2", entryId: "greater-daemon", variant: "keeper-of-secrets" },
    { uid: "h1", entryId: "harpies", size: 5 }, { uid: "h2", entryId: "harpies", size: 5 } ] };
  const m = vmsg(cw, list);
  assert.match(m, /Keeper of Secrets \(Slaanesh\): only 1 Greater Daemon may be summoned/);
  assert.doesNotMatch(m, /Lord of Change \(Tzeentch\)/);
  assert.match(m, /Only one unit of Harpies/);
  const beast = { points: 3000, selections: [
    { uid: "g", entryId: "chieftain", role: "general", gear: [] },
    { uid: "h1", entryId: "harpies", size: 5 }, { uid: "h2", entryId: "harpies", size: 5 }, { uid: "s", entryId: "beast-bsb", gear: [] } ] };
  assert.doesNotMatch(vmsg(cb, beast), /Harpies|Battle Standard Bearer may only/);
  beast.selections[0] = { uid: "g", entryId: "champion", role: "general", gear: [], options: {} };
  assert.match(vmsg(cb, beast), /the General must be one of the army's own Warlords/);
});
t("Chaos Beastmen: Gor champion 60 + gear, Ungor champion pays full equipment, Bestigor champion 65, Minotaur Lord", () => {
  assert.equal(selectionCost(cb, { entryId: "gors", size: 10, options: { halberd: true, shields: true }, boss: { enabled: true } }).total, 9 * 13 + 63);
  assert.equal(selectionCost(cb, { entryId: "ungors", size: 20, options: { spears: true, shields: true }, boss: { enabled: true } }).total, 19 * 5.5 + 62);
  assert.equal(selectionCost(cb, { entryId: "bestigors", size: 10, boss: { enabled: true } }).total, 9 * 18 + 65);
  assert.equal(computeSave(cb, { entryId: "bestigors", size: 10, options: { shields: true } }), "5+/4+");
  assert.equal(selectionCost(cb, { entryId: "minotaurs", size: 10, options: { dhw: true }, boss: { enabled: true, level: "lord" } }).total, 9 * 44 + 397);
});
t("Chaos Daemons: daemon command prices, mounted units, rewards and gods", () => {
  assert.equal(selectionCost(cdm, { entryId: "bloodletters", size: 20, standard: true, musician: true, boss: { enabled: true } }).total, 19 * 20 + 20 + 20 + 60);
  assert.equal(selectionCost(cdm, { entryId: "bloodcrushers", size: 3, standard: true, boss: { enabled: true } }).total, 2 * 90 + 20 + 130);
  assert.equal(selectionCost(cdm, { entryId: "greater-daemon", variant: "bloodthirster", extras: [{ itemId: "daemonic-strength" }, { itemId: "massive-stature" }] }).total, 820);
  const list = { points: 3000, selections: [
    { uid: "g", entryId: "greater-daemon", variant: "bloodthirster", role: "general", extras: [{ itemId: "flames-of-tzeentch" }, { itemId: "ward-of-chaos" }, { itemId: "lord-of-chaos" }] },
    { uid: "b", entryId: "bloodletters", size: 20, attachedTo: "g", boss: { enabled: true } },
    { uid: "p", entryId: "pink-horrors", size: 10, attachedTo: "g" },
    { uid: "s", entryId: "daemon-bsb", variant: "plaguebearer", attachedTo: "b", options: {} },
    { uid: "q", entryId: "daemon-prince", options: {}, extras: [{ itemId: "master-of-sorcery-2" }] },
    { uid: "q2", entryId: "daemon-prince", options: { "mark-khorne": true }, extras: [{ itemId: "radiance-of-dark-glory" }] },
    { uid: "q3", entryId: "daemon-prince", options: {}, extras: [{ itemId: "radiance-of-dark-glory" }] } ] };
  const m = vmsg(cdm, list);
  assert.match(m, /Bloodthirster of Khorne: 3 daemonic rewards, the maximum is 2/);
  assert.match(m, /Flames of Tzeentch is Tzeentch only/);
  assert.match(m, /Pink Horrors of Tzeentch: Daemons of Tzeentch cannot join the retinue of Bloodthirster/);
  assert.match(m, /Plaguebearer Champion: must lead a unit of his own kind/);
  assert.match(m, /replaces the unit's normal Champion/);
  assert.doesNotMatch(m, /Master of Sorcery/);
  assert.match(m, /Radiance of Dark Glory is taken 2 times/);
});
// ---------- Vampire Counts ----------
const vc = attachMagic(load("../data/armies/vampire-counts.json"), [load("../data/magic/warhammer-magic.json"), load("../data/magic/vampire-powers.json")]);
const vcmsg = (list) => validate(vc, list).map((i) => i.msg).join("\n");
t("Vampire Counts: Lord on barded Nightmare with HA, shield, lance = 362, save 2+; powers add their points", () => {
  const lord = { entryId: "general", variant: "vampire-lord", mount: "mount:nightmare", gear: ["heavy-armour", "shield", "lance", "barding"] };
  assert.equal(selectionCost(vc, lord).total, 362);
  assert.equal(computeSave(vc, lord), "2+");
  assert.equal(selectionCost(vc, { ...lord, extras: [{ itemId: "carstein-pure-blood" }, { itemId: "carstein-call-winds" }] }).total, 362 + 5 + 60);
  assert.equal(vc.magicPools.find((p) => p.id === "powers").items.length, 36);
});
t("Vampire Counts: power counts, Lords-only and on-foot powers, one bloodline, Carstein Ring needs Pure Blood", () => {
  const list = { points: 3000, selections: [
    { uid: "g", entryId: "general", variant: "vampire-lord", mount: "mount:nightmare", extras: [{ itemId: "carstein-bat-form" }, { itemId: "carstein-transfix" }, { itemId: "carstein-summon-bats" }, { itemId: "carstein-wolf-form" }] },
    { uid: "t1", entryId: "vampires", variant: "thrall", extras: [{ itemId: "carstein-summon-bats" }] },
    { uid: "t2", entryId: "vampires", variant: "thrall", extras: [] },
    { uid: "c", entryId: "vampires", variant: "count", extras: [{ itemId: "necrarch-dark-acolyte" }, { itemId: "the-carstein-ring" }] },
    { uid: "b", entryId: "battle-standard", variant: "wight-lord", extras: [] },
    { uid: "n", entryId: "necromancers", variant: "lord", extras: [] },
    { uid: "s", entryId: "skeleton-warriors", size: 20 } ] };
  const m = vcmsg(list);
  assert.match(m, /Vampire Lord: 4 vampire powers, the maximum is 3/);
  assert.match(m, /Vampire Lord: Bat Form can only be used by a model on foot/);
  assert.match(m, /Vampire Thrall: Summon Bats is Vampire Lords only/);
  assert.match(m, /Vampire Thrall: must have at least 1 vampire power \(has 0\)/);
  assert.match(m, /same bloodline .*Von Carstein \(Vampire Lord\), Necrarch \(Vampire Count\)/);
  assert.match(m, /Vampire Count: only a Vampire with the Pure Blood power may carry the Carstein Ring/);
  assert.doesNotMatch(m, /Wight Lord: must have|Necromancer Lord: must have/);
  assert.doesNotMatch(m, /Vampire Lord: Summon Bats/);
});
t("Vampire Counts: special characters bring their bloodline; Krell needs Kemmler, Isabella needs Vlad", () => {
  const m = vcmsg({ points: 3000, selections: [
    { uid: "v", entryId: "vlad" }, { uid: "c", entryId: "vampires", variant: "count", extras: [{ itemId: "lahmia-transfix" }] },
    { uid: "k", entryId: "krell" }, { uid: "s", entryId: "skeleton-warriors", size: 30 } ] });
  assert.match(m, /same bloodline .*Von Carstein \(Vlad von Carstein\), Lahmia \(Vampire Count\)/);
  assert.match(m, /Krell may only be included if the army is led by Heinrich Kemmler/);
  assert.doesNotMatch(m, /exactly|led by one General/);
  assert.match(vcmsg({ points: 2000, selections: [{ uid: "i", entryId: "isabella" }, { uid: "g", entryId: "general", variant: "vampire-count", extras: [{ itemId: "carstein-transfix" }] }] }), /Isabella may only be included/);
  assert.equal(computeSave(vc, { entryId: "walach" }), "2+");
});
t("Vampire Counts: Wight Cavalry 480 at 2+, Grave Guard 273 at 4+, Dire Wolves with a Doom Wolf", () => {
  const wc = { entryId: "wight-cavalry", size: 10, standard: true, musician: true, options: { lances: true, "heavy-armour": true, shields: true, barding: true } };
  assert.equal(selectionCost(vc, wc).total, 480);
  assert.equal(computeSave(vc, wc), "2+");
  assert.equal(computeSave(vc, { entryId: "wight-cavalry", size: 5 }), "5+");
  const gg = { entryId: "grave-guard", size: 20, standard: true, options: { "heavy-armour": true } };
  assert.equal(selectionCost(vc, gg).total, 273);
  assert.equal(computeSave(vc, gg), "4+");
  const dw = selectionCost(vc, { entryId: "dire-wolves", size: 10, boss: { enabled: true } });
  assert.equal(dw.total, 9 * 10 + 25);
  assert.equal(dw.byCategory.characters, 25);
});
t("Vampire Counts: Banshees per 1,000 points, Bat Swarms per Vampire, Bat units per regiment, champions and the Black Coach", () => {
  const list = { points: 2000, selections: [
    { uid: "g", entryId: "general", variant: "vampire-count", extras: [{ itemId: "lahmia-swiftness" }] },
    { uid: "b", entryId: "battle-standard", variant: "thrall", extras: [{ itemId: "lahmia-quickblood" }] },
    { uid: "w", entryId: "battle-standard", variant: "wight-lord" },
    { uid: "s", entryId: "skeleton-warriors", size: 20 },
    { uid: "h", entryId: "banshees", size: 3 },
    { uid: "x", entryId: "bat-swarms", models: { half: 3, full: 1 } },
    { uid: "v1", entryId: "vampire-bats", size: 2 }, { uid: "v2", entryId: "vampire-bats", size: 2 }, { uid: "v3", entryId: "vampire-bats", size: 2 },
    { uid: "c", entryId: "undead-champion", variant: "wraith", attachedTo: "gh" }, { uid: "gh", entryId: "ghouls", size: 10 },
    { uid: "k", entryId: "black-coach", size: 1, extras: [{ itemId: "banner-of-doom" }] } ] };
  const m = vcmsg(list);
  assert.match(m, /One Banshee for every full 1,000 points.*You have 3, the maximum is 2/);
  assert.match(m, /Half-cost Bat Swarms.*You have 3, the maximum is 2/);
  assert.match(m, /No more units of Vampire Bats.*You have 3, the maximum is 2/);
  assert.match(m, /Vampire Bats: 6 in 3 units, at most 2 units/);
  assert.match(m, /Undead Champion: cannot go with Ghouls/);
  assert.doesNotMatch(m, /Black Coach: a Magic Standard needs/);
  const q = vcmsg({ points: 2000, selections: [{ uid: "g", entryId: "general", variant: "vampire-count", extras: [{ itemId: "lahmia-quickblood" }, { itemId: "dawnstone" }] }] });
  assert.match(q, /Vampire Count: a model may never have more than one Ward/);
  assert.match(m, /Only one Battle Standard Bearer/);
  assert.equal(selectionCost(vc, list.selections[5]).total, 250);
});
t("Vampire Counts: a General on a Zombie Dragon counts the dragon as Characters", () => {
  const t2 = listTotals(vc, { points: 2000, selections: [{ uid: "g", entryId: "general", variant: "vampire-lord", mount: "monster:zombie-dragon" }] });
  assert.equal(t2.byCategory.characters, 850);
  assert.equal(t2.byCategory.monsters || 0, 0);
});
// ---------- Dwarfs ----------
const dw = attachMagic(load("../data/armies/dwarfs.json"), [load("../data/magic/warhammer-magic.json"), load("../data/magic/dwarf-runes.json")]);
const dwmsg = (list) => validate(dw, list).map((i) => i.msg).join("\n");
const rw = (...runes) => ({ runic: "weapon", runes });
t("Dwarfs: runic weapon points are the sum of its runes; names list the runes; it counts as a magic item", () => {
  assert.equal(dw.runes.runes.length, 50);
  const lord = { entryId: "general", gear: ["heavy-armour", "shield"], extras: [rw("rune-of-fury", "rune-of-fury", "master-rune-of-swiftness"), { runic: "armour", runes: ["rune-of-stone"] }] };
  assert.equal(selectionCost(dw, lord).total, 160 + 3 + 1 + 20 + 20 + 25 + 5);
  assert.equal(computeSave(dw, lord), "4+");
  const rows = rosterRows(dw, { selections: [{ uid: "g", ...lord }] });
  assert.ok(rows[0].lines.includes("Runic weapon (Rune of Fury ×2, Master Rune of Swiftness)"));
  const m = dwmsg({ points: 2000, selections: [{ uid: "h", entryId: "hero", extras: [rw("rune-of-fire"), { runic: "talisman", runes: ["rune-of-luck"] }, { itemId: "dawnstone" }] }] });
  assert.match(m, /Dwarf Hero: 3 magic items, the maximum is 2/);
});
t("Dwarfs: Rule of Three, Form, one master per item, Rune of Stone once, Gromril alone, armour needs armour", () => {
  const m = dwmsg({ points: 3000, selections: [
    { uid: "g", entryId: "general", tags: [], extras: [rw("rune-of-fury", "rune-of-fury", "rune-of-fury", "rune-of-cleaving"), { runic: "armour", runes: ["rune-of-stone", "rune-of-stone"] }] },
    { uid: "h", entryId: "hero", gear: ["light-armour"], extras: [rw("master-rune-of-death", "master-rune-of-swiftness"), { runic: "armour", runes: ["master-rune-of-gromril", "rune-of-iron"] }] },
    { uid: "k", entryId: "hero", extras: [rw("rune-of-iron")] } ] });
  assert.match(m, /Dwarf General: Runic weapon: 4 runes; no item may carry more than three/);
  assert.match(m, /Rune of Stone may be used only once on an item/);
  assert.match(m, /Dwarf General: Runic armour: armour runes need armour or a shield/);
  assert.match(m, /Dwarf Hero: Runic weapon: more than one master rune on one item/);
  assert.match(m, /Master Rune of Gromril cannot be combined with any other armour rune/);
  assert.match(m, /Rune of Iron is not one of the weapon runes \(Rule of Form/);
});
t("Dwarfs: master runes once per army (special characters too) and the Rule of Pride, lone Rune of Stone excepted", () => {
  const m = dwmsg({ points: 3000, selections: [
    { uid: "g", entryId: "general", gear: ["heavy-armour"], extras: [rw("rune-of-cleaving", "rune-of-fire"), { runic: "armour", runes: ["rune-of-stone"] }] },
    { uid: "h", entryId: "hero", gear: ["heavy-armour"], extras: [rw("rune-of-fire", "rune-of-cleaving"), { runic: "armour", runes: ["rune-of-stone"] }] },
    { uid: "x", entryId: "hero", gear: ["shield"], extras: [{ runic: "armour", runes: ["master-rune-of-adamant"] }] },
    { uid: "k", entryId: "kragg" } ] });
  assert.match(m, /Rune of Cleaving, Rune of Fire: the same combination of runes is on 2 items \(Dwarf General, Dwarf Hero\)/);
  assert.doesNotMatch(m, /Rune of Stone: the same combination/);
  assert.match(m, /Master Rune of Adamant is used 2 times \(Dwarf Hero, Rune Lord Kragg the Grim\)/);
});
t("Dwarfs: standards, Runesmith runes, engineering runes, one item of each kind, Slayer Champions weapons only", () => {
  const m = dwmsg({ points: 3000, selections: [
    { uid: "b", entryId: "battle-standard", extras: [{ runic: "standard", runes: ["master-rune-of-valaya", "rune-of-battle"] }] },
    { uid: "w", entryId: "warriors", size: 20, standard: true, extras: [{ runic: "standard", runes: ["master-rune-of-groth-one-eye"] }] },
    { uid: "h", entryId: "hero", extras: [{ runic: "talisman", runes: ["rune-of-spellbreaking"] }, rw("rune-of-fire"), { itemId: "sword-of-might" }] },
    { uid: "r", entryId: "runesmith", extras: [{ runic: "talisman", runes: ["rune-of-spellbreaking"] }] },
    { uid: "c", entryId: "cannons", size: 1, extras: [{ runic: "engineering", runes: ["rune-of-forging", "rune-of-seeking"] }] },
    { uid: "s", entryId: "slayers", size: 10, options: { "dh-axes": 4, "two-axes": 3 } },
    { uid: "sc", entryId: "slayer-champion", variant: "dragon", attachedTo: "s", extras: [{ runic: "armour", runes: ["rune-of-iron"] }] } ] });
  assert.doesNotMatch(m, /Battle Standard Bearer: Runic standard: Master Rune of Valaya/);
  assert.match(m, /Dwarf Warriors: Runic standard: Master Rune of Groth One-Eye may only be placed on the battle standard/);
  assert.match(m, /Dwarf Hero: Runic talisman: Rune of Spellbreaking may only be used by a Runesmith/);
  assert.doesNotMatch(m, /Runesmith: Runic talisman/);
  assert.match(m, /Dwarf Hero: 2 magic items of the same kind \(weapon\)/);
  assert.match(m, /Cannons: Engineering runes: Rune of Seeking is bolt throwers only/);
  assert.doesNotMatch(m, /Rune of Forging is/);
  assert.match(m, /Dragon Slayer: may only carry a magic weapon/);
  assert.equal(selectionCost(dw, { entryId: "slayers", size: 10, options: { "dh-axes": 4, "two-axes": 3 } }).total, 110 + 8 + 3);
});
t("Dwarfs: unit champions and saves, Iron Breakers, war machines, special characters, Slayer regiments limit", () => {
  const ib = selectionCost(dw, { entryId: "iron-breakers", size: 10, standard: true, boss: { enabled: true } });
  assert.equal(ib.byCategory.regiments, 10 * 20);
  assert.equal(ib.byCategory.characters, 53 + 3 + 1);
  assert.equal(computeSave(dw, { entryId: "iron-breakers", size: 10 }), "3+");
  assert.equal(computeSave(dw, { entryId: "warriors", size: 10 }), "5+");
  assert.equal(selectionCost(dw, { entryId: "thunderers", size: 10, boss: { enabled: true } }).byCategory.characters, 48 + 3 + 2);
  assert.equal(selectionCost(dw, { entryId: "stone-throwers", variant: "big", size: 1, options: { "crew-la": true } }).total, 104 + 6);
  assert.equal(selectionCost(dw, { entryId: "runesmith", variant: "rune-lord", options: { anvil: true } }).total, 506);
  assert.equal(selectionCost(dw, { entryId: "thorgrim", options: { throne: true } }).total, 625);
  const m = dwmsg({ points: 3000, selections: [
    { uid: "k", entryId: "kragg" }, { uid: "r", entryId: "runesmith" }, { uid: "g", entryId: "gotrek" },
    { uid: "u", entryId: "ungrim", role: "general" }, { uid: "w", entryId: "warriors", size: 20 },
    { uid: "s1", entryId: "slayers", size: 5 }, { uid: "s2", entryId: "slayers", size: 5 } ] });
  assert.match(m, /Only one Runesmith is allowed/);
  assert.match(m, /Gotrek always fights alongside Felix/);
  assert.match(m, /No more Slayer regiments than other Dwarf regiments.*You have 2, the maximum is 1/);
  assert.doesNotMatch(m, /led by one General/);
});
// ---------- Dark Elves ----------
const de = attachMagic(load("../data/armies/dark-elves.json"), [load("../data/magic/warhammer-magic.json")]);
const demsg = (list) => validate(de, list).map((i) => i.msg).join("\n");
t("Dark Elves: saves (Cold One Knights 2+, Dark Riders 5+, Corsairs 5+, Warriors 6+/5+, Witch Elves none), Cold One gives +2", () => {
  assert.equal(computeSave(de, { entryId: "cold-one-knights", size: 5 }), "2+");
  assert.equal(computeSave(de, { entryId: "dark-riders", size: 5 }), "5+");
  assert.equal(computeSave(de, { entryId: "corsairs", size: 10 }), "5+");
  assert.equal(computeSave(de, { entryId: "warriors", size: 10 }), "6+");
  assert.equal(computeSave(de, { entryId: "warriors", size: 10, options: { shields: true } }), "5+");
  assert.equal(computeSave(de, { entryId: "witch-elves", size: 10 }), "-");
  assert.equal(computeSave(de, { entryId: "hero", gear: ["light-armour", "shield"], mount: "mount:cold-one" }), "3+");
  assert.equal(computeSave(de, { entryId: "hero", gear: ["light-armour", "shield"], mount: "mount:dark-steed" }), "4+");
});
t("Dark Elves: unit and champion costs (Cold One Knight champion, Witch Elf champion, Corsair cloak, City Guard crossbows)", () => {
  const k = selectionCost(de, { entryId: "cold-one-knights", size: 6, standard: true, options: { lances: true }, boss: { enabled: true } });
  assert.equal(k.byCategory.regiments, 6 * 42);
  assert.equal(k.byCategory.characters, 48 + 3 + 1 + 10 + 2);
  assert.equal(selectionCost(de, { entryId: "witch-elves", size: 10, boss: { enabled: true } }).byCategory.characters, 62 + 1);
  assert.equal(selectionCost(de, { entryId: "corsairs", size: 10, boss: { enabled: true } }).byCategory.characters, 53);
  assert.equal(selectionCost(de, { entryId: "city-guard", size: 20, options: { crossbows: 10, shields: true } }).total, 20 * 12 + 20);
  assert.equal(selectionCost(de, { entryId: "hero", variant: "witch-elf" }).total, 132);
  assert.equal(selectionCost(de, { entryId: "general", mount: "monster:manticore" }).total, 360);
});
t("Dark Elves: one Reaper per regiment of ten or more, Assassins hidden one per regiment, 0-1 units, special characters", () => {
  const list = { points: 3000, selections: [
    { uid: "g", entryId: "general" },
    { uid: "w", entryId: "warriors", size: 10 }, { uid: "s", entryId: "spearmen", size: 9 },
    { uid: "b", entryId: "bolt-throwers", size: 2 },
    { uid: "a1", entryId: "assassin", attachedTo: "w" }, { uid: "a2", entryId: "assassin", attachedTo: "w" },
    { uid: "a3", entryId: "assassin", attachedTo: "b" },
    { uid: "h1", entryId: "harpies", size: 5 }, { uid: "h2", entryId: "harpies", size: 5 },
    { uid: "k", entryId: "kouran" }, { uid: "t", entryId: "tullaris" } ] };
  const m = demsg(list);
  assert.match(m, /Up to one Reaper Bolt Thrower per regiment of ten or more.*You have 2, the maximum is 1/);
  assert.match(m, /Dark Elf Warriors: 2 units of Dark Elf Assassin with it, the maximum is 1/);
  assert.match(m, /Dark Elf Assassin: cannot go with Reaper Bolt Throwers/);
  assert.match(m, /Harpies: 2 taken, the maximum is 1/);
  assert.match(m, /Kouran may only be included if the army also includes the Black Guard/);
  assert.match(m, /Tullaris may only be included if the army also includes the Har Ganeth Executioners/);
  assert.equal(selectionCost(de, { entryId: "witch-king" }).total, 675);
  assert.equal(selectionCost(de, { entryId: "hellebron" }).total, 552);
  const wk = demsg({ points: 3000, selections: [{ uid: "w", entryId: "witch-king" }, { uid: "s", entryId: "spearmen", size: 20 }, { uid: "b", entryId: "bolt-throwers", size: 1 }] });
  assert.doesNotMatch(wk, /led by one General|Reaper/);
});
// ---------- Chaos (4th edition) ----------
const c4 = attachMagic(load("../data/armies/chaos-4e.json"), [load("../data/magic/warhammer-magic.json")]);
const c4msg = (list) => validate(c4, list).map((i) => i.msg).join("\n");
t("Chaos 4e: saves (Knights 2+/1+, Warriors 5+/4+/3+, Khorne Lord in Chaos armour 4+, Chaos Armour card counts), Dragon Ogres 5+/4+", () => {
  assert.equal(computeSave(c4, { entryId: "chaos-knights", size: 5 }), "2+");
  assert.equal(computeSave(c4, { entryId: "chaos-knights", size: 5, options: { "chaos-armour": true } }), "1+");
  assert.equal(computeSave(c4, { entryId: "chaos-warriors", size: 10 }), "5+");
  assert.equal(computeSave(c4, { entryId: "chaos-warriors", size: 10, options: { "chaos-armour": true, shields: true } }), "3+");
  assert.equal(computeSave(c4, { entryId: "general", options: { "mark-khorne": true } }), "4+");
  assert.equal(computeSave(c4, { entryId: "hero", gear: ["shield"], options: { "mark-nurgle": true, "chaos-steed": true }, extras: [{ itemId: "chaos-armour" }] }), "2+");
  assert.equal(computeSave(c4, { entryId: "dragon-ogres", size: 3 }), "5+");
  assert.equal(computeSave(c4, { entryId: "dragon-ogres", size: 3, options: { "light-armour": true } }), "4+");
});
t("Chaos 4e: costs (Lord on Juggernaut, champions by race, Dragon Ogre champion, chariots, special characters)", () => {
  assert.equal(selectionCost(c4, { entryId: "general", options: { "mark-khorne": true, juggernaut: true }, gear: ["shield"] }).total, 305 + 70 + 1);
  const b = selectionCost(c4, { entryId: "beastmen", size: 20, options: { shields: true, "light-armour": true }, standard: true, boss: { enabled: true } });
  assert.equal(b.byCategory.regiments, 19 * 13 + 13);
  assert.equal(b.byCategory.characters, 60 + 1 + 2);
  assert.equal(selectionCost(c4, { entryId: "dragon-ogres", size: 4, boss: { enabled: true } }).total, 3 * 87 + 155);
  assert.equal(selectionCost(c4, { entryId: "chaos-chariots", variant: "beastmen", size: 2, options: { scythes: true, shields: true } }).total, 2 * 86 + 2 * 20 + 2 * 2);
  assert.equal(selectionCost(c4, { entryId: "egrimm" }).total, 1121);
  assert.equal(selectionCost(c4, { entryId: "bloodletters", size: 5, options: { juggernauts: true } }).total, 5 * 90);
});
t("Chaos 4e: a Mark is required, daemon mounts need their god, daemons need a Champion of their god, race characters need their regiment", () => {
  const m = c4msg({ points: 3000, selections: [
    { uid: "g", entryId: "general", options: { "mark-tzeentch": true, juggernaut: true } },
    { uid: "h", entryId: "hero", options: {} },
    { uid: "w", entryId: "chaos-warriors", size: 10 },
    { uid: "c", entryId: "champion", options: { "mark-khorne": true }, attachedTo: "w" },
    { uid: "c2", entryId: "champion", options: { "mark-slaanesh": true }, attachedTo: "w" },
    { uid: "b", entryId: "bloodletters", size: 10 },
    { uid: "p", entryId: "plaguebearers", size: 10 },
    { uid: "l", entryId: "lord-of-change" },
    { uid: "m", entryId: "minotaur-hero" },
    { uid: "d1", entryId: "dragon-ogres", size: 2 }, { uid: "d2", entryId: "dragon-ogres", size: 2 } ] });
  assert.match(m, /Chaos Hero: must owe allegiance to one of the Chaos Gods/);
  assert.match(m, /Juggernaut of Khorne needs Khorne/);
  assert.doesNotMatch(m, /Bloodletters of Khorne: Daemons/);
  assert.match(m, /Plaguebearers of Nurgle: Daemons of Nurgle need a Chaos Champion/);
  assert.doesNotMatch(m, /Lord of Change \(Tzeentch\): Daemons/);
  assert.match(m, /Minotaur Hero: requires at least one regiment of Minotaurs/);
  assert.match(m, /Chaos Warriors: 2 units of Chaos Champion with it, the maximum is 1/);
  assert.match(m, /Dragon Ogres: 4 in 2 units, at most 1 unit/);
});
// ---------- Wood Elves ----------
const wo = attachMagic(load("../data/armies/wood-elves.json"), [load("../data/magic/warhammer-magic.json")]);
const womsg = (list) => validate(wo, list).map((i) => i.msg).join("\n");
t("Wood Elves: saves (Glade Riders 5+/3+ with all armour, Warhawk Riders 6+, Glade Guard 6+/5+, Wardancers 6+, Treemen 5+)", () => {
  assert.equal(computeSave(wo, { entryId: "glade-riders", size: 5 }), "5+");
  assert.equal(computeSave(wo, { entryId: "glade-riders", size: 5, options: { "light-armour": true, barding: true } }), "3+");
  assert.equal(computeSave(wo, { entryId: "warhawk-riders", size: 5 }), "6+");
  assert.equal(computeSave(wo, { entryId: "glade-guard", size: 10, options: { "light-armour": true } }), "6+");
  assert.equal(computeSave(wo, { entryId: "glade-guard", size: 10, options: { "light-armour": true, shields: true } }), "5+");
  assert.equal(computeSave(wo, { entryId: "wardancers", size: 10 }), "6+");
  assert.equal(computeSave(wo, { entryId: "treemen", size: 1 }), "5+");
  assert.equal(computeSave(wo, { entryId: "hero", gear: ["light-armour", "shield", "barding"], mount: "mount:elven-steed" }), "3+");
});
t("Wood Elves: costs (cavalry options, champions by race, chariots, mounts, special characters)", () => {
  const g = selectionCost(wo, { entryId: "glade-riders", size: 6, options: { spears: true, longbows: true }, boss: { enabled: true } });
  assert.equal(g.byCategory.regiments, 5 * (27 + 2 + 6));
  assert.equal(g.byCategory.characters, 48 + 1 + 3 + 1 + 3);
  assert.equal(selectionCost(wo, { entryId: "wardancers", size: 10, boss: { enabled: true } }).byCategory.characters, 60);
  assert.equal(selectionCost(wo, { entryId: "archers", size: 10, boss: { enabled: true } }).byCategory.characters, 51);
  assert.equal(selectionCost(wo, { entryId: "chariots", size: 2, options: { scythes: true, "extra-crew": true, longbows: true } }).total, 2 * 76 + 2 * 20 + 2 * 13 + 3 * 3 * 2);
  assert.equal(selectionCost(wo, { entryId: "general", mount: "mount:warhawk" }).total, 180);
  assert.equal(selectionCost(wo, { entryId: "hero", mount: "chariot:chariots" }).total, 180);
  assert.equal(selectionCost(wo, { entryId: "ariel" }).total, 491);
  assert.equal(selectionCost(wo, { entryId: "baying-hounds", size: 6 }).total, 30);
});
t("Wood Elves: Treemen per 1,000 points, 0-1 Waywatchers, named champions lead their units, Orion is the General", () => {
  const m = womsg({ points: 2000, selections: [
    { uid: "o", entryId: "orion" }, { uid: "h", entryId: "baying-hounds", size: 4, attachedTo: "o" },
    { uid: "t1", entryId: "treemen", size: 2 }, { uid: "t2", entryId: "treemen", size: 1 },
    { uid: "w1", entryId: "waywatchers", size: 5 }, { uid: "w2", entryId: "waywatchers", size: 5 },
    { uid: "s", entryId: "scarloc", attachedTo: "w1" }, { uid: "y", entryId: "wychwethyl" },
    { uid: "d", entryId: "durthu" } ] });
  assert.match(m, /One Treeman for every full 1,000 points.*You have 3, the maximum is 2/);
  assert.match(m, /Waywatchers: 2 taken, the maximum is 1/);
  assert.match(m, /Scarloc: cannot go with Waywatchers/);
  assert.match(m, /Wychwethyl is the Champion of a unit of Wardancers/);
  assert.doesNotMatch(m, /led by one General|Baying Hounds/);
});
// ---------- percentage labels ----------
import { pctLabel } from "../js/calc.js";
t("percentages: rounding never hides a broken limit", () => {
  assert.equal(pctLabel(501 / 2000 * 100, null, 25), ">25%");
  assert.equal(pctLabel(500 / 2000 * 100, null, 25), "25%");
  assert.equal(pctLabel(30, null, 25), "30%");
  assert.equal(pctLabel(499 / 2000 * 100, 25, null), "<25%");
  assert.equal(pctLabel(750.5 / 3000 * 100, null, 25, 1), ">25%");
  assert.equal(pctLabel(12.34, null, 50, 1), "12.3%");
  // 1000 of 3999 = 25.006%: the warning must not say "25.0% exceeds the 25% maximum"
  const m = msgs({ points: 3999, selections: [{ uid: "c", entryId: "doom-diver", size: 10 }] });
  assert.match(m, /War Machines: 1000 pts \(>25%\) exceeds the 25% maximum/);
});
console.log(`${n} tests passed`);
