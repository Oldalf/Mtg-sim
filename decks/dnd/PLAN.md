# DnD (Hama Pashar, Ruin Seeker, William's deck): deck plan

Azorius blink and dungeons, bracket 2-3. A friend's deck, **pod-only** (Pontus, 2026-11-15). Run it with `npm run pod -- dnd ...`.

## Files

- `cards.ts`: names, `VALUE`, `BLINK_VALUE` (how much a second enter trigger is worth), `HOLD`, the tokens and the prepared spells. `game.ts`: `DndGame` (extends `CreatureDeckGame`). `candidates.ts`. `tests/dnd.test.ts`.

## How the deck wins (Pontus, 2026-11-15)

It blinks its enter and leave triggers, and with them ventures into the dungeon again and again: mostly Lost Mine of Phandelver (scry, tokens, drains, cards), and the Undercity through the initiative. It wins by combat.

## Simulation rules

- Win: every opponent at 0 life. Second measure: first opponent dead. Combat: the engine's.
- **The engine does** the dungeons (Lost Mine by default, the room worth the most), Hama Pashar and Dungeon Delver making rooms trigger again, the initiative (Undercellar Sweep, White Plume and Tomb of Horrors Adventurer, Sarevok's Tome; read from the card text, like "enters, venture"), the blink spells (Ephemerate with rebound, Daydream, Ghostly Flicker, Morningtide's Light, Lae'zel's Acrobatics), Panharmonicon and Starfield Vocalist, Peregrine Drake and Cloud of Faeries, Wall of Omens / Spirited Companion / Helpful Hunter, Solemn, the rocks.
- **Engine rules added with this deck:** a venture during the last room's ability (Throne of the Dead Three putting a venturing creature out) completes that dungeon and starts a new one; Theros gods aren't creatures below their devotion (Thassa, Ephara); Panharmonicon doubles Peregrine Drake's untap; Azorius Signet, Midnight Clock, Dungeon Map and Sarevok's Tome ({C}{C} with the initiative) are rocks; a Plains search; Day of Judgment is a pod wipe.
- **Enter triggers** run once per doubler. What a blink is worth (`BLINK_VALUE`): Peregrine Drake, the initiative cards and Agent of Treachery most, then the venture creatures, then the draw creatures; a token never; 2 more with Genku out. Blink spells are cast only for something worth 4 or more; Morningtide's Light and Lae'zel's Acrobatics only after combat.
- **Blink permanents:** Brago (combat damage: every nonland permanent worth it), Thassa (our end step), Oji (our second spell each turn), Airbender Ascension (a quest counter per creature entering; with four, a blink at our end step), Niko ({2},{T}: a nonlegendary creature until the end step), Skycoach Conductor (prepared: All Aboard for {U}; it comes back prepared).
- **Leave triggers:** Momo (a +1/+1 counter, or scry 2 without creatures), Genku (a Fox, a Moonfolk, a Rat, one of each a turn; its {3}{W}{U} counters after combat with three creatures).
- **Ventures:** Nadaar (enters or attacks; the others +1/+1 after a completed dungeon), Delver's Torch (equipped before combat on the best attacker), Yuan-Ti Malison and Midnight Pathlighter (combat damage), Dungeon Map ({3},{T}), Dungeon Descent ({4},{T}, tap a legendary creature, after combat), Cloister Gargoyle (+3/+0 and flying after a completed dungeon).
- **Draw:** Aether Channeler (a card; a Bird with six cards in hand), Emeritus of Ideation (prepared: Ancestral Recall for {U}; attacking with eight cards in the graveyard prepares it again), Ephara (a card at the next upkeep after a creature entered), Pensive Professor (increment; the mana spent is the spell's mana value), Djinni Windseer, Oji's scry, Niko's Shards ({2}, sacrifice: scry 1, draw), Windfall (with three cards or fewer in hand).
- **Ramp:** Land Tax, Knight of the White Orchid, Claim Jumper ("an opponent controls more lands": we can't see their lands, so the richest opponent is taken to have one land per turn, plus one from turn 3), Archaeomancer's Map (two Plains), Starfield Shepherd (a Plains while short of lands, else Momo), Rasputin (a 2/2 Knight per dream counter after combat).
- **Other:** Tomb of Horrors Adventurer copies our second spell each turn (twice after a completed dungeon; a permanent's copy is a token, none for a legendary one); White Plume Adventurer untaps a creature at each opponent's upkeep (all after a completed dungeon); Undercellar Sweep makes two attacking Soldiers when we attack with the initiative; Agent of Treachery takes an opponent's best permanent in a pod (as removal: we don't use what we take).
- Removal is held in a goldfish game; in a pod Path, Swords and Day of Judgment answer (the engine's `answers.ts`).

## Not modelled

Midnight Pathlighter counts our attackers as unblockable (legendary creatures could block them: most opponents have a legendary commander, so this overrates it); Mirrorweave, Reconnaissance, Avatar's Wrath and Component Pouch are not cast; Hullbreaker Horror is a plain 7/8; Rasputin's mana and the Goblins it gives the opponents; Airbender Ascension's airbend; Eccentric Apprentice's Bird; Thassa's tap ability; Displacer Beast's return to hand; Agent of Treachery's draw; Archaeomancer's Map's land drops; Midnight Clock's twelfth hour; Sarevok's Tome's free cast; warp (Starfield Vocalist, Starfield Shepherd); Niko's Shards becoming copies; Yuan-Ti Malison unblockable alone; Undercellar Sweep when the opponent we attack holds the initiative; Momo's Food; a blink on an opponent's turn returning at that player's end step (ours). The creature lands (Cave of the Frost Dragon, Hall of Storm Giants) only tap for mana, and the other lands are read from their text.

## First numbers (2026-11-16)

- Goldfish, 2,000 games: win by turn 8 / 10 / 12 / 14: 11.1 / 49.0 / 82.3 / 94.7%, average turn 10.50. First opponent dead by turn 10: 90%.
- Pod against three goldfish decks (`--set pod_race=true`, 1,000 games): 99.3% wins, round 10.69.
- Pod with Meren, Edgar and Helga (1,000 games, even = 25%, noise about 3 points): DnD 25.6%, Meren 32.6%, Edgar 24.2%, Helga 17.5%. DnD's average win round 9.09; it is out first in a quarter of the games.
