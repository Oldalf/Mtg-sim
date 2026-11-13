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

## 3. Game logs

- Every simulated game is logged in the same format as the logs Pontus has provided.
- Outliers get a tag, so that the UI can later open one specific game from a simulation or a pod run.
- Logs live on disk for one session only. They are cleared when the application starts.
- Comes after step 2.

## 4. App with a simple UI

- A local web page (decided 2026-11-12): a small Node program serves the page and runs the sim code directly. Started with one command, opened on localhost in the browser. Local only, never published. The Node side reads and writes the files (decks, lists, logs).
- Browse the decks and decklists.
- Simulation mode: pick a deck and which lists to simulate.
- Pod mode: pick 3 to 6 decks, a list for each, and the number of games.
- Open a tagged game from a run, read its log and step through it as it plays out (needs step 3).
- Comes after steps 2 and 3.
