/**
 * Sacrifice outlets and "sacrifice one, get another" cards, as the engine plays them. The facts hold in any deck; what
 * to sacrifice, when, and which creature to fetch is the deck's choice (it picks and calls these):
 *   - free or cheap outlets: Yahenni (free, it only names the card), High Market ({T}), Evolutionary Leap ({G}, the next
 *     creature card of the library to the hand);
 *   - Birthing Pod-like abilities: Fiend Artisan (a creature of mana value X or less from the library) and Sidisi,
 *     Regent of the Mire (a creature card of mana value one more from the graveyard);
 *   - Promise of Aclazotz: at our end step sacrifice a non-Demon creature to populate; its adventure Foul Rebirth makes a
 *     4/3 flying Vampire Demon, and the card can then be cast from exile.
 */
import { CardDef, Cost, hasCreatureType, makeToken } from '../cards/cards';
import type { GameCore } from './game-core';
import { Permanent } from './game-types';

export const YAHENNI = 'Yahenni, Undying Partisan';
export const HIGH_MARKET = 'High Market';
export const EVOLUTIONARY_LEAP = 'Evolutionary Leap';
export const FIEND_ARTISAN = 'Fiend Artisan';
export const SIDISI_REGENT = 'Sidisi, Regent of the Mire';
export const PROMISE_OF_ACLAZOTZ = 'Promise of Aclazotz';
/** Foul Rebirth's token. */
export const VAMPIRE_DEMON = makeToken('Vampire Demon', 4, 3, 'white black', [
  'flying',
]);
const EVOLUTIONARY_LEAP_COST = Cost.parse('{G}');
const FOUL_REBIRTH_COST = Cost.parse('{2}{B}');

// ================================================================ outlets
/** High Market: {T}, sacrifice a creature: gain 1 life. */
export function sacrificeToHighMarket(
  game: GameCore,
  land: Permanent,
  creature: Permanent,
): boolean {
  if (land.tapped || !game.battlefield.includes(creature)) return false;
  land.tapped = true;
  game.sacrifice(creature);
  game.gainLife(1);
  game.say(HIGH_MARKET, ': sacrifice', creature.card);
  return true;
}

/** Evolutionary Leap: {G}, sacrifice a creature: reveal cards from the top until a creature card; it goes to the hand,
 *  the rest to the bottom. */
export function sacrificeToEvolutionaryLeap(
  game: GameCore,
  creature: Permanent,
): boolean {
  if (
    !game.battlefield.includes(creature) ||
    !game.pay(EVOLUTIONARY_LEAP_COST, false)
  )
    return false;
  game.sacrifice(creature);
  const revealed: CardDef[] = [];
  let found: CardDef | null = null;
  while (game.library.length && !found) {
    const [card] = game.takeTopCardsOfLibrary(1);
    if (card.isCreature) found = card;
    else revealed.push(card);
  }
  if (found) game.putCard(found, 'hand');
  for (const card of revealed) game.putCard(card, 'library');
  game.say(EVOLUTIONARY_LEAP, ': sacrifice', creature.card, 'for', found);
  return true;
}

// ================================================================ Birthing Pod-like
/** Fiend Artisan gets +1/+1 for each creature card in our graveyard. */
export function fiendArtisanBonus(
  game: GameCore,
  permanent: Permanent,
): number {
  return permanent.card.name === FIEND_ARTISAN
    ? game.graveyard.filter((card) => card.isCreature).length
    : 0;
}

/** Fiend Artisan's cost for X: {X}{B/G}, paid with black if we can, else green. Null when we can pay neither. */
export function fiendArtisanCost(game: GameCore, x: number): Cost | null {
  for (const colour of ['B', 'G'])
    if (game.canPay(Cost.parse(`{${x}}{${colour}}`), false))
      return Cost.parse(`{${x}}{${colour}}`);
  return null;
}

/** Fiend Artisan: {X}{B/G}, {T}, sacrifice another creature: put a creature card with mana value X or less from the
 *  library onto the battlefield (sorcery speed). The deck picks X, and the card among those it may take: it is chosen
 *  after the sacrifice, since the sacrificed creature's death triggers resolve first (Protean Hulk may take it). */
