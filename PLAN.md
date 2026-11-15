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
| 2 | A2 | Fix the kill search's High Tide double count (after P: before or instead of B) | Opus 5.5 |
| 3 | B1 | Real mana: the design (done, approved 2026-11-15) | Opus 5.5, then Pontus |
| 4a | B2 | Steps and the pool: the pool empties at each step | Sonnet 5.5 |
| 4b | B3 | Kill lines played for real (engine + Gale), kill misses counted | Opus 5.5 |
| 4c | B4 | Kill lines played for real for Codie and Aesi | Sonnet 5.5 |
| 4c' | B3b | Gale's kill search without misses (after B3) | Opus 5.5 |
| 4d | B5 | `pay`: a better tapping order when the first try fails | Opus 5.5 |
| 4e | B6 | The log's "paid with" text and the viewer's pool chip | Sonnet 5.5 |
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

**Found (2026-11-15).**

- **The tests.** Two cases in `decks/gale/tests/kills.test.ts`: the position with a Dimir Signet, and the same with an Arcane Signet. Both fail today (`got 1, expected 0`). The search finds Pontus's exact line (High Tide, Konrad, unkicked Cacophony, libraries emptied) when the opponents' libraries are 45 or less. At 50 or more the Konrad/Mindcrank chain does not empty them, so the tests use 40. The pod game itself could not be replayed: `--trace 1 --seed 206` with the same six decks plays a different game under every policy, so its library sizes are unknown.
- **The cause is not the filter Signet.** An Arcane Signet (one mana of any colour, nothing fed in) makes the same wrong kill. A Sol Ring does not, because its mana is colourless. The bug is that High Tide's payment is counted twice:
  - `paidByLand` (`decks/gale/kill-state.ts`) sees mana from outside the lands (`coloursFromOutsideLands`, the rock) and says the rock paid High Tide, so all 3 Islands keep their bonus. But it only lowers the counter. It does not take that mana out of the pool.
  - `spendMana` then pays High Tide's {U} from `pool.U`, which is an Island's mana.
  - The rock's mana is still in the pool as `A` (any colour) and pays Konrad's second {B}. After High Tide the search has U 5, B 1, A 1: 7 mana with BB.
  - The real board has 7 mana with one B (the rock pays High Tide) or 6 with BB (an Island pays). Konrad and Cacophony need 7 with BB.
- **The filter Signet's colour.** Counting the filter Signet as "any" is a smaller inaccuracy, and it does not change this position. With the double count fixed, "any" gives the same best as feeding it a land: 6 U + 1 B, or 6 with BB.
- **The same pattern elsewhere.** `paidByLand` also pays Bubbling Muck (Swamps) this way. Energybending's {2} lowers the same two counters while `spendMana` pays from the pool, so it should be checked too.
- **The engine's payment is right.** Paying the same spells through `game.pay` refuses Konrad.
- **The game never pays a kill line.** `checkKill` (`engine/game/game-core.ts`, around line 655) takes the search's verdict, declares the win, and only logs the line's steps (`lastKillLine`). So the log's "cast" steps were never paid, and any miscount in a kill search becomes a win. This is the case for B1 question 3: a test that replays each found kill line through `pay` would have caught this one.

Committed together with A2, so `main` never has failing tests.

### A2. Fix the kill search's High Tide double count (Opus 5.5, after P)

Pontus decides whether A2 comes before B (a small fix now, so Gale's numbers are right while B is designed) or B replaces it. If A2: fix the double count A1 found. When `paidByLand` lets mana from outside the lands pay High Tide or Muck, that mana must also leave the pool (and Energybending's {2} the same way). The filter Signet as "any" can stay, unless a test shows a position where its fixed {U}{B} matters. The A1 tests pass.

