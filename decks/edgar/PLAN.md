# Edgar Markov (William's deck): deck plan

Mardu Vampire tribal / aristocrats, bracket 2–3. It is William's deck, not Pontus's: no swap proposals unless Pontus asks. Goals: consistency, and a deck for the pod. Run it with `npm run sim -- edgar` (see the root README).

## Files

- `cards.ts`: the card names, the Vampire check, the tokens, `VALUE` and `HOLD`. `game.ts`: `EdgarGame` (state, win check, anthems, mana from Treasures and Spawn, upkeep and end step, tutors, the planner's score). `triggers.ts`: enter, death and attack triggers. `actions.ts`: sacrifice outlets, the all-in sacrifice turn, prepared spells, activated abilities. `candidates.ts`: what the AI may do now, with a score. `index.ts`: deck registration and the `--diag` / `--hands` measures. `mulligan.ts`, `config.ts`, `tests/`.

## How the deck wins (Pontus, 2026-11-14)

- Edgar Markov leads an Aristocrats / Vampire tribal strategy. It builds board presence with +1/+1 counters, and closes with a Vampire token swarm (eminence) and drain / sacrifice.
- It runs plenty of ramp, a strong control package (selective answers), and drains, counters and flying creatures. Evereth, Viceroy of Plunder is how it explodes.

## Simulation rules (agreed 2026-11-14)

- **Opponents:** 3, at 40 life each, tracked separately. **Win: all three at 0.** Second measure: first opponent dead.
- **Combat:** the engine's goldfish combat for creature decks (flyers connect, opponents block half of the other attackers, the biggest first; the crackback for a big swing; `combat_safety` 10). Edgar attacks with haste and first strike; his attack puts a +1/+1 counter on each Vampire.
- **Single-target drains** ("target opponent loses ...") hit the opponent closest to dead.
- **Not modelled:** removal (no targets in a goldfish game: Swords, Feed the Swarm, New Blood, Kindred Dominance, Blasphemous Act, Saw in Half are held), Culling the Weak and Songs of the Damned (held), Master of Dark Rites' mana, Pit Fighter's ability, Gas Guzzler's speed, Clavileño's Demon, Captivating Vampire's steal, Pitiless Pontiff's and Yahenni's protection, Legion's Landing's land side making tokens, Cabal Coffers (played as a land that makes {B}), Urborg, the first-strike and lifelink of single attackers, Forerunner's pump, Vampire Gourmand's unblockable.

## How the AI plays (the main rules in `game.ts`, `triggers.ts`, `actions.ts`)

- **Eminence:** casting another Vampire makes a 1/1 Vampire token while Edgar is in the command zone or on the battlefield (the token is made after the spell, which is close enough). Vanquisher's Banner (type Vampire) draws for each Vampire spell.
- **Anthems:** Legion Lieutenant, Markov Baron, Stromkirk Captain, Captivating Vampire (+1/+1 to other Vampires), Vanquisher's Banner (all Vampires), Lord of Lineage (+2/+2 to other Vampires, Bloodline Keeper transforms with five Vampires).
- **Deaths:** Blood Artist, Vengeful Bloodwitch, Susurian Voidborn (one target opponent loses 1), Cruel Celebrant and Marionette Apprentice (each opponent loses 1), Arnyn (2, for creatures with power or toughness 1), Cordial Vampire (counters on every Vampire), Elenda (counters, then tokens when it dies), Pitiless Plunderer (Treasure), Pawn of Ulamog (Eldrazi Spawn), Carmen and Mayhem Devil (sacrifices only), Nine-Lives Familiar (comes back at the end step with one counter fewer).
- **Sacrifice outlets:** Evereth, Viscera Seer, Ashnod's Altar (makes {C}{C}), Phyrexian Altar (makes {B}), Indulgent Aristocrat ({2}), Pitiless Pontiff ({1}), Vampiric Rites and Baron Bertram ({1}{B}, draw). In the second main phase the AI sacrifices spare tokens when it has drain engines (a Vampire token only with two drains or more: it attacks and takes anthems). Skullclamp kills a 1-toughness token for two cards.
- **The all-in sacrifice turn:** when an outlet and enough fodder could kill the table (a cheap guess first, then a tried play on a copy of the game), the AI sacrifices everything that is not a drain engine, then Evereth itself to a second outlet and pays {1}{B}: Evereth hits each opponent for its power.
- **Mana:** Treasures and Eldrazi Spawn are spent only when lands and rocks are not enough.
- **Life:** Keen Duelist is cast only above 30 life (it costs us life every upkeep), Phyrexian Arena above 20, Black Market Connections above 20 (it draws, makes Treasures early and a 3/2 when life is high).
- **Tutors:** the AI wants a missing drain engine or outlet first (`tutorValue`). Beseech the Mirror is bargained with a token and casts what it finds for free up to mana value 4.
- **Prepared spells:** Emeritus of Woe (Demonic Tutor, {1}{B}) and Scheming Silvertongue (Sign in Blood, {B}{B}); they are prepared again at the end step after two deaths or two life gained.

## Log board check (engine change, 2026-11-14)

The log of a game names permanents by name only, so identical Vampire tokens with different counters or tapped state could end up wrong in a replay of the log. `MoveRecorder` (`engine/game-log/game-log-moves.ts`) now keeps the board as a replay builds it and adds a correcting line only when the replay would end with a different number of tapped permanents or counters in all. Other decks' logs are unchanged unless they were wrong.

## First results (decklist as given, 2026-11-14)

8,000 games: win by turn 8 / 10 / 12 / 14: **12.2 / 67.4 / 89.4 / 95.2%**, average turn 9.94; first opponent dead by turn 10: 95.7%; no win by turn 14: 4.8%. Edgar is cast from the command zone on turn 6 or later (six mana), so the early game is made by the cheap Vampires, lords and the eminence tokens.

## Opening hands (`--hands`, 8,000 hands, 2026-11-14)

2–5 lands are all fine (avg turn 10.1–10.5), 0–1 lands are a mulligan (1 land: 11.3, 0 lands: 12.5). A black source and a second colour is worth +0.56 turns, all three colours +0.43. Best cards in the opening 7: Bloodline Keeper (+1.04), Welcoming Vampire (+0.69), Preacher of the Schism (+0.66), Sol Ring, Arcane Signet, Fellwar Stone (+0.6 each). A token maker in the opening 7 is worth +0.63; a drain engine or an outlet alone is worth nothing (they need each other).

**Mulligan rule** (`mulligan.ts`): keep 3–4 lands with a black source, or 2 / 5 lands with a black source and a ramp piece, drain engine, outlet, token maker or cheap Vampire; after the free mulligan 2–6 lands with a black source. Against "keep 2–5 lands" (8,000 games each): win by turn 10 67.4% against 64.3%, average turn 9.94 against 10.03.

## Pod (2026-11-14)

Edgar against three goldfish: 99.8% wins, average round 9.95 (goldfish 9.94). In a pod with Meren, Sam & Frodo and Gale (300 games): Edgar 23.7%, Meren 25.0%, Sam & Frodo 31.3%, Gale 19.0%. Edgar is in the fixed-seed pod run (`POD_DECKS` in `scripts/verify.mjs`: the pod baseline was re-recorded for five decks). `podClose()` is Edgar out, six Vampires, drain engines and Evereth with a second outlet.

**`winAttempt()` (Evereth's explosion).** Sacrificing Evereth to an outlet is a cost, so nobody can respond to it; only her own pump ("sacrifice another creature: +1/+1 counter") uses the stack. So the others can answer only when the all-in sacrifice turn pumped her (a line with no pump has nothing to answer): the turn then keeps Evereth on the battlefield while the win is declared, we pay for it ({1}{B} and the outlet), deal the damage and keep the old life totals, and an exile or bounce effect on Evereth in response to the last pump stops the win (the engine puts the life totals back; what the pumps drained already happened). A destroy effect does not stop it (her dying is what makes her explode), so those answers are not used (`podCanTarget`). Not modelled: a Stifle effect on her death trigger. In a five-deck pod (600 games) 1.7% of Edgar's games declare the explosion and 16.7% of those are stopped. Edgar won 10.0% there (Meren 22.7%, Sam & Frodo 28.8%, Gale 15.3%, Aesi 23.2%; an even pod is 20%) and was the first one out in 15.8% of games.

## How the deck wins (`--diag`, 8,000 games, 2026-11-14)

The kind of damage that killed the last opponent, in wins: **combat 57.0%, drains and pings 34.3%, Evereth's explosion 8.7%.** Damage per won game: combat 104, drains and pings 14, Evereth's explosion 1.4 (the explosion hits each opponent at once, so it is counted per opponent). Combat is the main damage, from a Vampire board that Edgar's attacks and the lords and counters make big; the drains finish the games where the last few life points are out of reach of the attackers, and Evereth's explosion decides about one win in eleven. Pings count Mayhem Devil's damage.

## Simulator bug found on the way

The engine pays for a Dark Ritual by really paying and then undoing it. A payment that sacrifices Treasures or Spawn must not do that while the engine only tests: `isTestingRitual` in `game.ts` switches the sacrifice off during `ritualCandidates`.

## Open

- Pod: interaction cards of this deck in `engine/game/answers.ts` (its counterspell-free removal is only held), and a better model of the explosion (the outlet and the {1}{B} are paid before the others may answer; response by a counterspell on the ability is not modelled).
- The cards not modelled (see Simulation rules), most of all Master of Dark Rites' mana and Cabal Coffers.
- Pontus's game logs: none yet.
- Cuts and replacements: wait for Pontus's ideas (the deck is William's).
