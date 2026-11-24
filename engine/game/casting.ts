/**
 * Casting: an instant or sorcery (paid, announced, copied, maybe countered, resolved, then to the graveyard, exile or
 * rebound), a permanent spell (from hand or the command zone), rebound at our upkeep, flashback, Wishclaw Talisman,
 * transmute and cycling. GameCore's methods of the same names call these; every step calls the game's own methods, so
 * a deck's overrides (effectiveCost, pay, resolve, castTriggers, enter...) run as before.
 */
import * as C from '../cards/cards';
import { CardDef, Cost } from '../cards/cards';
import type { GameCore } from './game-core';
import {
  castInstantOrSorceryTriggers,
  copyNextInstantOrSorcery,
  EXILES_ITSELF,
} from './spell-copies';

/** Pays for the spell, casts it from hand or graveyard and resolves it. False when it can't be paid. */
export function castAndResolveInstantOrSorcery(
  game: GameCore,
  card: CardDef,
  fromGraveyard: boolean,
  base: Cost | null,
  mode: string | null,
  triggerOptions: Record<string, unknown>,
): boolean {
  const cost = game.effectiveCost(card, base, fromGraveyard);
  if (!game.pay(cost, true)) return false;
  game.takeCard(card, fromGraveyard ? 'graveyard' : 'hand');
  if (card.isSorcery) game.nextSorceryHasFlash = false; // Quicken's flash is for one sorcery
  game.sayEvent(
    'cast',
    'cast',
    card,
    fromGraveyard ? '(from graveyard)' : '',
    mode ? `[${mode}]` : '',
  );
  game.spellsCast += 1;
  game.onCastInstantOrSorcery(fromGraveyard);
  game.castTriggers(card, fromGraveyard, triggerOptions);
  copyNextInstantOrSorcery(game, card, mode);
  game.podAnnounceCast(card);
  if (game.podCounters(card)) {
    game.putCard(card, fromGraveyard ? 'exile' : 'graveyard');
    return true;
  }
  game.resolve(card, fromGraveyard, mode);
  if (!fromGraveyard && card.keywords.has('rebound')) {
    // rebound: exiled as it resolves, cast again for free at our next upkeep
    game.putCard(card, 'exile');
    game.reboundCards = [...game.reboundCards, card];
  } else
    game.putCard(
      card,
      fromGraveyard || EXILES_ITSELF.has(card.name) ? 'exile' : 'graveyard',
    );
  return true;
}

/** Rebound: at our upkeep, the cards exiled with rebound are cast again for free, then go to the graveyard. */
export function castCardsExiledWithRebound(game: GameCore): void {
  const rebounding = game.reboundCards;
  if (!rebounding.length) return;
  game.reboundCards = [];
  for (const card of rebounding) {
    if (!game.exile.includes(card)) continue;
    game.takeCard(card, 'exile');
    game.sayEvent('cast', 'cast', card, '(rebound, free)');
    game.spellsCast += 1;
    game.onCastInstantOrSorcery(false);
    copyNextInstantOrSorcery(game, card, null);
    game.podAnnounceCast(card);
    game.resolve(card);
    game.putCard(card, 'graveyard');
  }
}

/** What casting any instant or sorcery triggers: the engine's cast triggers, Academy Wall, Secrets of the Dead (from
 *  the graveyard) and a solved Case of the Ransacked Lab. */
export function triggerOnInstantOrSorceryCast(
  game: GameCore,
  fromGraveyard: boolean,
): void {
  game.isCast += 1;
  castInstantOrSorceryTriggers(game);
  for (const permanent of game.battlefield.slice()) {
    const cardName = permanent.card.name;
    if (cardName === 'Academy Wall' && !game.wallUsed) {
      game.wallUsed = true;
      game.draw(1);
      game.discard(1);
    } else if (cardName === 'Secrets of the Dead' && fromGraveyard)
      game.draw(1);
  }
  if (game.caseSolved && game.isOnBattlefield('Case of the Ransacked Lab'))
    game.draw(1);
}

/** Pays for a permanent spell (a commander with its tax) and puts it onto the battlefield, unless it is countered. */
export function castPermanentSpell(
  game: GameCore,
  card: CardDef,
  fromCommand: boolean,
): boolean {
  let cost = game.effectiveCost(card);
  if (fromCommand) cost = game.commanderCost(card, cost);
  if (!game.pay(cost, false)) return false;
  if (fromCommand) {
    game.takeCard(card, 'command');
    game.commandCasts.push(card.name);
    game.onCommanderCast(card);
  } else game.takeCard(card, 'hand');
  game.spellsCast += 1;
  game.sayEvent('cast', 'cast', card);
  game.podAnnounceCast(card);
  if (game.podCounters(card)) {
    // countered: a commander goes back to the command zone (its tax still counts this cast)
    game.putCard(card, fromCommand ? 'command' : 'graveyard');
    return true;
  }
  game.enter(card);
  return true;
}

export function castWithFlashback(game: GameCore, card: CardDef): boolean {
  if (!game.pay(game.effectiveCost(card, new Cost(1, 1), true), true))
    return false;
  game.takeCard(card, 'graveyard');
  game.myLife -= 3;
  game.sayEvent('cast', 'flashback', card);
  game.spellsCast += 1;
  game.onCastInstantOrSorcery(true);
  copyNextInstantOrSorcery(game, card, null);
  game.podAnnounceCast(card);
  game.resolve(card, true);
  game.putCard(card, 'exile');
  return true;
}

export function castAndActivateWishclaw(
  game: GameCore,
  card: CardDef,
): boolean {
  if (!game.pay(game.effectiveCost(card).plus(new Cost(1)), false))
    return false;
  game.takeCard(card, 'hand'); // it goes to an opponent
  game.say('Wishclaw Talisman (cast + activate)');
  game.podAnnounceCast(card);
  game.doTutor(() => true, false);
  return true;
}

export function transmuteCard(game: GameCore, card: CardDef): boolean {
  if (!game.pay(new Cost(1, 2), false)) return false;
  game.moveCard(card, 'hand', 'graveyard');
  game.say('transmute', card.name);
  game.doTutor(
    (otherCard) =>
      otherCard.manaValue === card.manaValue && otherCard.land === null,
    false,
  );
  return true;
}

/** Cycling: pay its cost ("Cycling {2}" in the text; {2} if the text doesn't say), discard it, draw a card. */
export function cycleCard(game: GameCore, card: CardDef): boolean {
  if (!game.pay(C.cyclingCost(card) ?? new Cost(2))) return false;
  game.moveCard(card, 'hand', 'graveyard');
  game.say('cycle', card);
  game.draw(1);
  return true;
}
