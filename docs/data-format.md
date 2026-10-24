# Army data format

Each army is one JSON file in `data/armies/`. Profiles are always 9 strings in the order
`M WS BS S T W I A Ld` (use `"-"`, `"sp"`, `"2D6"` etc. where the book does).

## Top level

| key | meaning |
|---|---|
| `id`, `name`, `source` | identification; `source` is shown under the list |
| `categories` | `[{id, name, min?, max?}]`, percentages of the points limit. The category with a `min` is treated as the core troops ("Mobs" for O&G, "Regiments" elsewhere) |
| `races` | `{raceId: "Display name"}` used for "requires a Mob of …" checks and race-restricted magic items; `racePlurals` overrides the plural used in warnings (e.g. "Skeleton Horsemen") |
| `equipment` | items characters may buy: `{id, name, cost, group?, armour?, mountedOnly?, troopOnly?, races?}` (`races`: only those races see it, e.g. Skink-only javelins); `armour` is `shield`, `light`, `heavy` or `barding` (barding adds +1 only when mounted); `troopOnly` items are only used to price champions |
| `mounts` | mounts for characters: `{id, name, cost, races?, profile or profiles[], saveBonus?, specialOnly?, noCavalry?}`; no `races` = anyone; `specialOnly` = only entries that list it in `mounts`; `noCavalry` for chariots (no cavalry save bonus, not "mounted" for lances) |
| `characterChariots` | entry ids of chariots a character may ride (cost added to the character) |
| `bossCosts`, `bossProfiles` | unit champion base cost/profile by race (O&G "Bosses", Empire "Champions"); omit if the army has none |
| `championName` | what unit champions are called (default "Boss") |
| `championCategory` | `"unit"` puts champions' points (and their items) in their unit's category instead of Characters (Chaos) |
| `limits` | percentage limits over several categories together: `[{name, categories: [...], min?, max?}]`. Chaos uses them for the 75% warband and 25% allies; the summary shows these instead of the categories |
| `base` | another file in `data/armies/` whose keys this one extends (its own keys win). The three Realm of Chaos armies share `chaos-realm.json` and only set their categories, limits and rules |
| `rules` | army-wide checks, see below |
| `entries` | everything you can add to a list |

## Entries