export function activateFiendArtisan(
  game: GameCore,
  artisan: Permanent,
  creature: Permanent,
  x: number,
  chooseCard: (choices: CardDef[]) => CardDef,
): boolean {
  const cost = fiendArtisanCost(game, x);
  if (
    !cost ||
    artisan.tapped ||
    artisan.sick ||
    creature === artisan ||
    !game.battlefield.includes(creature)
  )
    return false;
  game.pay(cost, false);
  artisan.tapped = true;
  game.sacrifice(creature);
  const choices = game.library.filter(
    (card) => card.isCreature && card.manaValue <= x,
  );
  const target = choices.length ? chooseCard(choices) : null;
  game.say(
    FIEND_ARTISAN,
    `(X = ${x}): sacrifice`,
    creature.card,
    'for',
    target,
  );
  if (target) {
    game.takeCard(target, 'library');
    game.shuffle();
    game.enter(target, 'library');
  }
  return true;
}

/** Sidisi, Regent of the Mire: {T}, sacrifice another creature with mana value X: return a creature card with mana
 *  value X + 1 from our graveyard to the battlefield (sorcery speed; the deck picks both). */
export function activateSidisi(
  game: GameCore,
  sidisi: Permanent,
  creature: Permanent,
  target: CardDef,
): boolean {
  if (
    sidisi.tapped ||
    sidisi.sick ||
    creature === sidisi ||
    !game.battlefield.includes(creature) ||
    !game.graveyard.includes(target) ||
    target.manaValue !== creature.card.manaValue + 1
  )
    return false;
  sidisi.tapped = true;
  game.sacrifice(creature);
  game.say(SIDISI_REGENT, ': sacrifice', creature.card, 'for', target);
  // the target was chosen on activation: if a death trigger moved it, the ability does nothing
  if (game.graveyard.includes(target)) game.reanimate(target);
  return true;
}

// ================================================================ Promise of Aclazotz
export function isDemon(card: CardDef): boolean {
  return hasCreatureType(card, 'Demon');
}

/** Promise of Aclazotz, at the beginning of our end step: sacrifice a non-Demon creature, then populate (a copy of our
 *  strongest creature token, if we have one). */
export function sacrificeToPromiseOfAclazotz(
  game: GameCore,
  creature: Permanent,
): boolean {
  if (isDemon(creature.card) || !game.battlefield.includes(creature))
    return false;
  game.sacrifice(creature);
  game.say(PROMISE_OF_ACLAZOTZ, ': sacrifice', creature.card);
  populate(game);
  return true;
}

/** Populate: a token copy of a creature token we control (the strongest). */
export function populate(game: GameCore): Permanent | null {
  const tokens = game.battlefield.filter(
    (permanent) => permanent.token && permanent.isCreature,
  );
  if (!tokens.length) return null;
  const strongest = tokens.reduce((best, token) =>
    game.power(token) > game.power(best) ? token : best,
  );
  return game.createTokens(strongest.card, 1)[0] ?? null;
}

/** Foul Rebirth (Promise of Aclazotz's adventure, an instant for {2}{B}): sacrifice a non-Demon creature for a 4/3
 *  flying Vampire Demon. The card goes to exile on its adventure, and can be cast from there later. */
export function castFoulRebirth(
  game: GameCore,
  card: CardDef,
  creature: Permanent,
): boolean {
  if (
    isDemon(creature.card) ||
    !game.battlefield.includes(creature) ||
    !game.hand.includes(card) ||
    !game.pay(game.effectiveCost(card, FOUL_REBIRTH_COST), true)
  )
    return false;
  game.takeCard(card, 'hand');
  game.sayEvent('cast', 'cast Foul Rebirth (adventure of', card, ')');
  game.podAnnounceCast(card);
  game.sacrifice(creature);
  game.createTokens(VAMPIRE_DEMON, 1);
  game.putCard(card, 'exile');
  game.cardsOnAdventure.push(card);
  return true;
}

/** Cast a card that is on an adventure in exile as its permanent half (Promise of Aclazotz). */
export function castFromAdventure(game: GameCore, card: CardDef): boolean {
  if (!game.cardsOnAdventure.includes(card) || !game.exile.includes(card))
    return false;
  if (!game.pay(game.effectiveCost(card), false)) return false;
  game.cardsOnAdventure.splice(game.cardsOnAdventure.indexOf(card), 1);
  game.takeCard(card, 'exile');
  game.spellsCast += 1;
  game.sayEvent('cast', 'cast from its adventure', card);
  game.podAnnounceCast(card);
  game.enter(card, 'exile');
  return true;
}
