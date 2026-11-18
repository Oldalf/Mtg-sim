# Meren of Clan Nel Toth: deck plan

Golgari reanimator, bracket 2–3. The aim is a consistent deck that's fun to play: slower than Gale, winning with Gray Merchant / Lotleth Giant drains and combat. Run it with `npm run sim -- meren` (see the root README). Engine notes: the root `PLAN.md`.

## Files

- `cards.ts`: the card names and facts about them. `game.ts`: `MerenGame` (state, win check, turn steps, combat, tutors). `triggers.ts`: enter and death triggers. `candidates.ts`: what the AI may do now, with a score. `actions.ts`: what the abilities and spells do. `index.ts`: deck registration and --diag / --hands measures. `mulligan.ts`, `config.ts`, `tests/`.

## How the deck wins (Pontus's primer)

- Meren and other reanimation are value engines for a big tempo swing.
- Main kill: Gray Merchant of Asphodel (each opponent loses life equal to your devotion to black). Lotleth Giant hits one opponent for the number of creature cards in your graveyard.
- Twilight Diviner doubles both (a token copy of a creature that enters from a graveyard). Saw in Half on your own Gray Merchant gives two copies.
- Forced sacrifice as board control, where it's value for you and bad for opponents.

## Simulation rules (agreed 2026-11-04)

- **Win:** 2 opponents dead, or 100+ damage dealt in total. The table also shows when the first opponent dies.
- **Opponents have no creatures.** Edicts and removal only count for what they do for you (feeding Meren, death triggers). A creature stolen from an opponent's graveyard (Breach the Multiverse, Puppeteer Clique, Sepulchral Primordial, Junji) is a vanilla 5/5 token.
- **Your life counts:** you start at 40, self-damage (Phyrexian Arena, Infernal Grasp, Diresight, Decode Transmissions, Grim Servant...) and life gain (Gray Merchant, Disciple of Bolas, Vampiric Rites) count, and you lose at 0.
- **Combat:** flyers always connect. Of the other attackers, opponents block half (rounded down), the biggest ones. Crackback: attacking with nothing left home costs you as much life as you dealt; each untapped creature kept home cuts that by a third (confirmed 2026-11-04). Spore Frog never attacks; if it's out, everything else may attack and it's sacrificed before your next turn (no crackback). If attacking with everything wins, the AI always does it. Otherwise it picks the biggest attack that keeps you above 10 life.
- **Logs:** the Archidekt "Start Your Engines!" tracker is Meren's experience counter (this deck only); tokens from the misc zone are yours ("Demon" = a stolen 5/5).

## Results so far (decklist.txt as given)

With the turn planner (2026-11-04), 3,000 games: win by turn 8 / 9 / 10 / 12: **18.2 / 44.3 / 71.2 / 94.4%**, average turn 9.6. First opponent dead by turn 9: 77.5%. The AI never died in 2,000 games (average life at the win: 83, lowest 8).

Before the planner: 11.3 / 35.1 / 64.0 / 92.4%, average 9.9. The planner is worth about 7 points by turn 10. It makes runs about 10 times slower (11 s per 3,000 games), which is still fast.

Your logged game (won turn 9, `logs/game1_t9_gray_merchant.txt`): the AI with the same draws also wins on turn 9 (turn 10 before the planner).

## Card ranking and cut tests (2026-11-04, before the planner)

