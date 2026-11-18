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
