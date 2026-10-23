# WHFB 5e List Builder

An army list builder for **Warhammer Fantasy Battle, 5th edition**, in the spirit of
[Old World Builder](https://old-world-builder.com/).

- Choose an army and a points total, then add characters, units, war machines and monsters.
- Points are worked out per the army book, including unit options, command models, Bosses
  (paid from the Characters allowance), mounts, monsters and chariots ridden by characters.
- Problems are **flagged, not blocked**: category percentages, 0-1 choices, a single Warlord,
  "requires a Mob of …" rules, minimum unit sizes, magic standard limits and so on.
- Export a finished list as an **A4 roster sheet PDF** laid out like the classic Warhammer roster,
  as plain text, or as a `.json` file you can import again.
- Lists are saved in your browser (localStorage).

Armies so far: **Orcs & Goblins**, **The Empire** (detachments, Champions, Elector Counts, the Runefang limit),
**Skaven** (war teams and Assassins with their regiments, Clan Moulder packs, half-price Rat Swarms, Ikit Claw's
war machine minimum), **The Undead** (Undead Champions leading regiments, character chariots, Carrion and Wraith units),
**Vampire Counts** (Vampire Powers by bloodline as a separate allowance next to magic items, one bloodline per army,
Banshees per 1,000 points, half-cost Bat Swarms per Vampire),
**High Elves**, **Lizardmen** (scaly-skin saves, Slann palanquins, Kroxigor with Skinks), **Bretonnia** (knightly
virtues, free Knight command models, Commoners allowance), **Chaos Dwarfs** and **Chaos** from *Realm of Chaos*
(Chaos Warrior, Beastman or Daemon warband, with the other warbands and the Monstrous Host as allies; each Warlord's
retinue must be worth his points; Marks of Chaos, daemonic steeds and Daemonic Rewards). Special rule keywords (Animosity, Fear, Frenzy…) pre-fill the roster's Notes column. Magic items come from the *Warhammer Magic* (5th edition) item summary,
filtered to what the army may use, with checks for item allowances, one Ward per model, Wizard Arcana,
race-restricted items and duplicates. Anything missing can still be added as a custom item.

## Running it

It's a static site with no build step and no external libraries (the PDF writer is built in).

- **GitHub Pages:** Settings → Pages → *Deploy from a branch* → `main`, folder `/ (root)`.
- **Locally:** browsers won't load the data files from `file://`, so start a small server in the
  repo folder, e.g. `python3 -m http.server 8000`, and open <http://localhost:8000>.

## Project layout

```
index.html               app shell
css/style.css            styles (light + dark)
js/app.js                user interface
js/calc.js               points, saves and validation (pure functions, no DOM)
js/pdf.js                roster rows + A4 roster sheet layout
js/minipdf.js            minimal PDF writer using the standard Times/Helvetica fonts
js/fontmetrics.js        glyph widths for those fonts
js/magic.js              magic item catalogues, pickers and checks
data/armies/index.json   list of available armies
data/armies/*.json       one file per army book (chaos-realm.json is shared by the three Chaos warbands)
data/magic/*.json        magic item catalogues, Daemonic Rewards and Vampire Powers (names, points, restrictions)
docs/data-format.md      how an army file is structured
tests/calc.test.mjs      `node tests/calc.test.mjs`
```

## Adding an army

Add a JSON file in `data/armies/` and register it in `data/armies/index.json`.
Army-specific composition rules (categories and their percentages, "requires a unit of race X",
"up to N per unit of Y", 0-1 limits, Warlord/Battle Standard tags) are data, not code. See
[docs/data-format.md](docs/data-format.md).

## Notes

Unofficial fan tool. Warhammer is a trademark of Games Workshop Ltd. The data files contain
names, profiles and points only; you need the army books to play.
