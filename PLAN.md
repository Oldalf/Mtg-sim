# Plan: the app with a simple UI (roadmap step 4)

Written 2026-11-13. The plan of step 3 (game logs) is finished; it is in git (`PLAN.md` at commit `df7eca7`), and what lasts from it is in `ENGINE.md`.

## The goal

One command starts a small local program. It opens a page in the browser where Pontus can:

- browse the decks and their decklists,
- run a simulation (one deck, one or more lists) and read the result,
- run a pod (3 to 6 decks, a list for each),
- open a game of a run, read its log and step through it with the board and the cards shown.

Local only, never published. Everything the command line does today keeps working.

## What exists today (checked 2026-11-13)

- **Runs:** `Runner.simulate` (goldfish) and `Pod.simulatePod` play seeds in worker threads and return every result. They have no progress report and no way to stop. A worker is started from the bundle itself (`new Worker(__filename, { workerData: 'sim-worker' })` in `runner.ts` and `pod.ts`, handled at the bottom of `sim.ts`), so whatever starts runs must live in the same bundle as `sim.ts`.
- **Reports:** `table()` in `report.ts` gives a kill-turn table as data. Everything else is worked out inside functions that print (`printCompare`, `printDiag`, `printPod`), so the page cannot use them yet.
- **Game logs:** all there, and free of `console.log`: `listRuns`, `readRunInfo`, `readIndex`, `readGame` (`game-log-files.ts`), `finishLoggedRun`, `describeGameResult` (`game-log-run.ts`), `boardAt`, `TableBoards` (`game-log-board.ts`), `highlightsOf`, `formatGameLog` (`game-log-text.ts`), `replayGame` (`game-log-replay.ts`), `readArchidektLog` (`game-log-archidekt.ts`). `cli/log-session.ts` starts and finishes a logged run for the command line.
- **Decks:** `DECKS` in `decks/index.ts`; each `Deck` has `dir`, `defaultList`, `config`, `metrics`. Lists are `.txt` files in the deck folder and its `lists/` folder; `C.loadDecklist(file)` reads one (commanders, library, the section of each card, missing and generic cards).
- **Cards:** `data/cards.json` has every card the lists use, with `scryfall_id`. No images are stored. Tokens have no card data.
- **Tools:** esbuild bundles `sim.ts` into `dist/sim.js`. Node 26 (Angular 22 needs at least 22.22.3; `.nvmrc`). No web framework yet, no test runner (the simulator's tests are functions that print `OK` / `BAD`).

## Decisions (say so if you want one changed)

1. **The server has no framework: Node's own `http` module** (agreed in principle 2026-11-13, see the note below). There are about ten routes. Each is one plain function in a route table, which reads top to bottom. NestJS was considered and is a poor fit: it brings modules, decorators and dependency injection for those ten routes, and it needs decorator metadata that esbuild does not produce, while the server must stay in the esbuild bundle for the worker threads (decision 2).
1b. **The page is an Angular app with Angular Material** (agreed 2026-11-13). Pontus knows Angular, and he is the one who reads and maintains the page.
    - It is its own project in `app/web/`, with its own `package.json`, `angular.json` and `tsconfig.json`, so Angular's packages and its TypeScript version stay apart from the simulator's.
    - `ng build` writes the finished page to `dist/web/`; the Node server serves that folder. While developing, `ng serve` with a proxy to the Node server gives live reload.
    - Current Angular style: standalone components, signals for state, the built-in control flow (`@if`, `@for`), the Angular router, `HttpClient` / `httpResource` and Signal Forms (stable in Angular 22, agreed 2026-11-13). No extra state library.
    - Angular Material gives the theme (dark, one accent colour) and the ready-made pieces: toolbar, table, form fields, buttons, progress bar, chips, tabs.
    - The official Angular agent skills (`angular-developer`, `angular-new-app`; https://angular.dev/ai/agent-skills) are installed inside `app/web/`, so that an agent working on the page follows Angular's own current practice. `app/web/` also gets a short `CLAUDE.md` that points to them and to the rules of this plan.
    - Shared with the rest of the project as plain TypeScript imports: `app/api-types.ts` and the engine's plain type files (`engine/game-log-types.ts`, `engine/run-types.ts`, `engine/pod-types.ts`). Nothing else from `engine/` builds in the page: it reaches Node code (see task 13).
2. **The server is a command of the existing bundle:** `npm run app` runs `dist/sim.js app`. That way the worker threads work unchanged.
3. **Folders:** `app/server/` (the server and its routes), `app/web/` (the Angular project of the page), `app/api-types.ts` (the shapes both sides share). The page is built into `dist/web/`.
4. **One run at a time.** A second run can be started when the first is done or stopped. This keeps the server simple and the machine usable.
5. **Progress by polling:** the page asks the server for the run's state about once a second. Simpler than a pushed stream, and enough for runs that take seconds to minutes.
6. **`session-logs/` is cleared when the app starts** (agreed 2026-11-13), not at each run. Every run stays on disk while the program is running, so earlier runs can be opened again. The command line keeps its own rule (cleared at each `sim` / `pod` command).
7. **Card images come from Scryfall by `scryfall_id` and are kept on disk** (agreed 2026-11-13) in `data/scryfall/images/` (not in git) the first time a card is shown. After that the app works without the network. Tokens and unknown cards show as a plain text card.
8. **The page reads, it does not edit.** No editing of decklists or settings files in this step. A run's settings (`--set`) can be changed per run in the form.
9. **Not in this step:** `--rank`, `--cut`, `--hands`, `--analyze`, `--regress`, the card data commands. They stay on the command line. `--diag` is in (it is a logged run already).
10. **Real Archidekt logs open in the game viewer too** (agreed 2026-11-13): the files in `decks/<name>/logs/`, read with `readArchidektLog`. They have no life totals and one player.
11. **The look to start with** (agreed 2026-11-13): dark, dense, one accent colour.
12. **The server listens on `127.0.0.1` only**, on a fixed port (default 4173, `--port` to change), and opens the browser itself.

## The API (task 0 writes this down as types first)

All answers are JSON. Errors are `{ error: "message" }` with a 4xx or 5xx status.

| Call | What it gives |
|---|---|
| `GET /api/decks` | every deck: name, commanders, default list, its list files, its settings with their defaults, the names of its two results |
| `GET /api/decks/<deck>/lists/<list>` | a decklist: commanders and cards with type, mana cost and `scryfall_id`, by section; cards without data; cards played generically |
| `POST /api/runs` | starts a run. Body: goldfish `{ deck, lists, games, settings, diag, powerSave }` or pod `{ decks: [{ deck, list }], games, rounds, settings, powerSave }`. Answers with the run's id. 409 if a run is going |
| `GET /api/runs/current` | the run in progress, or the last one: state (`running`, `done`, `stopped`, `failed`), games played and total, seconds so far, and when done the report and the run folders |
| `POST /api/runs/current/stop` | stops the run in progress |
| `GET /api/logs` | the run folders of this session, each with its `RunInfo` and how many games carry each tag |
| `GET /api/logs/<run>/games?tag=&winner=&from=&count=` | index rows of a run (seed, result in words, tags), filtered, a page at a time |
| `GET /api/logs/<run>/games/<seed>` | one game: the `GameLog` |
| `GET /api/decks/<deck>/logs` | the deck's real Archidekt logs (the file names in its `logs/` folder) |
| `GET /api/decks/<deck>/logs/<file>` | one real log as a `GameLog` (`readArchidektLog`) |
| `GET /api/cards/<name>/image` | the card's image (fetched from Scryfall and kept on disk the first time) |
| `GET /` and other paths | the page and its files |

The board of a game is worked out in the page, so it can step through a game without asking the server. How it gets the board code is open: see the note under task 13.

## The tasks

Each task stands on its own once the tasks it depends on are done. "Who" says what the task needs: a small model, the big model, or Pontus. How to take a task and when it counts as done is under "How to work on a task" below.

| Task | What | Needs | Who | Status |
|---|---|---|---|---|
| 0 | The shapes and the skeleton | - | big model, first and alone | done (2026-11-13) |
| 1 | Reports as data | 0 | small model | done (2026-11-13) |
| 2 | Runs that report progress and can be stopped | 0 | big model | done (2026-11-13) |
| 3 | Decks and decklists on the server | 0 | small model | done (2026-11-13) |
| 4 | Starting, following and stopping a run on the server | 1, 2 | big model | open |
| 5 | Game logs on the server | 0 | small model | open |
| 6 | The app shell, the theme and the shared components | 0 | big model | open |
| 7 | Card images | 0 | small model | open |
| 8 | Page: decks and decklists | 3, 6 | small model | open |
| 9 | Page: simulate | 4, 6 | big model | open |
| 10 | Charts for the results | 9 | small model | open |
| 11 | Page: pod | 4, 6 (after 9: same pattern) | small model | open |
| 12 | Page: the games of a run | 5, 6 | small model | open |
| 13 | Page: the game viewer | 5, 6, 7 | big model | open |
| 14 | Finish | all | small model | open |

After task 0, tasks 1, 2, 3, 5, 6 and 7 can all go side by side.

### 0. The shapes and the skeleton

- `app/api-types.ts`: a TypeScript type for every request and answer in the table above. Reuse the engine's types where they fit (`GameLog`, `GameIndexRow`, `RunInfo`, `Table`), and write the new ones (deck summary, decklist view, run request, run state, the reports).
- `app/server/server.ts`: an `http` server on `127.0.0.1` with a small table of routes, JSON answers, error answers, and static files from `dist/web/`. One route for now: `GET /api/health`.
- `sim.ts`: the `app` command. `package.json`: `npm run app` (builds the server bundle and the page, starts the server, opens the browser) and `npm run app:dev` (the server plus `ng serve` with a proxy for `/api`, for working on the page).
- `app/web/`: a new Angular project (`ng new` with standalone components, routing and SCSS, no server-side rendering), with Angular Material added (`ng add @angular/material`) and a dark theme with one accent colour. Its build output goes to `dist/web/`. One page that shows "it works" and the answer of `/api/health` through `HttpClient`.
- The official Angular agent skills inside `app/web/`: run `npx skills add https://github.com/angular/skills` there (check https://angular.dev/ai/agent-skills first, the command may have changed), and add `app/web/CLAUDE.md` that points to them, to `app/api-types.ts` and to the rules at the end of this plan.
- Keep the two worlds apart: the root `tsconfig.json`, `npm run check` and Prettier keep covering the simulator and `app/server/`; the page is checked by its own `ng build` and formatted by the same Prettier settings (`npm run format` covers `app/web/src` too). `.gitignore`: `app/web/node_modules/` and Angular's cache folder.
- Done when: after `npm install` in the root and in `app/web/`, `npm run app` opens the page and the page shows the server's answer; `npm run sim` and `npm run pod` work as before and are as fast as before (they do not build the page).
- Notes (task 0, 2026-11-13):
  - Importing an engine type into the page made Angular type-check every engine file behind it (Node's `fs`, stricter settings: 44 errors). So the plain types moved into Node-free files: `engine/game-log-types.ts` (`GameLog`, `GameEvent`, `CardMove`, `LogPlayer`, `EventKind`) and `engine/run-types.ts` (`Config`, `KillTurns`, `Table`, `RunInfo`, `GameIndexRow`). The old files re-export them, so no other import changed; `dist/sim.js` came out the same apart from comments. Keep these files free of Node and engine code.
  - `app/api-types.ts` holds the full report shapes (`KillTurnReport`, `DiagReport`, `PodReport`), taken from the print functions: task 1 produces exactly these. A run request has `mode: 'goldfish' | 'pod'` to tell the two apart, and the goldfish one has `turns` (as `--turns`).
  - The page loads its fonts from npm packages (`@fontsource/roboto`, `material-symbols`), not from Google, so it works offline. Angular's CLI MCP server is set up in `app/web/.mcp.json`; `app/web/CLAUDE.md` has Angular's practice in short.
  - `npm run app:dev` runs `scripts/app-dev.mjs` (the server with `--no-open` plus `ng serve` with `app/web/proxy.conf.json`). The server answers `GET /api/health` only; the `index.html` fallback for routes is task 6.

### 1. Reports as data (engine)

The page needs the numbers, not printed text.

- `report.ts`: split `printCompare` and `printDiag` into a function that returns the data and one that prints it. `pod-report.ts`: the same for `printPod` (win rates, win rounds, how the wins came, first out, by seat, the interaction table).
- The printed output must not change at all: save the output of a list comparison, a `--diag` run and a pod run with fixed seeds before, and compare after.
- Done when: those outputs are the same, and the data functions have the types from `app/api-types.ts`.
- Notes (task 1, 2026-11-13): `buildKillTurnReport` and `buildDiagReport` (`report.ts`) and `buildPodReport` (`pod-report.ts`) return the shapes of `app/api-types.ts`; `printCompare`, `printDiag` and `printPod` now take that report and only print it (`printSingle` is unchanged: a one-list run is a `KillTurnReport` with one row). Differences from the types as task 0 wrote them: `runFolder` is optional in the reports (the server fills it in, the engine does not know it), and `declaredPercent` / `standingPercent` of a pod deck are `null` when it never won. A kill-turn row's label is the list's file name without its folder.

### 2. Runs that report progress and can be stopped (engine)

- `Runner.simulate` and `Pod.simulatePod` hold the same worker loop twice. Pull the loop into one function that takes the jobs, and give it two options: `onProgress(gamesPlayed, gamesTotal)` called as each job comes back, and a way to stop (no new jobs are handed out, the workers are ended, the promise resolves with what was played and `wasStopped`).
- Seeds and results must not depend on any of this: `--regress check` IDENTICAL, and the fixed-seed pod run unchanged.
- A stopped logged run still gets its `index.json` for the games that were played.
- Done when: a test starts a 2,000-game run, sees progress grow, stops it and gets a partial result; the regress checks pass.
- Notes (task 2, 2026-11-13): the loop is `runJobsInWorkers` in `engine/worker-pool.ts` (with `splitSeedsIntoJobs`). `simulate` and `simulatePod` take a last optional `control: RunControl` (`onProgress(gamesPlayed, gamesTotal)`, `stopSignal`: an `AbortSignal`) and set `wasStopped` on their result. A stop ends the workers at once; the jobs they were in the middle of are dropped, so a stopped run holds whole jobs only (its seeds are not 1..n without gaps). `finishLoggedRun` on the returned `logRows` writes the index of the games played, but `run.json` keeps the asked `gameCount`: task 4 may want to correct it. The tests are `engine/worker-pool.test.ts`, run by `npm run app -- --test` (new, also part of `npm run verify`); task 14 adds the API tests there.

### 3. Decks and decklists on the server

- `GET /api/decks` and `GET /api/decks/<deck>/lists/<list>` (see the table). The list files of a deck: `*.txt` in its folder and under `lists/`, without the primers and swap notes (`PRIMER.txt`, `SWAPS.txt`) and without `lists/old/` and `lists/cuts/` unless asked (`?all=1`).
- A decklist view groups the cards by the section `loadDecklist` already reads, and gives each card its type line, mana cost, mana value and `scryfall_id`.
- A list name from the page must not reach outside the deck's folder (no `..`): answer 400.
- Done when: a test asks for every deck and every list and gets no error, and a path with `..` is refused.
- Notes (task 3, 2026-11-13): `app/server/decks-routes.ts` holds the two calls and `RequestError` (a status plus message that `server.ts` turns into an error answer; later routes can throw it too). `GET /api/decks?all=1` adds `lists/old` and `lists/cuts` to the list files; those folders also hold old reports that are not decklists, so the page must not open them as lists. The test is `app/server/decks-routes.test.ts`, run by `npm run app -- --test`.

### 4. Starting, following and stopping a run on the server

- `app/server/runs.ts`: holds the one run in progress. `POST /api/runs` checks the request (deck names, list files, game count within 1 to 50,000, settings that exist for the deck), starts the run with task 2's function, and logs it with the functions `cli/log-session.ts` uses (move what both need into `engine/` so the two don't drift apart).
- A goldfish run with several lists plays them one after the other on the same seeds, as the command line does, and ends with the comparison data of task 1. A pod run ends with the pod report data.
- `powerSave` uses what `--eco` uses (`cli/eco.ts`: fewer workers, a rest between chunks, lower priority).
- `session-logs/` is cleared once, when the server starts.
- Done when: a test starts a small goldfish run and a small pod run through the API, polls until done, and reads the report and the run folder; a second `POST` during a run gets 409; stop works.

### 5. Game logs on the server

- `GET /api/logs`, `/api/logs/<run>/games`, `/api/logs/<run>/games/<seed>` on top of `game-log-files.ts` and `game-log-run.ts`. The games list gives each row its result in words (`describeGameResult`) and filters by tag and, for a pod, by winner.
- Reading one game unzips its whole games file each time. Keep the last file that was unzipped in memory, so stepping between games of the same file is quick.
- The real logs: `GET /api/decks/<deck>/logs` and `/api/decks/<deck>/logs/<file>` (decision 10). The file name must not reach outside the deck's `logs/` folder: answer 400.
- Done when: a test writes a small run with the engine's functions, then lists and reads its games through the API; and every real log of every deck loads.

### 6. The look of the page and its shared pieces

- The app shell: a Material toolbar with the four places (Decks, Simulate, Pod, Games) and the routes behind them (`/decks/gale`, `/games/01-meren-decklist/412`), so a page can be reloaded and a game can be linked. The server answers every path that is not `/api/...` or a file with `index.html`, so that reloading a route works.
- The theme: dark, dense, one accent colour (decision 11), set once with Angular Material's theming.
- An `ApiService` on `HttpClient` with one typed method per call of the API table, and one place that turns an error answer into a message on the page (a Material snack bar).
- The shared components the pages are built from, each in its own folder: a card (image with a text fallback), a tag chip, a results table, a run progress panel (bar, games played, seconds, stop button), an error box. Use Material's own components where one exists instead of writing a new one.
- Done when: a sample route shows every shared piece, and the other pages can be built from them without new styles.

### 7. Card images

- `GET /api/cards/<name>/image`: looks up the card's `scryfall_id` in the card data, serves the file from `data/scryfall/images/` if it is there, otherwise fetches it from Scryfall, saves it and serves it. A card without an id, a token, or a failed fetch answers 404, and the page then shows the text card of task 6.
- Follow Scryfall's rules for automated use (a pause between requests, a plain client name; nothing about Pontus or the project in the request).
- Done when: a test asks for one known card twice (the second time without the network) and for a token (404).

### 8. Page: decks and decklists

- The decks as a list with commanders and the number of lists. A deck's page: its lists, and the chosen list by section with card count, each card as a row (name, mana cost, type) that shows its image on hover or tap.
- Notes the server gives are shown: cards without data, cards played generically, a list that is not 100 cards.
- Buttons to go on: "simulate this list", "compare with..." (to the Simulate page with the lists filled in).

### 9. Page: simulate

- The form (Signal Forms): deck, one or more lists (the first is the base), number of games (default 5,000), turns, the deck's settings with their defaults, `--diag` on or off, power-save on or off.
- While it runs: a progress bar, games played, seconds, a stop button.
- The result: for one list the kill-turn table (both results, per turn and by turn); for several lists the comparison table with the differences to the base and the noise note; for `--diag` the deck's measures per list.
- Under it, "Games worth a look" per list: the tagged games with their result, each a link into the game viewer, and a link to all games of the run.

### 10. Charts for the results

- The kill-turn table as a chart (share of games won by each turn, one line per list), drawn with SVG in a small component of our own. No chart library.
- Done when: the chart and the table show the same numbers.

### 11. Page: pod

- The form (Signal Forms, with a list of seats): 3 to 6 seats, a deck and a list for each (the same deck twice is allowed), games (default 1,000), round cap, the pod settings (`threat`, `policy`), power-save.
- The result: win rates against an even pod, win rounds, how the wins came, who went out first, by seat, and the interaction table.
- "Games worth a look" with the pod's tags, linking into the game viewer.

### 12. Page: the games of a run

- The runs of the session. A run: its games as a table (seed, result, tags) with filters for tag and, in a pod, winner; a page at a time; type a seed to jump to it.
- Per deck, its real games (the Archidekt logs), each a link into the game viewer.

### 13. Page: the game viewer

The main new thing of this step.

- Left: the log, grouped by turn (round and player in a pod), highlights marked, lines by another player than the one whose turn it is named, as `formatGameLog` does in text. Click a line to go there.
- State: the game and the chosen line are signals; the board is computed from them with `TableBoards` (imported from `engine/game-log-board.ts`).
- Right: the board after the chosen line: per player the battlefield (lands apart from the rest, tapped ones turned, counters shown, tokens marked), hand, graveyard, exile, command zone, library size and life. In a pod: every player, the one whose turn it is on top.
- Stepping: next and previous line, next and previous highlight, next and previous turn, by buttons and keys (arrow keys, `h` for highlights).
- The cards of the chosen line (`GameEvent.cards` and its moves) are shown large.
- A switch for the card moves under each line (what `--moves` shows).
- A real Archidekt log opens in the same viewer (one player, no life totals, a line per card move).
- Done when: a goldfish game, a 4-player pod game and a real log can be stepped from the opening hand to the end, and the last board equals what `npm run logs -- <run> --seed N --board` prints.
- Note from task 0: `engine/game-log-board.ts` cannot be imported into the page as it is: it imports `game-log.ts`, which imports `cards.ts` (reads files with Node). The way to go (Pontus, 2026-11-13): as with the types in task 0, move what the board needs out of the engine into a shared folder that both the engine and the page import, free of Node and engine code. The plain type files of task 0 (`engine/game-log-types.ts`, `engine/run-types.ts`, `engine/pod-types.ts`) move into that folder at the same time.

### 14. Finish

- README: `npm run app` and `npm run app:dev`, the second `npm install` in `app/web/`, the folders, where the images are kept. ENGINE.md: what the server calls. ROADMAP: step 4 done.
- A `--test` for the app (`npm run app -- --test`): the API tests of tasks 2 to 5 and 7 in one go, with the server on a free port and nothing left in `session-logs/` afterwards. The page's own tests are Angular's (`ng test` in `app/web/`): at least the board of the game viewer and the two forms.
- A look at the whole thing on a phone-width window and with the network off (images that were never fetched fall back to text).

## How to work on a task

For a person or an agent who starts without knowing the project. Read `CLAUDE.md` (the coding standards and the commands), this file, and before changing `engine/` the rules at the top of `ENGINE.md`.

1. **Pick a task** whose "Needs" are all `done` in the table above and whose status is `open`. Task 0 (done) created the folders and the shared shapes everything else builds on.
2. **Work on a branch** named `step4/<task number>-<short-name>` (for example `step4/3-decks-on-the-server`), one task per branch. Commit as you go: a commit before any large or scripted edit, so that a bad one can be undone.
3. **It is done when** the task's own "Done when" holds and `npm run verify` ends with VERIFY OK. For a task that changes the page, `ng build` in `app/web/` must pass too. A task that only touches the page and `app/server/` may skip nothing: the verify run is what shows the simulator still gives the same results.
4. **Hand it back:** merge the branch into `main`, set the status to `done (<date>)`, and add one or two lines under the task about anything that differs from this plan or that the next task should know.

Things that trip people up here:

- **Results must not change.** The simulator is used to compare decklists, so the same seeds must give the same games. `--regress check` printing DIFFERENT for a deck you did not mean to change is a bug in your change, not a baseline to re-record.
- **Simulations take minutes and load the machine.** If Pontus is there, ask whether to run them in power-save mode. If you work unattended, use power-save: `npm run verify -- --eco` (same results, about three times as long).
- **Angular version:** Angular 22.2.7, Angular Material 22.2.7, TypeScript 6.0 in `app/web/` (the simulator keeps its own TypeScript 5.7), Node 26.13.1 (installed with fnm, which reads `.nvmrc`). Later tasks use that version and do not upgrade it.
- **Network:** tasks 0 and 7 need it (`npm install`, the Angular skills, Scryfall). Everything else works without.
- **Shell:** this is a Windows machine. Backslashes get lost when a script is written through a shell heredoc: write files with an editor tool, not with `echo` or `cat <<EOF`.
- **Search and replace across the project:** whole word, match case, `*.ts` only, and commit first. A loose replace once changed card data and baselines.

## Rules for everyone working on this

- `CLAUDE.md` holds the coding standards (rule 0 names, small plain functions, comment the why). `ENGINE.md` holds the rules for changing `engine/`.
- The engine does not learn about the web: no `http`, no HTML in `engine/`. The server calls the engine; the page calls the server.
- Nothing in `app/server/` prints the report text the command line prints: it sends data, the page shows it.
- Work on the page follows the Angular skills in `app/web/` and uses Angular Material's components before writing new ones.
- A task that needs a shape that is not in `app/api-types.ts` adds it there first, in its own small change, so that tasks running side by side see it.

## Order and size

Task 0 comes first and is small. The big ones are 2 (the worker loop), 4 (runs on the server), 9 (the simulate page) and 13 (the game viewer). The first thing that works end to end is 0 + 3 + 6 + 8 (browsing decks); the first run from the page needs 1, 2, 4 and 9.
