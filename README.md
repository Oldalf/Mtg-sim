# Commander goldfish simulator

Simulates thousands of games of a Commander deck against 3 opponents who do nothing ("goldfish") and reports on which turn you can win. It's built for comparing decklists: every list is played by the same AI on the same random seeds.

Written in TypeScript and run with Node.js (it was ported from Python in November 2026).

## Setup

Install [Node.js](https://nodejs.org) 20 or newer, then once in this folder:

```
npm install
```

## Commands

```
npm run sim -- gale                                  # kill-turn table for decks/gale/decklist.txt (5000 games)
npm run sim -- gale -n 20000                         # more games = less noise
npm run sim -- gale decklist.txt lists/a.txt lists/b.txt   # compare lists on the same seeds (first = base)
npm run sim -- gale --set planner=0                  # same list, default AI vs a changed setting
npm run sim -- gale --turns 10                       # look further than turn 8
npm run sim -- gale --trace 3                        # play-by-play of 3 games, to check the AI's lines
npm run sim -- gale --rank                           # rank cards by how much seeing them by turn 4 helps
npm run sim -- gale --cut "Card A" "Card B"          # cut each card for an Island (--replace Swamp) and compare
npm run sim -- gale --analyze logs/game6.txt -d lists/proposed.txt   # check a real game for missed kills
npm run sim -- aesi lists/a.txt lists/b.txt --diag   # a deck's own consistency measures per list (Aesi, Meren: slow starts, when the commander comes down)
npm run sim -- gale --eco                            # power-save mode: for long runs in the background while you play (see below)
npm run sim -- aesi --hands -n 8000                  # how opening hands do, by land count and contents (for mulligan advice)
npm run sim -- gale --fetch lists/new.txt            # download data for new cards from Scryfall
npm run sim -- gale --test                           # the deck's kill-finder tests (must print ALL OK)
npm run sim -- gale --regress check                  # after a refactor: results must be IDENTICAL
npm run check                                        # type-check the code
```

`npm run sim` bundles the code with esbuild (a few milliseconds) and runs it. Games run in parallel on all cores but one (`-w N` to change).

**Power-save mode (`--eco`, or `npm run eco -- <deck> ...`):** for long runs while you do something else. It lowers the process priority, uses a quarter of the cores and makes each worker rest between chunks, so it is busy about 70% of the time (`--duty N` changes that, `-w N` the worker count). Results are identical, only slower: on a 16-core machine a run takes about 3 times as long and keeps about 3 of 16 cores busy on average (instead of nearly all), and it prints the average at the end. Lists and logs are looked up as given, then inside the deck's folder.

**Testing a change:** copy `decks/gale/decklist.txt` to `decks/gale/lists/test.txt`, edit it, then run `npm run sim -- gale decklist.txt lists/test.txt -n 3000`. If a card is new, run `--fetch` on the list first. New cards are played generically (by type and mana cost) until rules are added: card facts that hold in any deck go in `engine/cards.ts` / `engine/game.ts`, deck-specific behaviour in the deck's folder.

## Layout

| Folder / file | What it is |
|---|---|
| `engine/` | The shared engine: card data and facts (`cards.ts`), the game (`game.ts`: zones, mana, lands, casting, draw/scry/tutor effects, turn loop, mulligans, turn planner), the kill-search driver (`search.ts`), the runner (`runner.ts`: worker threads, tables, card ranking, cut tests), the Archidekt log analyzer (`analyze.ts`), the Scryfall fetcher (`fetch.ts`), the refactor safety net (`regress.ts`) and seeded random numbers (`rng.ts`). |
| `decks/<name>/` | One deck: its AI (a `Game` subclass in `game.ts`), its card rules, settings (`config.ts`), `index.ts`, `decklist.txt`, test lists (`lists/`), real-game logs (`logs/`), tests (`tests/`). Gale also has a kill search (`kills.ts`) and card roles (`roles.ts`). |
| `data/cards.json` | Oracle data for every card used, shared by all decks. |
| `sim.ts` | The command line (and the code each worker thread runs). |
| `regress_baseline/` | Saved results for `--regress check`. |
| `PLAN.md` | Engine notes: rules for changing it, what it provides, history, ideas. Each deck has its own `PLAN.md`; phases and next steps are in `ROADMAP.md`. |

Current decks:
- `gale`: Gale, Waterdeep Prodigy + Scion of Halaster, Dimir spellslinger combo. See [decks/gale/README.md](decks/gale/README.md) and its `PLAN.md`.
- `meren`: Meren of Clan Nel Toth, Golgari reanimator (bracket 2–3). Wins with 2 opponents dead or 100 damage in total; combat uses goldfish blocking and crackback rules (`decks/meren/PLAN.md`). Run `npm run sim -- meren`.

- `samfrodo`: Sam & Frodo, Abzan tokens / aristocrats (bracket 2–3). Wins with all three opponents drained from 40; only Frodo and Gollum attack, unless an all-in attack kills the table. Run `npm run sim -- samfrodo` (rules and results: `decks/samfrodo/PLAN.md`).
- `aesi`: Aesi, Tyrant of Gyre Strait, Simic "reverse landfall" (bracket 3). Extra land drops, lands returned and replayed, and loops shortcut by a solver (mill, endless flyers, Uyo copies). Run `npm run sim -- aesi` (rules and results: `decks/aesi/PLAN.md`).

The phases (Meren, Sam & Frodo, then Simic landfall) and what each needs: `ROADMAP.md`.

## Adding a deck

Make `decks/<name>/` with an `index.ts` that exports `deck = { name, dir, defaultList, cfg, Game }`, where `Game` extends the engine's `Game` class. Register it in `DECKS` (and its tests in `TESTS` / `REGRESS`) at the top of `sim.ts`. The subclass fills in the hooks at the bottom of `engine/game.ts`: what the AI wants to do (`candidates`, `cardValue`, `positionValue`, `tutorTarget`), how it wins (`light`, `killSearch`, `killReachable`, or `combat`), and the effects of cards only it uses (`resolveOther`, `castTriggers`, `beforeDraw`, `onToGy`). Gale is the worked example.

The engine handles all five colours, creatures (power / toughness, counters, tokens), enter and death triggers, sacrifice, devotion, life totals and a goldfish combat model (`creatureCombat`: flyers connect, half the ground attackers are blocked, crackback unless blockers stay home or a fog creature is used).

## Output

- **Win possible (any):** the first turn on which the AI finds a line that kills all 3 opponents (life, decking or poison).
- **Win with counter backup:** the same, but you also have a counterspell in hand and the mana to cast it after the combo.
- In a comparison, differences smaller than the printed noise level (about ±2.6 points at 3,000 games) are likely luck.

## Assumptions

Opponents never interact, attack or block. "Decked" opponents count as beaten, since they lose on their next draw. Mulligans: one free mulligan, then London mulligan. Each deck has a mulligan rule (`decks/<name>/mulligan.ts`, plain data: land ranges, needed colours and card tags); `--set smart_mulligan=0` plays the old "keep 2–5 lands" instead.

The AI is a heuristic player, not a perfect one. Absolute numbers are a rough guide; comparisons between lists are more reliable.
