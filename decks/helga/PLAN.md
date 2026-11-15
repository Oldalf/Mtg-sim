# Helga, Skittish Seer (Friend 2's deck): deck plan

Bant ramp into big creatures, bracket 2-3. A friend's deck, **pod-only** (Pontus, 2026-11-15): no goldfish tuning, mulligan study or swaps unless the owner asks. Run it with `npm run pod -- helga ...`.

## Files

- `cards.ts`: names, `VALUE`, `HOLD`, tokens. `game.ts`: `HelgaGame` (extends the engine's `CreatureDeckGame`): Helga's mana and cast trigger, the Eldrazi cast triggers, the card draw engines, Craterhoof, power bonuses. `candidates.ts`: what the AI may do now. `tests/helga.test.ts`.

## How the deck wins (Pontus, 2026-11-15)

Helga grows and taps for more and more mana, so huge threats (Eldrazi titans, Craterhoof) come turns early.

## Simulation rules

- Win: every opponent at 0 life (3 in a goldfish game, all others in a pod). Second measure: first opponent dead.
- Combat: the engine's goldfish combat for creature decks; in a pod, real blocks.
- **Helga:** each creature spell of mana value 4 or more draws a card, gains 1 life and puts a +1/+1 counter on her. She taps for mana equal to her power, of one colour, only for those creature spells: the AI taps her for exactly what the spell still needs, so none floats for other spells.
- **Cast triggers:** Kozilek, Butcher of Truth draws 4; Kozilek, the Broken Reality draws 4 (two opponents manifest two cards); Desolation Twin makes a 10/10; Apex Devastator cascades four times (a permanent found is cast for free, an instant or sorcery goes to the bottom).
- **Card draw:** Garruk's Uprising, Elemental Bond, Guardian Project, Colossal Majesty, Ohran Frostfang, Kozilek, Become the Avalanche, Rishkar's Expertise (draws, then a free permanent up to mana value 5), Regal Behemoth (the monarch: a card each end step).
- **Static:** Goreclaw and Radagast cost reductions, Stormsurge Kraken +2/+2 with Helga out, Kozilek, the Broken Reality's +3/+2 to other colourless creatures, Akroma's Memorial (every creature flies), Lightning Greaves (each new creature gets haste), Craterhoof and Become the Avalanche pump until end of turn, Koma's four Coils, Ob Nixilis's Angel when we gained life, Verdant Sun's Avatar's life.
- **Removal and counterspells** are held in a goldfish game; the pod uses them as answers (`engine/game/answers.ts`).

## Not modelled

Annihilator (Kozilek, Ulamog's Crusher, It That Betrays, Ulamog, the Defiler): the engine has no "defending player sacrifices" yet, so in a pod these hit only for their power. Ulamog, the Ceaseless Hunger's and Terastodon's, Angel of the Ruins's and Ob Nixilis's removal when they enter or are cast; Ulamog, the Defiler's mill and counters; Breaker of Armies's forced blocks; Myojin's counters; Selvala's mana and draws; Seedborn Muse; Wilderness Reclamation; Omnath; Moldgraf Monstrosity's return; Ruin Processor; Wandering Archaic; Serra's Emissary's protection; Explore's extra land; the monarch being taken.

## First numbers (2026-11-15)

- Goldfish, 2,000 games: win by turn 10 / 12 / 14: 36.2 / 78.3 / 92.9%, average turn 10.99. First opponent dead by turn 10: 81.5%.
- Pod against three goldfish (`--set pod_race=true`, 300 games): 99.3% wins, average round 11.29 (about the goldfish number).
