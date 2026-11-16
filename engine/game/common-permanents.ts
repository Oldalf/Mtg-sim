/**
 * Permanents whose rules hold in any deck: what they do when they enter, die or at our upkeep. The engine's default
 * onEnter / onDies / upkeep call these; a deck that overrides those hooks calls them where it wants them.
 * Which card to take (a land, a card from the graveyard) is the deck's choice (chooseLandToFetch, returnToHandValue).
 */
import type { GameCore } from './game-core';
import { Permanent } from './game-types';
import { fetchLand } from './land-search';
import { firstMax } from '../util/lists';
import {
  takesInitiativeOnEnter,
  ventureIntoDungeon,
  venturesOnEnter,
} from './dungeons';

/** The enter trigger of a common card. Returns false if the permanent has none here. */
export function enterTriggerOfCommonCard(
  game: GameCore,
  permanent: Permanent,
): boolean {
  // what the card's text says (any card): venture, take the initiative
  if (venturesOnEnter(permanent.card)) {
    ventureIntoDungeon(game);
    return true;
  }
  if (takesInitiativeOnEnter(permanent.card)) {
    game.takeInitiative();
    return true;
  }
  switch (permanent.card.name) {
    case 'Solemn Simulacrum':
      fetchLand(game, 'basic', true);
      return true;
    case 'Wood Elves':
      fetchLand(game, 'forest', false);
      return true;
    case 'Eternal Witness':
    case 'Timeless Witness':
      returnBestCardToHand(game);
      return true;
    // "When this creature enters, draw a card." (Baleful Strix draws in GameCore.enter)
    case 'Wall of Omens':
    case 'Spirited Companion':
    case 'Helpful Hunter':
      game.draw(1);
      return true;
    default:
      return false;
  }
}

/** The death trigger of a common card. Returns false if the permanent has none here. */
export function deathTriggerOfCommonCard(
  game: GameCore,
  permanent: Permanent,
): boolean {
  if (permanent.card.name !== 'Solemn Simulacrum') return false;
  game.draw(1);
  return true;
}

/** Upkeep triggers of common cards. */
export function upkeepOfCommonCards(game: GameCore): void {
  if (game.isOnBattlefield('Phyrexian Arena')) {
    game.draw(1);
    game.loseLife(1);
  }
}

/** Eternal Witness: the card in our graveyard we want most goes to our hand. */
function returnBestCardToHand(game: GameCore): void {
  if (!game.graveyard.length) return;
  const best = firstMax(game.graveyard, (card) => game.returnToHandValue(card));
  game.takeCardIfThere(best, 'graveyard');
  game.putCard(best, 'hand');
}
