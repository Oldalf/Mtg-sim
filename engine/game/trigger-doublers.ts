/**
 * Effects that make triggered abilities trigger an additional time (rules 603.2d-e).
 * Panharmonicon: an artifact or creature entering makes our enter triggers trigger again.
 * Roaming Throne: each triggered ability of another creature of the chosen type triggers again
 * (the deck says which type: GameCore.roamingThroneType).
 * The engine counts; the deck runs its trigger that many times.
 */
import { hasCreatureType } from '../cards/cards';
import type { GameCore } from './game-core';
import { Permanent } from './game-types';

/** How many times a triggered ability of this permanent triggers (Roaming Throne). */
export function triggerCount(game: GameCore, permanent: Permanent): number {
  const chosenType = game.roamingThroneType();
  if (chosenType === null || !permanent.card.isCreature) return 1;
  if (!hasCreatureType(permanent.card, chosenType)) return 1;
  const thrones = game.battlefield.filter(
    (throne) => throne !== permanent && throne.card.name === 'Roaming Throne',
  ).length;
  return 1 + thrones;
}

/** How many times this permanent's enter trigger triggers (Roaming Throne and Panharmonicon). */
export function enterTriggerCount(
  game: GameCore,
  permanent: Permanent,
): number {
  const isArtifactOrCreature =
    permanent.card.isCreature || permanent.card.types.has('artifact');
  const panharmonicons = isArtifactOrCreature
    ? game.battlefield.filter((other) => other.card.name === 'Panharmonicon')
        .length
    : 0;
  return triggerCount(game, permanent) + panharmonicons;
}
