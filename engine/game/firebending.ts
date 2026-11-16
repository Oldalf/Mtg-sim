/**
 * Firebending N: "Whenever this creature attacks, add N {R}. This mana lasts until end of combat." The engine's
 * combat adds it before the deck's attack triggers (onAttack), so the deck can spend it on spells during combat;
 * the pool empties when the turn moves on to the second main phase. Firebending a card gives for the turn (Sozin's
 * Comet, Fire Nation Palace) is the deck's: it knows what it cast.
 */
import { CardDef } from '../cards/cards';
import type { GameCore } from './game-core';
import { Permanent } from './game-types';

/** The N of a card's printed "Firebending N" (0 if it has none). */
export function printedFirebending(card: CardDef): number {
  const match = /\bFirebending (\d+)/i.exec(card.oracle);
  return match ? parseInt(match[1], 10) : 0;
}

/** The attackers' printed firebending: each one adds its {R}. */
export function addFirebendingMana(
  game: GameCore<unknown>,
  attackers: Permanent[],
): void {
  for (const attacker of attackers) {
    const amount = printedFirebending(attacker.card);
    if (amount === 0) continue;
    game.pool.R += amount;
    game.say(`  firebending ${amount}:`, attacker.card, `adds {R} x${amount}`);
  }
}
