# Plan: step 5, tidy up and a game you can watch

Written 2026-11-14. Five pieces of work Pontus asked for, split into tasks that say which size of model can do them. At the end is a list of suggestions that are not decided: Pontus picks.

## How to read this plan

Each task names a model. Give it to that model or a stronger one.

| Model | Tier | What it gets |
|---|---|---|
| Claude Haiku 5.5 | S (small) | Mechanical work with exact steps. No design choices. A command says if it worked. |
| Claude Sonnet 5.5 | M (medium) | A feature or refactor with a clear goal, in patterns the code already has. Small choices only. |
| Claude Opus 5.5, or Fable 5.2 | L (large) | Design, work across many files where judgement is needed, or writing that other models will follow. |
| **P** | Pontus | A decision. Tasks marked "after P" wait for it. |

Rules for every task:

- Read `CLAUDE.md` first (rule 0 names, KISS). For the engine also `ENGINE.md`, for the page also `app/web/CLAUDE.md`.
- One task is one commit. `npm run format`, then `npm run verify` must end with VERIFY OK.
- Ask Pontus eco or full power before any task that runs simulations (`verify` with regress checks counts).
- A task that finds its steps do not fit the code stops and says so. It does not improvise a bigger change. This matters most for Haiku 5.5.
- When a task is done, add one line under it here: what was built and anything the next task must know.

## Order

The tasks run one at a time, in this order. Each row is one session and one commit (B2 is seven commits).

