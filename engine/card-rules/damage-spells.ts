/**
 * Spells that deal damage to or drain the opponents. X comes with the cast (the mode 'x=N'); which opponents a
 * targeted spell hits is in its rule.
 */
import type { GameCore } from '../game/game-core';
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
  {
    names: ['Lightning Bolt', 'Kill! Maim! Burn!'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: as a finisher it deals 3 to the opponent closest to dead (never a creature;
    // Kill! Maim! Burn!'s other modes are the pod's removal, answers.ts).
    resolve(game) {
      damageTargetOpponent(game, 3);
    },
  },
  {
    names: ['Electrodominance'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: X to the opponent closest to dead (never a creature); the free cast of a spell
    // with mana value X or less is not modelled.
    resolve(game, _spell, howCast) {
      damageTargetOpponent(game, xValueOf(howCast));
    },
  },
  {
    names: ['Breath of Malfegor'],
    resolve(game) {
      game.drainEach(5);
    },
  },
];

/** "Deals N damage to any target", at the opponent closest to dead. */
function damageTargetOpponent(game: GameCore, damage: number): void {
  const target = game.chooseTargetOpponent();
  if (target !== null) game.damageOpponent(target, damage);
}
