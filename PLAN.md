# Plan: step 7, mana as it really is, then Pontus's ideas

Written 2026-11-15 from `IDEAS.md` and a pod game Pontus watched. The plan of step 6 is in git (`PLAN.md` at commit `330b641`).

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
- One task is one commit, straight on `main`. `npm run format`, then `npm run verify` must end with VERIFY OK.
- Ask Pontus eco or full power before any task that runs simulations (`verify` with regress checks counts).
- Before changing pod code, save a fixed-seed pod run (`npm run pod -- gale meren samfrodo aesi -n 200 --no-log`) and compare afterwards; `--regress check` does not cover pod mode.
- A task that changes results on purpose shows Pontus the numbers before and after (same seeds), then re-records the baselines (`--regress record`, `regress_baseline/pod.txt`).
- A task that finds its steps do not fit the code stops and says so. It does not improvise a bigger change. This matters most for Haiku 5.5.
- When a task is done, add one line under it here: what was built and anything the next task must know.

## Order

| # | Task | What | Model |
|---|---|---|---|
| 0 | Z0 | `npm run verify` for step 6's D4 (skipped on 2026-11-15) | Haiku 5.5 |
| 1 | A1 | Gale's High Tide kill with a Dimir Signet: a test that shows it, and why | Opus 5.5 |
| 2 | A2 | Fix the kill search's filter Signets (after P: before or instead of B) | Opus 5.5 |
| 3 | B1 | Real mana: the design (tapping in order, a floating pool, the steps of a turn) | Opus 5.5, then Pontus |
| 4 | B2... | Real mana: the build, in tasks B1 writes | B1 says |
| 5 | C1 | Meren's Snake: deathtouch or not | Sonnet 5.5, after P |
| 6 | D1 | The viewer: a card grows on hover | Sonnet 5.5 |
| 7 | E1 | The Games tab: a run's stats page | Opus 5.5 (design), Sonnet 5.5 (build) |

Why this order: the Gale game is a wrong win, so results are off until it is fixed; Pontus wants it first. A1 pins it down with a test, A2 is the small fix in the kill search, and B is the bigger change Pontus asked for: mana handled the way the rules handle it, in every deck, and visible in the log. B changes results for every deck, so it gets a design and Pontus's yes first. C, D and E stand alone.

---

## Z0. Verify step 6 (Haiku 5.5)

Step 6's D4 (commit `330b641`) was committed without `npm run verify` (Pontus was short on time). Type-check, `ng build`, `ng test` and `npm run app -- --test` passed. Run `npm run verify` (ask eco or full power); it must end with VERIFY OK. D4 only changed the image version in `engine/cards/card-images.ts`, which the sim does not use, so every `--regress check` must be IDENTICAL. If something fails, stop and report it.

---

## A. Gale wins with a mana he does not have

What Pontus saw (pod game `01-pod-gale-meren-samfrodo-aesi-mike-edgar`, seed 206, line 100; the run is gone, the server was restarted): turn 4, Gale's turn, nobody can answer. After the draw Gale's hand is Island, High Tide, Maddening Cacophony, Syr Konrad, the Grim, Mocking Sprite, Swamp. He plays the Island. Board: Dimir Signet, Mindcrank, 3 Islands and 1 Swamp, all untapped. The kill line found:

```
> cast High Tide from hand
> cast Syr Konrad, the Grim
> cast Maddening Cacophony [unk] from hand  => ALL OPPONENTS DONE
```

The line needs High Tide ({U}), then Syr Konrad ({3}{B}{B}) and Cacophony unkicked ({1}{U}): 7 mana with two black after High Tide. What the board can really make:

- Pay High Tide from the Signet: the Swamp feeds the Signet ({U}{B}), its {U} pays High Tide, its {B} floats; the three Islands then make 6 blue. That is 7 mana but only **one** black: Konrad cannot be cast.
- Pay High Tide with an Island: the other two Islands make 4 blue, the Swamp 1 black, and an Island's mana fed through the Signet turns 1 into {U}{B}. That is 6 mana with two black: **one short** (Pontus's count).

So the line is not there. The likely cause (found while writing this plan, not yet proven): the kill search's snapshot (`decks/gale/snapshot.ts`, `addManaAndLands`) counts a filter Signet (`'F'` in `engine/cards/card-facts.ts`) as one mana of any colour "from outside our lands" (`pool.A += 1`, `free += 1`), with nothing paying its {1}. `KillSearchState.paidByLand` (`decks/gale/kill-state.ts`) then pays High Tide with that free mana, so no Island loses its High Tide bonus and the Swamp's black is still there. The engine's own payment (`GameCore`, the `'F'` branch near line 575) does know a Signet needs a mana fed into it.

### A1. A test, and the cause (Opus 5.5)

1. Add the position to Gale's kill tests (`decks/gale/tests/kills.test.ts`, the same shape as the High Tide test there): the hand and board above, opponents at the life and library of the game, nothing to answer. Expected: no kill this turn. Check it fails today.
2. Find why the search finds the line. Start from the snapshot above; check the Signet's colour too (it makes {U}{B}, not "any"). Then check why the game itself let the line through: the cast of Konrad must pay through `pay`; if `pay` found the mana, there is a second bug in the engine's payment; if the kill line was executed without paying, say so.
3. Write what you found under this task and stop: A2 or B fixes it.