Ranking: 6,000 games. It shows how much sooner you win when you've seen the card by turn 4. This is correlation, not proof. Your Removal and Protection sections aren't judged (interaction does nothing against goldfish opponents, like Gale's counterspells), except Saw in Half, which is a combo piece here.

- **Best:** Sol Ring (+0.96 turns), Liliana the Repentant (+0.68), Grist (+0.63), Sakura-Tribe Elder (+0.63), Phyrexian Arena (+0.40), Priest of Forgotten Gods (+0.37), Satyr Wayfinder (+0.36), Llanowar Elves (+0.30), Fauna Shaman (+0.30), Buried Alive (+0.26). The speed comes from mana and from filling the graveyard.
- **Worst:** Timeless Witness (−0.46), Eternal Witness (−0.39), Junji (−0.26), Morbid Opportunist (−0.26), Garruk's Packleader, Village Rites, Decode Transmissions, Puppeteer Clique, Songs of the Damned (−0.22 each).

Cut test: each of those nine replaced by a Swamp, 5,000 games, noise about ±2 points.

| Cut → Swamp | Win by T8 | by T10 | by T12 |
|---|---|---|---|
| Timeless Witness | +1.7 | +1.8 | +0.7 |
| Eternal Witness | +1.2 | +2.2 | +0.1 |
| Junji | +1.2 | +1.6 | −0.4 |
| Morbid Opportunist | +1.4 | +0.7 | +0.4 |
| Garruk's Packleader | +1.2 | +0.4 | +0.6 |
| Village Rites | +1.3 | +0.9 | +0.3 |
| Decode Transmissions | +1.1 | +0.5 | +0.3 |
| Puppeteer Clique | +1.4 | −0.1 | −0.2 |
| Songs of the Damned | +0.3 | +1.4 | +0.3 |

All within noise: a Swamp does about as well as each of them, so none speeds up a goldfish game, but none clearly hurts either.

- **Cut candidates:** the two Witnesses are the clearest. Their real value is getting back answers, which a goldfish game can't see, so judge them like the removal.
- **Keep, or add more of:** mana (Sol Ring, Sakura-Tribe Elder, Llanowar Elves) and graveyard filling (Liliana, Satyr Wayfinder, Buried Alive, Fauna Shaman).

## Opening hands (`--hands`, 8,000 hands; the basis of the MULLIGANS section in `PRIMER.txt`)

3–4 lands win about a turn sooner than 0–1 lands (a one-lander is worse than a mulligan to 6). A green source is worth about 0.7 turns, a ramp piece or a graveyard filler / tutor about 0.35 each. Best cards in the opening 7: Sol Ring (+1.0), Liliana the Repentant, Sakura-Tribe Elder, Grist, Priest of Forgotten Gods.

**Mulligan rule** (`mulligan.ts`): keep 3–5 lands with a green source, or 2 lands with green and a ramp piece / graveyard filler / tutor; after the free mulligan 2–6 lands with green. It wins by turn 10 in 71.9% of 12,000 games against 69.9% for the old "keep 2–5 lands" (average turn 9.63 against 9.66).

**Lands (2026-11-07):** the check, fast and battle lands (Woodland Cemetery, Blooming Marsh, Vernal Fen), the snarl and Bojuka Bog / Mosswort Bridge now enter tapped when their condition fails, Llanowar Wastes deals its damage, and Tainted Wood makes coloured mana only with a Swamp. Twilight Mire is still played as a dual. Effect: win by turn 8 / 10 / 12 now 17.5 / 71.9 / 95.2% (was 18.6 / 72.5 / 95.5), first opponent dead by turn 10: 93.2%. The AI with your logged game's draws wins on turn 9 in 90% of runs.

## Consistency measures (`--diag`, 16,000 games, 2026-11-07)

`npm run sim -- meren --diag -n 16000 [--eco]` (lists in `index.ts`, definitions at the top of it; same slow-start definition as Aesi: less than 60% of the mana of one land per turn spent, i.e. under 9 mana by turn 5 or under 13 by turn 6).

- Win by turn 8 / 10 / 12: 17.6 / 71.9 / 95.2%. The 90th-percentile game wins on turn 12.
- **Slow start: 10.7%** (under 9 mana by turn 5: 8.5%; under 13 by turn 6: 8.9%). Average mana spent: 13.1 by turn 5, 18.5 by turn 6 (Aesi's package list: 15.5 / 24).
- Meren comes down on turn 4.0 on average; still not out, game still going: 18.4% after turn 4, 6.5% after turn 5, 3.5% after turn 6.
- **The engine is slow to start:** nothing has come back from a graveyard by the end of turn 5 in 71% of games (49% by turn 6), and Meren's experience averages 0.75 after turn 5 and 1.7 after turn 6. A thin board (under 3 nonland permanents) after turn 5: 17%.
- **Card draw** (2026-11-18, `--diag`): cards in hand at the end of turns 5 / 6 / 8, "out of cards" (1 or fewer in hand, game still going) at turns 6 / 8, cards drawn by turns 6 / 8 (draw steps included). decklist.txt: hand 5.3 / 5.1 / 4.8, out of cards 1.7 / 4.5%, drawn 7.0 / 10.6.
- **"No meaningful impact"** (Pontus's definition, 2026-11-18; `noImpact` in `index.ts`): the game is still going at the end of turn 5 / 6 and Meren's engine isn't running: Meren isn't on the battlefield, or nothing has come back from a graveyard and she has under 2 experience. **68.9% / 43.5%** (the first definition, nothing reanimated and under 3 nonland permanents, gave 15.9% / 4.3%). The new one is much stricter: by turn 5 the engine runs in about a third of the games.

## Known limits of the simulation

- The planner only chooses spells and abilities; attacks still follow the fixed combat rule, and the end-step Meren loop follows fixed priorities.
- Removal (Heartless Act, Infernal Grasp) is never cast, since goldfish opponents have no creatures.
- The log analyzer's per-turn kill check doesn't apply to this deck (no kill search, no life totals in the log); the AI replay with your draws is the useful part.

- Ophiomancer's Snake is a 1/1 black Snake with deathtouch (as on Scryfall), made at the beginning of **each** upkeep, ours and the opponents', if we control no Snakes (2026-11-15). The engine hook is `opponentUpkeep()`: goldfish calls it before our upkeep, a pod calls it at every other deck's turn start. Goldfish results are IDENTICAL (0 of 600 seeds differ); only the tests changed, so the baseline was re-recorded.

## Next ideas

- Test replacements for the weakest slots (more ramp or graveyard filling), with `npm run sim -- meren decklist.txt lists/test.txt -n 5000`.
- The card ranking and cut tests above were run before the planner; rerun them when there are new cut ideas.

## Swap tests (moved here from `lists/SWAPS.txt` on 2026-11-14; the lists were removed, see git history)

Test lists compared with `decklist.txt` (checked with a diff):

- `lists/proposed.txt` (was `b3.txt`): out Eternal Witness, Timeless Witness, Songs of the Damned, Puppeteer Clique, Solemn Simulacrum; in Carrion Feeder, Stitcher's Supplier, Wood Elves, Ophiomancer, Skull Prophet.
- `lists/proposed_marauder_and_elves.txt` (was `a3.txt`): the adopted list, plus out Village Rites and Rune-Scarred Demon; in Fleshbag Marauder, Fyndhorn Elves.
- `lists/proposed_solemn_kept.txt` (was `b3x.txt`): the adopted list with Solemn Simulacrum kept and no Skull Prophet (four cuts, four adds: Carrion Feeder, Stitcher's Supplier, Wood Elves, Ophiomancer).

Tried and dropped: Zulaport Cutthroat (drain, not the plan), Elvish Mystic (replaced by Ophiomancer), Sylvan Caryatid (replaced by Skull Prophet), cutting Twilight Diviner and Sepulchral Primordial (list C3: fewer wins).

### T6: answers to a wide board (2026-11-18)

Pontus's request: D'Ghor Bloodletter and Massacre Wurm, to give Meren something against go-wide tables (Edgar). Cuts picked by Claude, as Pontus asked: Decode Transmissions and Junji, the Midnight Sky (both near the bottom of the ranking above, both in both lists). Tested on `decklist.txt` and `lists/proposed.txt` (lines replaced in place), 4,000 games per list, same seeds, default settings. Goldfish noise about ±2.2, `--diag` ±2, pod ±2. Prices: Scryfall bulk data of 2026-11-13, check Cardmarket before buying.

Rules added first (T6): the engine gives Massacre Wurm its -2/-2 and its "that player loses 2 life", and a pod -X/-X until end of turn (by toughness, so indestructible doesn't help). Meren chooses D'Ghor Bloodletter's mode. The -1/-1 is used when it kills 2+ opposing creatures, or when Meren can sacrifice the Bloodletter (with an outlet that survives the -1/-1) and return it at the end step for a second -1/-1 that would kill them. Otherwise it uses the edict. In goldfish it's always the edict (no opposing creatures).

| List | Win by T8 | by T10 | by T12 | Avg turn | No impact T5 / T6 | Pod win (20% even) | Pod out first | Edgar's pod win |
|---|---|---|---|---|---|---|---|---|
| decklist.txt | 18.1 | 71.5 | 95.1 | 9.63 | 68.5 / 43.9 | 16.2 | 22.1 | 10.0 |
| D'Ghor Bloodletter for Decode Transmissions (€0.02) | −0.1 | −0.5 | −0.2 | 9.64 | | +0.1 | 0.0 | 10.4 |
| Massacre Wurm for Junji (€2.67) | −0.6 | −0.6 | −0.5 | 9.64 | | +1.2 | −0.5 | 9.7 |
| both | −0.5 | −1.0 | −0.6 | 9.65 | −1.5 / −1.4 | +1.2 | −0.3 | 9.9 |
| lists/proposed.txt | 21.9 | 77.9 | 96.0 | 9.41 | 65.5 / 39.8 | 19.3 | 21.6 | 9.4 |
| D'Ghor Bloodletter for Decode Transmissions | +0.4 | −0.3 | 0.0 | 9.42 | | −0.7 | +0.2 | 10.0 |
| Massacre Wurm for Junji | +0.5 | −1.5 | −0.3 | 9.43 | | +0.8 | 0.0 | 9.4 |
| both | +0.9 | −1.7 | −0.5 | 9.43 | −1.3 / −0.6 | +0.5 | +0.1 | 9.9 |

Pod: `npm run pod -- gale meren:<list> samfrodo aesi edgar -n 4000 --no-log`. In the logged games the Bloodletter's -1/-1 killed 2 to 13 creatures at a time, and the Wurm drained on most opposing deaths.

**Verdict:** every swap is within noise, in goldfish, in `--diag` and in the pod. Neither card measurably helps or hurts here, so none was rerun at 16,000. What the simulator doesn't see: the opponents' AIs don't play around a sweeper or hold creatures back, and Meren's attack and blocking rules are still the fixed ones, so a cleared board isn't pressed as hard as a player would. Pontus decides. Aside: `proposed.txt` beats `decklist.txt` by about 3 points in the pod (19.3 against 16.2, above the ±2 noise at 4,000) and by 3–4 points on the impact measure. That's worth knowing while deciding on the proposed list.

**Second round (2026-11-18), after the rules fixes** (Wight of the Reliquary's land ability, Village Rites and Disciple of Bolas choices, Junji's pod modes: opponents discard two, or a stolen 5/5 from an opponent's graveyard). Pontus's pairs: Massacre Wurm for Garruk's Packleader, D'Ghor Bloodletter for Unearth. 4,000 games per list, same seeds; the pod is the same five-player table. Card draw columns from `--diag` (hand and "out of cards" = 1 or fewer in hand, game still going).

| List | Win by T10 | Avg turn | No impact T5 / T6 | Cards drawn by T8 | Out of cards T8 | Pod win | Pod out first |
|---|---|---|---|---|---|---|---|
| decklist.txt | 72.8 | 9.60 | 67.3 / 42.4 | 10.62 | 4.5 | 17.1 | 22.1 |
| Massacre Wurm for Garruk's Packleader | −0.7 | 9.60 | +0.0 / −0.2 | −0.22 | +0.4 | +0.8 | −0.4 |
| D'Ghor Bloodletter for Unearth | −0.4 | 9.61 | +1.6 / +0.7 | −0.02 | +0.1 | −0.7 | +0.3 |
| both | −1.0 | 9.62 | +1.7 / +0.6 | −0.22 | +0.5 | +0.2 | 0.0 |
| lists/proposed.txt | 79.5 | 9.38 | 63.8 / 38.1 | 10.63 | 7.0 | 20.4 | 22.0 |
| Massacre Wurm for Garruk's Packleader | −0.7 | 9.39 | +0.1 / +0.6 | −0.23 | +0.6 | +1.5 | 0.0 |
| D'Ghor Bloodletter for Unearth | −0.6 | 9.39 | +1.3 / +0.5 | −0.03 | +0.2 | −1.0 | +0.1 |
| both | −1.1 | 9.40 | +1.3 / +1.0 | −0.27 | +0.8 | +0.5 | +0.1 |

**Verdict:** all within noise again (goldfish ±2.2, `--diag` ±2, pod ±2). Garruk's Packleader draws about 0.2 cards by turn 8 on average, so cutting it costs very little draw. Unearth's cut costs nothing measurable. Hand size counts the removal the AI holds in goldfish (never cast there), so goldfish hands look fuller than at the table. Pontus decides.

### T6: card draw round (2026-11-18)

Pontus's request: "build all these cards in, make them reusable, cut Garruk's Packleader and Morbid Opportunist for sure, try every card in a slot and measure how many cards each draws on average in the games where it shows up". Base `lists/proposed.txt`. Rules first (engine `engine/game/card-draw.ts`, tests in `card-draw.test.ts` and `meren.test.ts`): the sacrifice spells, Midnight Reaper, Moldervine Reclamation, Corpse Augur, Tireless Tracker with Clues, Skullclamp, Greater Good, Ayara, Elvish Visionary, Grim Backwoods, and Night's Whisper's 2 life (the engine was missing it; no other deck's results changed). Meren chooses what to sacrifice: an expendable creature, else a Treasure then a Clue (Deadly Dispute, Costly Plunder); up to 3 creatures and never under 15 life (Plumb); Skullclamp only on a 1-toughness creature it doesn't mind losing; Greater Good only for a creature with power 4+ that Meren can return. Prices: Scryfall bulk data of 2026-11-13, check Cardmarket before buying.

Each card was put into Garruk's Packleader's slot (line replaced in place), 4,000 games, same seeds, default settings (goldfish ±2.2, `--diag` ±2). "Played in" is the share of games where the card was cast or entered the battlefield; "drew" is the cards it drew in those games, over the whole game (a Clue's draws count for Tracker). `--diag` now reports both for every draw card.

| In for Garruk's Packleader | Win by T8 | by T10 | Avg turn | No impact T6 | Cards drawn by T8 | Played in % | It drew when played |
|---|---|---|---|---|---|---|---|
| lists/proposed.txt (Packleader) | 22.5 | 79.5 | 9.38 | 38.1 | 10.63 | 12.0 | 4.28 |
| Ayara, First of Locthwain (€5.32) | +2.3 | +2.0 | 9.30 | −0.3 | −0.16 | 21.8 | 0.77 |
| Skullclamp (€5.51) | +1.2 | +1.0 | 9.34 | −1.5 | +0.36 | 19.5 | 4.71 |
| Deadly Dispute (€0.54) | +0.9 | +1.0 | 9.34 | −0.9 | +0.08 | 16.5 | 2.01 |
| Plumb the Forbidden (€0.61) | +0.6 | +0.9 | 9.35 | −1.0 | +0.15 | 15.1 | 3.01 |
| Costly Plunder (€0.13) | +0.7 | +0.7 | 9.36 | −0.7 | +0.04 | 15.3 | 2.00 |
| Night's Whisper (€0.48) | +0.8 | +0.9 | 9.35 | −0.1 | +0.13 | 16.9 | 2.01 |
| Corpse Augur (€0.14) | +0.7 | +0.4 | 9.36 | −0.2 | +0.05 | 12.9 | 3.79 |
| Grim Backwoods (€0.17, a land) | +0.8 | +0.4 | 9.35 | −0.6 | −0.12 | 15.0 | 0.16 |
| Midnight Reaper (€0.28) | +0.4 | +0.6 | 9.36 | +0.3 | +0.05 | 21.4 | 3.02 |
| Elvish Visionary (€9.31) | +0.4 | +0.6 | 9.36 | −0.3 | +0.01 | 18.5 | 1.16 |
| Greater Good (€2.26) | +0.5 | +0.4 | 9.37 | −0.0 | +0.63 | 11.9 | 23.23 |
| Tireless Tracker (€0.26) | −0.3 | −0.3 | 9.40 | +0.4 | −0.13 | 18.6 | 0.83 |
| Moldervine Reclamation (€0.30) | −0.0 | +0.0 | 9.38 | +0.0 | +0.06 | 11.6 | 5.68 |

Only Ayara passed the noise at 4,000. The leaders went to 16,000 games (goldfish ±1.1), also in Morbid Opportunist's slot, and as pairs for both slots:

| 16,000 games | Win by T8 | by T10 | by T12 | Avg turn |
|---|---|---|---|---|
| lists/proposed.txt | 23.2 | 79.1 | 96.6 | 9.38 |
| Ayara for Packleader | +2.4 | +2.0 | +0.2 | 9.30 |
| Skullclamp for Packleader | +1.0 | +1.4 | +0.1 | 9.33 |
| Deadly Dispute for Packleader | +1.1 | +1.3 | +0.1 | 9.34 |
| Plumb the Forbidden for Packleader | +1.0 | +1.1 | +0.1 | 9.34 |
| Ayara for Morbid Opportunist | +2.2 | +1.8 | +0.2 | 9.30 |
| Skullclamp for Morbid Opportunist | +0.8 | +1.2 | +0.1 | 9.34 |
| Deadly Dispute for Morbid Opportunist | +0.9 | +0.8 | +0.1 | 9.35 |
| Midnight Reaper for Morbid Opportunist | +0.1 | +0.5 | 0.0 | 9.37 |
| Ayara for Packleader, Skullclamp for Opportunist | +3.4 | +3.0 | +0.2 | 9.25 |
| Ayara for Packleader, Deadly Dispute for Opportunist | +3.6 | +2.6 | +0.2 | 9.26 |
| Skullclamp for Packleader, Deadly Dispute for Opportunist | +1.8 | +1.8 | +0.1 | 9.31 |
| Ayara for Packleader, Midnight Reaper for Opportunist | +2.7 | +2.4 | +0.3 | 9.28 |

**Verdict.** Looks real at 16,000: Ayara (+2.4 by T8, +2.0 by T10, about 0.08 turns faster), and any pair with Ayara (+2.4 to +3.6 by T8). Skullclamp, Deadly Dispute and Plumb the Forbidden are at the edge of the noise (about +1 by T8, +1.1 to +1.4 by T10): a small gain, not proven. The rest are within noise. Ayara is no draw card here: it draws 0.77 cards when played. What helps is its drain (1 life each time a black creature enters, and 1 gained), and the simulator wins by damage. What counts for card draw: Skullclamp draws the most for its slot among the clean cards (4.71 cards in the games it is played, about 2 per use), Corpse Augur 3.8 and Midnight Reaper 3.0 (Reaper costs 1 life per card, Augur X life), Deadly Dispute and Costly Plunder exactly 2 (net +1 after the spell and a creature, but the Treasure helps), Moldervine Reclamation 5.7 but only in 11.6% of games (5 mana). Tracker and Grim Backwoods draw under 1 card (Clues cost {2}, Backwoods {2}{B}{G} and a land slot). Greater Good's 23 cards is misleading: it discards 3 each time (net power minus 3) and loops a returned Grave Titan, and the win turn didn't improve. None of them moved the "out of cards" or hand-size measures beyond noise, so the smoothing the deck wants isn't visible in goldfish, where Packleader's loss (about 4 cards in the games it is played) is replaced one for one. Not run in the pod: these cards don't change interaction. What goldfish can't see: Ayara needs BBB (the sim does pay it from the B sources the deck has), and Corpse Augur and Reaper cost life that a pod punishes. Pontus decides; `decklist.txt` and `lists/proposed.txt` are unchanged.
