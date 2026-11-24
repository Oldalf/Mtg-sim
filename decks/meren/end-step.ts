/**
 * Meren's end step: which creatures to sacrifice to feed her (tokens, creatures whose death is worth something, the
 * Gray Merchant and D'Ghor Bloodletter loops, Greater Good, Promise of Aclazotz, the fodder rule), and the creature card
 * she returns. MerenGame's feedMerenAtEndStep and merenReturnScore call these.
 */
import type { MerenGame } from './game';
import {
  DEATH_VALUE,
  DGHOR_BLOODLETTER,
  ENTER_AGAIN,
  FREE_OUTLETS,
  GRAY_MERCHANT,
  SHRINK_KILLS_AT_LEAST,
} from './cards';
import { keepsJunjiForOpponentsTurn } from './opponents-turns';
import { JUNJI } from './junji';
import {
  PROMISE_OF_ACLAZOTZ,
  isDemon,
  sacrificeToPromiseOfAclazotz,
} from '../../engine/game/sacrifice-outlets';
import { CardDef } from '../../engine/cards/cards';
import {
  GREATER_GOOD,
  sacrificeToGreaterGood,
} from '../../engine/game/card-draw';
import { Permanent } from '../../engine/game/game-types';
import { firstMax } from '../../engine/util/lists';

/** How much Meren wants to return this card at her end step with this much experience: its value when it comes back
 *  to the battlefield, much less when it can only go to the hand. */
export function scoreForMerenToReturn(
  game: MerenGame,
  card: CardDef,
  experience: number,
): number {
  if (card.manaValue > experience) return game.battlefieldValue(card) * 0.4;
  if (
    card.name === DGHOR_BLOODLETTER &&
    game.podCreaturesShrinkWouldKill(1) >= SHRINK_KILLS_AT_LEAST
  )
    return 1000; // a pod: wipes the wide board
  return game.battlefieldValue(card);
}

/** Fodder (Pontus, 2026-11-24): one creature sacrificed at Meren's end step when the experience counter of its death
 *  is free. Either she returns it at once (its mana value is at most her experience after its death, and nothing in
 *  the graveyard comes first): it is back, with its enter trigger again (Wood Elves, Satyr Wayfinder). Or its death
 *  lets her return a better card that would otherwise only go to the hand (mana value exactly her experience after
 *  the death, worth more than the creature). One a turn, since Meren returns one card. Off with --set
 *  end_step_fodder=0. */
function sacrificeOneMerenReturnsAtOnce(game: MerenGame): void {
  if (!game.hasOutletNow()) return;
  const experienceAfter = game.experienceCounters + 1;
  const graveyardCreatures = game.graveyard.filter((card) => card.isCreature);
  const bestInGraveyardAfter = graveyardCreatures.length
    ? firstMax(graveyardCreatures, (card) =>
        game.merenReturnScore(card, experienceAfter),
      )
    : null;
  const scoreAfter = bestInGraveyardAfter
    ? game.merenReturnScore(bestInGraveyardAfter, experienceAfter)
    : 0;
  // mana value exactly the new experience: before the death it could only have gone to the hand
  const unlocksBetterCard =
    bestInGraveyardAfter !== null &&
    bestInGraveyardAfter.manaValue === experienceAfter;
  const isFodder = (permanent: Permanent) =>
    !permanent.token &&
    !game.isStolen(permanent) &&
    !FREE_OUTLETS.includes(permanent.card.name) &&
    !(permanent.card.name === JUNJI && keepsJunjiForOpponentsTurn(game));
  const comesBackAtOnce = (permanent: Permanent) =>
    permanent.card.manaValue <= experienceAfter &&
    game.merenReturnScore(permanent.card, experienceAfter) >= scoreAfter;
  const isWorthLessThanUnlocked = (permanent: Permanent) =>
    unlocksBetterCard &&
    game.battlefieldValue(permanent.card) <
      game.battlefieldValue(bestInGraveyardAfter);
  const choices = game
    .sacrificeOrder()
    .filter(
      (permanent) =>
        isFodder(permanent) &&
        (comesBackAtOnce(permanent) || isWorthLessThanUnlocked(permanent)),
    );
  const choice =
    choices.find(
      (permanent) =>
        comesBackAtOnce(permanent) && ENTER_AGAIN.has(permanent.card.name),
    ) ?? choices[0];
  if (!choice) return;
  game.say('sacrifice', choice.card, 'to feed Meren at once');
  game.sacrificeToOutlet(choice);
}

