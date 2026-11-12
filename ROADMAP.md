# Roadmap

Decided 2026-11-12 (Pontus). The big steps below go in this order. Deck work (new decks, cuts, logs, refinements, pod steps) is ongoing, happens before, during or after these steps, and is not part of the roadmap. It lives in each deck's `PLAN.md` and in `POD_PLAN.md`. The goal of the roadmap is to make that ongoing work easier.

## 1. Code follows the coding standards (CLAUDE.md) (done)

- Prettier is set up and the code is formatted (`npm run format`).
- Done: the existing code was brought in line with CLAUDE.md (rule 0 names, readability, KISS, rule of three). Every change left `--regress check` IDENTICAL for all decks and pod output unchanged.
- Known leftovers: card-nickname constants in aesi (e.g. `BSZ`, `OMNI`), a few 3+ letter abbreviations, and `engine/game-core.ts` is still about 1850 lines.

## 2. Scryfall bulk data replaces `data/cards.json`

- A script downloads Scryfall's bulk data on demand. It is run once at the start, and later only when new sets and cards come out and a deck uses them. The bulk file is not kept in git.
- Keep only the functional parts (mana cost, types, rulings and similar), only English default cards, no images.

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
