/**
 * Cards that care about our creatures dying: drains, counters, Treasures and Spawn. Which opponent a drain or a ping
 * targets is the game's choice (chooseTargetOpponent); which card Carmen returns is the deck's (battlefieldValue).
 */
import * as C from '../cards/cards';
import { ELDRAZI_SPAWN, LIFELINK_VAMPIRE, TREASURE } from '../cards/tokens';
import type { GameCore } from '../game/game-core';
import type { Permanent } from '../game/game-types';
import { firstMax } from '../util/lists';
import type { CardRules } from './card-rules';

export const ARISTOCRATS: CardRules[] = [
  {
    // "Whenever this or another creature you control dies, target opponent loses 1 life and you gain 1 life."
    names: ['Blood Artist', 'Vengeful Bloodwitch'],
    onPermanentDies(game, _permanent, dead) {
      if (dead.card.isCreature) game.drainOne(1);
    },
  },
  {
    // "Whenever this or another creature or artifact you control dies, target opponent loses 1 life and you gain 1."
    names: ['Susurian Voidborn'],
    onPermanentDies(game, _permanent, dead) {
      if (dead.card.isCreature || dead.card.types.has('artifact'))
        game.drainOne(1);
    },
  },
  {
    names: ['Cruel Celebrant'],
    onPermanentDies(game, _permanent, dead) {
      if (dead.card.isCreature) game.drainAllOpponents(1);
    },
  },
  {
    names: ['Cordial Vampire'],
    onPermanentDies(game, _permanent, dead) {
      if (dead.card.isCreature) addCounterToEachVampire(game);
    },
  },
  {
    names: ['Elenda, the Dusk Rose'],
    onPermanentDies(_game, permanent, dead) {
      if (permanent !== dead && dead.card.isCreature) permanent.counters += 1;
    },
    onDies(game, permanent) {
      game.createTokens(LIFELINK_VAMPIRE, game.power(permanent));
    },
  },
  {
    names: ['Pitiless Plunderer'],
    onPermanentDies(game, permanent, dead) {
      if (permanent !== dead && dead.card.isCreature)
        game.createTokens(TREASURE);
    },
  },
  {
    names: ['Pawn of Ulamog'],
    onPermanentDies(game, _permanent, dead) {
      if (dead.card.isCreature && !dead.token) game.createTokens(ELDRAZI_SPAWN);
    },
  },
  {
    names: ['Carmen, Cruel Skymarcher'],
    onPermanentDies(game, permanent, dead) {
      if (game.isSacrificing && permanent !== dead) {
        permanent.counters += 1;
        game.gainLife(1);
      }
    },
    onAttacks(game, permanent) {
      // return a permanent card with mana value up to her power from the graveyard to the battlefield
      const power = game.power(permanent);
      const options = game.graveyard.filter(
        (card) =>
          card.land === null &&
          !card.isInstantOrSorcery &&
          card.manaValue <= power,
      );
      if (!options.length) return;
      const best = firstMax(options, (card) => game.battlefieldValue(card));
      game.takeCardIfThere(best, 'graveyard');
      game.enter(best, 'graveyard');
      game.say('  Carmen returns', best);
    },
  },
  {
    names: ['Mayhem Devil'],
    onPermanentDies(game) {
      // "whenever a player sacrifices a permanent": 1 damage to the opponent closest to dead
      if (!game.isSacrificing) return;
      const target = game.chooseTargetOpponent();
      if (target !== null) game.damageOpponent(target, 1);
    },
  },
];

/** Put a +1/+1 counter on each Vampire we control. */
export function addCounterToEachVampire(game: GameCore): void {
  for (const vampire of vampiresOf(game)) vampire.counters += 1;
}

function vampiresOf(game: GameCore): Permanent[] {
  return game
    .creatures()
    .filter((permanent) => C.hasCreatureType(permanent.card, 'Vampire'));
}
