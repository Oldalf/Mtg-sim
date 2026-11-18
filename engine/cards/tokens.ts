/**
 * Tokens whose rules the engine knows, so every deck makes the same one.
 * (makeToken / makeArtifactToken return the same definition for the same name and stats, so a deck's own
 * makeArtifactToken('Treasure') is this one too.)
 */
import { makeArtifactToken, makeToken } from './cards';

/** "{T}, Sacrifice this token: Add one mana of any color." GameCore taps it only when lands and rocks fall short. */
export const TREASURE = makeArtifactToken('Treasure');

/** "{2}, Sacrifice this token: Draw a card." (Tireless Tracker makes them: engine/game/card-draw.ts.) */
export const CLUE = makeArtifactToken('Clue');

/** "Sacrifice this token: Add {C}." Spent like a Treasure: last. */
export const ELDRAZI_SPAWN = makeToken('Eldrazi Spawn', 0, 1);
