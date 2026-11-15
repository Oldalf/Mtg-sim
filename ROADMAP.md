# Roadmap

Decided 2026-11-12 (Pontus). The big steps below go in this order. Deck work (new decks, cuts, logs, refinements, pod steps) is ongoing, happens before, during or after these steps, and is not part of the roadmap. It lives in each deck's `PLAN.md` and in `POD_PLAN.md`. The goal of the roadmap is to make that ongoing work easier.

## 1. Code follows the coding standards (CLAUDE.md) (done)

- Prettier is set up and the code is formatted (`npm run format`).
- Done: the existing code was brought in line with CLAUDE.md (rule 0 names, readability, KISS, rule of three). Every change left `--regress check` IDENTICAL for all decks and pod output unchanged.
- Known leftovers: card-nickname constants in aesi (e.g. `BSZ`, `OMNI`), a few 3+ letter abbreviations, and `engine/game/game-core.ts` is still about 2,280 lines.

## 2. Scryfall bulk data replaces per-card fetching (done)

- `npm run cards -- update` downloads Scryfall's oracle cards and rulings (gzipped JSONL) into `data/scryfall/` (not in git), with `bulk-info.json` next to them (download date, latest set). It is run by hand, once now and again when new sets come out.
- The files stay gzipped and are streamed line by line; only matching cards are parsed. The simulator still reads only `data/cards.json` (in git: the cards the lists use, now with Scryfall ids; rulings are downloaded but stay out of it, `rulingsFor` reads them), so run speed is unchanged. Cards missing from it are added from the bulk data automatically before a run.
- `npm run cards -- refresh` rebuilds the stored cards from the bulk data and lists the ones whose rules text changed. Run once: no card changed in a way that affects play, `--regress check` is IDENTICAL for all decks, pod output unchanged.
- Images are not downloaded. Each card keeps its `scryfall_id`, so images can later be fetched for just the cards the lists use.

## 3. Game logs (done)

- Every game of a `sim` or `pod` run is logged as events: a readable line plus its card moves in Archidekt's simple format, the format of the logs Pontus has provided. A goldfish game, a pod game and a real Archidekt log share one format. The plan and what was decided on the way are in git (`PLAN.md` at commit `df7eca7`); `ENGINE.md` has the rules for new code.
- The games worth reading get a tag (fastest, slowest, average, win-stopped...) and are saved as text; `npm run logs` reads any game, with its card moves, its highlights or the board at the end of each turn.
- Logs live in `session-logs/` (not in git) and are cleared when the next `sim` or `pod` command starts a run. Until step 4 there is no application to start, so one session is the last run command.
- Every zone change in the engine and the decks goes through the engine's functions (`takeCard`, `putCard`, `moveCard`...), which record it; `--test` fails on one that does not. Results did not change: `--regress check` IDENTICAL for all decks.
- For step 4: the board at any point is rebuilt from the moves (`boardAt`), and a game can be played again from its run (`replayGame`).

## 4. App with a simple UI (first step done 2026-11-14)

