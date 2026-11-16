/**
 * Cards that trigger whenever a creature enters under our control (not the entering creature's own trigger):
 *   - Cathars' Crusade: a +1/+1 counter on each creature we control;
 *   - Radiant Solar: another nontoken creature entering ventures into the dungeon (its own entering is read from its
 *     text, like any "enters, venture": dungeons.ts).
 * The trigger doublers count by the permanent that entered (trigger-doublers.ts): the deck runs this once per trigger.
 * A deck that plays these cards calls it from its onEnter.
 */
import type { GameCore } from './game-core';
import { Permanent } from './game-types';
import { ventureIntoDungeon } from './dungeons';

export const CATHARS_CRUSADE = "Cathars' Crusade";
export const RADIANT_SOLAR = 'Radiant Solar';

/** A creature of ours entered: our cards that trigger on it. */
export function triggersOfCreatureEntering(
  game: GameCore,
  entering: Permanent,
): void {
  if (!game.isCreatureNow(entering)) return;
  for (let i = 0; i < game.countOnBattlefield(CATHARS_CRUSADE); i++)
    for (const creature of game.creatures()) creature.counters += 1;
  if (entering.token) return;
  for (const solar of game.battlefield)
    if (solar.card.name === RADIANT_SOLAR && solar !== entering)
      ventureIntoDungeon(game);
}