**Done (2026-11-15).** `KillSearchState` now splits the outside mana into `blueFromOutsideLands`, `blackFromOutsideLands`, `anyColourFromOutsideLands` (and `colourlessFromOutsideLands` as before), and `payBonusSpell` (was `paidByLand`) pays High Tide / Muck from outside mana of its colour, else from any-colour mana (which then leaves the pool), else from a land. A Dark Ritual's {B} no longer pays High Tide. A positive test checks that a rock paying High Tide still leaves every Island its bonus. Results (same seeds): Gale goldfish `-n 3000` win by T8 58.0% -> 57.7%, with counter backup 37.9% -> 37.1%; the verify pod run (gale meren samfrodo aesi edgar, 200 games) only moves Gale's avg turn 7.26 -> 7.33. `regress_baseline/gale.json` and `pod.txt` re-recorded; `npm run verify` was skipped on Pontus's word. Still not exact: the outside-mana counters do not go down when that mana is spent on other spells, and the game still never pays a kill line (see B1). Gale's results change on purpose: show Pontus a fixed-seed goldfish run (`-n 3000`) and the pod run before and after, then re-record the baselines. Check every other mana source the snapshot counts as "free" the same way (Talismans, Sol Ring, Treasures, rituals).

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

6. **Kill lines are played, not declared** (Pontus, 2026-11-15). Today `checkKill` declares the win from the search's verdict and only logs the line (A1). Instead the game plays the line it found through the real engine: each spell cast and paid with `pay`, each land and rock tapped in the log, loops shown for a few rounds and then summed up ("repeats 37 times"). A step that cannot be paid, or an outcome short of a win, means no win, and the game logs it and counts it as a search miss (a bug to look at). Say how each kind of kill move gets its real-game step, what happens to "expected" results such as Konrad's chain (played with the real library, so it can fail), and what it costs in speed.
7. **The rule book.** Use the Comprehensive Rules (Wizards' official rules text) as the reference: 500–514 (turn structure), 106.4 (the mana pool empties at the end of each step and phase), 601.2g–h (mana abilities are activated while paying a cost), 605 (mana abilities). Cite the rule numbers in `ENGINE.md` where the engine follows them, and say where it knowingly does not.

Done when the design is written here and Pontus has said yes.

#### The design (Opus 5.5, 2026-11-15; waiting for Pontus)

**What the code does today** (checked while writing this):

- `pay` already taps one source at a time into `this.pool` and pays from the pool. The loop is `short` (what are we short of), then `pick` (the best untapped source for it, by `RANK`), then `tap`. So mana is already tapped in order, but the order is greedy and the first good-looking source wins. The undo for `commit = false` restores the pool and untaps.
- The pool is only emptied in `startTurn`. Mana made in the first main phase is still there in combat, the second main phase and the end step. Rituals and other mana spells add to the pool directly (Dark Ritual, Songs of the Damned, Codie's rituals). Codie's flat Mana Drain adds its mana in upkeep, but the real card adds it at the start of the first main phase.
- How the decks with a kill search find a kill:
  - **Gale** counts mana abstractly in `KillSearchState`.
  - **Codie** searches on copies of the game and pays with the real `pay`. Its loops add 99 of each colour as a shortcut.
  - **Aesi** plays its loops in the real game, with an `infMana` shortcut. Its `killSearch` is only used by the log analyzer.
  - **Meren, Sam & Frodo, Mike and Edgar** have no kill search. They win through combat or their own actions in the real game, so their wins are already paid for.
- `checkKill` declares the win from the search's answer. Only Gale's wins can be unpaid, which is where A1's bug came from. Codie's wins are paid, but on a copy of the game that is then thrown away, so its log shows the line as text only.

**1. The pool and the steps.**

- The game gets a `step` field: `'upkeep' | 'draw' | 'main1' | 'combat' | 'main2' | 'end'`.
  - `enterStep(step)` sets it and empties the pool (rule 106.4).
  - With the log on, mana that is lost gets a short note ("2 mana left in the pool is lost at the end of main phase 1"). Lost mana usually means the AI wasted it, so the note helps find bugs.
  - There is no mana burn. It left the rules in 2009.
- `takeTurn` and the planner's `rolloutValue` call `enterStep` at each step. A deck reads `this.step` when a card cares which step it is, e.g. "at the beginning of combat".
- Untap has no step value, because nothing happens there. Cleanup is part of `endTurn` (rule 514: discard to 7, and "until end of turn" effects end).
- Mana made in upkeep or in combat empties at the end of that step, as the rules say, so a deck must spend it in that step. Today one deck does this: Codie's flat Mana Drain adds its mana in upkeep. It moves to `main1`, which is where the card adds it.
- High Tide, Bubbling Muck and Energybending stay per-turn flags. They last until end of turn, so they are right as they are.
- A pod: each deck's game has its own pool. Instant-speed plays on another player's turn (counterspells) already pay with `pay` and spend the mana at once, so nothing floats there.

**2. Tapping in order.** `pay` stays fast for the 99% case and gets a fallback for the rest.

- **The greedy order stays first.** It is quick and nearly always right. The fixes A1 found go into `pick`:
  - A filter Signet is only picked when a mana is in the pool to feed it. That check exists today. What is new: the colour it adds counts towards the colour we are short of.
  - With High Tide out, Islands are tapped for the coloured part of a cost. They already get a −0.5 rank bonus.
- **The fallback.** When the greedy order fails, `pay` checks whether the untapped sources could make enough mana at all (a quick count). If they could, it tries the remaining orders with a small depth-first search. It taps each source once, in each order, with each colour choice for an any-colour source. The search is bounded by the number of untapped sources, which is about 12 in a late game. It stops at the first order that pays.
  - Speed: the fallback only runs when greedy fails and enough mana exists. That is rare, so the cost should be under a few percent. B5 measures it. If the fallback finds payments that greedy missed, it is wanted: those are spells the AI could not cast before.
- **A deck can ask for an order.** `pay(cost, isInstantOrSorcery, commit, preferredSources?)` taps the named permanents first, e.g. Gale's kill line: "pay High Tide with the Signet, fed by the Swamp".
- **`commit = false` is unchanged.** It taps, then undoes the taps and restores the pool. Rule from `ENGINE.md`: side effects (pain damage, sacrifices) only happen on commit. The fallback search uses the same undo between tries.
- Each payment records what it tapped and what each source made (`lastPayment: { source: Permanent; made: string }[]`). The log reads it (point 4). It costs one small array per payment, which is cheap.

**3. The kill searches: their counting is checked, not replaced.** Each kill a search finds is played for real in every game (point 6). If its counting is wrong, the game does not win, and the miss is counted.

Why not give the searches the real pool and sources?
- Gale's search tries thousands of positions per call (`search_budget`). Each position would need a copy of the game instead of a small state object, which makes it about 10–50 times slower.
- Gale takes 45 s per 3,000 games today, and the search is a large part of that.
- Codie already searches on copies of the game, which is why its searches are small and shallow.
- Playing the found line costs one copy of the game per found kill, which is at most a few per game.

The check runs in every game, not just in a test. So any future miscount, in any deck, shows up as a counted miss in the run's numbers and in `--test`.

Codie and Aesi stay as they are. Codie already pays; it only needs to keep the paid copy (point 6). Aesi already plays in the real game.

**4. The log.**

- **A cast line names what paid for it.** For example: `cast Syr Konrad, the Grim — paid with Island, Island (+2 High Tide), Swamp, Dimir Signet (fed by Island)`. The text comes from `lastPayment`. The card moves already show the sources as tapped.
- **No line per tap.** A kill line of 20 spells would bury the log.
- **The viewer shows the pool as a chip on the seat**, like energy: `U3 B1` while mana floats, and nothing when the pool is empty. It is a new field on the event (`pool`, only when it is not empty), set the same way `playerCounters` is, so old logs stay as they are.
- **A reader sees which mana paid for what** from the cast line's "paid with" text. Highlighting the paying cards when hovering a line can come later as a viewer task, because the data will already be in the event (`paidWith: string[]`).

**5. Results and tasks.**

- **Gale** changes most: unpaid kills go away, and payments that were impossible may become possible.
- **Codie** changes through the steps (Mana Drain) and the fallback payment.
- **Aesi** changes through the steps, if its loops leave mana floating into combat.
- **Meren, Sam & Frodo, Mike and Edgar** should come out nearly or exactly IDENTICAL. Any change there would come from the fallback payment.

How to compare: same seeds, `-n 3000` per deck before and after each task, plus the verify pod run (gale, meren, samfrodo, aesi, edgar, `-n 200 --no-log`). Show Pontus the numbers, then re-record the baselines. Each task below leaves the code working and is one commit.

| Task | What | Model |
|---|---|---|
| B2 | Steps and the pool: `step`, `enterStep`, the pool empties, the lost-mana note, Codie's Mana Drain in `main1`. Rule numbers in `ENGINE.md` (point 7). | Sonnet 5.5 |
| B3 | Kill lines played for real, in the engine and for Gale: kill steps as data, play on a copy, adopt or count a miss, a `killMisses` diag number, and a test that 300 seeds have no misses. | Opus 5.5 |
| B4 | The same for Codie (keep the paid copy, show loops summed up) and Aesi (loop rounds summed up in the log) | Sonnet 5.5 |
| B5 | `pay`: the fallback order search, `preferredSources`, `lastPayment`, and the speed measured | Opus 5.5 |
| B6 | The log: "paid with" on cast lines, and the pool chip in `shared/` and the viewer | Sonnet 5.5 |

B3 comes before B5 because it shows how many of Gale's kills are wrong today, which is the bug Pontus saw. B5 then makes payments that were wrongly refused possible. B6 can be done at any point after B5.

**6. Kill lines are played, not declared.**

- **Kill steps become data.** `KillSearcher.lastLine` changes from text to steps: `{ kind, card?, variant?, text }`. Gale's kinds are the moves in `kill-moves.ts`:
  - cast a permanent from hand (Guildmage, Mindcrank, Konrad, the untappers, the Monument)
  - cast a spell from hand, with its variant (kicked or not)
  - recast a spell from the graveyard through Gale
  - activate an ability (Guildmage's drain or mill, Konrad's mill, the Monument's two abilities)
  - attack with The Mindskinner
  - Emet-Selch
  - a self-counter in response
  
  Each kind has a step in Gale's game (`playKillStep`) that uses the methods the game already has (`castPerm`, `castInstantOrSorcery`, the recast, `pay` for abilities). Where the real game has no such method yet, B3 writes it in Gale's folder.
- **Played on a copy.** `checkKill` plays the steps on a copy of the game, the way protected mode already tries actions.
  - If every step pays and the opponents are beaten at the end, the copy becomes the game, with its log and moves (as in `develop`'s protected branch), and the win is declared.
  - If a step cannot be paid, or the end falls short of a win, the game is not changed. The log gets a highlight line (`kill line failed at step 3: cannot pay {3}{B}{B} for Syr Konrad`) and `killMisses` counts it. The search is not repeated for that position this turn (it is the same `lastKey`).
- **Loops** (the same activation many times, e.g. Konrad's mill or Guildmage's drain): the first 3 rounds are logged in full and the rest as one line (`… repeats 37 more times`). Every round is still paid with `pay`, so a loop that runs out of mana stops where it really would.
- **"Expected" lines.** Konrad's chain counts on the average number of creatures milled. Played for real, our own library is the real cards. The opponents' libraries are numbers in a goldfish game, so their creatures come from `opp_creature_density` and the game's dice. A line that falls short because of the dice is not a bug: it is counted as `killChanceFails`, apart from `killMisses`, and the game goes on. This is more honest: Gale's chance-based kills will win a little less often.
- **Planner rollouts do not play lines.** Rollouts are guesses about the future, so they keep scoring the search's answer, and they stay fast. Only the real game plays the line.
- **A pod:** the line is played on a copy first. The copy becomes the game only if the pod lets the win through (`podAnswersWin`). If an opponent answers it, today's path stays (the turn goes on without the card it was stopped at).
- **Speed:** one copy of the game and up to about 30 steps per found kill, and a game finds at most a few kills. I expect under 2% of Gale's 45 s, and B3 measures it.

**7. The rule book.** `ENGINE.md` gets a "Rules followed" list with the rule numbers:

- **Followed after this step:**
  - 106.4 (the pool empties at the end of each step and phase)
  - 500–514 (the turn's steps, in order)
  - 601.2g–h (mana abilities are activated while paying, then the cost is paid)
  - 605 (mana abilities don't use the stack)
  - 602.2 (a Signet's {1} is a cost of activating it)
  - 302.6 (a creature with summoning sickness can't tap for mana)
  - 514.1 (discard to hand size at cleanup)
  - 514.2 ("until end of turn" ends at cleanup: High Tide and the like)
  - 117 (priority) only as far as the pod's answer window goes
- **Knowingly not followed:**
  - Goldfish opponents never act, and in a pod they act only in answer windows. There is no full stack or priority.
  - Combat's steps (506–511) are one step.
  - There are no instant-speed plays on other players' turns, except the pod's answers. This is already an idea in `ENGINE.md`.
  - A goldfish opponent's library is a number, not cards.
  - Filter lands, Hideaway and Bojuka Bog's exile are not modelled, as listed today.
  - Loops are shortcut after their first rounds, as the rules' "Taking Shortcuts" section allows a player to do. B2 looks up its exact number in the current rules.

Forge and XMage are open-source full rules engines. Running a full rules engine here would make every run many times slower, so the goal is to follow the rules wherever they change results, and to say so where we don't.

**Pontus decides:**
- **(a)** Yes or no to the plan as a whole.
- **(b)** Should a failed kill line be a counted miss only, or should `--test` fail when a deck has any miss over 300 seeds? I recommend failing the test, because that is what catches bugs like A1's.
- **(c)** Is the pool chip on the seat wanted in the viewer, or is the "paid with" text enough?

**Pontus's answers (2026-11-15):**
- (a) Yes, on the condition that Gale's run time stays about where it is. The 10–50× slowdown was the option this design turns down. Gale keeps its fast abstract search, and B3 must show the cost of playing kill lines; I expect under 2%. If B3 or B5 makes any deck clearly slower (more than about 5%), stop and show Pontus before committing.
- (b) Yes: `--test` fails when a deck has a kill miss over 300 seeds.
- (c) Both: the "paid with" text and the pool chip.

Rules for every B task:
- Read B1's design above first.
- Ask Pontus eco or full power before running sims.
- Before you change anything, save the numbers you'll compare against: `-n 3000` for each deck the task touches, and the verify pod run (gale meren samfrodo aesi edgar, `-n 200 --no-log`).
- Afterwards, show Pontus the numbers before and after, then re-record the baselines.
- If a deck gets more than about 5% slower, stop and show Pontus before you commit.
- When the task is done, write one line under it.

### B2. Steps and the pool (Sonnet 5.5)

1. Add `step` to `GameCore` (`engine/game/game-core.ts`). Its type is `'upkeep' | 'draw' | 'main1' | 'combat' | 'main2' | 'end'`. Copy it in `clone`.
2. Add `enterStep(step)`:
   - It sets `step` and empties the pool (rule 106.4).
   - With `verbose` on and mana left in the pool, it logs a note with `say`, e.g. `2 mana left in the pool is lost at the end of main1`.
3. Call `enterStep` in `takeTurn` before upkeep, the draw, `playLand`/`developWin`, `combat`, `developWin(true)` and `endTurn`.
4. Call it the same way in `rolloutValue`, for both the turn being finished and the next turn.
5. Check `engine/pod/` for code that runs a deck's steps on its own (blocking, answers on other players' turns). Another player's turn must not empty our pool in the middle of a payment. If it would, stop and say so.
6. Move Codie's flat Mana Drain (`decks/codie/game.ts`, the `mana_drain_flat` branch in upkeep) so its mana is added when `main1` starts. Use a hook, or a field that `enterStep('main1')` reads.
7. Look for other mana that is added outside main phases: `grep "pool\.[A-Z] +="` in `decks/` and `engine/`. Each one must be spent in the same step, or moved.
8. Add a "Rules followed" list to `ENGINE.md`, using the rule numbers in B1 point 7. Look up the current number of the "Taking Shortcuts" rule rather than guessing it.
9. Run `npm run format`, then `npm run verify` (ask eco or full power first). Re-record the baselines once Pontus has seen the numbers.

**Done (2026-11-15), baselines re-recorded after Pontus saw the numbers; `npm run verify` is VERIFY OK.** `GameCore.step`, `enterStep` (empties the pool, notes lost mana) and an `onEnterStep` hook, called in `takeTurn` and both turns of `rolloutValue`. Codie's flat Mana Drain moved into `onEnterStep('main1')`. No other mana is added outside main phases; the pod runs no steps on its own, so another player's turn never empties a pool mid-payment. `ENGINE.md` has "Rules followed" (Taking Shortcuts is 732 in the 2026-06-19 rules). Tests added in Codie's. Win by T8 (any), 3,000 games, before -> after: Gale 57.7 -> 57.6, Meren 18.1 -> 18.1, Sam & Frodo 15.4 -> 14.4, Aesi 43.4 -> 43.2, Mike 32.0 -> 32.0, Codie 21.5 -> 18.7, Edgar 12.2 -> 12.1. Run times unchanged. Change comes from mana left over in the pool (a Sol Ring tapped for {1}) that used to float into the second main phase.

### B3. Kill lines played for real (Opus 5.5)

Build B1 point 6 for the engine and Gale:
- Kill steps become data: `KillSearcher.lastLine` holds `{ kind, card?, variant?, text }`.
- Gale gets `playKillStep`.
- `checkKill` plays the line on a copy. It adopts the copy, or logs the failed step and counts a miss.
- Loops show their first 3 rounds and then a summary line.
- Count `killMisses` and `killChanceFails`, and show both in `--diag`.
- `--test` fails if a deck has any kill miss over 300 seeds.
- Rollouts don't play lines.
- In a pod, the copy is adopted only when the win stands.
- Measure Gale's speed before and after.

**Built (2026-11-15), committed with Gale's miss test failing, on Pontus's word ("commit as it is, then fix Gale").** `engine/game/kill-line.ts` plays a found line on a copy (`playKillStep` per deck, runs of the same step logged 3 rounds then summed up); `checkKill` keeps the copy, `developWin` adopts it when the win stands (`adoptKillLineCopy`, which keeps the kill turns). `killMisses` / `killChanceFails` in every deck's `--diag`; `engine/game/kill-line.test.ts` in every `--test` (300 seeds, prints the first misses; `KILL_MISS_SEEDS_SHOWN=100` shows more). Steps are data: `KillStep` (`text`, `forecast`), Gale's `GaleKillStep` (kill-state.ts), played by `decks/gale/kill-play.ts`. Gale's opponents are hit by the search's own rules (`applyOpponentStep`, `applyKillSpellToOpponents`). While a line plays, `discard` keeps the cards it names. Results, 3,000 games, same seeds: Gale win by T8 57.6% -> 47.4%, with backup 37.3% -> 31.8%; Gale 26.2 s -> 28.7 s (+9.5%, mostly longer games); pod run Gale 13.5% -> 10.5% (its wins now "last standing": the line really kills). **Open: 53 of 300 seeds have a Gale kill miss.** Of 103 failed lines: 52 with High Tide out (the search gives High Tide's bonus to Islands already tapped for earlier steps: it never lowers `islandsForHighTide` when land mana is spent before High Tide; e.g. the kill test "Guildmage + High Tide + Turnabout + kicked Cacophony" is only a kill in another order), 29 with an untapped filter Signet (`pay` only feeds it from floating mana: B5), the rest smaller miscounts (an An Offer You Can't Refuse's Treasures are U+B, not any colour). Next: fix these until Gale has no miss (B3b below, then B5).

### B3b. Gale's kill search without misses (Opus 5.5)

Pontus, 2026-11-15: fix Gale's problems so its played kill lines don't miss. Start from the miss list (`KILL_MISS_SEEDS_SHOWN=100 npm run sim -- gale --test`): the High Tide count in `KillSearchState` (land mana spent before High Tide resolves must not get the bonus), then B5's tapping order (feed a filter Signet), then whatever is left. Done when `gale --test` has no miss; show Pontus the numbers and the speed before and after.

**Part 1 (2026-11-15), committed with 9 of 300 seeds still missing, on Pontus's word.** Misses 53 -> 9 seeds. Search: `payBonusSpell` gives High Tide's / Muck's bonus only to the Islands / Swamps the mana left can still stand for; `untapLands` gives a Swamp black, not any colour. Engine `pay`: a filter source (Dimir Signet, Darkwater Catacombs) is fed by another source when nothing else pays (`filterSignetFeeder`), and never eats the colour it should add; `untapLands` untaps what makes the most first (High Tide and Muck bonuses), then a two-colour land; `avoidsSource` hook. Gale: Islands / Swamps kept back while a High Tide / Muck is still to come, An Offer You Can't Refuse makes real Treasures (`TREASURE`, any colour). Kill lines: a failed line is tried again with the deck's tapping orders (`killLineTappingOrders`, Gale 4) and 12 shuffled ones (`killLineRankShuffle`); a miss's log line shows the pool and the untapped sources, and the steps it got through ("(tried)"). Results, 3,000 games: Gale win by T8 56.1% (B3: 47.4%, before B3: 57.6%), with backup 36.7% (31.8%, 37.3%); Codie 5 of 600 seeds differ (better untaps), within noise; other decks IDENTICAL. Speed: Gale 30.0 s (before B3 26.2 s: +14%, Pontus told). Left: seeds 125, 144, 186, 199, 232, 244, 254, 263, 272 (e.g. 244: the line needs the Catacombs fed by a Swamp so Arcane Signet can pay High Tide), and the speed.

### B4. Codie and Aesi (Sonnet 5.5)

- **Codie:** keep the copy of the game its solver paid on, so the log shows the real plays, and replace the 99-mana loop shortcut with loop rounds plus a summary line.
- **Aesi:** log the first rounds of a loop, then a summary line.
- Both decks: B3's miss test passes.

**Done (2026-11-15), in the same commit as B3.** Codie: the solver's steps keep their move (`CodieKillStep.play`), so the real game does each move again; the finisher is cast for real (`castFinisher`: copies paid, Reiterate / Return the Favor to the graveyard, each resolution hits). A next-turn line (Ad Nauseam + Teferi's Protection) plays this turn's steps and stops at `KILL_STEP_NEXT_TURN`. In the real game the Reiterate loop is paid round by round up to 99 more mana (`playLoopRounds`; Treasures make the colour that gained least), 3 rounds logged then summed up; the solver and the planner keep the 99 at once. While a line plays, a tutor chooses as the solver's copies did (`isPlayingKillLine`). Aesi: each loop has a `round` text; drawing through a loop and Mindsweeper's mill log 3 rounds, then "repeats N more times". Both decks 0 misses over 300 seeds. Codie 3,000 games IDENTICAL by the table, about 18 s before and after; Aesi IDENTICAL (0 of 600 seeds differ), only the log analyzer's text gained the round lines. Baselines re-recorded.

### B5. A better tapping order (Opus 5.5)

Build B1 point 2:
- **Fallback search:** when the first try fails but enough mana exists, `pay` tries other orders and other colour choices, with the same undo between tries.
- **`preferredSources`:** a deck can name the sources to tap first.
- **`lastPayment`:** records what was tapped and what each source made.
- **Speed:** measure every deck.

### B6. "Paid with" and the pool chip (Sonnet 5.5)

- **"Paid with":** cast lines end with the sources that paid, taken from `lastPayment` (e.g. `paid with Island, Swamp, Dimir Signet (fed by Island)`). The event gets a `paidWith` field.
- **The pool chip:** the event gets a `pool` field, but only when the pool isn't empty. The types go in `shared/` and are set the same way `playerCounters` is. The viewer shows it as a chip on the seat, the way energy is shown.
- **Checks:** `ng build`, `ng test`, and look at it in the browser.

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
