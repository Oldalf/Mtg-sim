# Plan: step 10, after G14

Written 2026-11-16. Tasks G1 to G11 and G14 are done; their steps and notes (among them G2's pod report and G14's blink in answer to removal and wipes) are in git: `PLAN.md` at commit `ff164f7`. Step 8's plan is at commit `c88cda4`.

The friends' decks (Helga, Ardyn, Teval, Thantis, DnD, Azula) are **pod-only**: no goldfish tuning, no mulligan study, no swap tests, no primer of ours, unless the owner asks (Pontus, 2026-11-15). The table plays bracket 2-3. Each deck's own `PLAN.md` says how it wins and what it does not model.

## How to read this plan

Each task names a model. Give it to that model or a stronger one.

| Model | Tier | What it gets |
|---|---|---|
| Claude Haiku 5.5 | S (small) | Mechanical work with exact steps. No design choices. A command says if it worked. |
| Claude Sonnet 5.5 | M (medium) | A feature or fix with a clear goal, in patterns the code already has. Small choices only. |
| Claude Opus 5.5, or Fable 5.2 | L (large) | Design, work across many files where judgement is needed, or writing that other models will follow. |
| **P** | Pontus | A decision or input. Tasks marked "after P" wait for it. |

Rules for every task:

- Read `CLAUDE.md` first (rule 0 names, KISS). For the engine also `ENGINE.md`, for the page also `app/web/CLAUDE.md`, for a new deck `/add-deck`.
- One task is one commit, straight on `main`. `npm run format`, then `npm run verify` must end with VERIFY OK.
- Ask Pontus eco or full power before any task that runs simulations (`verify` with regress checks counts).
- Before changing pod code, save a fixed-seed pod run (`npm run pod -- gale meren samfrodo aesi edgar -n 200 --no-log`) and compare it afterwards; `--regress check` does not cover pod mode. `verify` also compares that run with `regress_baseline/pod.txt`; re-record it (`node scripts/verify.mjs --eco --record-pod`) only for a change Pontus accepted.
- An engine change must leave every existing deck IDENTICAL (goldfish and the pod run). A task that would change them stops and asks.
- A task that finds its steps do not fit the code stops and says so. It does not improvise a bigger change.
- When a task is done, add one line under it here: what was built and anything the next task must know. When the whole plan is done, it is cleared and a new one written.

## Order

| # | Task | What | Model |
|---|---|---|---|
| 1 | R1 | Gale: Rain of Filth against `lists/proposed.txt` (done) | Sonnet 5.5 |
| 2 | R2 | Gale: a `--diag` that shows what a slow game is missing (done) | Sonnet 5.5 |
| 3 | R3 | Instant speed on the opponents' turns, and flash enablers (done) | Opus 5.5 |
| 4 | R4 | Gale: model Merchant Scroll, Mnemonic Wall, Aetherize | Sonnet 5.5 |
| 5 | R5 | Gale: swap tests, budget about 15 € | Sonnet 5.5 |
| 6 | R6 | Gale in a lower-bracket pod | Sonnet 5.5 |

Done on 2026-11-16 without a task: **Edgar's commander cast.** Edgar stays in the command zone (eminence works there) and is cast only with mana nothing else wants (`COMMANDER_CAST_SCORE` in `decks/edgar/candidates.ts`; it was the first play). Goldfish, 2,000 games: win by turn 10 65.0% against 66.2% before; never casting him is 43.9%, because his attack puts counters on every Vampire, so he is still cast late (in 76% of games). Pod with Meren, Gale and Helga (1,000 games): Edgar 26.2% against 24.9%. The regress and pod baselines were re-recorded.

Azula's next task (B7) is not in this plan: it waits in `decks/azula/PLAN.md` ("Next task B7") until Pontus wants it, since Azula may not be played in the pod at all.

---

## R1. Gale: Rain of Filth against the proposed list (Sonnet 5.5)

Pontus's home deck is `decklist.txt`, but it is still missing four cards of `lists/proposed.txt` (Drain Power, Unearth, Muddle the Mixture, Thunderclap Drake), which he plans to add. So the comparison is **against `lists/proposed.txt`, not `decklist.txt`.** Rain of Filth (taps every land, then sacrifices them all for {B} each; kill turn only) was modelled in b5fc943 and is in no list yet. Pontus (2026-11-16) leaves the choice of what it replaces to us: try a few.

