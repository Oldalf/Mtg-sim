/** What Azula's own instants and sorceries do when they resolve (a copy resolves the same way). The engine resolves
 *  the ones it knows (Frantic Search, Snap, Waterlogged Teachings, the burn and draw spells: engine/card-rules/); the additional costs (a discard, an artifact)
 *  are paid when the card is cast (candidates.ts), so a copy doesn't pay them. */
import { SCARRING_MEMORIES, SOZINS_COMET, TORMENT_OF_HAILFIRE } from './cards';
import type { AzulaGame } from './game';
import { CardDef } from '../../engine/cards/cards';

/** Resolves one of the deck's spells. Returns false if it isn't one. */
export function resolveAzulaSpell(game: AzulaGame, card: CardDef): boolean {
  switch (card.name) {
    case TORMENT_OF_HAILFIRE:
      tormentOfHailfire(game, game.chosenX);
      return true;
    case SCARRING_MEMORIES: {
      // (the sacrifice and the discard are not modelled)
      const target = game.chooseTargetOpponent();
      if (target !== null) game.opponentLosesLife(target, 3);
      return true;
    }
    case SOZINS_COMET:
      game.sozinsCometTurn = game.turn;
      return true;
    default:
      return false;
  }
}

/** Torment of Hailfire: X times, each opponent loses 3 life unless it sacrifices a nonland permanent or discards.
 *  Each opponent pays while it has cards and permanents to give (a goldfish opponent: config opp_hand). */
function tormentOfHailfire(game: AzulaGame, timesRepeated: number): void {
  for (let slot = 0; slot < game.life.length; slot++) {
    if (!game.isOpponentAlive(slot)) continue;
    const payments = game.cardsAndPermanentsOfOpponent(slot);
    const lifeLosses = Math.max(0, timesRepeated - payments);
    game.opponentLosesLife(slot, 3 * lifeLosses);
  }
}
