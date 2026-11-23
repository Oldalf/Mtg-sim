import { TREASURE } from '../../engine/cards/tokens';
import { AGENT_OF_THE_IRON_THRONE, FOOD, SAGA, TOK } from './cards';
import { enterTriggerOfCommonCard } from '../../engine/game/common-permanents';
import type { SamFrodoGame } from './game';
import { Cost } from '../../engine/cards/cards';
import { Permanent, Zone } from '../../engine/game/game-types';
import { fetchLand } from '../../engine/game/land-search';
import { Answer } from '../../engine/game/answers';

/** Shire Shirriff's enter trigger in a pod: exile target creature an opponent controls. */
const SHIRRIFF_EXILE: Answer = {
  kind: 'removal',
  instant: false,
  hits: ['creature'],
  how: 'exile',
};

// ================================================================ entering
export function onPermanentEntered(
  game: SamFrodoGame,
  permanent: Permanent,
  _from: Zone,
): void {
  triggerOtherPermanents(game, permanent);
  tutorPartner(game, permanent);
  resolveOwnEnterTrigger(game, permanent);
}

/** Merry, Belladonna Took, Prosperous Innkeeper and Mentor of the Meek react to something entering. */
function triggerOtherPermanents(
  game: SamFrodoGame,
  permanent: Permanent,
): void {
  const card = permanent.card;
  if (
    card.types.has('artifact') &&
    !game.merryUsed &&
    game.battlefield.some(
      (other) =>
        other !== permanent && other.card.name === 'Merry, Warden of Isengard',
    )
  ) {
    game.merryUsed = true;
    game.makeTokens([TOK.soldier]);
  }
  if (
    permanent.token &&
    game.isOnBattlefield('Belladonna Took') &&
    game.belladonnaTriggers < 3
  ) {
    game.belladonnaTriggers++;
    if (game.belladonnaTriggers === 1) game.gainLife(1);
    else if (game.belladonnaTriggers === 2) game.draw(1);
    else for (const creature of game.creatures()) creature.counters += 1;
  }
  if (card.isCreature) {
    for (const other of game.battlefield)
      if (other !== permanent && other.card.name === 'Prosperous Innkeeper')
        game.gainLife(1);
    if (game.power(permanent) <= 2 && game.phase !== 'main1')
      for (const other of game.battlefield)
        if (
          other !== permanent &&
          other.card.name === 'Mentor of the Meek' &&
          game.pay(new Cost(1))
        )
          game.draw(1);
  }
}

/** Partner with: Merry fetches Pippin from the library and the other way round. */
function tutorPartner(game: SamFrodoGame, permanent: Permanent): void {
  const name = permanent.card.name;
  const partner =
    name === 'Merry, Warden of Isengard'
      ? 'Pippin, Warden of Isengard'
      : name === 'Pippin, Warden of Isengard'
        ? 'Merry, Warden of Isengard'
        : null;
  if (!partner || permanent.token) return;
  const card = game.library.find((candidate) => candidate.name === partner);
  if (card) {
    game.takeCardIfThere(card, 'library');
    game.shuffle();
    game.putCard(card, 'hand');
    game.say('partner: tutor', card);
  }
}

/** The permanent's own enter trigger (tokens, Food, counters, the Saga's first chapter). */
function resolveOwnEnterTrigger(
  game: SamFrodoGame,
  permanent: Permanent,
): void {
  const card = permanent.card;
  const name = card.name;
  if (name === 'Cauldron Familiar') {
    game.drainEach(1);
    game.gainLife(1);
  } else if (name === 'Marionette Apprentice')
    game.makeTokens([TOK.servo]); // fabricate 1: a Servo (more fodder)
  else if (name === 'Marionette Master')
    permanent.counters += 3; // fabricate 3: counters (each artifact going away drains 4)
  else if (name === 'The Notary Hobbits' && !permanent.token)
    game.makeTokens([card, card]);
  else if (name === 'Prosperous Innkeeper') game.makeTokens([TREASURE]);
  else if (
    [
      'Gilded Goose',
      'Elanor Gardner',
      'Unlucky Cabbage Merchant',
      'Cat Collector',
      'Rosie Cotton of South Lane',
    ].includes(name)
  )
    game.makeTokens([FOOD]);
  else if (name === 'Farmer Cotton') {
    const xValue = game.farmerCottonX;
    game.makeTokens([
      ...new Array(xValue).fill(TOK.halfling),
      ...new Array(xValue).fill(FOOD),
    ]);
  } else if (name === 'Shire Shirriff') {
    if (game.inArena()) {
      // a pod: sacrifice a token to exile the best creature an opponent controls (it stays exiled: Shirriff leaving
      // the battlefield doesn't bring it back here)
      const token = game.spareSacrifices().find((candidate) => candidate.token);
      if (token) {
        game.sacrifice(token);
        game.arena!.snipe(game, SHIRRIFF_EXILE, 'Shire Shirriff');
      }
      return;
    }
    const token = game
      .spareSacrifices()
      .find(
        (candidate) => candidate.token && game.sacrificeValue(candidate) >= 3,
      );
    if (token) game.sacrifice(token);
  } else if (name === SAGA) {
    permanent.counters = 1;
    const target = game.bestCounterTarget();
    if (target) target.counters += 1;
    game.makeTokens([FOOD]);
  } else if (!permanent.token) enterTriggerOfCommonCard(game, permanent); // Eternal Witness
}

/** Put into the graveyard from the battlefield (sacrificed, destroyed; tokens too). */
export function onPermanentDied(
  game: SamFrodoGame,
  permanent: Permanent,
): void {
  const art = permanent.card.types.has('artifact'),
    cre = permanent.card.isCreature;
  if (!art && !cre) return;
  for (const battlefieldPermanent of game.battlefield.slice()) {
    const name = battlefieldPermanent.card.name;
    if (name === 'Marionette Apprentice') game.drainEach(1);
    else if (name === 'Marionette Master' && art)
      game.drainTargetOpponent(game.power(battlefieldPermanent));
    else if (name === 'Susurian Voidborn') {
      game.drainTargetOpponent(1);
      game.gainLife(1);
    } else if (name === AGENT_OF_THE_IRON_THRONE) {
      const commanders = game.commandersOnBattlefield();
      if (commanders > 0) game.drainEach(commanders);
    }
  }
  if (permanent.card.name === 'Susurian Voidborn') {
    game.drainTargetOpponent(1);
    game.gainLife(1);
  }
  if (permanent.card.name === 'Rapacious Guest')
    game.drainTargetOpponent(game.power(permanent));
}

export function onFoodSacrificed(game: SamFrodoGame): void {
  game.foodSacrificedThisTurn = true;
  for (const permanent of game.battlefield.slice()) {
    const name = permanent.card.name;
    if (name === 'Nuka-Cola Vending Machine')
      game.makeTokens([TREASURE], { tapped: true });
    else if (name === 'Rapacious Guest') permanent.counters += 1;
    else if (
      name === 'Unlucky Cabbage Merchant' &&
      game.landsOnBattlefield().length < 7 &&
      game.battlefield.includes(permanent)
    ) {
      if (fetchLand(game, 'basic', true)) {
        game.takeFromBattlefieldIfThere(permanent);
        game.putCard(permanent.card, 'library');
      }
    }
  }
}