1. Baseline: `lists/proposed.txt`, 4,000 games (the numbers in `decks/gale/PLAN.md`: kill by turn 6 / 7 / 8 19.9 / 51.4 / 75.3% in 2026-11-14, before the step 8 engine changes; run it again, 16.5 / 45.8 / 70.9% on 2026-11-15). Same seeds for every list.
2. Test lists, each `proposed.txt` with Rain of Filth in place of one card: **Mocking Sprite**; then 3 to 5 cards that look weak in the list. Pick them from `npm run sim -- gale --rank` on `proposed.txt` and from the cards `decks/gale/PLAN.md` calls dead weight or untested (a single engine card, a protection card, a creature that only blocks, an Island: Rain wants lands, so check that one too). Say why each was chosen.
3. Report a table: kill by turn 6 / 7 / 8, counter backup by turn 8, average kill turn, difference to the baseline. Noise is about ±2.6 points at 3,000 games; call a difference real only above that.
4. Put the lists in `decks/gale/lists/` while testing and remove them when done (the table goes in `decks/gale/PLAN.md`). Leave `decklist.txt` and `proposed.txt` as they are: Pontus decides what to swap. Add one line under this task here.
5. Gale's regress baseline must stay IDENTICAL (no code changes in this task).

Done 2026-11-17 (Sonnet 5.5, full power): six lists, 4,000 games each, none clearly better than `proposed.txt` (best: Wizards of Thay out, +3.0 / +2.7 / +0.8 by turn 6 / 7 / 8, backup by turn 8 +1.5, all within about 2 points of noise). Table in `decks/gale/PLAN.md`. Pontus: Rain must come with at least one protection spell; the backup columns measure that and show no real gain. The test lists are removed; no code changed.

---

## Gale: faster and safer, within about 15 € (R2 to R6)

Pontus (2026-11-17): Gale should take about 20% of the games in a 4-player pod with a deck like Codie (which wins around turn 5 with protection at the table). In lower-bracket pods Gale is too slow to win before the creature decks beat it down, yet too busy combo-ing to keep protection up. Budget for new cards: about 15 € in total. Codie stays out of the pod for now (its model is too far off).

**Where the speed is not:** more kill-turn mana. Cabal Ritual was tested twice (before 2026-11-14) and one ritual captured the whole gain; Rain of Filth (R1) confirms it. The time goes before the kill turn: getting Gale out with mana to spare and finding the missing piece.

