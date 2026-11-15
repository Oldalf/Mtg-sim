# Teval, the Balanced Scale (Friend 4's deck): deck plan

Sultai self-mill and graveyard value, a strong bracket 3 that its owner pilots poorly (Pontus, 2026-11-15). A friend's deck, **pod-only**. Run it with `npm run pod -- teval ...`.

## Files

- `cards.ts`: names, `VALUE`, `HOLD`, tokens, the Zombie check. `game.ts`: `TevalGame` (extends `CreatureDeckGame`). `candidates.ts`. `tests/teval.test.ts`.

## How the deck wins (Pontus, 2026-11-15)

It ramps with the commander and self-mill. Its wins usually come from Rise of the Dark Realms, or a value engine that makes many Zombies that attack.

## Simulation rules

- Win: every opponent at 0 life. Second measure: first opponent dead. Combat: the engine's.
- **Cards leaving our graveyard** (one trigger per event: a spell's resolution or one effect counts once): Teval makes a 2/2 Zombie Druid, Tormod a tapped 2/2 Zombie, Teval's Judgment draws a card (then a Zombie Druid; its Treasure is not used). Doubling Season and Parallel Lives double tokens; Doubling Season also counters.
- **Self-mill:** Teval's attack (mill 3, a land from the graveyard comes back tapped), Sidisi, Brood Tyrant (a Zombie when creatures are milled), Colossal Grave-Reaver (a milled creature comes back), Six (a milled land to hand), Lumra (mill 4, all lands back), Will of the Sultai, Ripples of Undeath (at upkeep here), Breach the Multiverse, Buried Alive.
- **Landfall:** Rampaging Baloths, Ob Nixilis, the Fallen, Tatyova, Aesi (its draw; not its extra land).
- **Graveyard value:** the engine's reanimation spells, Sheoldred, Whispering One, Meren (experience from our creatures dying), Muldrotha (a creature a turn from the graveyard), Oversold Cemetery, Phyrexian Reclamation, the Witnesses.
- **Other:** The Scarab God (each opponent loses one per Zombie at upkeep), Endless Ranks of the Dead, Nyxbloom Ancient (triple mana), Multani and Lumra's size, Beastmaster Ascension, Wonder (flying), Whip of Erebos (lifelink), Growth Spiral, Demonic and Vampiric Tutor.
- Removal, Cyclonic Rift, Damnation, Day's Undoing and Finale of Revelation are held in a goldfish game.

## Not modelled

The owner's misplays (the AI plays the list as built, so the numbers likely overrate it). Muldrotha's other permanent types and lands from the graveyard (Conduit of Worlds, Ancient Greenwarden and its doubled landfall), Underrealm Lich's draws, Gravecrawler from the graveyard, Whip of Erebos's and The Scarab God's activations, Lier's flashback, Lost Monarch, Sidisi, Undead Vizier's exploit, Wilhelt, Hedge Shredder, Millikin's mill, Midnight Clock, Takenuma and Boseiju's channel, Teval's Judgment's Treasure, another player's graveyard.

## First numbers (2026-11-15)

Goldfish, 2,000 games: win by turn 10 / 12 / 14: 70.0 / 91.7 / 97.0%, average turn 9.91. First opponent dead by turn 8: 71.7%.
