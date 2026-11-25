/**
 * Permanents: what they do when they enter, die or at our upkeep. Which card to take (a land, a card from the
 * graveyard) is the deck's choice (chooseLandToFetch, returnToHandValue).
 */
import type { CardDef } from '../cards/cards';
import type { GameCore } from '../game/game-core';
import { corpseAugurDies, CORPSE_AUGUR } from '../game/card-draw';
import { fetchLand } from '../game/land-search';
import { firstMax } from '../util/lists';
import type { CardRules } from './card-rules';

export const MASSACRE_WURM = 'Massacre Wurm';

export const PERMANENTS: CardRules[] = [
  {
    names: ['Solemn Simulacrum'],
    onEnter(game) {
      fetchLand(game, 'basic', true);
    },
    onDies(game, permanent) {
      game.draw(1, permanent.card.name);
    },
  },
  {
    names: ['Wood Elves'],
    onEnter(game) {
      fetchLand(game, 'forest', false);
    },
  },
  {
    names: ['Eternal Witness', 'Timeless Witness'],
    onEnter(game) {
      returnBestCardToHand(game);
    },
  },
  {
    names: [MASSACRE_WURM],
    onEnter(game) {
      // creatures your opponents control get -2/-2 until end of turn (its drain: engine/pod/pod-arena.ts)
      game.podShrinkCreatures(2, false, null, MASSACRE_WURM);
    },
  },
  {
    names: ['Mnemonic Wall'],
    onEnter(game) {
      returnBestCardToHand(game, (card) => card.isInstantOrSorcery);
    },
  },
  {
    // "When this creature enters, draw a card." (Baleful Strix draws in GameCore.enter)
    names: [
      'Wall of Omens',
      'Spirited Companion',
      'Helpful Hunter',
      'Elvish Visionary',
    ],
    onEnter(game, permanent) {
      game.draw(1, permanent.card.name);
    },
  },
  {
    names: [CORPSE_AUGUR],
    onDies(game, permanent) {
      corpseAugurDies(game, permanent);
    },
  },
  {
    names: ['Phyrexian Arena'],
    onUpkeep(game) {
      game.draw(1, 'Phyrexian Arena');
      game.loseLife(1);
    },
  },
];

/** Eternal Witness: the card in our graveyard we want most goes to our hand. */
function returnBestCardToHand(
  game: GameCore,
  isAllowed: (card: CardDef) => boolean = () => true,
): void {
  const allowed = game.graveyard.filter(isAllowed);
  if (!allowed.length) return;
  const best = firstMax(allowed, (card) => game.returnToHandValue(card));
  game.takeCardIfThere(best, 'graveyard');
  game.putCard(best, 'hand');
}
