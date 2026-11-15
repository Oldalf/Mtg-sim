# Plan: step 7, mana as it really is, then Pontus's ideas

Written 2026-11-15 from `IDEAS.md` and a pod game Pontus watched. Tasks Z0 to B5 are done; their full text (the B1 design, results, what each found) is in git (`PLAN.md` at commit `e686967`). The plan of step 6 is at commit `330b641`.

## How to read this plan

Each task names a model. Give it to that model or a stronger one.

| Model | Tier | What it gets |
|---|---|---|
| Claude Haiku 5.5 | S (small) | Mechanical work with exact steps. No design choices. A command says if it worked. |
| Claude Sonnet 5.5 | M (medium) | A feature or fix with a clear goal, in patterns the code already has. Small choices only. |
| Claude Opus 5.5, or Fable 5.2 | L (large) | Design, work across many files where judgement is needed, or writing that other models will follow. |
| **P** | Pontus | A decision. Tasks marked "after P" wait for it. |

Rules for every task:

- Read `CLAUDE.md` first (rule 0 names, KISS). For the engine also `ENGINE.md`, for the page also `app/web/CLAUDE.md`.
- One task is one commit, straight on `main`. `npm run format`, then `npm run verify` must end with VERIFY OK, except for Gale's known kill misses (below).
- Ask Pontus eco or full power before any task that runs simulations (`verify` with regress checks counts).
- Before changing pod code, save a fixed-seed pod run (`npm run pod -- gale meren samfrodo aesi -n 200 --no-log`) and compare afterwards; `--regress check` does not cover pod mode.
- A task that changes results on purpose shows Pontus the numbers before and after (same seeds), then re-records the baselines (`--regress record`, `regress_baseline/pod.txt`).
- A task that finds its steps do not fit the code stops and says so. It does not improvise a bigger change. This matters most for Haiku 5.5.
- When a task is done, add one line under it here: what was built and anything the next task must know.

**Gale's known kill misses.** 9 of 300 Gale seeds still have a kill miss, because Gale's kill search keeps lands and floating mana in one pool. The fix is `ROADMAP.md` step 8, after this plan. Until then `gale --test` fails on those 9 seeds, so `npm run verify` ends VERIFY BAD with that one line: a task is fine when it is the only BAD line.

## Done

| Task | What |
|---|---|
| Z0 | `npm run verify` for step 6 |
| A1, A2 | Gale's High Tide kill with a Signet: test, cause (High Tide's payment counted twice), fix |
| B1 | Real mana: the design, approved by Pontus |
| B2 | Steps and the pool: `GameCore.step`, `enterStep` empties the pool (rule 106.4), "Rules followed" in `ENGINE.md` |
| B3, B4 | Kill lines played for real (engine, Gale, Codie, Aesi); `killMisses` / `killChanceFails` in `--diag`; `--test` fails on a miss over 300 seeds |
| B3b | Gale's misses 53 -> 9 seeds; the rest is `ROADMAP.md` step 8 |
| B5 | `pay` tries other orders when the first fails (`engine/game/payment-search.ts`); `GameCore.lastPayment` records what paid |

## Order

| # | Task | What | Model |
|---|---|---|---|
| 1 | B6 | The log's "paid with" text and the viewer's pool chip | Sonnet 5.5 |
| 2 | D1 | The viewer: a card grows on hover | Sonnet 5.5 |
| 3 | C1 | Meren's Snake: deathtouch or not | Sonnet 5.5, after P |
| 4 | E1 | The Games tab: a run's stats page | Opus 5.5 (design), Sonnet 5.5 (build) |

C, D and E stand alone.

---

## B6. "Paid with" and the pool chip (Sonnet 5.5)

From the B1 design (point 4), with Pontus's answer: both the text and the chip are wanted.

