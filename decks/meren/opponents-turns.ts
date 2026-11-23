/**
 * Meren on the other players' turns (Pontus's playtests, 2026-11-23): what a player does there at instant speed.
 * The engine calls opponentUpkeep and opponentEndStep for each opponent's turn (three per round in a goldfish game).
 *
 * - "Once each turn" abilities are fresh in every turn: Twilight Diviner and Morbid Opportunist.
 * - Ophiomancer makes a Snake in each upkeep; sacrificed in each end step, it is an experience counter for Meren every
 *   turn instead of once a round.
 * - Junji is sacrificed so it returns Gray Merchant, and Twilight Diviner copies it in that turn.
 * Off with --set opponents_turns=0 (the old play: nothing on the opponents' turns but the Snake).
 */
import {
  GRAY_MERCHANT,
  GREATER_GOOD_MIN_LIBRARY,
  MEREN,
  TOKENS,
} from './cards';
import type { MerenGame } from './game';
import { JUNJI, junjiDiscardWorth, junjiTargetWorth } from './junji';
import {
  GREATER_GOOD,
  sacrificeToGreaterGood,
} from '../../engine/game/card-draw';
import { Permanent } from '../../engine/game/game-types';

export function playsOnOpponentsTurns(game: MerenGame): boolean {
  return game.config.opponents_turns !== 0;
}

/** Another player's turn starts: our "once each turn" abilities can trigger again. */
export function resetOnceEachTurnAbilities(game: MerenGame): void {
  game.morbidUsed = game.divinerUsed = false;
}

/** At another player's end step: Junji for Gray Merchant, then the Snake. */
export function playAtOpponentsEndStep(game: MerenGame): void {
  const isJunjiSacrificed = sacrificeJunjiForGrayMerchant(game);
  const isSnakeSacrificed = sacrificeSnake(game);
  if (isJunjiSacrificed || isSnakeSacrificed) game.checkKill();
}

/** The Snake comes back at the next upkeep: sacrificed now, it is an experience counter (and a Morbid Opportunist card). */
function sacrificeSnake(game: MerenGame): boolean {
  const snake = game.battlefield.find(
    (permanent) => permanent.card === TOKENS.snake,
  );
  if (!snake || !game.findFreeSacrificeOutlet()) return false;
  const isWorthSomething =
    game.isOnBattlefield(MEREN) ||
    (game.isOnBattlefield('Morbid Opportunist') && !game.morbidUsed);
  if (!isWorthSomething) return false;
  game.sacrifice(snake);
  return true;
}

/**
 * Sacrifice Junji so it returns Gray Merchant (a drain, and a second one when Twilight Diviner copies it). Gray Merchant
 * on our battlefield goes first to a free outlet, so Junji brings it straight back. Junji goes to Greater Good when it
 * is out (5 cards), else to the free outlet; Meren can return it at our end step. Returns true when it was done.
 */
function sacrificeJunjiForGrayMerchant(game: MerenGame): boolean {
  const junji = game.findPermanent(JUNJI);
  if (!junji) return false;
  const freeOutlet = game.findFreeSacrificeOutlet();
  const canUseGreaterGood =
    game.isOnBattlefield(GREATER_GOOD) &&
    game.library.length >= GREATER_GOOD_MIN_LIBRARY;
  if (!freeOutlet && !canUseGreaterGood) return false;
  const grayInGraveyard = game.graveyard.find(
    (card) => card.name === GRAY_MERCHANT,
  );
  const grayOnBattlefield = game.battlefield.find(
    (permanent) => permanent.card.name === GRAY_MERCHANT && !permanent.token,
  );
  const grayCard = grayInGraveyard ?? grayOnBattlefield?.card;
  if (!grayCard) return false;
  if (junjiTargetWorth(game, grayCard) < junjiDiscardWorth(game)) return false;
  if (!grayInGraveyard) {
    if (!freeOutlet || !grayOnBattlefield) return false;
    game.say('sacrifice Gray Merchant so Junji returns it');
    game.sacrifice(grayOnBattlefield);
  }
  game.say("sacrifice Junji at the end of an opponent's turn");
  sacrificeJunji(game, junji, canUseGreaterGood);
  return true;
}

/** At our end step: keep Junji for an opponent's turn when Twilight Diviner has copied something this turn, so the
 *  Gray Merchant that Junji returns there is copied again. */
export function keepsJunjiForOpponentsTurn(game: MerenGame): boolean {
  return (
    playsOnOpponentsTurns(game) &&
    game.isOnBattlefield('Twilight Diviner') &&
    game.divinerUsed &&
    (game.graveyard.some((card) => card.name === GRAY_MERCHANT) ||
      game.isOnBattlefield(GRAY_MERCHANT))
  );
}

function sacrificeJunji(
  game: MerenGame,
  junji: Permanent,
  canUseGreaterGood: boolean,
): void {
  if (canUseGreaterGood) sacrificeToGreaterGood(game, junji);
  else game.sacrifice(junji);
}
