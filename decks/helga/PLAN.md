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
- **No held-back mana while Helga can cast:** the pod holds mana for an instant answer in hand (`podReserve`, from round 5). That reserve is off while Helga is untapped and a creature of mana value 4+ is in hand, so Helga's mana is used instead of the turn passing (seed 455: Omnath sat in hand for two turns behind a held Negate). Pod, 600 games: Helga 13.2% -> 16.5% (noise about 4 points).
- **Cast triggers:** Kozilek, Butcher of Truth draws 4; Kozilek, the Broken Reality draws 4 (two opponents manifest two cards); Desolation Twin makes a 10/10; Apex Devastator cascades four times (a permanent found is cast for free, an instant or sorcery goes to the bottom).
- **Card draw:** Garruk's Uprising, Elemental Bond, Guardian Project, Colossal Majesty, Ohran Frostfang, Kozilek, Become the Avalanche, Rishkar's Expertise (draws, then a free permanent up to mana value 5), Regal Behemoth (the monarch: a card each end step).
- **Static:** Goreclaw and Radagast cost reductions, Stormsurge Kraken +2/+2 with Helga out, Kozilek, the Broken Reality's +3/+2 to other colourless creatures, Akroma's Memorial (every creature flies), Lightning Greaves (each new creature gets haste), Craterhoof and Become the Avalanche pump until end of turn, Koma's four Coils, Ob Nixilis's Angel when we gained life, Verdant Sun's Avatar's life.
- **Removal and counterspells** are held in a goldfish game; the pod uses them as answers (`engine/game/answers.ts`).
- **Annihilator** (pod only, before blocks): Kozilek, Butcher of Truth 4, Ulamog's Crusher 2, It That Betrays 2, Ulamog, the Defiler X. The defender sacrifices tokens first, then its cheapest nonland permanents, then lands. Ulamog, the Defiler enters with 6 counters in a pod (an assumption: its exile of half a library is not looked at).
- **Removal on cast or enter** (pod only, through the pod's removal path): Ulamog, the Ceaseless Hunger exiles two permanents; Terastodon destroys up to three noncreature permanents worth 45 or more (the owner gets a 3/3 Beast, not an Elephant); Angel of the Ruins exiles up to two artifacts or enchantments.

## Not modelled

It That Betrays taking what the opponents sacrifice; Ob Nixilis's destroy-all-tapped-creatures; Ulamog, the Ceaseless Hunger's attack mill and Ulamog, the Defiler's cast mill; Breaker of Armies's forced blocks; Myojin's counters; Selvala's mana and draws; Seedborn Muse; Wilderness Reclamation; Omnath; Moldgraf Monstrosity's return; Ruin Processor; Wandering Archaic; Serra's Emissary's protection; Explore's extra land; the monarch being taken.

## First numbers (2026-11-15)

- Goldfish, 2,000 games: win by turn 10 / 12 / 14: 36.2 / 78.3 / 92.9%, average turn 10.99. First opponent dead by turn 10: 81.5%.
- Pod against three goldfish (`--set pod_race=true`, 300 games): 99.3% wins, average round 11.29 (about the goldfish number).
