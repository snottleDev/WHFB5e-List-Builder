# Army data format

Each army is one JSON file in `data/armies/`. Profiles are always 9 strings in the order
`M WS BS S T W I A Ld` (use `"-"`, `"sp"`, `"2D6"` etc. where the book does).

## Top level

| key | meaning |
|---|---|
| `id`, `name`, `source` | identification; `source` is shown under the list |
| `categories` | `[{id, name, min?, max?}]`, percentages of the points limit. The category with a `min` is treated as the core troops ("Mobs" for O&G, "Regiments" elsewhere) |
| `races` | `{raceId: "Display name"}` used for "requires a Mob of …" checks |
| `equipment` | items characters may buy: `{id, name, cost, group?, armour?, mountedOnly?, troopOnly?}`; `armour` is `shield`, `light`, `heavy` or `barding` (barding adds +1 only when mounted); `troopOnly` items are only used to price champions |
| `mounts` | mounts for characters: `{id, name, cost, races?, profile, saveBonus?, specialOnly?}`; no `races` = anyone; `specialOnly` = only entries that list it in `mounts` |
| `characterChariots` | entry ids of chariots a character may ride (cost added to the character) |
| `bossCosts`, `bossProfiles` | unit champion base cost/profile by race (O&G "Bosses", Empire "Champions"); omit if the army has none |
| `championName` | what unit champions are called (default "Boss") |
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
`tags`, `extraProfile(s)`, `mountProfile`; `armour[]`, `cavalry`, `saveBonus` for the save.

**Units:** `cost` (per model) or `models: [{id, name, cost, counts}]` for mixed units;
`variants` (e.g. troll type or rock lobber size, may carry their own `cost` and `single` name);
`minSize`, `sizeLabel`, `noCommand`, `race`, `profiles[]`, `armour[]`, `cavalry`, `saveBonus`,
`save` (fixed override), `magicStandard` (`any` / `one`), `bossGear`, `bossMount`, `bossOptions`,
`crew` (chariots), `ratio` (e.g. one hunter team per three squigs), `maxModels` (e.g. 0-8 Steam Tanks across all units),
`stateTroops` (may form or receive Empire detachments).

Unit `options`: `{id, name, cost, per?, group?, count?, max?, gear?, armour?, addsCrew?, replacesGear?}`
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

`items` holds army-book items missing from the shared catalogue; `entries: [...]` restricts an item to particular
special characters (e.g. Fearfrost). Characters get their allowance from
`magicItems` (per variant), wizards are marked with `"wizard": true`, and `startingItems` pre-adds signature
items (e.g. Gorbad's Morgor the Mangler) that the player can still remove.

**Planned extensions** (not built yet):
- *Chaos gifts*: a second pool, e.g. `{ "id": "gifts", "catalogues": ["chaos-gifts"], "allowance": "gifts" }`,
  with `"gifts": n` on the character variants. Gifts are then counted separately from magic items.
- *Dwarf runes*: a `runes` pool replacing `magic`, with rune-specific checks (runes per item, master runes once per
  army, etc.) added as new rule types in `js/magic.js`.

## Army-wide rules

```json
{ "type": "exactlyTag", "tag": "warlord", "count": 1, "message": "…" }
{ "type": "maxTag", "tag": "bsb", "count": 1, "message": "…" }
{ "type": "perUnits", "entry": "squig-hoppers", "max": 5, "per": ["night-goblins", "netters"], "message": "…" }
{ "type": "itemLimit", "item": "runefang", "exceptEntries": ["boris-todbringer", …], "max": 1, "message": "…" }
{ "type": "detachments", "max": 2, "message": "…" }
```

Detachments: a `stateTroops` unit can point to a parent regiment (`parent` on the selection). The check flags
more than `max` detachments per regiment, a detachment bigger than half its regiment, and command models in a detachment.

New army books will need new rule types. Add them to `validate()` in `js/calc.js` and list them here.

## Pricing conventions

- Unit size includes the leader, standard bearer, musician and Boss.
- Standard bearer and musician cost double a trooper (with options), so each adds one trooper's cost.
- A Boss replaces a trooper; his cost (race cost + the unit's gear priced from `equipment` + mount)
  goes to Characters, as do his magic items.
- Halves are kept exact and shown as ½; nothing is rounded.
