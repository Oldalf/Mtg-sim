import { FOOD, TOK } from './cards';
import type { SamFrodoGame } from './game';
import {
  deathTriggerOfCommonCard,
  ourPermanentDiesTriggerOf,
} from '../../engine/card-rules/card-rules';
import { Permanent } from '../../engine/game/game-types';

const SUSURIAN_VOIDBORN = 'Susurian Voidborn';

/** Farmer Cotton's enter trigger: X Halflings and X Foods (X is the deck's: game.farmerCottonX while it enters). */
export function farmerCottonEnters(game: SamFrodoGame): void {
  const xValue = game.farmerCottonX;
  game.createTokenGroup([
    ...new Array(xValue).fill(TOK.halfling),
    ...new Array(xValue).fill(FOOD),
  ]);
}

/** Put into the graveyard from the battlefield (sacrificed, destroyed; tokens too): our other permanents' death
 *  triggers in battlefield order, then the dead one's own (Susurian Voidborn's "this or another" is its death trigger
 *  for itself), as Sam & Frodo always had it. */
export function onPermanentDied(
  game: SamFrodoGame,
  permanent: Permanent,
): void {
  for (const battlefieldPermanent of game.battlefield.slice())
    ourPermanentDiesTriggerOf(game, battlefieldPermanent, permanent);
  if (permanent.card.name === SUSURIAN_VOIDBORN)
    ourPermanentDiesTriggerOf(game, permanent, permanent);
  else deathTriggerOfCommonCard(game, permanent);
}
