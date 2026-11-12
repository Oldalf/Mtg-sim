# Sam & Frodo: deck plan

Abzan tokens / aristocrats, bracket 2–3. Wins by draining: tokens and Foods are created and sacrificed, and drain payoffs (Mirkwood Bats, Marionette Apprentice and Master, Popular Egotist, Susurian Voidborn, Sanguine Bond, Gollum) turn that into life loss. Run it with `npm run sim -- samfrodo` (see the root README). The phases of the project are in the root `ROADMAP.md` (this is phase 2).

## Files

- `cards.ts`: the card names and facts about them. `game.ts`: `SamFrodoGame` (state, life gain, tokens, sacrifice values, mana, turn steps). `triggers.ts`: enter, death and Food triggers. `candidates.ts`: what the AI may do now, with a score. `actions.ts`: what the abilities do. `combat.ts`: goldfish combat, pod combat, the all-in attack. `index.ts`: deck registration and --diag / --hands measures. `mulligan.ts`, `config.ts`, `tests/`.

## How the deck wins (Pontus, 2026-11-05)

- Drain with the drain cards: on tokens or creatures created or sacrificed, or with life gain through Gollum (and Sanguine Bond).
- Attacks: generally only Gollum (for its end-step trigger) and Frodo (for the Ring and the card draw).
- Mechanics to model: tokens, Treasures, Food, life gain, the Ring tempting you (always Frodo as Ring-bearer), Merry / Pippin partners.

## Simulation rules (agreed 2026-11-05)

