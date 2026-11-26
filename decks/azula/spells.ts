/** What Azula's own instants and sorceries do when they resolve (a copy resolves the same way). The engine resolves
 *  the ones it knows (Frantic Search, Snap, Waterlogged Teachings, the burn and draw spells: engine/card-rules/); the additional costs (a discard, an artifact)
 *  are paid when the card is cast (candidates.ts), so a copy doesn't pay them. */
import {
  JESKAS_WILL,
  MANA_GEYSER,
  SCARRING_MEMORIES,
  SEETHING_SONG,
  SOZINS_COMET,
  TORMENT_OF_HAILFIRE,
} from './cards';
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
    case SEETHING_SONG:
      game.pool.R += 5;
      return true;
    case MANA_GEYSER:
      game.pool.R += game.opponentsTappedLands();
      return true;
    case JESKAS_WILL:
      jeskasWill(game);
      return true;
    case SOZINS_COMET:
      game.sozinsCometTurn = game.turn;
      return true;
    default:
      return false;
  }
}

/** Jeska's Will: {R} for each card in the fullest opponent's hand; with a commander out also the top three cards
 *  of the library, which we may play this turn (they go to hand and back to exile at the end of the turn). */
function jeskasWill(game: AzulaGame): void {
  game.pool.R += game.mostCardsInAnOpponentsHand();
  if (!game.controlsCommander()) return;
  for (const card of game.takeTopCardsOfLibrary(3)) {
    game.putCard(card, 'hand');
    game.cardsPlayableThisTurnOnly.push(card);
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
