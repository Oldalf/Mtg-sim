# Fire Lord Azula (Friend 3's deck): deck plan

Grixis spells, bracket 4. A friend's deck, **pod-only** (Pontus, 2026-11-15). Run it with `npm run pod -- azula ...`.

## Files

- `cards.ts`: names, `VALUE`, `HOLD`, `FINISHERS`. `game.ts`: `AzulaGame` (extends `CreatureDeckGame`). `spells.ts`: what the deck's spells do. `combos.ts`: the ten combos. `candidates.ts`. `tests/azula.test.ts`.

## How the deck wins (Pontus, 2026-11-16)

Value engines, spells cast in combat while Azula attacks (she copies each one, her firebending pays for the first), free casts, and many infinite combos. The ten combos (Commander Spellbook, "Agni Kai") are listed in the root `PLAN.md` (B6). All ten count, with two conditions Pontus set:

- 4, 5, 8, 9 and 10 only make endless magecraft triggers: they count only with **Storm-Kiln Artist** out (its Treasures make the mana endless).
- A combo needs a **finisher it can reach**: Vivi Ornitier when the loop casts a spell each round, or endless mana and a finisher spell (Lightning Bolt, Kill! Maim! Burn!, Breath of Malfegor, Electrodominance, Torment of Hailfire, Scarring Memories) in hand, or in the library when the loop digs (Frantic Search loots, Jeska's Will with Azula out exiles, the Archmages draw). With red mana only (Jeska's Will, Mana Geyser), the finisher's other pips must be payable.

## Simulation rules

- Win: every opponent at 0 life. Second measure: first opponent dead. Combat: the engine's.
- **A combo** is found by `findComboWin` (each check: the pieces, the timing, the mana for the first round). It is not played round by round: the first round is paid, the log says what the loop makes and the finisher, and every opponent dies. In a pod it is a declared win (`winAttempt`): the others may counter one of its spells (or the finisher) or remove a piece (Storm-Kiln Artist, Prismari, Twinning Staff, Azula, Vivi); then the opponents' life goes back and the turn goes on.
- Jeska's Will counts the fullest opponent's hand; Mana Geyser the opponents' tapped lands (a pod: the real ones through the Arena; goldfish: `opp_hand` 7 and `opp_tapped_per_turn` 2.15 a turn, as Codie). Six cards or lands break even: no endless mana then (Vivi or Storm-Kiln Artist still win).
- **Azula attacks** (in a pod she must attack while we hold something to cast in combat). Her firebending 2 (the engine's) is in the pool, and the AI casts in combat what it held back in the first main phase: instants, flash cards, and with Leyline of Anticipation, High Fae Trickster, Valley Floodcaller or Wizards of Thay the rest too. Each spell is copied (a permanent's copy is a token, not a legendary one). A combo comes first. Sozin's Comet gives each attacker firebending 5; Firebender Ascension's Soldier has firebending 1 and the Ascension copies firebending from its fourth quest counter.
- **Copies and free casts:** Storm of Saruman (the second spell each turn; its copy of a legendary is kept), Prismari (storm), Twinning Staff (one more copy), Arcane Bombardment (the first instant or sorcery each turn: a random one from the graveyard is exiled, then each exiled card is cast again free), Mysterious Stranger (a pod: a random instant or sorcery from our graveyard cast free), Torrential Gearhulk (the best instant in our graveyard, cast free, then exiled). Free casts trigger what casting does (Azula copies them).
- **Engines:** Storm-Kiln Artist, Archmage Emeritus, Archmage of Runes, Veyran (the engine's `spell-copies.ts`), Vivi Ornitier (a noncreature spell: a +1/+1 counter and 1 damage to each opponent), Mindsplice Apparatus (an oil counter each upkeep, each one makes instants and sorceries cost {1} less), Wizards of Thay, Fated Firepower (damage to opponents +X), Ozai (mana we would lose becomes red), Rhystic Study and Phyrexian Arena (engine).
- **Equipment:** Lightning Greaves, Swiftfoot Boots and Whispersilk Cloak go on Azula (haste; shroud or hexproof against the pod's removal; the Cloak makes her unblockable).
- **Spells:** burn is cast in combat while Azula attacks (copied), when it kills, or late in a second main phase without Azula; draw spells (Big Score, Unexpected Windfall, Demand Answers, Frantic Search, Sea Gate Restoration, Jeska's Will with Azula out) for value; Waterlogged Teachings fetches the one card a combo still lacks. Thought Vessel, Decanter and Sea Gate Restoration: no maximum hand size.
- **Interaction** is held in a goldfish game; in a pod it answers (engine `answers.ts`): Counterspell, Mana Drain, Void Shatter, Force of Will (free by pitching a blue card and 1 life when we can't pay it), Fierce Guardianship (free with Azula out), Sink into Stupor (counted as a counter), Deadly Rollick, Kill! Maim! Burn!, Isildur's Fateful Strike, Untimely Malfunction, Snap; Necron Deathmark destroys a creature on entering.

## Not modelled

Reiterate, Reverberate and Narset's Reversal outside the combos (copying a burn or draw spell for value), Seething Song and Mana Geyser as plain rituals, Torment of Hailfire outside a combo, Kill! Maim! Burn!'s burn outside a combo, Electrodominance's free spell, Vivi's mana ability, Mirror Room // Fractured Realm (held), Callidus Assassin's copy (a plain body), Faerie Mastermind's draws, Deflecting Swat, Redirect Lightning, Vandalblast, Fire Nation Palace's firebending, Arena of Glory's exert, the life payment of Sink into Stupor and Sea Gate Restoration's lands, Leyline of Anticipation from the opening hand, Scarring Memories' sacrifice and discard, Ozai's flying and indestructible, Necron Deathmark's mill, Mysterious Stranger in a goldfish game (no other graveyards), Isildur's Fateful Strike needing a legendary creature.

## First numbers (2026-11-16)

- Goldfish, 2,000 games: win by turn 8 / 10 / 12 / 14: 8.3 / 20.6 / 40.8 / 63.5%, average turn 11.27 (37% no win by turn 14). First opponent dead by turn 10: 69%. A combo goes off in about 29% of games (500 seeds): mostly Mana Geyser and Jeska's Will with Reiterate (goldfish opponents hold 7 cards) and combo 7 (Azula + Narset's Reversal + Storm-Kiln Artist); the rest win by Azula's combat and burn.
- Pod against three goldfish decks (1,000 games): 84.6% wins, round 12.53.
- Pod with Meren, Edgar and Helga (1,000 games): Azula 5.7%, Meren 38.0%, Edgar 32.0%, Helga 24.2% (noise about 3 points). Azula is out first in 48% of games, around round 8: the creature decks kill her before her combos come together, and the real opponents seldom hold the 6+ cards Jeska's Will needs. Only 0.04 win attempts a game. `azula_attacks_to_cast=false` changed nothing (5.0%).
- **Likely underrated:** the AI only goes off when every piece and the whole first round's mana are there at once; it does not use Reiterate, Seething Song or Mana Geyser as plain ramp to reach a combo turn earlier, does not hold counterspells to protect a combo, and Vivi's mana is not modelled. A good pilot of a bracket 4 list would be faster.