- **Opponents:** 3, at 40 life each, tracked separately. **Win: all three at 0.** Second measure: first opponent dead.
- **Single-target drains** ("target opponent loses ...") hit the opponent with the most life, so all three go down together and "each opponent" drains never hit a dead player.
- **Attacks:** Frodo and Gollum only. Gollum always connects (skulk) and hits an opponent he hasn't hit yet, so his end-step drain grows to all three. Frodo connects once the Ring has tempted us (the Ring-bearer can't be blocked by bigger creatures); before attacking, the AI eats a Food (Sam makes one each combat and makes Foods cost {1}) to reach 3 life gained, so the Ring tempts us. Ring level 2: Frodo loots on attack; Frodo draws once tempted twice; level 4: Frodo's hit drains 3 from each opponent. No crackback (the attacks are tiny).
- **All-in:** if attacking with everything kills the whole table (flyers connect, half the ground attackers blocked, biggest first; Pippin's +3/+3 and haste if needed), the AI does it. `--set all_in=false` turns that off.
- **Our life counts** (Night's Whisper, Trading Post's Goat); we start at 40.

## How the cards are played (the main rules in `game.ts`)

- **Token creation** is one event: Peregrin Took and Tippy-Toe add a Food each, then Academy Manufactor turns each Food, Clue or Treasure into one of each (so one Food with all three out = 3 Food, 3 Clue, 3 Treasure). Mirkwood Bats and Rosie Cotton trigger per token; Belladonna Took, Merry (once a turn), Mentor of the Meek, Prosperous Innkeeper trigger as they enter.
- **Sacrifice and death:** Bats (tokens), Egotist (any permanent), Apprentice (creature or artifact), Master (artifacts, drains its power; fabricate goes on Master as counters), Voidborn, Rapacious Guest. Food sacrifices also trigger Nuka-Cola, Rapacious Guest, Unlucky Cabbage Merchant and Elanor.
- **Life gain:** Sanguine Bond, Prize Pig (untaps), Cat Collector, Dawn of Hope and Well of Lost Dreams (paid outside the first main phase), Gollum, The Gaffer, Tippy-Toe, Gwaihir.
- **Mana:** Treasures are sacrificed when used, Gilded Goose eats a Food, Pristine Talisman gains 1, The Notary Hobbits tap for {C} per Halfling, Chromatic Lantern makes lands any colour, two-colour lands only make their two colours, snarls enter untapped when you can reveal a matching basic.
- **Partner with:** Merry and Pippin fetch each other from the library when cast.
- **Sacrifice outlets:** Umbral Collar Zealot sacrifices spare tokens worth 3+ drain in the second main phase. Witch's Oven eats Cauldron Familiar (which comes back for a Food) or a spare token. Lobelia sacrifices a spare artifact for 2 each. Trading Post draws for a spare artifact, or turns dead removal into 4 life with Bond / Gollum out. Spare = all tokens except a Food for Cauldron Familiar and one for Frodo when Sam isn't out, and two Treasures before turn 7.
- **Foods are eaten** (3 life) for Frodo before combat, and in the second main phase only when something rewards it (Bond, Gollum's hit opponents, The Gaffer / Gwaihir reaching 3, Tippy-Toe, Cat Collector, Dawn of Hope / Well).
- **Removal on our own Rapacious Guest** (from Pontus's log): in the second main phase, once its power is 6+, Swords (we gain its power), Path (we get a basic: landfall), Go for the Throat, Mortify or Anguished Unmaking on it; it drains its power as it leaves. On average no change (68.4 vs 68.5% by turn 10: it needs Guest, Foods and removal together), kept because it's a real line (`own_removal`).
- **Not modelled:** other removal (no targets in a goldfish game; held, discarded first), Supper for Spiders, Lobelia's exiled cards, Voidborn's warp, Ash Barrens' landcycling.
- **Turn planner** is on: it's worth +8 points win by turn 10 (planner off: 59.5%).

## First results (decklist as given, 2026-11-05)

3,000 games: win by turn 9 / 10 / 11 / 12 / 14: **42.1 / 68.5 / 87.0 / 95.9 / 99.4%**, average turn 9.8. First opponent dead by turn 10: 72.9%. The AI never died in 600 games (lowest life at a win: 42).

- About a quarter of the wins end with an all-in attack (average turn 10.5, against 9.8 for drain wins): the slower games, where a big token board finishes it. Without all-in attacks: −1.2 points by turn 10 (noise), so the drains carry the deck.
- 3,000 games take about 50 s with the planner on.

## Card ranking (6,000 games, 2026-11-05)

How many turns sooner the deck wins when you've seen the card by turn 4 (correlation, not proof; noise about ±0.08 turns). Removal isn't judged.

- **Best:** Academy Manufactor (+1.32), Peregrin Took (+0.95), Nuka-Cola Vending Machine (+0.72), The Notary Hobbits (+0.70), Mirkwood Bats (+0.70), Gollum (+0.67), Sol Ring (+0.65), Marionette Apprentice (+0.34), Tippy-Toe (+0.33), Birds of Paradise and Prize Pig (+0.28). The token multipliers are the engine; Bats and Apprentice turn every token into drain.
- **Worst:** Farmer Cotton (−0.51), Mentor of the Meek (−0.33), Unlucky Cabbage Merchant (−0.28), Merry (−0.28 before its partner tutor, −0.16 after), Supper for Spiders (−0.27, dead in a goldfish game), Cultivate (−0.25), Dawn of Hope, Pristine Talisman, Gwaihir, Witch's Oven (−0.22 each), Trading Post (−0.21).
- Farmer Cotton isn't a misplay: holding it for X ≥ 3, 4 or 5 changed nothing beyond noise.
- No cut tests until Pontus has cut ideas.

## Pontus's game 1 (`logs/game1_t8_pippin_alpha.txt`, 2026-11-05)

Turn 8: Pippin's +3/+3 alpha strike, then Path to Exile on his own Rapacious Guest. The AI with the same draws wins on turn 9 in 99% of runs (turn 8: 0.5%), so the real game was a turn ahead.

- Analyzer: tokens read from the log (Food, Treasure, Soldier, ...), the Ring card's counter = temptations, +1/+1 counters carried over. Archidekt doesn't log tokens leaving, so a tapped Food or Treasure counts as sacrificed (`logSacOnTap`); Foods sacrificed without tapping (Pippin, Savvy Hunter) stay on the analyzer's board.
- Looks off in the log (see the reply of 2026-11-05): the loot on the turn-5 attack, the Ring counter not raised on turns 6 and 7, Tippy-Toe's Food on Merry's Soldier and Sam's Food missing on turn 8, Rapacious Guest's counters from Pippin's four Foods, the basic land from Path to Exile.

## Opening hands (`--hands`, 6,000 hands; the basis of the MULLIGANS section in `PRIMER.txt`)

3–4 lands are best, 2 and 5–6 fine; 0–1 lands are a mulligan (a one-lander is nearly a turn slower than a fresh 7). Sources for all three colours are worth about 0.4 turns. One of Academy Manufactor, Peregrin Took, Nuka-Cola, The Notary Hobbits, Mirkwood Bats, Gollum or Sol Ring in the opening 7 wins about a turn sooner (Manufactor +1.2, Peregrin +0.9, Bats +0.8).

**Mulligan rule** (`mulligan.ts`): keep 3–4 lands, or 2 / 5–6 lands with a ramp piece, token maker or drain payoff; after the free mulligan 2–6 lands. No measurable change against "keep 2–5 lands" (6,000 games: win by turn 10 67.2% either way); it changes about 2% of games.

**Lands (2026-11-07):** the check lands (Isolated Chapel, Sunpetal Grove, Woodland Cemetery), the battle land (Canopy Vista), the snarls and Fortified Village now enter tapped when their condition fails. Murmuring Bosk is tapped and costs 1 life for {W} or {B} ({G} is free), Brushland costs 1 life for a colour and nothing for {C}. Effect: win by turn 10 / 12 / 14 now 67.2 / 95.5 / 99.3% (was 69.0 / 95.6 / 99.3), average turn 9.88 (was 9.81). The AI with your logged game's draws still wins on turn 9 in 99% of runs.

## Next

- Pontus's game logs: replay them with `npm run sim -- samfrodo --analyze logs/<file>.txt` (the analyzer may need token names from the logs, `logToken`).
- Cut and replacement ideas from Pontus, tested with the same seeds.
