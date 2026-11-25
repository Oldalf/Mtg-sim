/**
 * Effects that make triggered abilities trigger an additional time (rules 603.2d-e).
 * Panharmonicon: an artifact or creature entering makes our enter triggers trigger again.
 * Starfield Vocalist: any permanent entering does.
 * Roaming Throne: each triggered ability of another creature of the chosen type triggers again
 * (the deck says which type: GameCore.chosenCreatureType).
 * The engine counts; the card-rules dispatchers run a trigger that many times.
 */
import { hasCreatureType } from '../cards/cards';
import type { GameCore } from './game-core';
import { Permanent } from './game-types';

/** How many times a triggered ability of this permanent triggers (Roaming Throne). */
export function triggerCount(game: GameCore, permanent: Permanent): number {
  if (!permanent.card.isCreature) return 1;
  let count = 1;
  for (const throne of game.battlefield) {
    if (throne === permanent || throne.card.name !== 'Roaming Throne') continue;
    const chosenType = game.chosenCreatureType(throne.card);
    if (chosenType !== null && hasCreatureType(permanent.card, chosenType))
      count++;
  }
  return count;
}

/** How many times this permanent's enter trigger triggers (Roaming Throne and Panharmonicon). */
export function enterTriggerCount(
  game: GameCore,
  permanent: Permanent,
): number {
  return triggerCountOnEnter(game, permanent, permanent);
}

/** How many times a triggered ability of `source` triggers on `entered` entering (its own enter trigger, or "whenever
 *  a creature you control enters"): Roaming Throne for the source, Panharmonicon and Starfield Vocalist for what
 *  entered. */
export function triggerCountOnEnter(
  game: GameCore,
  source: Permanent,
  entered: Permanent,
): number {
  const isArtifactOrCreature =
    entered.card.isCreature || entered.card.types.has('artifact');
  const panharmonicons = isArtifactOrCreature
    ? game.battlefield.filter((other) => other.card.name === 'Panharmonicon')
        .length
    : 0;
  // Starfield Vocalist: any permanent entering
  const vocalists = game.battlefield.filter(
    (other) => other.card.name === 'Starfield Vocalist',
  ).length;
  return triggerCount(game, source) + panharmonicons + vocalists;
}
