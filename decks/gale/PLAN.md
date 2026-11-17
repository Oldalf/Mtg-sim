# Gale: deck plan

Dimir spellslinger mill combo (Gale, Waterdeep Prodigy + Scion of Halaster). Wins in one big turn by milling all three opponents. Run it with `npm run sim -- gale` (see the root README). How the deck plays, win lines and tutor targets for the table: `PRIMER.txt`. What the simulator models and its settings: `README.md`. This file keeps the AI's rules, why the list looks as it does, and what is still open (it used to be the root `PLAN.md`).

**Lists:** `decklist.txt` is the physical deck Pontus has at home (since 2026-11-15): `lists/proposed.txt` minus Drain Power, Unearth, Muddle the Mixture and Thunderclap Drake (not owned yet), replaced by Zombify (played as Unearth for now) and Reliquary Tower, Archmage's Charm and Secrets of the Dead from the original (the last two are the Secret Lair Gale print, easy to find). `lists/original.txt` is the list as first given. Keep `decklist.txt` equal to what is on the table. **`lists/proposed.txt` is the adopted list** (Pontus, 2026-11-04). The other test lists from the rounds below were removed on 2026-11-14 (they are in git history); `logs/` holds Pontus's real games.

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

**The adopted list** (`lists/proposed.txt`), 4,000 games: kill by turn 6 / 7 / 8 **19.9 / 51.4 / 75.3%**, with counter backup by turn 8 **57.4%**, average kill turn 7.0. The original `lists/original.txt` was 10.2 / 31.9 / 55.7% (3,000 games, counter backup by turn 8: 36.0%).

**Changes vs `lists/original.txt`:** + Prologue to Phyresis, Expansion Algorithm, Turnabout, Muddle the Mixture, Spell Pierce, Pieces of the Puzzle, Energy Tap, Drain Power, 3 Island; − Jidoor, Cut Your Losses, Traumatize, Secrets of the Dead, Academy Wall, Emet-Selch, Archmage Emeritus, Archmage's Charm, Case of the Ransacked Lab, Baleful Strix, Reliquary Tower. 37 lands + Waterlogged Teachings. The step before the rituals is in git history (before 2026-11-14).

**The home list** (`decklist.txt`, 2026-11-15), 4,000 games, same seeds, after the engine changes of step 8: kill by turn 6 / 7 / 8 **13.0 / 38.9 / 65.0%**, with counter backup by turn 8 **49.8%**, average kill turn 7.16. On the same run `lists/original.txt` was 9.5 / 31.5 / 55.7% (backup by turn 8 36.4%, average 7.23) and `lists/proposed.txt` 16.5 / 45.8 / 70.9% (53.2%, 7.07). It'll Quench Ya! (one more generic mana, any spell) is in the Spell Pierce slot, counted as a plain counterspell and not re-tested (goldfish games don't show counters). Zombify is modelled as a dearer Unearth (`unearthMaxManaValue` in `roles.ts`: any creature, but 4 mana); Pontus plays it where Unearth would go. The regress baseline for `decklist.txt` was re-recorded; the six logs are checked against the list they were played with (`logLists` in `index.ts`).

**What the tests showed** (3,000 games per list, noise about ±2.6 points; goldfish only):
- **The 4 engines are dead weight.** Cutting Secrets of the Dead, Academy Wall, Emet-Selch and Archmage Emeritus together for Islands: +6 points by turn 7 / 8. None of them beats an Island alone (Wizards of Thay too, but its flash value isn't modelled).
- **Poison** (Prologue + Algorithm) is about 18% of all kills: +2.8 / +4.3 by turn 7 / 8.
- **Untap and ritual effects are the best additions:** Turnabout (0.27 €) was the best of its round (+3.7 by turn 7); Energy Tap for Baleful Strix +4.0, Drain Power about the same. One ritual captures the gain: both together didn't help. Baleful Strix did less than an Island.
- **Keep the land count:** cutting lands hurts (37 lands about −1 / −2.3 by turn 7 / 8 vs 38 with Rewind; 36 lands about −2.3 by turn 8). Pontus has played the deck a lot at 35 + 1 and expects 37 to play better than the goldfish numbers show.
- **The Case of the Ransacked Lab slot** doesn't affect goldfish speed (all replacements within ±1). Pieces of the Puzzle was chosen: a sorcery Gale can recast, and it puts instants and sorceries in the graveyard.
- **Protection** can't be measured: it is dead in a goldfish game, expect about 1–2 points by turn 8 per slot. Peregrine Drake / Cloud of Faeries as flying blockers cost about 0.5–1 point against Rewind.

**Rain of Filth (task R1, 2026-11-17)**, in place of one card of `lists/proposed.txt`, 4,000 games per list, same seeds, noise about ±2.2 points. Rain taps every land, then sacrifices them all for {B} each, so after it only floating mana is left for a counterspell: judge it by the backup columns, since a kill that a counter cannot protect is a coin flip against any one answer.

| Replaces (why) | By T6 | By T7 | By T8 | Backup T7 | Backup T8 | Avg turn |
|---|---|---|---|---|---|---|
| nothing (`proposed.txt`) | 18.5 | 48.8 | 74.1 | 29.2 | 54.3 | 7.04 |
| Mocking Sprite (asked) | +2.4 | +2.0 | +1.0 | +0.1 | +0.6 | 6.99 |
| Wizards of Thay (worst `--rank`, flash not modelled) | +3.0 | +2.7 | +0.8 | +1.0 | +1.5 | 6.97 |
| Personal Tutor (second worst tutor in `--rank`) | +2.2 | +1.9 | +0.4 | +1.2 | +1.4 | 6.98 |
| Focus the Mind (bad in `--rank`) | +1.8 | +2.0 | -0.2 | +0.2 | -1.2 | 6.98 |
| Thespian's Stage (bad in `--rank`) | +2.1 | +2.7 | +0.9 | +0.3 | +0.8 | 6.98 |
| an Island (Rain wants lands, so the land count is the test) | +1.9 | +2.2 | +0.2 | -0.9 | -0.4 | 6.98 |

Nothing is clearly real: only Wizards of Thay and Thespian's Stage reach +2.7 by turn 7, just above the noise, and every list gains less by turn 8 and almost nothing in the backup columns, which is the measure that matters for Rain. So Rain is a small speed-up on turns 6 and 7, not a protected win. If Pontus adds it, Wizards of Thay is the best card to give up (its value here is the flash, which is not modelled). Rain without a counterspell in hand is the part to avoid at the table.

**What a slow game misses** (`--diag`, task R2, `lists/proposed.txt`, 4,000 games, 2026-11-17):

| Measure | Value |
|---|---|
| Gale out by the end of turn 3 / 4 | 71.6 / 92.3% (average turn 3.24) |
| A whole combo package at hand by the end of turn 5 | 50.1% (average turn 4.88) |
| Untapped lands and rocks at the end of turn 3 / 4 / 5 / 6 | 0.21 / 0.51 / 0.98 / 1.75 |
| No kill by turn 6: no Gale | 0.7% |
| No kill by turn 6: Gale, but a package piece missing | 35.5% |
| No kill by turn 6: Gale and a package, but no line | 45.3% |

Gale is rarely the problem. About two turns pass between having the pieces and killing, so mana on the kill turn (or Gale's recast fuel) matters more than R1's Rain of Filth result suggested, and finding the last piece is the other third. The AI taps out every turn, so in goldfish it never pays the price of holding a counterspell up: see R3 in the root `PLAN.md`.

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
- Housekeeping (2026-11-14): `lists/` holds only `proposed.txt`; the test lists and the cut tests were removed (in git history before that date).
