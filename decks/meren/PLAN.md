# Meren of Clan Nel Toth: deck plan

Golgari reanimator, bracket 2–3. The aim is a consistent deck that's fun to play: slower than Gale, winning with Gray Merchant / Lotleth Giant drains and combat. Run it with `npm run sim -- meren` (see the root README). Engine notes: the root `PLAN.md`.

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
- **"No meaningful impact"** (first definition, change `noImpact` in `index.ts`): by turn 5 / 6 nothing came back from a graveyard and the board has under 3 nonland permanents. 15.9% / 4.3%. Waiting for Pontus's view of what counts as impact for this deck.

## Known limits of the simulation

- The planner only chooses spells and abilities; attacks still follow the fixed combat rule, and the end-step Meren loop follows fixed priorities.
- Removal (Heartless Act, Infernal Grasp) is never cast, since goldfish opponents have no creatures.
- The log analyzer's per-turn kill check doesn't apply to this deck (no kill search, no life totals in the log); the AI replay with your draws is the useful part.

## Next ideas

- Test replacements for the weakest slots (more ramp or graveyard filling), with `npm run sim -- meren decklist.txt lists/test.txt -n 5000`.
- The card ranking and cut tests above were run before the planner; rerun them when there are new cut ideas.
