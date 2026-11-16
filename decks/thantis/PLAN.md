# Thantis, the Warweaver (Friend 2's deck): deck plan

Jund forced combat, bracket 2-3. A friend's deck, **pod-only** (Pontus, 2026-11-15). Run it with `npm run pod -- thantis ...`.

## Files

- `cards.ts`: names, `VALUE`, `HOLD`. `game.ts`: `ThantisGame` (extends `CreatureDeckGame`). `candidates.ts`. `tests/thantis.test.ts`.

## How the deck wins (Pontus, 2026-11-15)

Forced combat: every creature must attack each combat (Thantis, Ruric Thar, Ares, goad from Kardur and Geode Rager). Taurean Mauler grows on everyone's spells, Thantis grows on every attack against it, and the deaths pay: Syr Konrad, Sangromancer, Grave Venerations, Dictate of Erebos, plus the reanimation (Avacyn, Meren, Alesha, Reanimate and the other engine spells).

## Simulation rules

- Win: every opponent at 0 life. Second measure: first opponent dead. Combat: the engine's. Forced attacks and goad are the pod's (M2): Thantis and Ruric Thar make creatures attack without the deck knowing.
- **Thantis:** a +1/+1 counter for each creature that attacks us (the engine's `onAttackedBy`, called when the attack is declared).
- **Triggers on other players' spells** (M3, engine): Taurean Mauler grows on an opponent's spell; Ruric Thar deals 6 to a player casting a noncreature spell (an opponent's: the engine; ours: the deck, and with 12 life or less the AI casts only creatures); Lurking Predators puts a revealed creature onto the battlefield.
- **Deaths** (a creature of any player dying reaches every other player through the engine's `onOtherPlayersCreatureDies`): Syr Konrad drains 1 (also for a creature card leaving our graveyard), Sangromancer gains 3, Morbid Opportunist draws (once a turn). Our own: Grave Venerations (opponents lose 1, we gain 1), Dictate of Erebos (opponents sacrifice a creature), Spinner of Souls (a creature to hand), Meren's experience, Avacyn (back at the end step).
- **Haste, trample, size:** Lavaleaper (haste for all, and basic lands make one more mana), Anger and Brawn in the graveyard (with a Mountain / Forest), Garruk's Uprising (trample, draw on a creature with power 4), Rhythm of the Wild (riot: haste for power 4 or more, else a counter), Pyrewood Gearhulk (+2/+2 for the others), Zopandrel (doubles our creatures from the beginning of combat; it and Selvala make mana).
- **Goad:** Kardur on entering goads every opponent's creatures; Geode Rager's landfall goads the opponent with the most power.
- **Attack and enter triggers:** Archon of Cruelty (3 life from one opponent, we draw and gain 3), Alesha (counter, raid return at the end step), Raph & Mikey (a creature from the library joins the attack), Glissa Sunslayer (draw), Whip of Erebos (lifelink).
- **Value:** Grave Venerations (monarch: a card and a creature back at each end step), Professor Dellian Fel (each upkeep: +2 below 12 life, else 0), Neyith (upkeep draw), Indulgent Tormentor (the opponent pays 3), Meren's end step, Graveshifter, the engine's reanimation spells, ramp, draw and the Witnesses.
- Removal is held in a goldfish game; in a pod it answers (Assassin's Trophy, Chaos Warp and Deadly Rollick are in the engine's `answers.ts` now).

## Not modelled

Shredder's copies and "lose half their life" (a plain 5/5), Titan Hunter's end step damage (a plain 4/5), Archon of Cruelty's sacrifice and discard, Archfiend of Depravity's end step, Kardur's drain, Ares returning attackers, Neyith's pump and draw on blocks, Dellian Fel's loyalty and -3, Chainer, Whip of Erebos's reanimation, Black Market, Tortured Existence, Yavimaya Elder and Icetill Explorer's extras, Selvala's big mana, Zopandrel's sacrifice, Lavaleaper and Zopandrel on other players' turns, creature cards milled or discarded for Syr Konrad, Chaos Warp's top card, another player becoming the monarch, another player's graveyard.

## First numbers (2026-11-16)

- Goldfish, 2,000 games: win by turn 10 / 12 / 14: 5.5 / 36.7 / 70.8%, average turn 12.33 (29% no win by turn 14). First opponent dead by turn 10: 76%.
- Pod against three goldfish decks (1,000 games): 92.7% wins, round 13.05.
- Pod with Meren, Edgar and Helga (1,000 games): Thantis 19.2%, Meren 29.7%, Edgar 30.9%, Helga 20.1% (noise about 3 points). It is the slowest of the four to win (average round 9.41) and is out first in a quarter of the games.
