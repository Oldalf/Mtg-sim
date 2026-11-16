# DnD (Hama Pashar, Ruin Seeker, William's deck): deck plan

Azorius blink and dungeons, bracket 2-3. A friend's deck, **pod-only** (Pontus, 2026-11-15). Run it with `npm run pod -- dnd ...`.

## Files

- `primer.txt`: the owner's primer, in the owner's own words (2026-11-16).
- `cards.ts`: names, `VALUE`, `BLINK_VALUE` (how much a second enter trigger is worth), `HOLD`, the tokens and the prepared spells. `game.ts`: `DndGame` (extends `CreatureDeckGame`). `candidates.ts`. `tests/dnd.test.ts`.

## How the deck wins (the primer)

Two ways, close to each other. Both control the board first: bounce the opponents' permanents (Hullbreaker Horror, Avatar's Wrath, Aether Channeler, Morningtide's Light) and blink our enter triggers again and again (Oji, Thassa, Brago, Kykar). Then:

- **Combat:** the creatures grow with +1/+1 counters (the dungeon rooms, Cathars' Crusade) and hit hard.
- **The Trap! room:** the Undercity's Trap! (an opponent loses 5 life), three times with Hama Pashar and Dungeon Delver, as often as the deck gets through the Undercity.

Lost Mine of Phandelver early ("bread and butter"), the Undercity in the mid and late game through the initiative. Hama Pashar comes down on turn 3 and does little alone; once the deck is deep in a dungeon the opponents go for her.

## From the primer (2026-11-16)

The list: the primer names Cathars' Crusade, Radiant Solar and Kykar, Zephyr Awakener, which were not in our list. The owner had cut Cloud of Faeries, Claim Jumper and Azorius Signet for them; `decklist.txt` now has them.

Card by card, against the simulation. **Modelled** = as the primer says; **new** = added with this task; **differently** = modelled, but not quite as played.

| Primer | Simulation |
|---|---|
| Hama Pashar on turn 3 | Modelled (the commander is the AI's first choice once it is castable). |
| Lost Mine early, Undercity later | Modelled: a venture enters Lost Mine; the initiative enters the Undercity (if we are in Lost Mine, the initiative moves on in Lost Mine, by the rules). |
| Run past the Trap! room | Modelled: the room choice goes Secret Entrance, Forge, **Trap!**, Archives, Throne of the Dead Three. Trap! hits the opponent closest to dying, once per room trigger (three with Hama Pashar and Dungeon Delver). |
| Arena's goad ("about to be hit for 25") | Not modelled (root `PLAN.md` task G6). Stash and Mine Tunnels (Treasure) are modelled. |
| Opponents remove Hama near the Undercity's end, Tomb of Horrors Adventurer on sight | Differently: the pod's removal takes the most valuable permanent. Hama (commander) is always first; Tomb of Horrors Adventurer and Brago next. Not tied to how deep in the dungeon we are. |
| Hullbreaker Horror bounces | **New** (pod): each spell we cast returns the opponents' best nonland permanent to hand (a commander to the command zone). Returning a spell, or our own permanent to cast again, is not modelled. |
| Aether Channeler bounces | **New** (pod): bounces an opponent's permanent worth 60 or more (a commander always) instead of drawing; else draws (a Bird with six cards in hand). |
| Avatar's Wrath | **New** (pod): cast at the start of the second main phase when behind on board (the pod's wipe rule: the strongest opponent has 10 power or more, and what we lose is at most half of that). Our strongest creature stays. Differently: the airbended creatures go back to hand (their {2} recast is a full one), ours too; "can't cast spells except from hand" is not modelled. |
| Morningtide's Light | **New**: its shield, all damage to us prevented until our next turn (a pod attack on us is fogged). Its blink of our creatures was modelled. Not modelled: exiling the opponents' creatures; casting it for the shield (the AI casts it for its blink value, after combat). |
| +1/+1 counters: rooms, Cathars' Crusade | Rooms modelled (Forge, Storeroom, Throne); Cathars' Crusade **new** (engine: `creature-enter-triggers.ts`; Panharmonicon and Starfield Vocalist double it). A blink now counts the counters it would lose against it. |
| Sarevok's Tome, Undercellar Sweep | Modelled. |
| Veteran Dungeoneer, Displacer Beast, Cloister Gargoyle | Modelled. Displacer Beast's return to hand is not. |
| Radiant Solar | **New**: ventures as it or another nontoken creature of ours enters (engine). Its "{W}, discard: venture, gain 3" is not modelled. |
| White Plume Adventurer | Modelled. (The primer says it ventures; the card takes the initiative, which ventures into the Undercity.) |
| Eccentric Apprentice | The venture is modelled; its Bird (an opponent's creature becomes a 1/1 at our combat) is not. |
| Nadaar, Tomb of Horrors Adventurer | Modelled (Tomb copies the second spell each turn, twice after a completed dungeon). |
| Yuan-Ti Malison | The venture is modelled; unblockable when attacking alone is not. |
| Midnight Pathlighter | **Fixed**: our creatures can only be blocked by legendary creatures (pod: a new engine evasion, `'legendary'`; goldfish: an opponent's legendary commander blocks our biggest ground creature). It used to count every attacker as unblockable. |
| Dungeon Map, Dungeon Descent | Modelled. |
| Hama Pashar, Dungeon Delver, Panharmonicon, Starfield Vocalist | Modelled (the engine's room and enter trigger doublers). |
| Kykar, Zephyr Awakener | **New**: each noncreature spell blinks another creature until the end step, or makes a 1/1 flying Spirit. Before combat it makes the Spirit unless the creature can't attack anyway. |
| Brago, Thassa, Airbender Ascension, Oji | Modelled. |
| Daydream (and its flashback), Ephemerate (rebound), Skycoach Conductor, Ghostly Flicker, Lae'zel's Acrobatics | Modelled. |
| Blink to dodge removal and wipes (Kykar, Lae'zel's Acrobatics, Ephemerate) | Not modelled: the pod has no way to answer an opponent's removal or wipe with a blink yet. Written as a task in the root `PLAN.md` (G14). |
| The opening hand | The primer says nothing about it: the engine's default rule stays. |

## Simulation rules

- Win: every opponent at 0 life. Second measure: first opponent dead. Combat: the engine's.
- **The engine does** the dungeons (Lost Mine by default, the room worth the most), Hama Pashar and Dungeon Delver making rooms trigger again, the initiative (Undercellar Sweep, White Plume and Tomb of Horrors Adventurer, Sarevok's Tome; read from the card text, like "enters, venture"), the blink spells (Ephemerate with rebound, Daydream, Ghostly Flicker, Morningtide's Light, Lae'zel's Acrobatics), Panharmonicon and Starfield Vocalist, Cathars' Crusade and Radiant Solar (`creature-enter-triggers.ts`), Peregrine Drake, Wall of Omens / Spirited Companion / Helpful Hunter, Solemn, the rocks.
- **Engine rules added with this deck:** a venture during the last room's ability (Throne of the Dead Three putting a venturing creature out) completes that dungeon and starts a new one; Theros gods aren't creatures below their devotion (Thassa, Ephara); Panharmonicon doubles Peregrine Drake's untap; Azorius Signet, Midnight Clock, Dungeon Map and Sarevok's Tome ({C}{C} with the initiative) are rocks; a Plains search; Day of Judgment is a pod wipe. With the primer: the `'legendary'` evasion (only legendary creatures block), Cathars' Crusade and Radiant Solar, the Arena's `bounceAllCreatures`, and `snipe` with a name for the log and a minimum value.
- **Enter triggers** run once per doubler. What a blink is worth (`BLINK_VALUE`): Peregrine Drake, the initiative cards and Agent of Treachery most, then the venture creatures, then the draw creatures; a token never; 2 more with Genku out; 1 less per +1/+1 counter it would lose. Blink spells are cast only for something worth 4 or more; Morningtide's Light and Lae'zel's Acrobatics only after combat.
- **Blink permanents:** Brago (combat damage: every nonland permanent worth it), Thassa (our end step), Oji (our second spell each turn), Kykar (each noncreature spell), Airbender Ascension (a quest counter per creature entering; with four, a blink at our end step), Niko ({2},{T}: a nonlegendary creature until the end step), Skycoach Conductor (prepared: All Aboard for {U}; it comes back prepared).
- **Leave triggers:** Momo (a +1/+1 counter, or scry 2 without creatures), Genku (a Fox, a Moonfolk, a Rat, one of each a turn; its {3}{W}{U} counters after combat with three creatures).
- **Ventures:** Nadaar (enters or attacks; the others +1/+1 after a completed dungeon), Radiant Solar, Delver's Torch (equipped before combat on the best attacker), Yuan-Ti Malison and Midnight Pathlighter (combat damage), Dungeon Map ({3},{T}), Dungeon Descent ({4},{T}, tap a legendary creature, after combat), Cloister Gargoyle (+3/+0 and flying after a completed dungeon).
- **Draw:** Aether Channeler (a card, or a bounce in a pod; a Bird with six cards in hand), Emeritus of Ideation (prepared: Ancestral Recall for {U}; attacking with eight cards in the graveyard prepares it again), Ephara (a card at the next upkeep after a creature entered), Pensive Professor (increment; the mana spent is the spell's mana value), Djinni Windseer, Oji's scry, Niko's Shards ({2}, sacrifice: scry 1, draw), Windfall (with three cards or fewer in hand).
- **Ramp:** Land Tax, Knight of the White Orchid ("an opponent controls more lands": we can't see their lands, so the richest opponent is taken to have one land per turn, plus one from turn 3), Archaeomancer's Map (two Plains), Starfield Shepherd (a Plains while short of lands, else Momo), Rasputin (a 2/2 Knight per dream counter after combat).
- **Control (a pod):** Hullbreaker Horror, Aether Channeler, Avatar's Wrath and Agent of Treachery (takes an opponent's best permanent, as removal: we don't use what we take), as in the table above; Path, Swords and Day of Judgment are the engine's answers (`answers.ts`). They are held in a goldfish game, and kept over spare lands at the discard to seven.
- **Other:** Tomb of Horrors Adventurer copies our second spell each turn (twice after a completed dungeon; a permanent's copy is a token, none for a legendary one); White Plume Adventurer untaps a creature at each opponent's upkeep (all after a completed dungeon); Undercellar Sweep makes two attacking Soldiers when we attack with the initiative; Morningtide's Light prevents damage to us until our next turn.

## Not modelled

Blink in answer to removal or a wipe (root `PLAN.md` G14); Arena's goad and the other rooms that hit an opponent's creature (G6); Mirrorweave, Reconnaissance and Component Pouch are not cast; Hullbreaker Horror returning spells or our own permanents; Avatar's Wrath's exile and {2} recast (counted as a bounce) and its "only from hand"; Morningtide's Light on the opponents' creatures; Rasputin's mana and the Goblins it gives the opponents; Airbender Ascension's airbend; Eccentric Apprentice's Bird; Thassa's tap ability; Displacer Beast's return to hand; Radiant Solar's discard ability; Agent of Treachery's draw; Archaeomancer's Map's land drops; Midnight Clock's twelfth hour; Sarevok's Tome's free cast; warp (Starfield Vocalist, Starfield Shepherd); Niko's Shards becoming copies; Yuan-Ti Malison unblockable alone; Undercellar Sweep when the opponent we attack holds the initiative; Momo's Food; a blink on an opponent's turn returning at that player's end step (ours; G5). The creature lands (Cave of the Frost Dragon, Hall of Storm Giants) only tap for mana, and the other lands are read from their text.

## Numbers

Before = the first build (2026-11-16, the old list); after = the primer's changes and the new list (2026-11-16).

| | Before | After |
|---|---|---|
| Goldfish (2,000 games): win by turn 8 / 10 / 12 / 14 | 11.1 / 49.0 / 82.3 / 94.7% | 14.7 / 57.1 / 87.5 / 96.3% |
| Goldfish: average win turn | 10.50 | 10.18 |
| Goldfish: first opponent dead by turn 10 | 89.9% | 91.8% |
| Pod with Meren, Edgar, Helga (1,000 games, even = 25%, noise about 3 points): DnD | 25.6% | 28.4% |
| Meren / Edgar / Helga | 32.3 / 24.3 / 17.8% | 30.9 / 24.8 / 15.9% |
| DnD's average win round | 9.08 | 9.41 |
| DnD out first | 25.1% | 27.1% |
| Removal the others take per game (Meren / Edgar / Helga; DnD's bounces count) | 0.24 / 0.53 / 0.22 | 0.62 / 1.05 / 0.47 |

The goldfish is faster although Midnight Pathlighter no longer makes everything unblockable: the three new cards (Cathars' Crusade above all) do more than the three cut. In the pod DnD wins a little more (within the noise) and a little later: the bounces slow the others down, and its own attacks meet more blockers.
