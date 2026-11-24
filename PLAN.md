# Plan: step 12, a heavier engine, one board, missing cards and the app's missing commands

Written 2026-11-24. Step 11 (tasks T1 to T9) is done; its steps and notes are in git: `PLAN.md` at commit `29f352e`. `ROADMAP.md` has the steps before it.

Pontus picked the four parts of this step on 2026-11-24 from the roadmap's open ideas, step 11's leftovers and the decks' "Open" lists.

Still waiting on Pontus from earlier steps: whether to adopt `decks/gale/lists/speed.txt` (step 10), and the answer from Codie's creator on how often he wins by turn 5 (T3).

The friends' decks (Helga, Ardyn, Teval, Thantis, DnD, Azula) are still **pod-only**: no goldfish tuning, no swap tests, no card rounds for them unless the owner asks (Pontus, 2026-11-15).

## How to read this plan

Each task names a model. Give it to that model or a stronger one.

| Model | Tier | What it gets |
|---|---|---|
| Claude Haiku 5.5 | S (small) | Mechanical work with exact steps. No design choices. A command says if it worked. |
| Claude Sonnet 5.5 | M (medium) | A feature or fix with a clear goal, in patterns the code already has. Small choices only. |
| Claude Opus 5.5, or Fable 5.2 | L (large) | Design, work across many files where judgement is needed, or writing that other models will follow. |
| **P** | Pontus | A decision or input. Tasks marked "after P" wait for it. |

Rules for every task:

- Read `CLAUDE.md` first (rule 0 names, KISS). For the engine also `ENGINE.md`, for the page also `app/web/CLAUDE.md`.
- One task is one commit, straight on `main` (a big task may be a few commits, each one passing). `npm run format`, then `npm run verify` must end with VERIFY OK (`verify --quick` while working).
- Ask Pontus eco or full power before any task that runs simulations (`verify` with regress checks counts).
- Before changing pod code, save a fixed-seed pod run (`npm run pod -- gale meren samfrodo aesi edgar -n 200 --no-log`) and compare it afterwards; `--regress check` does not cover pod mode. `verify` also compares that run with `regress_baseline/pod.txt`; re-record it (`node scripts/verify.mjs --eco --record-pod`) only for a change Pontus accepted.
- A move of code must leave every deck IDENTICAL (goldfish and the pod run). A new card rule changes the results of the decks that play the card: report before / after and ask before re-recording a baseline.
- A task that finds its steps do not fit the code stops and says so. It does not improvise a bigger change.
- When a task is done, add one line under it here: what was built and anything the next task must know. When the whole plan is done, it is cleared and a new one written.

## Order

| # | Task | What | Model |
|---|---|---|---|
| 1 | U1 | Card rules out of the big deck files, and the engine's big files split | Opus 5.5 |
| 2 | U2 | One board, not two (the analyzer's and the viewer's) | Sonnet 5.5 |
| 3 | U3 | The cards not modelled yet: Edgar, Aesi, Gale, then Codie | Opus 5.5 |
| 4 | U4 | The app: the commands it is missing, editing lists, a card's print | Opus 5.5 (design), Sonnet 5.5 (each feature) |

U1 comes first so that U3's new card rules land in the right topic files. U2 can run any time (it touches only the log boards and the page). U4 comes last: its design may use deck measures that U1 moves.

---

## U1. Card rules out of the big deck files, and the engine's big files split (Opus 5.5)

The roadmap's goal is a heavy engine and light decks (the engine owns what a card does, the deck decides). Files over the guide's 800 lines: `engine/game/game-core.ts` 1,755, `decks/aesi/game.ts` 1,192, `engine/game/game.ts` 1,099 (the pod parts of a game), `decks/meren/game.ts` 1,073, `decks/mike/game.ts` 969.

1. Survey first, per file: which parts are card facts that hold in any deck (they go to an engine topic file, a new one if no topic fits), which are the deck's own choices (they stay), and which are code for cards no list plays any more (Edgar's `PLAN.md` says the removed cards' code is still there; check every list in `lists/` before calling a card unused). Write the survey here under this task before moving code.
2. Move one topic per commit, each one IDENTICAL (`npm run verify`: every deck, the pod run, the logs). Follow `ENGINE.md` "How the game class is split": a plain function that takes the game; a method a deck calls or overrides keeps its name as a one-line call; inside a topic file the game's methods are called on the game, so overrides still run. No renames or behaviour changes on the way; a fix found on the way is a separate commit.
3. `game-core.ts`: `ENGINE.md` names casting (about 150 lines) and the turn's small steps (about 130) as the next parts to move (`casting.ts`, `turn.ts`). `game.ts`: split its pod parts by topic (blocks, removal and counterspells, the threat score), as `engine/pod/` already is.
4. Done when each of these files is about 800 lines or `ENGINE.md` has a short list of why not, and `ENGINE.md`'s folder table and "What the engine provides" name the new files. Removing unused card code changes nothing a list plays, so it stays IDENTICAL too.

