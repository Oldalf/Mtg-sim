/**
 * Cards with attack triggers: a creature's own ("whenever this attacks") and our permanents' "whenever you attack".
 */
import { LIFELINK_VAMPIRE } from '../cards/tokens';
import { addCounterToEachVampire } from './aristocrats';
import type { CardRules } from './card-rules';

export const LEGIONS_LANDING = "Legion's Landing";

export const ATTACK_TRIGGERS: CardRules[] = [
  {
    names: ['Edgar Markov'],
    onAttacks(game) {
      addCounterToEachVampire(game);
    },
  },
  {
    names: ['Preacher of the Schism'],
    onAttacks(game) {
      // a Vampire when we attack the player with the most life (we assume the opponent with the most life), a card
      // (and 1 life) when we have the most life
      const mostOpponentLife = Math.max(...game.life);
      if (mostOpponentLife >= game.myLife) game.createTokens(LIFELINK_VAMPIRE);
      if (game.myLife >= mostOpponentLife) {
        game.draw(1);
        game.loseLife(1);
      }
    },
  },
  {
    names: ['Vampire Gourmand'],
    onAttacks(game, permanent) {
      // may sacrifice another creature (an untapped token) to draw a card
      const fodder = game
        .creatures()
        .find(
          (creature) =>
            creature !== permanent && creature.token && !creature.tapped,
        );
      if (!fodder) return;
      game.sacrifice(fodder);
      game.draw(1);
    },
  },
  {
    names: [LEGIONS_LANDING],
    onEnter(game) {
      game.createTokens(LIFELINK_VAMPIRE);
    },
    onWeAttack(game, permanent, attackers) {
      // becomes Adanto, the First Fort (a land that makes {W}) when we attack with three or more creatures
      if (attackers.length < 3 || permanent.transformed) return;
      permanent.transformed = true;
      game.say("  Legion's Landing transforms");
    },
  },
];