| # | Task | What | Model |
|---|---|---|---|
| 1 | A2 (done) | Remove and rename the decklists | Haiku 5.5 |
| 2 | A3 (done) | Remove the app's archive switch (skip if suggestion 4 keeps an archive folder) | Haiku 5.5 |
| 3 | B2 (done) | Move the engine into folders, one folder per commit | Sonnet 5.5 |
| 4 | B3 (done) | Docs follow the move | Haiku 5.5 |
| 5 | C1 (done) | Write the add-a-deck skill | Opus 5.5 |
| 6 | C2 (done) | Try the skill on a real deck | Sonnet 5.5 |
| 7 | D1 (done) | Autoplay | Sonnet 5.5 |
| 8 | D2 (done) | Remember speed and position | Haiku 5.5 |
| 9 | E1 (done) | Table view: design as a prototype, Pontus picks | Opus 5.5, then Pontus |
| 10 | E2 (done) | Table view: the logic as plain functions | Sonnet 5.5 |
| 11 | E3 (done) | Table view: build it | Sonnet 5.5 (Opus 5.5 if the design is far from today's components) |
| 12 | E4 | Table view: check every size | Haiku 5.5 or Sonnet 5.5 |

Why this order: the decklists are the smallest and touch nothing else. The engine move comes before the skill because the skill names engine paths. Autoplay comes before the table view because the table view builds on it.

Where a suggestion goes if Pontus takes it: 4 before step 2; 1 and 2 after step 4; 3 before step 5; 5 after step 1; 7 before step 10; 10 after step 8; 6, 8 and 9 any time.

---

## A. Fewer decklists

Goal: each deck keeps its original list, its most successful list, its proposals and the list its `SWAPS.txt` describes. The other test lists go. Their results stay in the deck's `PLAN.md`, and the files stay in git history.

What is there now: gale has 39 lists plus `lists/cuts/` (9) and `lists/old/` (5). Aesi has 32. Meren has 7 plus `lists/cuts/` (9). Mike has 4. Samfrodo and codie have only `decklist.txt`.

### A1. The keep list (decided 2026-11-14)

The adopted list of every deck gets the same name, `lists/proposed.txt` (gale's already has it). The alternatives next to it are named after what they change.

| Deck | Keep | New name | What it is |
|---|---|---|---|
| gale | `decklist.txt` | same | The original |
| gale | `lists/proposed.txt` | same | The adopted list, the one `SWAPS.txt` describes |
| aesi | `decklist.txt` | same | The original |
| aesi | `lists/package.txt` | `lists/proposed.txt` | The list `SWAPS.txt` describes |
| aesi | `lists/p_d.txt` | `lists/proposed_many_journeys_kept.txt` | Many Journeys kept, no Skyshroud Claim (the second alternative in `SWAPS.txt`) |
| aesi | `lists/p_e.txt` | `lists/proposed_natures_lore_for_claim.txt` | Nature's Lore in, Skyshroud Claim out |
| aesi | `lists/p_a.txt` | `lists/proposed_lore_and_visits.txt` | Nature's Lore and Three Visits in, Skyshroud Claim and Wood Elves out |
| meren | `decklist.txt` | same | The original |
| meren | `lists/b3.txt` | `lists/proposed.txt` | The list `SWAPS.txt` describes |
| meren | `lists/a3.txt` | `lists/proposed_marauder_and_elves.txt` | Proposed, plus Fleshbag Marauder and Fyndhorn Elves for Village Rites and Rune-Scarred Demon |
| meren | `lists/b3x.txt` | `lists/proposed_solemn_kept.txt` | Proposed with Solemn Simulacrum kept and no Skull Prophet |
| mike | the four `lists/fblthp_for_*.txt` | same | The open proposals |

Everything else goes: every other file in gale's `lists/` with `lists/cuts/` and `lists/old/`; aesi's other 28 lists; meren's `a.txt`, `a2.txt`, `b.txt`, `b2.txt` and `lists/cuts/`. Meren's `lists/SWAPS.txt` is not a list: its text moves into `decks/meren/PLAN.md`.

Checked for aesi: `p_b.txt` holds the same cards as `package.txt`, and `p_c.txt` is both alternatives at once (Many Journeys kept, Lore and Visits in), so both go. `SWAPS.txt` says Nature's Lore or Three Visits can stand in for Search for Tomorrow; no kept list does exactly that swap, `p_a` and `p_e` are the nearest (they put them in for Skyshroud Claim).

### A2. Remove and rename the lists (Haiku 5.5)

- `git rm` every list that is not in the table of A1, and `git mv` the ones with a new name. Nothing else.
- The renamed lists are named in `decks/aesi/PLAN.md`, `SWAPS.txt` and `PRIMER.txt` (`lists/package.txt`), and `decks/meren/PLAN.md` and `SWAPS.txt` (`b3`, `a3`, `b3x`): update each. The text may still call aesi's list "the package".
- Fix what named them: `decks/gale/PLAN.md` (lines on `lists/old/`, "about 35 test lists"), `decks/gale/README.md` (the `lists/` row, and it still says `decklist.txt` is the current list), `decks/aesi/PLAN.md` (the housekeeping line), `decks/meren/SWAPS.txt` and `PLAN.md` (`lists/SWAPS.txt`, `lists/test.txt`).
- Check with a search that no removed or old file name is left in `*.ts`, `*.md`, `*.txt` or `regress_baseline/`.
- Done when: `npm run verify` is OK (`REGRESS` in `decks/index.ts` only uses `decklist.txt` and gale's `lists/proposed.txt`, so no baseline changes), and the Decks page of the app shows only the kept lists.

Done 2026-11-14: gale keeps `decklist.txt` and `proposed.txt`; aesi `proposed.txt` and three `proposed_*.txt`; meren `proposed.txt` and two `proposed_*.txt`; mike unchanged. The removed meren swap notes moved into `decks/meren/PLAN.md`. `npm run verify -- --eco` gave VERIFY OK, every regress IDENTICAL. A3 still has to remove the archive switch (`lists/old` and `lists/cuts` are gone, so `?all=1` lists nothing).

### A3. The archive switch of the app (Haiku 5.5, after A2)

With `lists/cuts/` and `lists/old/` gone, `?all=1` in `app/server/decks-routes.ts` (`ARCHIVE_FOLDERS`, `includeArchive`) lists nothing. Remove it: the route, its test in `decks-routes.test.ts`, the type in `app/api-types.ts`, the call in `app/web/src/app/core/api.ts` and whatever the Deck page shows for it. Done when `npm run app -- --test` and `ng test` pass. Skip this task if Pontus wants to keep archive folders for future cut tests (see suggestion 4).

Done 2026-11-14: the `?all=1` switch is gone from the server (`decks-routes.ts`, `server.ts`), its test, and the page's `ApiService.decks()`. `npm run verify -- --eco` gave VERIFY OK, page build and tests included.

---

## B. Engine in folders

Goal: `engine/` has 42 files in one folder. Move them into folders by topic. Pure moves: no code changes besides import paths, results IDENTICAL.

### B1. The folders (decided 2026-11-14)

| Folder | Files | What it is |
|---|---|---|
| `engine/cards/` | `cards`, `card-facts`, `land-text`, `scryfall`, `card-images` | Card data and facts that hold in any deck |
| `engine/game/` | `game-core`, `game`, `game-types`, `mulligan`, `answers`, `search`, `log-format` | One game: zones, mana, turns, the hooks a deck fills in |
| `engine/game-log/` | `game-log`, `game-log-moves`, `-text`, `-tags`, `-files`, `-run`, `-replay`, `-archidekt`, `logged-runs`, `game-log.test` | Logging a game and reading logs back |
| `engine/pod/` | `pod`, `pod-arena`, `pod-table`, `pod-combat`, `pod-blocking`, `pod-interaction`, `pod-report`, `pod.test` | Decks playing each other |
| `engine/run/` | `runner`, `worker-pool`, `worker-pool.test`, `power-save`, `setting-descriptions` | Running many games |
| `engine/tools/` | `report`, `ranking`, `regress`, `analyze`, `log-board`, `diag-metrics` | Reports and the command line tools (`--rank`, `--cut`, `--analyze`, `--diag`, `--regress`) |
| `engine/util/` | `lists`, `rng` | Small helpers with no imports |

File names stay as they are in this step, so the diff is only moves and import lines. Dropping the now doubled prefixes (`game-log/game-log-files.ts` to `game-log/files.ts`) is suggestion 2.

### B2. Move one folder at a time (Sonnet 5.5)

Seven commits, one per folder, in this order: `util`, `cards`, `game`, `game-log`, `pod`, `run`, `tools`. Haiku 5.5 can do a folder if it is given the exact file list and the checks below, but the first folder (which finds the traps) needs Sonnet 5.5.

- Before starting: save the output of a fixed-seed pod run (`npm run pod -- gale meren samfrodo aesi -n 200 --no-log`) to the scratchpad. `--regress check` does not cover pod mode.
- Per folder: `git mv` the files, fix the imports (engine, `decks/`, `cli/`, `app/server/`, `sim.ts`; about 230 import lines in all), `npm run check`, `npm run format`.
- Known traps:
  - `engine/cards.ts` has `ROOT = path.resolve(__dirname, '..')`. It runs from the bundle `dist/sim.js`, so `__dirname` is `dist/` and the move does not change it. Do not "fix" it. Check with one `npm run sim -- gale -n 50`.
  - `engine/worker-pool.ts` starts workers from `__filename` (the bundle). Same: leave it.
  - `game-types`, `game` and `cards` import each other. A pure move keeps that working. Do not untangle it here.
  - The page (`app/web/`) imports only `shared/` and `app/api-types.ts`, never `engine/`. Check that `app/api-types.ts` still builds there (`npx ng build` in `app/web/`).
- After the last folder: `npm run verify -- --full` must be OK with every deck IDENTICAL, and the pod output must equal the saved one byte for byte.

Done 2026-11-14: all seven folders moved, committed as one commit (not seven). `ROOT` in `engine/cards/cards.ts` and the worker start in `engine/run/worker-pool.ts` are untouched. `npm run verify -- --full --eco` gave VERIFY OK: every deck IDENTICAL, the fixed-seed pod run equals `regress_baseline/pod.txt`. B3 still has to update the `engine/<file>.ts` paths in the docs and add the Folders table to `ENGINE.md`.

### B3. Docs follow the move (Haiku 5.5, after B2)

Update every `engine/<file>.ts` path in `ENGINE.md`, `README.md`, `CLAUDE.md`, `app/web/CLAUDE.md`, `POD_PLAN.md`, `ROADMAP.md`, the deck `PLAN.md` files and the header comments in the code. Add a short "Folders" table to `ENGINE.md` (the table of B1). Done when a search for `engine/[a-z-]+\.ts` finds only paths that exist.

Done 2026-11-14: every `engine/<file>.ts` path in the docs and code comments now has its folder (ENGINE.md, README.md, CLAUDE.md, POD_PLAN.md, ROADMAP.md, the app's comments, the decks' comments); the Folders table is in `ENGINE.md`. Left as they are: this file's own B2 and B3 notes, which describe the move. No deck `PLAN.md` or `app/web/CLAUDE.md` had a path to change. `npm run verify` was not run: Node is not installed on this machine, so the check, format and regress steps still need a run.

---

## C. A skill for adding a deck

Goal: `/add-deck` walks a model through adding a deck the way the six decks were added, so the next deck costs less and looks like the others. It lives in `.claude/skills/add-deck/SKILL.md` at the project root (the page has its own skills in `app/web/.claude/skills/`).

### C1. Write down what adding a deck takes (Opus 5.5)

Read how the six decks are built and write the skill. It needs Opus 5.5 because it must pick what is common from six different decks and say it so a smaller model can follow. Use the `skill-creator` skill for the format. The skill must cover, in this order:

1. **What to ask Pontus first:** the list (Archidekt export), the commander, how the deck wins, the bracket, whose deck it is, real game logs if there are any, and what he wants from it (speed, consistency, fun). Memory notes hold here: no cut tests until he names cuts, logs contain misplays.
2. **Which deck to copy from:** gale for a kill search, meren for combat and the planner, samfrodo for tokens, aesi for loops, codie for a solver, goldfish for the smallest possible deck.
3. **The files of a deck** and what each holds: `decklist.txt`, `index.ts` (`deck = { name, dir, defaultList, config, Game }`), `config.ts`, `game.ts` (the hooks in the header of `game-core.ts`), `cards.ts`, `candidates.ts`, `mulligan.ts` (plain data), `tests/<name>.test.ts`, `PLAN.md`, later `PRIMER.txt` and `SWAPS.txt`.
4. **Where to register it:** `DECKS`, `TESTS` and `REGRESS` in `decks/index.ts`; `DECKS_WITH_BASELINE` (and `POD_DECKS` if it joins the pod) in `scripts/verify.mjs`; the deck's entry in `README.md`.
5. **The order of work:** card data (`npm run cards`), a game that plays lands and casts spells, the win, tests, the first numbers, the mulligan rule from `--hands`, `--regress record`, then the deck's `PLAN.md`.
6. **The rules:** card facts that hold in any deck go in the engine and must leave the other decks IDENTICAL; zone changes only through `takeCard` / `putCard` and the like; `say` / `sayEvent` / `sayHighlight` for the log.
7. **The pod layer** as a second, optional part: interaction cards, the "close to winning" flag, `POD_PLAN.md`.
8. **Done when:** `--test` prints ALL OK, the baseline is recorded, `npm run verify` is OK, the deck shows in the app.

Done 2026-11-14: `.claude/skills/add-deck/SKILL.md` covers the eight points in that order, plus a `PLAN.md` outline for a new deck; `README.md`'s "Adding a deck" points to it. Written with skill-creator's format; its test-run loop was skipped because C2 is that test. Registration is four places (`DECKS`, `TESTS`, `REGRESS`, `DECKS_WITH_BASELINE`), so suggestion 3 would shorten section 4. `npm run verify` not run (docs only, no code changed).

### C2. Try the skill on a real deck (Sonnet 5.5, after C1)

The next deck Pontus wants is added by Sonnet 5.5 using only the skill. Every place where it had to guess or ask is fixed in the skill. If no new deck is waiting, re-add `goldfish` under another name as a throwaway change that is not kept, as a smoke test.

Done 2026-11-14: the skill was used for William's Edgar Markov deck (`decks/edgar/`, Mardu Vampire aristocrats, bracket 2–3), committed as `694d364`. The seven questions and the eight steps worked as written; the deck is registered in all four places plus `POD_DECKS`, with a baseline, tests, a mulligan rule, `podClose` and a `winAttempt`. Fixed in the skill: `--test` has no ALL OK line (the exit code is the result), the ritual-probe payment trap, the log check for identical tokens, testing a `winAttempt` with a stub arena, and how to report win types. The first guess of the skill that Edgar corrected: the mulligan and `--hands` steps need the card lists exported from `mulligan.ts` for `index.ts`'s `handFeatures` (done that way in Edgar). The engine change it needed: `MoveRecorder` corrects the log of identical tokens with different counters (`engine/game-log/game-log-moves.ts`).

---

## D. Autoplay in the game viewer

Goal: a play button in the viewer (`app/web/src/app/pages/game/`) that steps through the game by itself, slowly enough to follow.

### D1. Autoplay (Sonnet 5.5)

- A play / pause button in the step toolbar, and Space as its key (add it to `STEP_KEYS`' tooltips the same way). A speed choice next to it: slow, normal, fast.
- Playing moves to the next line with text (`nextEvent` already skips to it). It stops at the last line and the button turns back to play.
- The time a line stays is a plain function in `game-steps.ts` with a spec (`autoplayDelay(event, startsTurn, speed)`): a base time, longer for a highlight, longer for the first line of a turn. Start with 1.2 s / 2.5 s / 2 s at normal speed and let Pontus tune the numbers.
- Any manual step (button, key, click on a log line) pauses. Loading another game pauses.
- The timer is a signal `isPlaying` plus one `effect` that schedules the next step and cleans up after itself (also when the page is left).
- The log already follows the chosen line (`scrollIntoView` in `game-log-view.ts`). Check it stays smooth while playing.
- Done when: `ng test` passes with the new spec, and a goldfish game and a 4-seat pod game play to the end by themselves in the browser.

Done 2026-11-14: play / pause button and a slow / normal / fast toggle in the step toolbar, Space as the key; `autoplayDelay` in `game-steps.ts` with a spec (slow is 1.75 times normal, fast 0.5). Any manual step or click on a log line pauses, a new game pauses, play at the end starts over. It steps with `nextEvent` (one event; events without text are turn starts). Pontus watched it play in the browser and confirmed it.

### D2. Remember speed and position (Haiku 5.5, after D1)

The chosen speed is kept in `localStorage`. The chosen line goes in the URL (`?line=120`) so a refresh or a shared link opens the same spot. Small, and useful for the table view too.

Done 2026-11-14: the speed is kept under `magic.autoplaySpeed` in `localStorage` (read with `speedFromStored`, a missing or unknown value is normal). The line is in `?line=` counted from 1, as the page shows it, and is left out on the first line; it is written with replace, so Back does not step through every line. A game opened without `?line=` starts at its first line. `npm run verify -- --eco` gave VERIFY OK.

---

## E. The viewer as a table you can watch

Goal: with autoplay on, the viewer feels like watching a Commander game on video: the whole table in view, clear whose turn it is, what just happened readable at a glance. It must work for a goldfish game (1 player), every pod size (3 to 6 seats) and real Archidekt logs.

What is wrong today: the boards are stacked top to bottom and reordered every turn (`playersTopDown` puts the active player first), so with 4 players the page is several screens tall and jumps on each turn change. Every card is full size. The log takes a third of the width.

### E1. Design, shown as a prototype (Opus 5.5, then Pontus)

Use the `prototype` skill: a throwaway page with made-up boards, for 1, 3, 4, 5 and 6 players, on a desktop and a phone width. Pontus picks before anything is built. The proposal to prototype:

- **The table fills the window, no page scroll.** Seats keep their place for the whole game: 1 player = the whole table; 3 or 4 = a 2 by 2 grid; 5 or 6 = 3 by 2. Seat order runs clockwise so the turn passes the way it does at a real table.
- **A seat is compact:** name, commander, life (big), hand and library counts, then the battlefield as small cards (stacked as now, lands in a thin row). The hand, graveyard and exile are counts that open on click.
- **Whose turn:** the active seat gets the accent border and a turn marker. As a second variant to prototype: a spotlight, where the active seat is large and the others shrink to tiles.
- **What just happened:** a caption bar under the table, like subtitles: the turn title, the line's text and its cards at full size. The cards a line moved get a short glow on the board; a life change counts up or down.
- **The log** becomes a drawer on the side that can be closed. Closed is the default while playing.
- **Controls** at the bottom like a video player: play / pause, speed, a scrub bar with one tick per turn and a mark per highlight.
- **Phone:** seats in one column, the active one first and open, the others folded to their header line.

Done when Pontus has picked a variant and the choices are written here under this task.

Done 2026-11-14: Pontus picked the **grid** ("seems like it will scale the best"), and it replaces the stacked view (no option to keep the old one). Three layouts were prototyped on the real game page (grid, spotlight with the active seat large, stage with what happened in the middle of the table); the prototype was not committed. The grid as chosen:

- Seats keep their place all game, clockwise: the first half left to right along the top, the rest right to left along the bottom (3 = 2 + 1, 5 = 3 + 2). One player fills the table. The window holds the whole table; the page does not scroll.
- A seat: turn marker, name, commanders, life big with a +/- chip for the line's change; the permanents as cards sized to fit the seat (more permanents, more rows, smaller cards), the lands fanned with overlap in a thin row with "N lands, M untapped"; library as a count, hand and graveyard (and exile, command zone when not empty) as counts that open their cards in a popover. The active seat has the accent border and glow; a player at 0 life or less is greyed.
- The cards a line moved glow for a moment. A goldfish game shows the opponents' life in the caption.
- The caption bar under the table: the turn title, the line (with the player's name when the log names it), its cards; a highlight is tinted.
- The controls at the bottom like a video player: play / pause, speed, turn and line steps, a scrub bar (a tick per turn, a taller tick per round, a dot per highlight), the position, highlight steps, the log button.
- The log is a drawer over the right of the table, closed by default, `l` opens it; the card moves toggle lives in it.
- Phone (under 700 px): one column, the caption on top, the active seat first and open, the others folded to their header (a tap opens one), the controls fixed at the bottom.

Checked in the browser with real games: goldfish (samfrodo), pods of 3, 4 and 6, a real Archidekt log (aesi), phone width (390 px, no sideways scroll). Learned for E2/E3: a seat must size its cards from how many permanents it has (rows and cards per row), else a big board scrolls inside its seat; lands fanned with overlap fit ten in the room of four cards; the arrow keys are taken by stepping, so the log drawer got `l`.

### E2. The logic as plain functions (Sonnet 5.5, after E1)

In `game-steps.ts` (or a new `table-layout.ts` if it passes about 300 lines), each with a spec:

- seats in fixed order and the grid shape for a player count (replaces `playersTopDown` for the table);
- the cards and life totals that changed between two positions (for the glow and the life count);
- the scrub bar's ticks: turn starts and highlights as fractions of the game.

No new server calls: all of it comes from `GameLog` and `boardAt`.

Done 2026-11-14: `app/web/src/app/pages/game/table-layout.ts` with a spec: `seatRows` (clockwise, top row left to right, bottom right to left), `changedCardsByPlayer`, `lifeChanges`, `goldfishOpponentLives`, `scrubMarks` (turn ticks, taller at a round's start, highlight marks), `permanentGrid` (rows and cards per row for a seat's permanents) and `countLands`. `playersTopDown` stays until E3 removes the stacked view. `ng test` passes (48).

### E3. Build the table (Sonnet 5.5, or Opus 5.5 if the design of E1 is far from today's components)

New components next to the old ones: a compact seat (from `player-board.ts`), the caption bar, the control bar with the scrub bar, the log drawer. `game.html` puts them together. Keep the components small, state in signals, per `app/web/CLAUDE.md`. Keyboard steps and autoplay from D keep working. The old stacked view is removed once the new one covers it, not kept as an option.

Done 2026-11-14: the grid of E1 is the only view. New components in `pages/game/`: `player-seat` (replaces `player-board`), `game-caption`, `game-controls` (emits a `ControlStep`; the scrub bar is a native range input with the marks drawn behind it); the log drawer is in `game.html`. `playersTopDown` is gone. Keys: as before, plus `l` for the log and Home / End for the first and last line (the first / last buttons went; the scrub bar does that). The app shell gives a page the whole window when the routed component has `fillsWindow = true` (`App.pageOpened` on the outlet's `activate`): no width cap, exactly the window's height, so the table never scrolls the page (on a phone it does, one column). Checked in the browser: a pod of 5 (no page or seat scrolls at 1920 x 945), goldfish, a real Archidekt log (codie) with autoplay and the drawer, phone width 390 px. `npm run verify` gave VERIFY OK (no regress needed: page only). For E4: the seat's style is right at the 4 kB budget; a pod of 6 and AXE are not checked yet.

### E4. Check every size (Haiku 5.5 or Sonnet 5.5, after E3)

In the browser, with real runs: a goldfish game, a pod of 3, 4, 5 and 6, and a real Archidekt log, at desktop and at phone width (no page may scroll sideways). A big board (samfrodo tokens, aesi lands) must stay readable. AXE checks pass. Fix what breaks; write what was learned into `app/web/CLAUDE.md`.

---

## Suggestions (not decided: Pontus picks)

Found while planning. Each names the model it would need, in case it is taken.

1. **Split `engine/game-core.ts`** (Opus 5.5). It is 2,276 lines; the size guide says about 800. With `engine/game/` in place it can become one file per topic (zones, mana and payment, casting, creatures and combat, turn loop, planner). Must be IDENTICAL. Best done right after B, while the folder is fresh. `decks/aesi/game.ts` (1,129) and `decks/mike/game.ts` (962) are over the guide too.
2. **Shorter file names inside the folders** (Haiku 5.5, after B). `game-log/game-log-files.ts` to `game-log/files.ts`, `pod/pod-table.ts` to `pod/table.ts`. Reads better, but it is a second round of import changes.
3. **One place to register a deck** (Sonnet 5.5). Today a new deck is named in five places: `DECKS`, `TESTS`, `REGRESS` in `decks/index.ts` and two arrays in `scripts/verify.mjs`. If each deck's `index.ts` exported its tests and regress lists, and `verify` asked the simulator for the deck names, it would be one line. Makes skill C shorter and harder to get wrong. Do it before C1 if taken.
4. **A rule for test lists from now on** (Pontus, then Haiku 5.5). So the lists do not pile up again: test lists are written to a folder git ignores (say `lists/scratch/`), and only a list Pontus picks is copied into `lists/`. The rule goes into `CLAUDE.md` and each deck's `PLAN.md`.
5. **The app knows the adopted list** (Sonnet 5.5). After A2 every adopted list is `lists/proposed.txt`, but the code knows only `defaultList` (`decklist.txt`, the original). The app could mark `lists/proposed.txt` where it exists and preselect it in Simulate and Pod. Also the open point in `decks/aesi/PLAN.md`: make the proposed list the default `decklist.txt` or not.
6. **A skill for testing a swap** (Opus 5.5). The other thing done over and over: build the list, run 16,000 games against the base with the same seeds, read `--diag`, write the result into the deck's `PLAN.md` and `SWAPS.txt`. Fits the notes already kept (wait for Pontus's cuts, judge aesi with `--diag`, ask eco or full power).
7. **One board, not two** (Sonnet 5.5). `engine/log-board.ts` (the analyzer) and `shared/game-log-board.ts` (the log) each apply card moves with their own code (`ENGINE.md`, "Ideas for later"). The table view (E) leans on the shared one, so a bug fixed in one stays in the other.
8. **Leftovers of roadmap step 1** (Haiku 5.5). The card-nickname constants in aesi (`BSZ`, `OMNI`) and a few abbreviations. Must be IDENTICAL.
9. **Docs that have gone stale** (Haiku 5.5). `ROADMAP.md` gets this plan as step 5. `ENGINE.md` says "all six decks" in the safety-net rule; it should point at `verify` instead of counting. `app/web/CLAUDE.md` says to read `PLAN.md` for "the tasks and their rules" of step 4.
10. **Watch a game straight from a result** (Haiku 5.5, after D1). A "watch" button next to each game in "games worth a look" and the pod report that opens the viewer already playing (`?play=1`).
