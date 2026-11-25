/** The triggers of Edgar's cards that are still the deck's own: Emeritus of Woe's prepared spell and Evereth's death
 *  (the others are engine card rules: engine/card-rules/). */
import { EVERETH } from './cards';
import type { EdgarGame } from './game';
import { Cost } from '../../engine/cards/cards';
import { Permanent, Zone } from '../../engine/game/game-types';

/** The enter effects of Edgar's own cards, after the engine's (EdgarGame.onEnter). */
export function onPermanentEntered(
  game: EdgarGame,
  permanent: Permanent,
  from: Zone,
): void {
  const wasCast = from === 'hand' || from === 'command';
  if (permanent.card.name === 'Emeritus of Woe' && wasCast)
    game.prepared.add(permanent);
}

/** The death effects of Edgar's own cards, after the engine's (EdgarGame.onDies). */
export function onPermanentDied(game: EdgarGame, dead: Permanent): void {
  if (dead.card.name !== EVERETH) return;
  // may pay {1}{B/R}: damage equal to its power to each opponent
  const power = game.power(dead);
  if (power > 0 && game.pay(Cost.parse('{1}{B/R}'), false)) {
    game.say('  Evereth deals', String(power), 'to each opponent');
    game.withDamageSource('explosion', () =>
      game.drainAllOpponents(power, false),
    );
  }
}