**Where it may be: instant speed.** The goldfish never plays on the opponents' turns, so the mana Gale holds up for a counterspell is simply lost in the simulator. At the table that mana goes into instants at the end of the turn before Gale's, and with a flash enabler into sorceries too (Windfall, Night's Whisper, the tutors). That is exactly Pontus's problem: Gale could keep protection up and still develop. Wizards of Thay ranks last in `--rank` because its flash is not modelled; people run Emergence Zone in Gale for the same reason. R3 models this.

**Candidates.** Prices are the Scryfall bulk data of 2026-11-13 (one printing, euro): check Cardmarket before buying. Mox Amber (65 €), Lotus Petal (no price; expensive), Mystical Tutor (13 €), Vedalken Orrery (8 €) and Basalt Monolith (Pontus: it doesn't feel right) are out.

| Card | € | Kind | Notes |
|---|---|---|---|
| Wizards of Thay | in the list | flash | Sorceries as though they had flash, and instants and sorceries cost {1} less. |
| Emergence Zone | 2.43 | flash | A land: replaces an Island, so it costs no spell slot. Sacrifice for one turn of flash. |
| Borne Upon a Wind | 2.42 | flash | {1}{U} instant: flash this turn, draw a card. Gale can recast it. |
| Quicken | 0.25 | flash | {U}: the next sorcery has flash, draw a card. |
| Leyline of Anticipation | 5.08 | flash | Flash for everything; free on turn 0 from the opening hand. |
| Merchant Scroll | 4.23 | tutor | Finds a blue instant: High Tide or a counterspell, speed or protection, whichever the hand lacks. |
| Sapphire Medallion | 6.03 | speed | Every blue spell costs {1} less from turn 2. Already a known reducer in the engine, so it can be tested now. |
| Mnemonic Wall | 0.24 | speed + defence | Returns an instant or sorcery (Cacophony, High Tide) and blocks as a 0/4. |
| Rain of Filth | in R1 | kill-turn mana | Pontus keeps it in the tests: R1 found it within noise, but with flash it may matter. Only cast with protection. |
| Aetherize | 0.53 | defence | Pontus played it before. One instant bounces a whole attack; Gale can recast it. |

Tested before, not repeated: Rewind, Peregrine Drake, Cloud of Faeries (`decks/gale/PLAN.md`).

## R2. Gale: a `--diag` for slow games (Sonnet 5.5)

Aesi and Meren have `--diag`; Gale has none. Add one that prints per list: the turn Gale is cast (average, % by turn 3 / 4), the turn the first combo package is in hand, the mana left unused at the end of each of our turns (what instant speed could use), and for games with no kill by turn 6 what was missing on turn 6: Gale, a package piece, mana, or protection (a kill without backup). Run it on `lists/proposed.txt` and add the output to `decks/gale/PLAN.md`. No change to results (`--regress check` IDENTICAL).

Done 2026-11-17 (Opus 5.5): `npm run sim -- gale --diag` (measures in `GaleGame.recordEndOfTurnMeasures`, metrics in `decks/gale/index.ts`; `fewestMissingPackagePieces` was pulled out of `positionValue`). Regress IDENTICAL. Output for `proposed.txt` in `decks/gale/PLAN.md`: Gale is out early (92% by turn 4), so the gap is between the package (average turn 4.9) and the kill (7.0). At turn 6 without a kill: 36% of games miss a package piece (tutors), 45% have Gale and a package but no line (mana, or graveyard spells for Gale).

## R3. Instant speed on the opponents' turns, and flash enablers (Opus 5.5)

The biggest change: an engine design task. Read `ENGINE.md` first.

1. A window at the end of the turn before ours (one window per round is enough: the three goldfish opponents do nothing). There a deck may cast instants with its untapped lands, and sorceries if something gives them flash. A deck hook, off by default, so every other deck stays IDENTICAL (goldfish and the pod run).
2. Gale uses it: cantrips and draw first, keeping the mana for a counterspell when a kill is set up for its next turn; the turn planner and the kill finder must see the window (a kill there is a kill on that round; say in `decks/gale/PLAN.md` how it is counted). **R2 found that the goldfish AI taps out every turn** (0.2 to 1.75 untapped lands and rocks at the end of turns 3 to 6), so a window alone gains almost nothing in goldfish: the mana it would use is already spent at sorcery speed. Flash is worth something only when Gale also holds a counterspell up, as at the table. So add a Gale rule (a setting, so the two can be compared): from Gale's turn on, keep the mana for the cheapest counterspell in hand untapped at the end of the turn, and spend it in the window if nothing needed answering. Report goldfish with that rule, with and without the flash enablers: that is the honest cost of holding protection, and what flash wins back.
3. Flash enablers as card facts in `engine/`: Wizards of Thay, Leyline of Anticipation (also the turn-0 start), Emergence Zone, Borne Upon a Wind, Quicken. Azula has a combat-only version in `decks/azula/game.ts` (`canCastNow`); reuse what fits.
4. The pod: Gale may use the same window there. Save a fixed-seed pod run first; the other decks must not change.
5. Tests in `decks/gale/tests/`. Gale's results will change (that is the point): record the new regress baseline only after Pontus has seen the before / after numbers for `proposed.txt`.

If the window does not fit the turn loop without a big rewrite, stop and write down why and what it would take.

Done 2026-11-17 (Opus 5.5): `engine/game/instant-speed.ts` (the window, flash for sorceries, Quicken, Borne Upon a Wind, Emergence Zone, the opening-hand Leyline), the pod calls it for the next player, Gale's `hold_counter` (its `podReserve` in goldfish games) and `buildOpponentsEndStepCandidates`; 11 tests in `decks/gale/tests/instant-speed.test.ts`. Both settings are **off by default**, so every deck and the pod run are IDENTICAL (Gale's baseline was re-recorded for the new test lines only). Results in `decks/gale/PLAN.md`: holding a counter costs about 9 to 11 points by turn 7; the window wins back about 2 of them (0.4 spells per game); Emergence Zone, Borne Upon a Wind, Quicken and Leyline add nothing measurable. **P:** which settings Gale plays by default.

## R4. Gale: model Merchant Scroll, Mnemonic Wall, Aetherize (Sonnet 5.5)

Merchant Scroll (choice in `tutoring.ts`: High Tide or a missing piece when a kill is near, a counterspell when the combo is assembled), Mnemonic Wall (enter trigger: the best instant or sorcery in the graveyard, like Gale's recast choice; a creature for the kill search's Unearth?), and check that Gale casts Aetherize in the pod when an attack would hurt (it is in the engine). Card facts in `engine/`, Gale's choices in `decks/gale/`. Every other deck stays IDENTICAL.

## R5. Gale: swap tests (Sonnet 5.5, after R3 and R4)

Each candidate alone against `lists/proposed.txt`, played both with the default settings and with `--set hold_counter=1 --set opponents_end_step=1` (holding protection as at the table, R3), 4,000 games, same seeds; then the best two or three together within 15 €. Slots to try: Mocking Sprite, Personal Tutor, Focus the Mind, Thespian's Stage, an Island (for Emergence Zone). Report by turn 5 / 6 / 7 / 8, **backup by turn 6 / 7 / 8** (Pontus goes off only with protection), average turn. Aetherize and Mnemonic Wall's blocking are worth nothing in goldfish: only check what they cost. Lists in `decks/gale/lists/` while testing, the table in `decks/gale/PLAN.md`, `proposed.txt` and `decklist.txt` untouched.

## R6. Gale in a lower-bracket pod (Sonnet 5.5)

Gale's pod win rate with the friends' decks (for example `npm run pod -- gale helga ardyn teval -n 1000`): `proposed.txt` against the best R5 list, with and without Aetherize. Report the win rate and the turn Gale dies when it loses. Pontus decides the swaps.
