# Gale: deck plan

Dimir spellslinger mill combo (Gale, Waterdeep Prodigy + Scion of Halaster). Wins in one big turn by milling all three opponents. Run it with `npm run sim -- gale` (see the root README). How the deck plays, win lines and tutor targets for the table: `PRIMER.txt`. What the simulator models and its settings: `README.md`. This file keeps the AI's rules, why the list looks as it does, and what is still open (it used to be the root `PLAN.md`).

**Lists:** `decklist.txt` is the list as first given. **`lists/proposed.txt` is the adopted list** (Pontus, 2026-11-04). The other files in `lists/` are test lists from the rounds below (`cuts/` and `old/` too); `logs/` holds Pontus's real games.

## Simulation rules

- 3 goldfish opponents at 40 life, 92-card libraries, 30% creatures (for Konrad chains), no interaction. Opponents' cards in logs are ignored. The simulator never plays on opponents' turns, so instant-speed value (Wizards of Thay's flash) isn't counted.
- **Win:** all three opponents dead by life, decking or poison. Two measures: any kill, and a kill with counter backup (a counterspell in hand and the mana to cast it afterwards).
- **Mulligans:** the first is free (a new 7), then London. The rule is in `mulligan.ts`: keep 3–4 lands, or 2 / 5 lands when the hand has a rock, reducer, cantrip or tutor; after the free mulligan 2–5 lands (1 land with one of those); always keep at 5 cards. It changes about 5% of games and no result beyond noise (the old 2–5 rule was already close), so it is mainly there to match how Pontus mulligans.
- Counterspells rank low in every ranking (opponents do nothing): judge them separately.

## How the AI plays

- **Turn planner:** at each decision it tries its best 4 plays on copies of the game (library reshuffled, so no peeking), plays out this turn and the next, and keeps the play that kills soonest or leaves the best position. Two rollouts, not one (one was consistently worse).
- **Kill finder:** a search of this turn's lines. It only runs when the cheap pre-check (`killReachable` → `finisherReachable`) sees a possible finisher, so a finisher missing there is silently never found; the tests go through the pre-check too.
  - Lines: Guildmage + Mindcrank; Guildmage + a big mill; kicked Cacophony + Monument exhaust; Mindskinner + Konrad; **Konrad (+ Mindcrank) + a big mill**; Unearth on Guildmage / Mindskinner; Emet-Selch recasts; poison (Prologue + Expansion Algorithm); Windfall.
  - **Konrad chains** count opponents' milled creatures on average, but a real chain can fizzle. So a line that relies on it counts only if it wins at least 90% of the time against random deals (`CHAIN_MIN`, `chainProb`). Konrad + Mindcrank + unkicked Cacophony wins only about 70%; kicked, 100%.
  - **Mana:** High Tide and Bubbling Muck stack (each copy adds +1 per Island / Swamp, including a recast via Gale), and the Island or Swamp that pays for them doesn't get the bonus. Energybending makes every land an Island and a Swamp. Untaps (Frantic Search, Snap, Unwind, Turnabout, Rewind) re-tap lands with all bonuses. Only Fetid Pools and Sunken Hollow are Island/Swamp-typed.
  - **Countering your own spell to trigger Gale:** An Offer You Can't Refuse (+2 Treasures), Unwind (untap 3 lands), Counterspell, Arcane Denial, Mana Sculpt, Dispel. Outside the kill, `self_counter_dev` does it with a cheap spell when another counter stays in hand (no measurable effect, left on).
- **Gifts Ungiven:** builds the pile whose worst split (the opponent chooses) is best; ideally every split wins this turn or the next. With Gale out it also considers finding only 2 instants/sorceries so both go to the graveyard. **Keep this rule** (agreed).
- **Tutors:** pick the card that makes a kill possible this turn or next; otherwise the missing piece closest to completion, or a counterspell if a combo is assembled. Tutoring for ramp on turns 1–4 changes nothing (`ramp_tutor`).
- **Log analyzer:** tracks a floating-mana pool from the taps (each tap adds what the permanent makes with the High Tide / Muck bonuses at that moment, spells pay after reducers, a cost the pool can't cover yet is owed and paid by the next taps; the pool empties at a new turn and at combat). Not in the log, so not subtracted: activated abilities, kicker / X, Offer's Treasures, so the estimate can be one too high.

## Current state

**The adopted list** (`lists/proposed.txt`), 4,000 games: kill by turn 6 / 7 / 8 **19.9 / 51.4 / 75.3%**, with counter backup by turn 8 **57.4%**, average kill turn 7.0. The original `decklist.txt` was 10.2 / 31.9 / 55.7% (3,000 games, counter backup by turn 8: 36.0%).

**Changes vs `decklist.txt`:** + Prologue to Phyresis, Expansion Algorithm, Turnabout, Muddle the Mixture, Spell Pierce, Pieces of the Puzzle, Energy Tap, Drain Power, 3 Island; − Jidoor, Cut Your Losses, Traumatize, Secrets of the Dead, Academy Wall, Emet-Selch, Archmage Emeritus, Archmage's Charm, Case of the Ransacked Lab, Baleful Strix, Reliquary Tower. 37 lands + Waterlogged Teachings. The step before the rituals is in `lists/old/proposed_before_rituals.txt`.

**What the tests showed** (3,000 games per list, noise about ±2.6 points; goldfish only):
- **The 4 engines are dead weight.** Cutting Secrets of the Dead, Academy Wall, Emet-Selch and Archmage Emeritus together for Islands: +6 points by turn 7 / 8. None of them beats an Island alone (Wizards of Thay too, but its flash value isn't modelled).
- **Poison** (Prologue + Algorithm) is about 18% of all kills: +2.8 / +4.3 by turn 7 / 8.
- **Untap and ritual effects are the best additions:** Turnabout (0.27 €) was the best of its round (+3.7 by turn 7); Energy Tap for Baleful Strix +4.0, Drain Power about the same. One ritual captures the gain: both together didn't help. Baleful Strix did less than an Island.
- **Keep the land count:** cutting lands hurts (37 lands about −1 / −2.3 by turn 7 / 8 vs 38 with Rewind; 36 lands about −2.3 by turn 8). Pontus has played the deck a lot at 35 + 1 and expects 37 to play better than the goldfish numbers show.
- **The Case of the Ransacked Lab slot** doesn't affect goldfish speed (all replacements within ±1). Pieces of the Puzzle was chosen: a sorcery Gale can recast, and it puts instants and sorceries in the graveyard.
- **Protection** can't be measured: it is dead in a goldfish game, expect about 1–2 points by turn 8 per slot. Peregrine Drake / Cloud of Faeries as flying blockers cost about 0.5–1 point against Rewind.

## Pontus's real games (`logs/`)

| Game | Result | What the analysis found |
|---|---|---|
| 1 | T7 Mindskinner + Konrad | No missed kill. Led to AI fixes: Aqueduct T2 → Gale T3, rock before Scion, Windfall when the hand is mostly instants. |
| 2 | T6 Guildmage + kicked Cacophony | Led to the self-counter tricks (Offer / Unwind) and Gifts piles. The kill was set up at the end of turn 5. |
| 3 | T6 Mindskinner | No missed kill; the earliest possible (Mindskinner can't attack the turn it is cast). |
| 4 | T7 kicked Cacophony → Konrad → Mindcrank loop | Found a simulator bug (the pre-check didn't know Konrad + mill); fixed. Turn 6 is "no kill" (the unkicked chain wins about 68%), turn 7 a kill, as played. |
| 5 | T6 Guildmage + Cacophony with 2 High Tides + Muck | Led to stacking High Tide / Muck and the floating-mana tracker. The analyzer finds the kill right after Wishclaw fetches Cacophony. |
| 6 | T9 Guildmage + Singularity Rupture (a stuck game, adopted list) | No kill missed. Land drops missed on turns 5–6 (a Swamp sat in hand); from turn 7 the graveyard had no sorcery for Gale. The AI with the same draws kills by turn 7 in 46%, mostly from sequencing. |

More logs help most when they show a line the simulator hasn't seen, or a stalled game (turn 9+). A sixth game with the same line adds little. Run `npm run sim -- gale --analyze logs/<file>.txt -d lists/proposed.txt` on each.

## Open

- Pontus's goldfish feedback on the adopted list; whether to add a protection card, and for what.
- Ideas, none started: play at instant speed on opponents' turns (Wizards of Thay, end-of-turn draw and tutors);  Thunderclap Drake's copy ability; Mana Sculpt's mana; kill-finder mana leftovers (outside mana isn't used up by other spells, a dual paying for High Tide still counts for Muck, the AI doesn't save a rock to pay for High Tide).
- Speed: the planner is about 40% of the run time. Running it only when the top plays are close in score would be the next saving. 4,000 games take about 1 minute.
- Housekeeping: `lists/` holds about 35 test lists from the rounds above; the cut-test files are in `cuts/`. `README.md` still says `decklist.txt` is the current list.
