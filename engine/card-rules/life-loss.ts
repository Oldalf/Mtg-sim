/**
 * Cards that care about life being lost: the opponents' (doubled, given back to us, lost again) and ours (cards drawn).
 */
import type { CardRules } from './card-rules';

export const LIFE_LOSS: CardRules[] = [
  {
    names: ['Gray Merchant of Asphodel'],
    onEnter(game) {
      game.gainLife(game.drainEach(game.devotion('B')));
    },
  },
  {
    names: ['Bloodletter of Aclazotz'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: it doubles on every turn (the card: only during our turn).
    opponentLifeLossMultiplier() {
      return 2;
    },
  },
  {
    names: ['Exquisite Blood', 'Bloodthirsty Conqueror'],
    onOpponentLosesLife(game, _permanent, lost) {
      game.gainLife(lost);
    },
  },
  {
    names: ['Vilis, Broker of Blood'],
    onWeLoseLife(game, _permanent, amount) {
      game.draw(amount);
    },
  },
  {
    names: ['Archfiend of Despair'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: "your opponents can't gain life" is not modelled; the life they lost counts from
    // after our upkeep.
    onEndStep(game) {
      // each opponent loses the life it lost this turn, again
      for (let i = 0; i < game.life.length; i++) {
        const lostThisTurn =
          (game.opponentLifeAtTurnStart[i] ?? game.life[i]) - game.life[i];
        if (lostThisTurn > 0 && game.isOpponentAlive(i))
          game.damageOpponent(i, lostThisTurn);
      }
    },
  },
];
