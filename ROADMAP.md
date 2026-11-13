# Roadmap

Decided 2026-11-12 (Pontus). The big steps below go in this order. Deck work (new decks, cuts, logs, refinements, pod steps) is ongoing, happens before, during or after these steps, and is not part of the roadmap. It lives in each deck's `PLAN.md` and in `POD_PLAN.md`. The goal of the roadmap is to make that ongoing work easier.

## 1. Code follows the coding standards (CLAUDE.md) (done)

- Prettier is set up and the code is formatted (`npm run format`).
- Done: the existing code was brought in line with CLAUDE.md (rule 0 names, readability, KISS, rule of three). Every change left `--regress check` IDENTICAL for all decks and pod output unchanged.
- Known leftovers: card-nickname constants in aesi (e.g. `BSZ`, `OMNI`), a few 3+ letter abbreviations, and `engine/game-core.ts` is still about 1850 lines.

## 2. Scryfall bulk data replaces per-card fetching (done)

- `npm run cards -- update` downloads Scryfall's oracle cards and rulings (gzipped JSONL) into `data/scryfall/` (not in git), with `bulk-info.json` next to them (download date, latest set). It is run by hand, once now and again when new sets come out.
- The files stay gzipped and are streamed line by line; only matching cards are parsed. The simulator still reads only `data/cards.json` (in git: the cards the lists use, now with Scryfall ids; rulings are downloaded but stay out of it, `rulingsFor` reads them), so run speed is unchanged. Cards missing from it are added from the bulk data automatically before a run.
- `npm run cards -- refresh` rebuilds the stored cards from the bulk data and lists the ones whose rules text changed. Run once: no card changed in a way that affects play, `--regress check` is IDENTICAL for all decks, pod output unchanged.
- Images are not downloaded. Each card keeps its `scryfall_id`, so images can later be fetched for just the cards the lists use.

## 3. Game logs (done)

- Every game of a `sim` or `pod` run is logged as events: a readable line plus its card moves in Archidekt's simple format, the format of the logs Pontus has provided. A goldfish game, a pod game and a real Archidekt log share one format. The plan and what was decided on the way are in `PLAN.md`; `ENGINE.md` has the rules for new code.
- The games worth reading get a tag (fastest, slowest, average, win-stopped...) and are saved as text; `npm run logs` reads any game, with its card moves, its highlights or the board at the end of each turn.
- Logs live in `session-logs/` (not in git) and are cleared when the next `sim` or `pod` command starts a run. Until step 4 there is no application to start, so one session is the last run command.
- Every zone change in the engine and the decks goes through the engine's functions (`takeCard`, `putCard`, `moveCard`...), which record it; `--test` fails on one that does not. Results did not change: `--regress check` IDENTICAL for all decks.
- For step 4: the board at any point is rebuilt from the moves (`boardAt`), and a game can be played again from its run (`replayGame`).

## 4. App with a simple UI

- A local web page (decided 2026-11-12): a small Node program serves the page and runs the sim code directly. Started with one command, opened on localhost in the browser. Local only, never published. The Node side reads and writes the files (decks, lists, logs).
- Browse the decks and decklists.
- Simulation mode: pick a deck and which lists to simulate.
- Pod mode: pick 3 to 6 decks, a list for each, and the number of games.
- Open a tagged game from a run, read its log and step through it as it plays out (needs step 3).
- Comes after steps 2 and 3.
