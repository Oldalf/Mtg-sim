# Meren: hand playtest plan (2026-11-19)

Goldfish playtests by hand, to compare how you play the deck with how the AI plays it, and to find cards the simulator codes wrongly. Not for statistics: a handful of games cannot measure a win rate. The logs go in a later session.

## The three lists

All three have D'Ghor Bloodletter (for Decode Transmissions) and Massacre Wurm (for Garruk's Packleader). Junji stays in: in a pod it can take the best creature from any graveyard (ours too), or make every opponent discard two and lose 2. No Skullclamp.

| File in `lists/` | What it is | Differs from the one before |
|---|---|---|
| `playtest_1_original.txt` | your `decklist.txt` | the two new cards only |
| `playtest_2_proposed.txt` | `proposed.txt` | Witnesses, Songs of the Damned, Puppeteer Clique, Solemn out; Carrion Feeder, Stitcher's Supplier, Wood Elves, Ophiomancer, Skull Prophet in |
| `playtest_3_proposed_draw.txt` | list 2 | Deadly Dispute for Morbid Opportunist, Greater Good for Unearth |

List 1 to 2 asks whether the five-card swap feels right; list 2 to 3 asks whether the two draw cards do what the simulator thinks. Play 6 to 10 games per list, the same number for each.

## What the simulator says (goldfish, 16,000 games each, noise about ±1.1)

| List | Win by T8 | by T10 | by T12 | Average win turn |
|---|---|---|---|---|
| 1 original | 17.8% | 71.9% | 94.7% | 9.62 |
| 2 proposed | 23.1% | 77.4% | 95.9% | 9.40 |
| 3 proposed + draw | 23.7% | 79.5% | 96.4% | 9.36 |

The fastest games win on turn 6.

## Rules for a hand goldfish (the simulator's)

- Three opponents at 40 life who do nothing: no blockers, no removal, no counters.
- **Win** when two of the three opponents are dead, or 100 damage in total has been dealt to them (Gray Merchant drains, Priest and combat all count). The simulator assumes the third falls soon.
- **Stop** at the end of your turn 12 and count it as no win.
- Count a turn from your first turn as turn 1.
- Write down every mulligan: what you kept and why.

## What to record

Per game, as a few lines under the log:

1. Win turn (or "no win" and the turn you stopped).
2. The turn Meren came down, and what she was cast with (a ritual, Sol Ring, a rock).
3. Mana available on turns 3, 5 and 7 (lands, rocks, rituals).
4. Creature cards in your graveyard at the end of turn 6.
5. Every Dark Ritual: the turn, what you cast with it, and what you would have done with a Swamp instead.
6. Every Greater Good, Deadly Dispute, Massacre Wurm and D'Ghor Bloodletter: the turn, what you did, what it gave you. (Massacre Wurm and the Bloodletter have no opposing creatures in a goldfish, so note what you would have wanted them for.)
7. Any turn where you disagree with how the AI would play it, or a card sat dead in your hand.

## Numbers to compare against (what the simulator's games look like)

- Win by turn 8 in about 1 game in 5; by turn 10 in 3 of 4; by turn 12 in nearly all. Over 8 games per list, expect about 1 win by turn 8, 6 by turn 10, 8 by turn 12. A single game outside that proves nothing; a list that is clearly slower or faster over 8 games is worth a note.
- Average win turn 9.4 to 9.6.
- Creature cards in the graveyard at the end of turn 6: about 1.7 on average. The deck mills about 8 cards by turn 8.
- Dark Ritual is cast in about 17% of games (mostly Meren on turn 2 or a big turn later); the simulator finds it worth 1.4 more mana by turn 5 and 0.09 turns earlier Meren.
- Greater Good is cast in 12 to 14% of games, Deadly Dispute in about 16%.
- The library stays above 10 cards at turn 8 (no decking).

## Known simulator oddities to look for

- A mana hold for removal in the pod (fixed in the last change, pod only; no effect in goldfish).
- About 1 game in 4,000 hits a planner error in the simulator (`planBestOption`); not fixed.