Common keys: `id`, `name`, `kind` (`character` / `unit` / `monster`), `category`, `page`,
`max` (e.g. 1 for 0-1 choices and special characters), `special` (listed under Special characters),
`notes` (shown in the editor), `rulesText` (pre-fills the roster's Notes column),
`requires: [{race | entry | entries, message}]` (`entries` = any one of a list), `tags` (e.g. `warlord`, `general`, `bsb`),
`rulesText` (special rule keywords, also allowed on variants, e.g. Stone Trolls).

**Characters:** `variants: [{id, race, name, cost, magicItems, profile}]` or a single
`cost`/`profile`/`magicItems`; `requiresOwnRace` (needs a core unit of the variant's race);
`equipmentList` (may buy from `equipment`); `mountChart`, `mounts[]`, `monsters`, `chariots`;
`roles` (e.g. Gorfang as Big Boss or Warlord, each with its own `tags`); `options` with optional
`tags`, `extraProfile(s)`, `mountProfile`; `armour[]`, `cavalry`, `saveBonus` for the save;
`itemRaces` (extra races for magic item restrictions, e.g. Krell may use Necromancer items);
`allowedItems` (item ids that skip the item checks, e.g. Settra's Staff of Osiris although he is no wizard);
`monsterRaces` (only these races may ride a monster, e.g. Chaos Dwarf but not Hobgoblin Heroes);
`requiredGroups: [{group, message}]` (an option group that must be chosen, e.g. a Bretonnian Knight's first virtue).
Variants may carry their own `requires`, `extraProfiles`, `save` and `naturalSave`.
`god` (on an entry, a variant or a Mark option) is the Chaos god a selection serves, used for Daemon retinues and
Daemonic Rewards. Character options may set `cavalry` (a steed bought as an option) and `requires` (an option id or
list: warns if none of them is chosen, e.g. a Juggernaut needs the Mark of Khorne). `allowances: {rewards: 2}` gives
an allowance in an extra magic pool. `summonable`: one such Warlord may come without a retinue (allied Greater Daemon).

**Units:** `cost` (per model) or `models: [{id, name, cost, counts}]` for mixed units;
`variants` (e.g. troll type or rock lobber size, may carry their own `cost` and `single` name);
`minSize`, `sizeLabel`, `noCommand`, `race`, `profiles[]`, `armour[]`, `cavalry`, `saveBonus`,
`save` (fixed override), `magicStandard` (`any` / `one`), `bossGear`, `bossMount`, `bossOptions`,
`crew` (chariots), `ratio` (e.g. one hunter team per three squigs), `maxModels` (e.g. 0-8 Steam Tanks across all units),
`stateTroops` (may form or receive Empire detachments); `bossReplaces` (for `models` units: the model type a champion
replaces, e.g. a Packmaster); `groupLabels` (text for the empty choice of an option group, e.g. "No armour");
`ratio.min` (e.g. each Packmaster controls 1 to 6 beasts); `freeStandard` / `freeMusician` (Knights, White Lions);
`requireStandard` (message if the unit has no standard bearer, e.g. Dragon Princes); `magicStandardFactor`
(e.g. 0.5: Dragon Princes pay half for a magic standard); `naturalSave` (Lizardmen scaly skin: base save that
light armour and a shield each improve by 1).
`bossCost`, `bossName`, `bossProfile` (champion cost, name and profile for this unit, instead of the army's by race);
`bossLevels: [{id, name, cost, profile, minSize}]` (a choice of leader, e.g. Ogre Champion / Chief / War Chief, each
allowed from a unit size); `bossItems: false` (the leader may not carry magic items); `commandCost` (full price of a
standard bearer or musician model, e.g. 40 for Bloodletters); `noStandard` / `noMusician`; `mounted` (a mounted Daemon
unit, checked against its Battle Standard Bearer's steed). Armour `chaos` is Chaos armour: 4+, 3+ with a shield.

**Going with a regiment** (units or characters): `attachTo: {entries, label, alone?, required?, requiredMessage?,
maxModels?, maxUnits?, maxFraction?, hint?}`. The selection stores `attachedTo` (the regiment's uid). Used for Skaven
Globadiers, warpfire teams and Assassins, Plague Censer Bearers (`maxFraction: 0.5`) and Undead Champions
(`required`, `maxUnits: 1`). Attached units skip the minimum size and have no command models.
`perParentModels: 8` allows one model per eight in the regiment (Kroxigor with Skinks).

**Chaos retinues** use the same `attachTo` with `retinue: true`: the unit stays a regiment of its own (normal minimum
size and command) but belongs to a Warlord. Further keys: `requiresSibling: {entries, message}` (the same Warlord must
also have one of these, e.g. chariots need Chaos Warriors, Knights or Marauders); `sameGod` (a Daemon unit may not join
a Warlord of another god); `leadsUnit` (the Daemon Battle Standard Bearer replaces the unit's champion and must be of the
unit's kind); `inGeneralRetinue` (must end up in the General's retinue). Large monsters use a plain `attachTo`
("Ridden by") so their points stay in the Monstrous Host.

Unit `options`: `{id, name, cost, per?, perModel?, group?, count?, max?, gear?, armour?, replacesArmour?, cavalry?, addsCrew?, replacesGear?}`
- `perModel`: cost per model of one type in a `models` unit (e.g. extra hand weapons for Packmasters only)
- `cavalry`: the option mounts the unit (e.g. Wights on Skeleton Steeds); `replacesArmour` drops the listed armour
- `saveBonus`: +1 save (barded steeds); `save`: replaces the calculated save (White Lions with shields)
- `per`: `model` (default), `unit`, `chariot` or `crew`
- options sharing a `group` are mutually exclusive (shown as one drop-down)
- `count` makes it a number input (e.g. hidden Fanatics, extra crewmen)
- `gear` names the `equipment` item a Boss must pay for when the unit has this option

## Magic items

Shared catalogues live in `data/magic/` (e.g. `warhammer-magic.json`). Each item is
`{id, name, type, points, page, only?, tags?, excludeTags?, races?, notWizard?, uses?, multiple?}`:

- `type`: `weapon`, `armour`, `ward`, `enchanted`, `arcana`, `standard`, `bound` (defined under `types` in the catalogue,
  with `maxPerModel`, `wizardOnly`, `standardOnly` flags)
- `tags`: armies that may use it ("Skaven only" → `["skaven"]`); no tags = any army.
  `excludeTags` for "may not be used by Orcs or Goblins"
- `races`: race restriction inside an army ("Night Goblins only" → `["night-goblin"]`), warned about, not blocked
- `only`: the restriction text as printed, shown in the picker. Effect text is deliberately not copied

An army file opts in with:

```json
"magic": {
  "tags": ["orcs-goblins"],
  "pools": [{ "id": "magic", "name": "Magic items", "catalogues": ["warhammer-magic"], "allowance": "magicItems" }],
  "items": [ { "id": "evil-sun-banner", "type": "standard", "points": 10, ... } ]
}
```

**Extra pools** (Daemonic Rewards, Vampire Powers) are listed under `pools` with their own catalogue and allowance key
(`allowances: {powers: 3}` on the character or variant). A pool may also set `min` (every character with an allowance must
take at least this many, e.g. one Vampire Power each) and `oneType` (all of the pool's items in the army must share one
`type`, e.g. one bloodline; the value names an entry field, here `"bloodline"`, through which special characters bring
their own type), with `oneTypeMessage`. The catalogue's `types` then act as the groups shown in the picker, and once the
army uses one type the picker only offers that one. Pool items may set `variants: [ids]` (only these character variants,
e.g. Lords-only powers), `onFoot` (warned about if the model is mounted) and `ward` (counts against one Ward per model).
`itemNeeds: [{item, needs: [ids], message}]` under `magic` warns when a model carries `item` without one of `needs`
(the Carstein Ring needs the Pure Blood power). The same item twice on one model is always warned about.

`excludeItems: [ids]` blocks catalogue items the army may not use (Chaos Dwarfs and god-specific Chaos items).
`items` holds army-book items missing from the shared catalogue; `entries: [...]` restricts an item to particular
special characters (e.g. Fearfrost). Characters get their allowance from
`magicItems` (per variant), wizards are marked with `"wizard": true`, and `startingItems` pre-adds signature
items (e.g. Gorbad's Morgor the Mangler) that the player can still remove.

**Dwarf runic items.** `magic.runes: "dwarf-runes"` loads a rune catalogue (`"kind": "runes"`) with `types` (weapon,
armour, protection, engineering, talismanic runes), `forms` (the items runes go on: runic weapon, armour, talisman,
standard, engineering runes, each naming its rune type and the item kind it counts as) and `runes`
`{id, name, type, points, page, master?, maxPerItem?, alone?, prideExempt?, battleStandardOnly?, runesmithOnly?, machines?, only?, effect}`.
A selection's runic item is an extra `{ runic: form, runes: [ids], label?, onBoss? }`; its points are the sum of its runes
and it counts against the normal magic item allowance. Checks: at most three runes (Rule of Three), runes of the item's
own type (Rule of Form), one master rune per item and each master rune once per army (Jealous Runes), no two items with
the same runes (Rule of Pride; a lone Rune of Stone excepted), `maxPerItem`, `alone` (Gromril), `battleStandardOnly`,
`runesmithOnly` (entry `runesmith: true`), `machines` (entry ids), armour runes need armour or a shield, engineering runes
only on entries with `engineering: true`. `magic.onePerKind` maps item kinds to names and warns when a model has two
items of one kind (cards and runic items together). Entry `itemTypes: ["weapon"]` limits what a character may carry
(Slayer Champions), and `runicItems: [{name, form, runes}]` lists a special character's own runic items so they count
for the master rune and Rule of Pride checks.

## Army-wide rules

```json
{ "type": "exactlyTag", "tag": "warlord", "count": 1, "message": "…" }
{ "type": "maxTag", "tag": "bsb", "count": 1, "message": "…" }
{ "type": "perUnits", "entry": "squig-hoppers", "max": 5, "per": ["night-goblins", "netters"], "model"?: "half", "message": "…" }
{ "type": "unitsBySize", "entries": ["warpfire-throwers", "jezzails"], "per": 5, "message": "…" }
{ "type": "requireEntry", "entry": "warriors", "message": "…" }
{ "type": "minCategoryIf", "entry": "ikit-claw", "category": "war-machines", "min": 25, "message": "…" }
{ "type": "itemLimit", "item": "runefang", "exceptEntries": ["boris-todbringer", …], "max": 1, "message": "…" }
{ "type": "detachments", "max": 2, "message": "…" }
{ "type": "retinues", "summoned": 1, "message": "…" }
{ "type": "requiresGeneral", "entries": ["battle-standard"], "general": ["champion", "sorcerer"], "message": "…" }
{ "type": "maxUnits", "entry": "harpies", "max": 1, "unlessGeneral": ["chieftain", "shaman"], "message": "…" }
{ "type": "generalFrom", "categories": ["w-warlords"], "message": "…" }
{ "type": "perPoints", "entry": "banshees", "per": 1000, "max"?: 1, "message": "…" }
```

`perPoints`: at most `max` (default 1) models of the entry for every full `per` points of the army's points limit.
In `perUnits`, a `per` id may name one variant as `"entry:variant"` (e.g. `"battle-standard:thrall"` counts only a
Vampire Thrall standard bearer when allowing half-cost Bat Swarms per Vampire).

`perUnits` counts characters as one each and, with `model`, only that model type (half-price Rat Swarm bases);
`units: true` counts units instead of models, `atLeast` is a guaranteed minimum (two Repeater Bolt Throwers),
and `entry` may be a list.
`unitsBySize`: up to `per` models may form one unit, `2 × per` up to two units, and so on (models attached to a regiment are not counted).

`retinues`: every selection tagged `warlord` needs units attached to it (`attachTo.retinue`, followed down the chain)
worth at least its own points; `summoned` Warlords marked `summonable` may have none.
`requiresGeneral`: these entries need the General to be one of `general`. `maxUnits`: at most `max` units of an entry
unless the General is one of `unlessGeneral`. `generalFrom`: the General must come from these categories (not from the allies).

Detachments: a `stateTroops` unit can point to a parent regiment (`parent` on the selection). The check flags
more than `max` detachments per regiment, a detachment bigger than half its regiment, and command models in a detachment.

New army books will need new rule types. Add them to `validate()` in `js/calc.js` and list them here.

## Pricing conventions

- Unit size includes the leader, standard bearer, musician and Boss.
- Standard bearer and musician cost double a trooper (with options), so each adds one trooper's cost.
- A Boss replaces a trooper; his cost (race cost + the unit's gear priced from `equipment` + mount)
  goes to Characters, as do his magic items.
- Magic item catalogues may set `book` on items (e.g. "RoC") for the page reference shown in the picker, and `gods`
  for Daemonic Rewards restricted to a god (`"unaligned"` = a Daemon Prince without a Mark).
- Halves are kept exact and shown as ½; nothing is rounded.