## U2. One board, not two (Sonnet 5.5)

The analyzer and `npm run logs` rebuild the board from the logged card moves in `engine/tools/log-board.ts` (395 lines); the game viewer does it in `shared/game-log-board.ts` (286 lines). A fix in one can be missed in the other (roadmap idea 1, `ENGINE.md` "Ideas for later").

1. Compare the two and list here what each does that the other doesn't (the analyzer's extras: tokens read from the log, `logSacOnTap`, `logTrackers`, counters carried over; the viewer's: what it shows per seat).
2. Keep one board in `shared/` (the page may import `shared/`, never `engine/`), with the analyzer's extras either in it or as a thin layer in `engine/tools/` on top of it. No behaviour change.
3. Checks: every deck's regress (it replays each real log through the analyzer) IDENTICAL, `npm run logs` prints the same for a few saved games, `ng build` and `ng test` pass, and the viewer shows a real log (Sam & Frodo's game 2, one of Gale's) the same as before. Remove the note in `ENGINE.md` "Ideas for later" and roadmap idea 1.

## U3. The cards not modelled yet (Opus 5.5; a single card with a clear rule may go to Sonnet 5.5)

From the decks' `PLAN.md` "Open" and "Simulation rules" lists, only cards in a current list (`decklist.txt` or `lists/proposed.txt`, checked 2026-11-24). Card facts go in an engine topic file, the deck's choice of when to use them in its folder. Each card gets a test (engine or deck). After each deck: 4,000 games on the same seeds before / after (16,000 when the change is near the noise line), a line in the deck's `PLAN.md`, and ask before re-recording its baseline.

1. **Edgar** (William's deck: model the cards, no swap proposals): Master of Dark Rites' mana, Cabal Coffers and Urborg (today Coffers is a land that makes {B}); in the pod, its removal in `engine/game/answers.ts` (Feed the Swarm, New Blood, Kindred Dominance, Saw in Half; in a goldfish game they stay held). Culling the Weak and Songs of the Damned only if a line uses them.
2. **Aesi:** Haru-Onna returning to the hand when a Spirit is cast without Omniscience, Familiar's adapt, PuPu UFO's Town ability. (Likeness of the Seeker is no longer in a list: drop it from Aesi's "Open".)
3. **Gale:** Mana Sculpt's mana (in every Gale list). The kill search counts it, so add kill tests first; kill misses stay 0 (the regress checks them).
4. **Pod:** Siren Stormtamer's "targets you" half (`POD_PLAN.md`), with a pod test.
5. **Codie** (last; Pontus said on 2026-11-18 each is worth about a point at most): Mana Drain, Narset's Reversal, Bring to Light, Spelltwine, Crop Rotation, Scapeshift, Splendid Reclamation, Bala Ged Recovery, and the lands Field of the Dead, Mistrise Village and Vesuva. After the first three or four, report the gain; if it stays within noise, ask Pontus whether to go on.

## U4. The app: the commands it is missing, editing lists, a card's print (Opus 5.5 design, then Sonnet 5.5)

Roadmap step 4 lists what is still only on the command line: `--rank`, `--cut`, `--hands`, `--analyze`, editing lists, and picking the print of a card for its image.

1. **Design (Opus 5.5), then P:** where each one goes in the page (for example: the Simulate page gets a mode for rank, cut and hands; the Games page analyzes a deck's real log; the Decks page edits lists and picks prints), the API shapes in `app/api-types.ts`, and the order. Write it here and let Pontus approve it before building.
2. **Build (Sonnet 5.5), one feature per commit**, each with server tests (`npm run app -- --test`) and page tests (`ng test`), `ng build` passing, checked at phone width:
   - `--hands` and `--rank` (tables, like the report tables).
   - `--cut` (a cut test runs only when Pontus names the cards; the page only makes it easier to run).
   - `--analyze` of a real log, linked to the viewer at the turns it flags.
   - Editing lists: save as a new list in `lists/` or over an existing test list; never re-sort (the order deals the hands); never overwrite `decklist.txt` (the built deck) or `lists/proposed.txt` without asking in the page.
   - A card's print: the list of prints from Scryfall's search (not in the bulk data), and the choice kept in the decklist file in a form Archidekt imports (the design says which).
3. Update `README.md` and roadmap step 4's "Left for later" when done.
