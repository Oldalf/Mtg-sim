/**
 * Tokens whose rules the engine knows, so every deck makes the same one.
 * (makeToken / makeArtifactToken return the same definition for the same name and stats, so a deck's own
 * makeArtifactToken('Treasure') is this one too.)
 */
import { CardData, CardDef, makeArtifactToken, makeToken } from './cards';

/** "{T}, Sacrifice this token: Add one mana of any color." GameCore taps it only when lands and rocks fall short. */
export const TREASURE = makeArtifactToken('Treasure');

/** "{2}, Sacrifice this token: Draw a card." (Tireless Tracker makes them: engine/game/card-draw.ts.) */
export const CLUE = makeArtifactToken('Clue');

/** "Sacrifice this token: Add {C}." Spent like a Treasure: last. */
export const ELDRAZI_SPAWN = makeToken('Eldrazi Spawn', 0, 1);
/** Woe Strider's Goat. */
export const GOAT = makeToken('Goat', 0, 1, 'white');
/** A 2/2 black Zombie (Grave Titan). */
export const ZOMBIE = makeToken('Zombie', 2, 2, 'black');
/** A 1/1 white Vampire with lifelink (Legion's Landing, Baron Bertram Graywater, Elenda, Preacher of the Schism). */
export const LIFELINK_VAMPIRE = makeToken('Vampire', 1, 1, 'white', [
  'lifelink',
]);
/** A 2/2 black Zombie Druid (Teval, Teval's Judgment). */
export const ZOMBIE_DRUID = makeToken('Zombie Druid', 2, 2, 'black');
/** A 4/4 green Beast (Rampaging Baloths). */
export const BEAST = makeToken('Beast', 4, 4, 'green');

/** Desolation Twin's. */
export const ELDRAZI = makeToken('Eldrazi', 10, 10);
/** Ob Nixilis, the Ascended's. */
export const FLYING_ANGEL = makeToken('Angel', 4, 4, 'white', ['flying']);
/** Koma, World-Eater's. */
export const KOMAS_COIL = makeToken("Koma's Coil", 3, 3, 'blue');

/** Firebender Ascension's 2/2 red Soldier with firebending 1. */
export const FIREBENDING_SOLDIER = new CardDef(
  'Soldier',
  {
    name: 'Soldier',
    type_line: 'Token Creature — Soldier',
    power: '2',
    toughness: '2',
    keywords: ['Firebending'],
    oracle: 'Firebending 1',
    token: true,
  } as CardData,
  {
    name: 'Soldier',
    face: {
      power: 2,
      toughness: 2,
      colours: ['red'],
      keywords: ['firebending'],
    },
  },
);
/** Undercellar Sweep's, tapped and attacking. */
export const SOLDIER = makeToken('Soldier', 1, 1, 'white');
/** Genku, Future Shaper's three, one of each a turn. */
export const FOX = makeToken('Fox', 2, 2, 'white', ['vigilance']);
export const MOONFOLK = makeToken('Moonfolk', 1, 2, 'blue', ['flying']);
export const RAT = makeToken('Rat', 1, 1, 'black', ['lifelink']);
/** Aether Channeler's. */
export const FLYING_BIRD = makeToken('Bird', 1, 1, 'white', ['flying']);
/** Niko, Light of Hope's Shard: an enchantment token, "{2}, Sacrifice this token: Scry 1, then draw a card." */
export const SHARD = new CardDef('Shard', {
  name: 'Shard',
  type_line: 'Token Enchantment — Shard',
  token: true,
} as CardData);
