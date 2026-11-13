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
npm run sim -- gale --trace 3                        # play-by-play of 3 games, to check the AI's lines (--moves adds the card moves)
npm run logs                                         # the games of the last sim / pod command: its runs and their tagged games
npm run logs -- 1 --seed 412                         # one game of run 1 as text (--moves: card moves, --highlights: only the key lines)
npm run logs -- 1 --tag fastest                      # every game of run 1 with that tag
npm run sim -- gale --no-log                         # don't write the games to session-logs/
npm run sim -- gale --rank                           # rank cards by how much seeing them by turn 4 helps
npm run sim -- gale --cut "Card A" "Card B"          # cut each card for an Island (--replace Swamp) and compare
npm run sim -- gale --analyze logs/game6.txt -d lists/proposed.txt   # check a real game for missed kills
npm run sim -- aesi lists/a.txt lists/b.txt --diag   # a deck's own consistency measures per list (Aesi, Meren: slow starts, when the commander comes down)
npm run sim -- gale --eco                            # power-save mode: for long runs in the background while you play (see below)
npm run sim -- aesi --hands -n 8000                  # how opening hands do, by land count and contents (for mulligan advice)
npm run cards                                       # when the Scryfall data was downloaded, and its latest set
npm run cards -- update                             # download Scryfall's bulk data (only when new sets are out)
npm run cards -- refresh                            # update the cards in data/cards.json from it
npm run sim -- gale --test                           # the deck's kill-finder tests (must print ALL OK)
npm run sim -- gale --regress check                  # after a refactor: results must be IDENTICAL
npm run pod -- gale meren samfrodo aesi mike -n 1000 # a pod: the decks play against each other (3 to 6 decks; see POD_PLAN.md)
npm run check                                        # type-check the code
```

`npm run sim` bundles the code with esbuild (a few milliseconds) and runs it. Games run in parallel on all cores but one (`-w N` to change).

**Power-save mode (`--eco`, or `npm run eco -- <deck> ...`):** for long runs while you do something else. It lowers the process priority, uses a quarter of the cores and makes each worker rest between chunks, so it is busy about 70% of the time (`--duty N` changes that, `-w N` the worker count). Results are identical, only slower: on a 16-core machine a run takes about 3 times as long and keeps about 3 of 16 cores busy on average (instead of nearly all), and it prints the average at the end. Lists and logs are looked up as given, then inside the deck's folder.

**Testing a change:** copy `decks/gale/decklist.txt` to `decks/gale/lists/test.txt`, edit it, then run `npm run sim -- gale decklist.txt lists/test.txt -n 3000`. A card that is not in `data/cards.json` yet is added from the downloaded Scryfall data automatically (no network; if the card is from a newer set, run `npm run cards -- update` first). New cards are played generically (by type and mana cost) until rules are added: card facts that hold in any deck go in `engine/cards.ts` / `engine/game-core.ts`, deck-specific behaviour in the deck's folder.

## Layout

| Folder / file | What it is |
|---|---|
| `engine/` | The shared engine: card data (`cards.ts`), card facts that hold in any deck (`card-facts.ts`, `land-text.ts` reads unknown lands from their text), the rules of one game (`game-core.ts`: zones, mana, lands, casting, draw/scry/tutor effects, turn loop, mulligans, turn planner; its header lists the hooks a deck fills in), the pod parts of a game (`game.ts`: blocks, removal, counterspells), shared types (`game-types.ts`), the pod (`pod.ts` plays the rounds, with `pod-table.ts`, `pod-combat.ts`, `pod-blocking.ts`, `pod-interaction.ts`, `pod-arena.ts`, `pod-report.ts`), the kill-search driver (`search.ts`), the runner (`runner.ts`: worker threads and games), the tables it prints (`report.ts`), card ranking and cut tests (`ranking.ts`), the Archidekt log analyzer (`analyze.ts`, with the board rebuilt from a log in `log-board.ts`), the Scryfall bulk data reader (`scryfall.ts`), the game logs (`game-log.ts` and the `game-log-*.ts` files: events, card moves, text, files, tags), the refactor safety net (`regress.ts`) and seeded random numbers (`rng.ts`). |
| `decks/<name>/` | One deck: its AI (a `Game` subclass in `game.ts`), its card rules, settings (`config.ts`), `index.ts`, `decklist.txt`, test lists (`lists/`), real-game logs (`logs/`), tests (`tests/`). Gale also has a kill search (`kills.ts`) and card roles (`roles.ts`). |
| `data/cards.json` | Oracle data for every card the lists use (no rulings: they stay in the bulk file, `rulingsFor` in `scryfall.ts` reads them), shared by all decks. The only card file the simulator reads. In git. |
| `data/scryfall/` | Scryfall's bulk files (gzipped, never unzipped) and `bulk-info.json` (download date and latest set: when it is time to run `npm run cards -- update` again). Not in git. Filled by `npm run cards -- update`. |
| `sim.ts`, `cli/` | The command line: `sim.ts` picks the command (and holds the code each worker thread runs), `cli/` has the options (`args.ts`), the deck report (`deck-command.ts`), the pod (`pod-command.ts`), the log viewer (`logs-command.ts`, `log-session.ts`), card data (`cards-command.ts`) and power-save mode (`eco.ts`). `decks/index.ts` lists the decks. |
| `regress_baseline/` | Saved results for `--regress check`. |
| `session-logs/` | The log of every game of the last `sim` or `pod` command, one folder per run (`engine/game-log-files.ts` describes it). Cleared when the next command starts a run. Not in git. Read it with `npm run logs`. |
| `ENGINE.md` | Engine notes: rules for changing it, what it provides, history, ideas. |
| `PLAN.md` | The plan for the roadmap step in progress. Each deck has its own `PLAN.md`; phases and next steps are in `ROADMAP.md`. |

Current decks:
- `gale`: Gale, Waterdeep Prodigy + Scion of Halaster, Dimir spellslinger combo. See [decks/gale/README.md](decks/gale/README.md) and its `PLAN.md`.
- `meren`: Meren of Clan Nel Toth, Golgari reanimator (bracket 2–3). Wins with 2 opponents dead or 100 damage in total; combat uses goldfish blocking and crackback rules (`decks/meren/PLAN.md`). Run `npm run sim -- meren`.

- `samfrodo`: Sam & Frodo, Abzan tokens / aristocrats (bracket 2–3). Wins with all three opponents drained from 40; only Frodo and Gollum attack, unless an all-in attack kills the table. Run `npm run sim -- samfrodo` (rules and results: `decks/samfrodo/PLAN.md`).
- `aesi`: Aesi, Tyrant of Gyre Strait, Simic "reverse landfall" (bracket 3). Extra land drops, lands returned and replayed, and loops shortcut by a solver (mill, endless flyers, Uyo copies). Run `npm run sim -- aesi` (rules and results: `decks/aesi/PLAN.md`).

- `mike`: Vnwxt, Verbose Host, mono-blue card draw (bracket 2–3). Three wins: mill yourself out with Laboratory Maniac / Jace, Twenty-Toed Toad with 20 cards in hand, or drain/attack all three opponents (Psychosis Crawler, Krakens, Hand of Vecna). Every draw is modelled (Vnwxt at max speed and Teferi double it). Run `npm run sim -- mike` (rules and results: `decks/mike/PLAN.md`).

- `codie`: Codie, Vociferous Codex, five-colour spells combo (bracket 4, someone else's deck). Wins with an X spell (Exsanguinate, Crackle with Power, Torment of Hailfire), copied by Reiterate. A solver finds the kill line each turn and recognises Reiterate loops (Jeska's Will, Mana Geyser, Brass's Bounty), treating the mana they make as bottomless. Run `npm run sim -- codie` (rules and results: `decks/codie/PLAN.md`).

The phases (Meren, Sam & Frodo, Simic landfall, Mike, then Codie) and what each needs: `ROADMAP.md`.

## Adding a deck

Make `decks/<name>/` with an `index.ts` that exports `deck = { name, dir, defaultList, config, Game }`, where `Game` extends the engine's `Game` class. Register it in `DECKS` (and its tests in `TESTS` / `REGRESS`) in `decks/index.ts`. The subclass fills in the hooks listed in the header of `engine/game-core.ts`: what the AI wants to do (`candidates`, `cardValue`, `positionValue`, `tutorTarget`), how it wins (`buildKillSearchState`, `killSearch`, `killReachable`, or `combat`), and the effects of cards only it uses (`resolveOther`, `castTriggers`, `beforeDraw`, `onToGraveyard`). Gale is the worked example.

The engine handles all five colours, creatures (power / toughness, counters, tokens), enter and death triggers, sacrifice, devotion, life totals and a goldfish combat model (`creatureCombat`: flyers connect, half the ground attackers are blocked, crackback unless blockers stay home or a fog creature is used).

## Output

- **Win possible (any):** the first turn on which the AI finds a line that kills all 3 opponents (life, decking or poison).
- **Win with counter backup:** the same, but you also have a counterspell in hand and the mana to cast it after the combo.
- In a comparison, differences smaller than the printed noise level (about ±2.6 points at 3,000 games) are likely luck.

## Assumptions

Opponents never interact, attack or block. "Decked" opponents count as beaten, since they lose on their next draw. Mulligans: one free mulligan, then London mulligan. Each deck has a mulligan rule (`decks/<name>/mulligan.ts`, plain data: land ranges, needed colours and card tags); `--set smart_mulligan=0` plays the old "keep 2–5 lands" instead.

The AI is a heuristic player, not a perfect one. Absolute numbers are a rough guide; comparisons between lists are more reliable.
