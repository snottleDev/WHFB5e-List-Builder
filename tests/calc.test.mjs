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
console.log(`${n} tests passed`);