### A2. Fix the kill search's filter Signets (Opus 5.5, after P)

Pontus decides whether A2 comes before B (a small fix now, so Gale's numbers are right while B is designed) or B replaces it. If A2: the snapshot and `KillSearchState` treat a filter Signet as "pay one mana in, get {U}{B} out" (the mana fed in is a land's, so an Island that feeds it before High Tide loses its bonus). The A1 test passes. Gale's results change on purpose: show Pontus a fixed-seed goldfish run (`-n 3000`) and the pod run before and after, then re-record the baselines. Check every other mana source the snapshot counts as "free" the same way (Talismans, Sol Ring, Treasures, rituals).

---

## B. Mana as it really is

What Pontus wants: lands and rocks are tapped during play, in order, and the mana goes into a floating pool; the turn has its real steps (untap, upkeep, draw; first main phase; combat; second main phase; end step and cleanup), and mana left in the pool empties when a step or phase ends. The log and the viewer show each tap as it happens.

What the engine does today (to be checked by B1): `GameCore.pay` picks sources for a cost and taps them (with `commit = false` it taps and undoes, to test whether a cost can be paid), `pool` holds mana that floats, and High Tide / Bubbling Muck are counters (`highTidesThisTurn`) that add mana when an Island / Swamp is tapped. The decks' kill searches (Gale's `KillSearchState`, others) do their own abstract mana counting. The turn is `untap, upkeep, draw, main, combat, main, end` in code, but floating mana is not emptied between them in every case.

### B1. The design (Opus 5.5, then Pontus)

Write the design here, under this task, for Pontus to approve. It must answer:

1. **The pool and the steps.** Where the pool empties (each step and phase), and how a deck's code says which step it is in. What happens to mana made in upkeep or at the end of combat.
2. **Tapping in order.** A cost is paid by tapping sources one by one into the pool and then paying from the pool, so the order matters (feed a Signet, tap an Island before or after High Tide). How the engine picks the order (it must find the best order, or a deck can ask for one), and how `commit = false` (testing a payment) works with it.
3. **The kill searches.** Gale's `KillSearchState` and the other decks' kill checks count mana on their own. Either they get the real pool and sources (slower, exact), or their counting is checked against the real payment (a test that replays each kill line through `pay` and fails when it cannot be paid). Pick one, say why, and say what it costs in speed (`ENGINE.md` has today's times).
4. **The log.** Each tap is already a move ("tapped"); say whether mana in the pool is shown (a line, the caption, a chip on the seat like energy) and how a viewer reader sees which mana paid for what.
5. **Results.** This changes results for every deck. Say which decks are touched most (Gale, Codie, Aesi's loops), how to compare before and after (same seeds, `-n 3000` per deck, the pod run), and how the change is split into tasks that each leave the code working (B2, B3...), with a model for each.

Done when the design is written here and Pontus has said yes.

### B2... (written by B1)

---

## C. Meren's Snake

### C1. Deathtouch or not (Sonnet 5.5, after P)

Meren's Snake token (`decks/meren/cards.ts`: `makeToken('Snake', 1, 1, 'black')`) has no deathtouch, but Scryfall's only black 1/1 Snake token has it (found in step 6's D1). Find the card in Meren's lists that makes it and read its Scryfall text (`all_parts` in the bulk data names the exact token). Tell Pontus what the card makes. If it has deathtouch, add it (`makeToken(..., ['deathtouch'])`): Meren's results may change (blocks in a pod, crackback in goldfish), so show before and after and re-record. Update `decks/meren/PLAN.md`.

---

## D. The viewer

### D1. A card grows on hover (Sonnet 5.5)

Cards on the table are small. On hover (and on focus, for the keyboard) a card shows larger, as a pop-up next to the pointer, at the size of a real card image (about 250 px wide), for permanents, lands, the caption's cards and the zone popovers. A token card (`app-token-card`) grows too. It must not cover the card itself or make the page scroll; on a phone a tap opens it and a second tap or a tap elsewhere closes it. Mind `player-seat.scss`'s 4 kB budget: the pop-up belongs in its own component (or in `app-card-image` / `app-token-card`). Check in the browser at desktop and phone width; `ng test` and `npm run verify` pass.

---

## E. The Games tab

### E1. A run's stats (Opus 5.5 for the design, Sonnet 5.5 for the build)

The Games tab lists runs and their games, but not the result table a run printed (win rates, kill turns). Add a stats page per run: for a goldfish run the kill-turn table and chart of the Simulate page, for a pod run the pod report. First decide (and write here): store the report with the session logs when the run ends (simple, the run's numbers exactly; needs `GameIndex` / run info to carry it) or compute it from the logged games (works for old runs; must match what the run printed). Recommendation: store it, as the report already exists when the run ends. Then build it: the API, a page reusing the Simulate and Pod result components, and a link from the run's games. Done when `ng test`, `npm run app -- --test` and `npm run verify` pass and the browser shows a goldfish and a pod run's stats.

---

## Not in this plan

The ideas left from step 5 are in `ROADMAP.md` under "Ideas not decided". New memos from Pontus go at the end of `IDEAS.md`.