- **"Paid with":** cast lines end with the sources that paid, taken from `GameCore.lastPayment` (e.g. `cast Syr Konrad, the Grim — paid with Island, Island (+2 High Tide), Swamp, Dimir Signet (fed by Island)`). The event gets a `paidWith: string[]` field, so a viewer can later highlight the paying cards. No log line per tap: a kill line of 20 spells would bury the log.
- **The pool chip:** the event gets a `pool` field, but only when the pool isn't empty, so old logs stay as they are. The types go in `shared/` and are set the same way `playerCounters` is. The viewer shows it as a chip on the seat, the way energy is shown (`U3 B1`).
- **Checks:** `ng build`, `ng test`, and look at it in the browser. Sim results must stay IDENTICAL (only log text changes).

**Built (2026-11-15).** `GameEvent.paidWith` (`ManaPaid`: card, what it made) and `GameEvent.pool` (the acting player's floating mana as symbols, "UUB") in `shared/game-log-types.ts`. `GameCore` notes each committed payment in `paymentsForLog` while the log is on; the next line takes them. `restore` drops payments a snapshot undoes, because Gale's AI pays to try a plan and then rolls it back. `event.text` itself is unchanged: `describeEventText` (shared) adds " — paid with Island (U) x2, Swamp (B)" for the text log, the viewer's log and the caption. The board has `pool` (emptied at a turn start, set from each line of its player), shown as "pool U2 B1" in `describeBoard` and as a chip on the seat. A filter Signet's part is what it added net (fed by U, it shows "B"). Tests: `runPaymentLogTests` in `npm run pod -- --test`, and one in `game-steps.spec.ts`. Checked in the browser at desktop and 390 px.

---

## C. Meren's Snake

### C1. Deathtouch or not (Sonnet 5.5, after P)

Meren's Snake token (`decks/meren/cards.ts`: `makeToken('Snake', 1, 1, 'black')`) has no deathtouch, but Scryfall's only black 1/1 Snake token has it (found in step 6's D1). Find the card in Meren's lists that makes it and read its Scryfall text (`all_parts` in the bulk data names the exact token). Tell Pontus what the card makes. If it has deathtouch, add it (`makeToken(..., ['deathtouch'])`): Meren's results may change (blocks in a pod, crackback in goldfish), so show before and after and re-record. Update `decks/meren/PLAN.md`.

---

## D. The viewer

### D1. A card grows on hover (Sonnet 5.5)

Cards on the table are small. On hover (and on focus, for the keyboard) a card shows larger, as a pop-up next to the pointer, at the size of a real card image (about 250 px wide), for permanents, lands, the caption's cards and the zone popovers. A token card (`app-token-card`) grows too. It must not cover the card itself or make the page scroll; on a phone a tap opens it and a second tap or a tap elsewhere closes it. Mind `player-seat.scss`'s 4 kB budget: the pop-up belongs in its own component (or in `app-card-image` / `app-token-card`). Check in the browser at desktop and phone width; `ng test` and `npm run verify` pass.

**Built (2026-11-15).** `CardZoom` (`app/web/src/app/shared/card-zoom/`) is a host directive on `app-card-image` and `app-token-card`: on mouse hover (120 ms delay), keyboard focus (`:focus-visible`) or a tap it shows a copy of the card, 262 px wide, as a manual popover in the top layer (no parent clips it, `pointer-events: none`). `placeZoomedCard` puts it right of the card, else left, else above/below (phone), inside the window. A touch tap toggles it; a tap elsewhere or Escape closes it. Checked in the browser at desktop width; phone width and touch not yet checked.

---

## E. The Games tab

### E1. A run's stats (Opus 5.5 for the design, Sonnet 5.5 for the build)

The Games tab lists runs and their games, but not the result table a run printed (win rates, kill turns). Add a stats page per run: for a goldfish run the kill-turn table and chart of the Simulate page, for a pod run the pod report. First decide (and write here): store the report with the session logs when the run ends (simple, the run's numbers exactly; needs `GameIndex` / run info to carry it) or compute it from the logged games (works for old runs; must match what the run printed). Recommendation: store it, as the report already exists when the run ends. Then build it: the API, a page reusing the Simulate and Pod result components, and a link from the run's games. Done when `ng test`, `npm run app -- --test` and `npm run verify` pass and the browser shows a goldfish and a pod run's stats.

---

## Not in this plan

The ideas left from step 5 are in `ROADMAP.md` under "Ideas not decided". New memos from Pontus go at the end of `IDEAS.md`.
