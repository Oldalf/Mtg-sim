/**
 * Spells that deal damage to or drain the opponents. X comes with the cast (the mode 'x=N'); which opponents a
 * targeted spell hits is in its rule.
 */
import type { CardRules } from './card-rules';
import { xValueOf } from './draw-spells';

export const DAMAGE_SPELLS: CardRules[] = [
  {
    names: ['Exsanguinate'],
    resolve(game, _spell, howCast) {
      game.gainLife(game.drainEach(xValueOf(howCast)));
    },
  },
  {
    names: ['Crackle with Power'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: it targets only opponents, those with the most life first (never creatures or
    // planeswalkers).
    resolve(game, _spell, howCast) {
      const xValue = xValueOf(howCast);
      const targets = game.life
        .map((life, slot) => ({ life, slot }))
        .filter(({ slot }) => game.isOpponentAlive(slot))
        .sort((first, second) => second.life - first.life)
        .slice(0, xValue);
      for (const { slot } of targets) game.damageOpponent(slot, 5 * xValue);
    },
  },
];
