# Meren: the card draw round, results and lists (2026-11-19)

Everything tested on 2026-11-18 and 2026-11-19 in one place, for playtesting by hand. The details and the reasoning are in `PLAN.md` (sections "T6"), the pod ranking of every card is in `POD_RANKING.md`.

**How to read the numbers.** The simulator plays goldfish (three opponents who do nothing) and the pod (Meren against Helga, Edgar and Teval; 25% would be an even share). All runs use the same seeds for every list. Noise: about ±1.1 points at 16,000 games, ±2.2 at 4,000 games (pod: ±2 at 4,000). A difference below the noise means nothing measurable. The simulator cannot see what a table does that it doesn't: removal and blockers in goldfish, how a player would keep creatures back, and hand-by-hand judgement. This is why the results below are a guide for what to try, not a verdict.

## The lists

The two lists the swaps were made on:

- `decklist.txt`: your original list.
- `lists/proposed.txt`: the original with 5 swaps (Eternal Witness, Timeless Witness, Songs of the Damned, Puppeteer Clique, Solemn Simulacrum out; Carrion Feeder, Stitcher's Supplier, Wood Elves, Ophiomancer, Skull Prophet in).

The draw swaps, each as a ready list to import (the line is replaced in place, so the shuffle stays comparable):

| List file | Based on | Out | In |
|---|---|---|---|
| `lists/proposed_dispute_greater_good.txt` | proposed | Morbid Opportunist, Unearth | Deadly Dispute, Greater Good |
| `lists/proposed_skullclamp_dispute_greater_good.txt` | proposed | Garruk's Packleader, Morbid Opportunist, Unearth | Skullclamp, Deadly Dispute, Greater Good |
| `lists/proposed_dispute_greater_good_rise.txt` | proposed_dispute_greater_good | Rune-Scarred Demon | Rise of the Dark Realms |
| `lists/original_dispute_greater_good.txt` | decklist | Morbid Opportunist, Unearth | Deadly Dispute, Greater Good |
| `lists/original_skullclamp_dispute_greater_good.txt` | decklist | Garruk's Packleader, Morbid Opportunist, Unearth | Skullclamp, Deadly Dispute, Greater Good |

Unearth goes to Gale (it is weaker here than Persist). Prices (Scryfall bulk data of 2026-11-13, check Cardmarket before buying): Skullclamp €5.51 (over €10 in your shop), Greater Good €2.26, Plumb the Forbidden €0.61, Deadly Dispute €0.54, Night's Whisper €0.48, Midnight Reaper €0.28, Corpse Augur €0.14, Rise of the Dark Realms not looked up.

## 1. Which card draw? (goldfish, `proposed.txt`, 16,000 games)

Each card in Garruk's Packleader's slot, difference to `proposed.txt` (23.2 wins by turn 8, 79.1 by turn 10, average win turn 9.38):

| Card | Win by T8 | by T10 | Avg turn | Cards it drew when played (4,000 games) | Played in % of games |
|---|---|---|---|---|---|
| Skullclamp | +1.0 | +1.4 | 9.33 | 4.7 | 19.5 |
| Deadly Dispute | +1.1 | +1.3 | 9.34 | 2.0 | 16.5 |
| Plumb the Forbidden | +1.0 | +1.1 | 9.34 | 3.0 | 15.1 |
| Night's Whisper | +0.8 | +0.9 | 9.35 | 2.0 | 16.9 |
| Greater Good | +0.5 | +0.9 | 9.36 | 29 (10.5 net of its 3 discards) | 12 to 14 |
| Corpse Augur | within noise | | | 3.8 | 12.9 |
| Midnight Reaper | within noise | | | 3.0 | 21.4 |

Tested and not worth a slot (all within noise at 4,000 games): Costly Plunder, Tireless Tracker, Moldervine Reclamation, Elvish Visionary, Grim Backwoods. Ayara, First of Locthwain gained +2.4 by turn 8, but through her drain, not draw (and she is the commander of your other deck), so she was left out.

Plumb the Forbidden: draws about as much as Deadly Dispute but costs 1 life per card and a creature per extra card, and gained the same. Deadly Dispute does the job more simply.

Greater Good (sacrifice a creature of power 3 or more: draw its power, discard three; the discards prefer surplus lands, then creature cards, most of all one Meren returns at once; the AI also uses it at Meren's end step): it draws a lot, but the 3 discards cancel most of it (net about +10 cards over a game where it is played) and the graveyard doesn't fill much more (1.8 creature cards at the end of turn 6, 1.7 without it), because the deck already mills about 8 cards by turn 8.

## 2. The swaps in the lists (goldfish 16,000 games; pod: Helga, Edgar, Teval, 16,000 games)

| List | Win by T8 | by T10 | by T12 | Avg turn | Pod win | Pod out first |
|---|---|---|---|---|---|---|
| decklist.txt | 18.1 | 73.1 | 95.4 | 9.60 | 24.7 | 30.0 |
| original + Dispute, Greater Good | 18.7 | 75.1 | 96.0 | 9.55 | 24.3 | 30.8 |
| original + Skullclamp, Dispute, Greater Good | 19.4 | 75.5 | 96.0 | 9.53 | 25.9 (4,000 games) | 31.1 |
| lists/proposed.txt | 23.1 | 78.9 | 96.6 | 9.38 | 29.7 | 27.9 |
| proposed + Dispute, Greater Good | 24.0 | 80.7 | 96.9 | 9.34 | 29.9 | 28.4 |
| proposed + Skullclamp, Dispute, Greater Good | 24.6 | 81.6 | 97.1 | 9.31 | 31.0 (earlier run) | 28.0 |
| proposed + Dispute, Greater Good + Rise for Rune-Scarred Demon | 23.3 | 79.0 | 96.4 | 9.37 | 29.5 | 28.8 |

(The pod numbers of the first runs, made before Sepulchral Primordial took real cards from graveyards, are about 1 point higher; see the note in `PLAN.md`.)

What it says:

- **The proposed list beats your original in goldfish by about +5 by turn 8 and +6 by turn 10, and in the pod by about +5 points of win rate** (above the noise). The five original cards that were cut do not look better in the pod ranking either: Eternal Witness −6.9, Timeless Witness −5.1, Solemn Simulacrum −3.1 (games where Meren had seen them by turn 4 were worse than the games where she had not; correlation, not proof).
- **The draw swaps add a little in goldfish**: Deadly Dispute and Greater Good about +0.8 by turn 8 and +1.7 by turn 10; with Skullclamp +1.4 and +2.5. In the pod nothing is beyond noise.
- **Rise of the Dark Realms does not help**: it takes back the gain of the swaps (+1.8 to +0.1 by turn 10) and is cast in only 7.5% of games (nine mana).
- Songs of the Damned back in for Wood Elves: slightly worse (−0.3 by turn 8, −1.1 by turn 10, pod −0.3). It only gets cast with 4 creature cards in the graveyard, and there are 1.7 on average at turn 6. Wood Elves is better than its pod rank says (+3.3 points by turn 10 in the goldfish ranking).

## 3. Rituals and fast mana

- Dark Ritual is cast in 17% of games, mostly well (turn 2 Meren in 61 of 1,500 games, big turns later). Against a Swamp in its place: Meren 0.09 turns earlier, 1.4 more mana by turn 5, but the same win rate (23.1 against 23.0 by turn 8). A ritual is also cast now when it lets Meren make one more play (two creatures instead of one), which changes nothing measurable.
- Sol Ring is the card that matters: cutting it costs −2.5 by turn 8; in the ranking it is +9.7 points by turn 10.

## 4. Pod ranking (`POD_RANKING.md`)

Every card's pod win rate when seen by the end of turn 4 against not seen, for the original list with the three swaps, the proposed list with the three swaps, and both together (16,000 games each). Selected values for the three swaps: Deadly Dispute −0.1 (original) and +1.0 (proposed); Greater Good −0.9 and −2.3; Skullclamp −3.6 and −0.5 (each ±1.4). Clear signals: Spore Frog +13, Sol Ring +12, Sakura-Tribe Elder +8, Twilight Diviner, Grist and Protean Hulk +6 to +7. Held removal (Beast Within, Infernal Grasp, Heartless Act) and the Witnesses are at the bottom. It is correlation, not proof: a ramp card seen early is also a fast game, and a card that sits in the hand shows as bad.

## 5. What to look at while playtesting

- Does Greater Good give you the plays the simulator thinks it does, or does it mostly cost cards? In the simulator it is the weakest of the three swaps in the pod ranking.
- Does Skullclamp (the dear card) draw enough on tokens, Meren's Insects, Snakes and Goats? It draws about 2 cards a use and is played in about 1 game in 5.
- How often a hand wants Dark Ritual on turn 2 for Meren, and what you would play instead of a Swamp.
- Whether the draw problem you feel is visible at the table: in the simulator the best lists draw 0.3 to 1.2 more cards by turn 8 than the proposed list, and the "out of cards" and hand-size measures did not move beyond noise.
