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
 *  triggers in battlefield order, then the dead one's own. Susurian Voidborn is still the deck's (Edgar codes it too:
 *  U1b step 3); the engine's triggers run in the same loop, so the order stays the battlefield's. */
export function onPermanentDied(
  game: SamFrodoGame,
  permanent: Permanent,
): void {
  const isArtifactOrCreature =
    permanent.card.types.has('artifact') || permanent.card.isCreature;
  for (const battlefieldPermanent of game.battlefield.slice()) {
    if (battlefieldPermanent.card.name !== SUSURIAN_VOIDBORN)
      ourPermanentDiesTriggerOf(game, battlefieldPermanent, permanent);
    else if (isArtifactOrCreature) susurianVoidbornDrains(game);
  }
  if (permanent.card.name === SUSURIAN_VOIDBORN) susurianVoidbornDrains(game);
  else deathTriggerOfCommonCard(game, permanent);
}

function susurianVoidbornDrains(game: SamFrodoGame): void {
  game.drainTargetOpponent(1);
  game.gainLife(1);
}