/** Feed Meren with a free sacrifice outlet, then return the best creature card from the graveyard. */
export function feedMeren(game: MerenGame): void {
  // Greater Good: a big creature Meren can return now, for cards and a full graveyard
  const toGreaterGood = game.isOnBattlefield(GREATER_GOOD)
    ? game.chooseGreaterGoodSacrifice()
    : null;
  if (toGreaterGood) sacrificeToGreaterGood(game, toGreaterGood);
  usePromiseOfAclazotz(game);
  // sacrifice tokens and creatures whose death is worth something: each one is an experience counter
  for (const permanent of game.sacrificeOrder()) {
    if (
      game.isStolen(permanent) ||
      FREE_OUTLETS.includes(permanent.card.name) ||
      (permanent.card.name === JUNJI && keepsJunjiForOpponentsTurn(game))
    )
      continue;
    if (permanent.token || DEATH_VALUE.has(permanent.card.name))
      if (!game.sacrificeToOutlet(permanent)) break;
  }
  // the Gray Merchant loop: sacrifice it and let Meren bring it back (drain again)
  const grayMerchant = game.findPermanent(GRAY_MERCHANT);
  if (grayMerchant && !grayMerchant.token && game.experienceCounters + 1 >= 5)
    game.sacrificeToOutlet(grayMerchant);
  // a pod: sacrifice D'Ghor Bloodletter so Meren brings it back for a second -1/-1 (it stacks game turn)
  const bloodletter = game.findPermanent(DGHOR_BLOODLETTER);
  if (
    bloodletter &&
    !bloodletter.token &&
    game.experienceCounters + 1 >= bloodletter.card.manaValue &&
    game.podCreaturesShrinkWouldKill(1) >= SHRINK_KILLS_AT_LEAST
  )
    game.sacrificeToOutlet(bloodletter);
  if (game.config.end_step_fodder !== 0) sacrificeOneMerenReturnsAtOnce(game);
  const candidates = game.graveyard.filter((card) => card.isCreature);
  if (!candidates.length) return;
  const best = firstMax(candidates, (card) =>
    game.merenReturnScore(card, game.experienceCounters),
  );
  if (best.manaValue <= game.experienceCounters) {
    game.say(`Meren (${game.experienceCounters} experience) returns`, best);
    game.reanimate(best);
  } else {
    game.takeCardIfThere(best, 'graveyard');
    game.putCard(best, 'hand');
    game.merenReturnsToHand++;
    game.say(
      `Meren (${game.experienceCounters} experience) returns to hand`,
      best,
    );
  }
}

/** Promise of Aclazotz at our end step: sacrifice a token or a creature whose death is worth something (not a
 *  Demon), then populate. A nontoken one first, so the token copy has a token to copy. */
function usePromiseOfAclazotz(game: MerenGame): void {
  if (!game.isOnBattlefield(PROMISE_OF_ACLAZOTZ)) return;
  const choices = game
    .sacrificeOrder()
    .filter(
      (permanent) =>
        !game.isStolen(permanent) &&
        !FREE_OUTLETS.includes(permanent.card.name) &&
        !isDemon(permanent.card) &&
        (permanent.token || DEATH_VALUE.has(permanent.card.name)),
    );
  const choice =
    choices.find((permanent) => !permanent.token) ?? choices[0] ?? null;
  if (choice) sacrificeToPromiseOfAclazotz(game, choice);
}