- `npm run app` starts a local server (Node's own `http`, 127.0.0.1:4173, inside the simulator's bundle so the worker threads work as before) and opens an Angular page (Angular Material, dark). The plan and its notes per task are in git (`PLAN.md` at commit `4588599`); `README.md` has the commands and folders, `ENGINE.md` what the server calls, `app/web/CLAUDE.md` the page's rules.
- Pages: Decks (decklists by section, card images), Simulate (one deck, one or more lists, settings, `--diag`, progress and stop, kill-turn tables and chart, games worth a look), Pod (3 to 6 seats, threat, policy, settings, the pod report), Games (the runs of the session, filters, each deck's real Archidekt logs) and the game viewer (log by turn, the board after any line, stepping by line, turn and highlight). The viewer is a table you can watch (step 5, done 2026-11-14): a grid of seats that keep their place, a caption under the table, a control bar with a scrub bar, autoplay, and a log drawer; checked at 1 to 6 seats, real logs and a 390 px phone width.
- Card images come from Scryfall by `scryfall_id` and are kept in `data/scryfall/images/`; without them a card shows as text.
- Tests: `npm run app -- --test` (the API) and `ng test` in `app/web/` (the board of the viewer, the report tables, the two forms); `npm run verify` runs both.
- Left for later: pick the print of a card in a decklist (for its image): the image call and the card component already take a Scryfall id (`?print=`); still to do are the list of prints of a card (from Scryfall's search, not in the bulk data) and a place for the choice in the decklist file. Not in the app yet (still on the command line): `--rank`, `--cut`, `--hands`, `--analyze`, `--regress`, the card data commands, editing lists.

## 5. Tidy up and a game you can watch (done 2026-11-14)

The plan and its notes per task are in git (`PLAN.md` at commit `85acdc5`).

- Fewer decklists: each deck keeps `decklist.txt` (the original), its adopted list as `lists/proposed.txt` and the alternatives named after what they change. The app's archive switch is gone.
- The engine is in folders by topic (`cards`, `game`, `game-log`, `pod`, `run`, `tools`, `util`); `ENGINE.md` has the table.
- `/add-deck` (`.claude/skills/add-deck/SKILL.md`) walks a model through adding a deck; it was tried on the Edgar deck.
- The game viewer has autoplay (Space, three speeds, kept in `localStorage`), the line in the URL (`?line=`), and is a grid table of seats that keep their place (see step 4), checked at 1 to 6 seats, real logs and phone width.

## 6. What Pontus saw in the viewer (done 2026-11-15)

The plan and its notes per task are in git (`PLAN.md` at commit `330b641`).

- Whole game rows are links; the caption keeps one height while autoplay runs.
- The fastest and slowest tags go only to games won on the earliest and latest turn (none when every game won on the same turn), `most-interaction` the same way.
- Energy, experience and poison are player counters in the engine, the log and the viewer (a chip on the seat).
- Volatile Stormdrake takes a creature in a pod: a permanent can change control between players (`Permanent.owner`, `GameCore.giveControlTo`), with energy paid to keep it.
- Tokens: the deck owns a token's stats, Scryfall only gives its art (`data/token-art.json`, `pickTokenArt`). The log writes a creature token's face next to its name, so tokens with the same name and other stats stay apart; Aesi's armies are logged as x999. The viewer shows a creature token as Scryfall's art in our own frame with the game's stats, other tokens as their Scryfall token card.
- D4 was committed without `npm run verify` (Pontus skipped it); step 7 runs it first.

## 7. Mana as it really is, then Pontus's ideas (in progress)

The plan is in `PLAN.md`: a wrong Gale win (a filter Signet counted as free mana by the kill search), then mana tapped in order into a floating pool that empties between the steps of a turn, then Meren's Snake, cards that grow on hover in the viewer, and a stats page per run in the Games tab.

## 8. Gale's kill search taps lands and counts mana for real (planned, after step 7)

Pontus, 2026-11-15: do this after step 7's other tasks. Step 7's B3 plays every kill line for real, and 9 of 300 Gale seeds still have a kill miss (`KILL_MISS_SEEDS_SHOWN=100 npm run sim -- gale --test` lists them; until then Gale's `--test`, and so `npm run verify`, fails on them). The cause: `KillSearchState` keeps all its mana in one pool, lands and rocks and rituals together, as if every land were already tapped. So it can't tell which lands are still untapped when a High Tide or Bubbling Muck resolves or an untap spell comes (seed 199: Gale recasts Dark Ritual before the Muck resolves, so a Swamp is tapped for it and loses the bonus).

The idea: the search keeps its untapped lands as counts by kind (Islands, Swamps, Island-Swamps, others, filter lands) and its rocks apart, and taps them as a payment needs them, the way the real game's `pay` does, with floating mana as the pool. High Tide and Muck then count the lands really untapped, untaps put back real lands, and `payBonusSpell` and the `...FromOutsideLands` counters go away. Opus 5.5, with a design first (`PLAN.md` B3b part 2, at commit `e686967`, has the details), the speed measured (Gale's search is most of its 25 s; it must stay fast) and Pontus's yes. Done when Gale's `--test` has no kill miss.

## Ideas not decided (Pontus picks)

Left from the planning of step 5. Each names the model it would need.

1. **Split `engine/game/game-core.ts`** (Opus 5.5). 2,276 lines, the size guide says about 800: one file per topic (zones, mana and payment, casting, creatures and combat, turn loop, planner). Must be IDENTICAL. `decks/aesi/game.ts` (1,129) and `decks/mike/game.ts` (962) are over the guide too.
2. **Shorter file names inside the engine folders** (Haiku 5.5). `game-log/game-log-files.ts` to `game-log/files.ts`, `pod/pod-table.ts` to `pod/table.ts`. A second round of import changes.
3. **One place to register a deck** (Sonnet 5.5). Today a deck is named in `DECKS`, `TESTS`, `REGRESS` in `decks/index.ts` and two arrays in `scripts/verify.mjs`. If each deck's `index.ts` exported its tests and regress lists and `verify` asked the simulator for the names, it would be one line (and `/add-deck` shorter).
4. **A rule for test lists** (Pontus, then Haiku 5.5). Test lists go to a folder git ignores (say `lists/scratch/`); only a list Pontus picks is copied into `lists/`. The rule goes into `CLAUDE.md` and each deck's `PLAN.md`.
5. **The app knows the adopted list** (Sonnet 5.5). Mark `lists/proposed.txt` where it exists and preselect it in Simulate and Pod. Also the open point in `decks/aesi/PLAN.md`: make the proposed list the default or not.
6. **A skill for testing a swap** (Opus 5.5). Build the list, run 16,000 games against the base with the same seeds, read `--diag`, write the result into the deck's `PLAN.md` and `SWAPS.txt`.
7. **One board, not two** (Sonnet 5.5). `engine/tools/log-board.ts` (the analyzer) and `shared/game-log-board.ts` (the log, which the viewer uses) each apply card moves with their own code.
8. **Leftovers of step 1** (Haiku 5.5). The card-nickname constants in aesi (`BSZ`, `OMNI`) and a few abbreviations. Must be IDENTICAL.
9. **Watch a game straight from a result** (Haiku 5.5). A "watch" button next to each game in "games worth a look" and the pod report that opens the viewer already playing (`?play=1`).
