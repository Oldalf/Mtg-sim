/**
 * Gale's kill lines, played for real (see engine/game/kill-line.ts). Each step the search found (kill-moves.ts) is
 * played in the real game: every cost is paid with pay(), every card moves, and the effects on the opponents are
 * the search's own rules (KillSearchState), applied to the game's opponents.
 */
import * as C from '../../engine/cards/cards';
import { CardDef, Cost } from '../../engine/cards/cards';
import { GALE } from './roles';
import {
  COST_GUILDMAGE_DRAIN,
  COST_GUILDMAGE_MILL,
  COST_KONRAD_MILL,
  COST_MONUMENT,
  COST_MONUMENT_EXHAUST,
  OVERTURE_COST,
} from './kill-moves';
import { GaleAbility, GaleKillStep, OPPONENT_EVENT } from './kill-state';
import type { GaleGame } from './game';

const JIDOOR = 'Jidoor, Aristocratic Capital';
const GUILDMAGE = 'Duskmantle Guildmage';
const KONRAD = 'Syr Konrad, the Grim';
const MONUMENT = 'Riverchurn Monument';
const MINDSKINNER = 'The Mindskinner';
const EMET_SELCH = 'Emet-Selch of the Third Seat';

/** Plays one step of a kill line. Returns null when it was played, or why it could not be. */
export function playGaleKillStep(
  game: GaleGame,
  step: GaleKillStep,
): string | null {
  switch (step.kind) {
    case 'castPermanent':
      return castPermanentFromHand(game, step.card!);
    case 'ability':
      return activateAbility(game, step.ability!);
    case 'attack':
      return attackWithMindskinner(game);
    case 'castSpell':
      return castSpellFromHand(game, step);
    case 'emetSelch':
      return castWithEmetSelch(game, step.card!, step.variant!);
    case 'selfCounter':
      return castAndCounterOwnSpell(game, step);
  }
}

function cardInHand(game: GaleGame, name: string): CardDef | undefined {
  return game.hand.find((card) => card.name === name);
}

function castPermanentFromHand(game: GaleGame, name: string): string | null {
  const card = cardInHand(game, name);
  if (!card) return `${name} is not in hand`;
  const cost = game.effectiveCost(card);
  return game.castPerm(card) ? null : `cannot pay ${cost} for ${name}`;
}

// ---------------------------------------------------------------- abilities and the attack
function activateAbility(game: GaleGame, ability: GaleAbility): string | null {
  switch (ability) {
    case 'guildmageDrain':
      if (!game.isOnBattlefield(GUILDMAGE)) return `no ${GUILDMAGE}`;
      if (!game.pay(COST_GUILDMAGE_DRAIN))
        return `cannot pay ${COST_GUILDMAGE_DRAIN} for Guildmage's drain`;
      game.guildmageActivations += 1;
      game.say('activate Guildmage {1}{U}{B}: opponents lose life per card');
      return null;
    case 'guildmageMill':
      if (!game.isOnBattlefield(GUILDMAGE)) return `no ${GUILDMAGE}`;
      if (!game.pay(COST_GUILDMAGE_MILL))
        return `cannot pay ${COST_GUILDMAGE_MILL} for Guildmage's mill`;
      game.applyOpponentStep(['millBiggestLibrary', 2]);
      game.say('Guildmage {2}{U}{B}: an opponent mills 2', libraries(game));
      return null;
    case 'konradMill':
      return activateKonradMill(game);
    case 'monumentExhaust':
    case 'monumentMill':
      return activateMonument(game, ability === 'monumentExhaust');
  }
}

/** Syr Konrad {1}{B}: each player mills a card (our own is a real card: a creature pings each opponent). */
function activateKonradMill(game: GaleGame): string | null {
  if (!game.isOnBattlefield(KONRAD)) return `no ${KONRAD}`;
  if (!game.pay(COST_KONRAD_MILL))
    return `cannot pay ${COST_KONRAD_MILL} for Konrad's mill`;
  const events: number[] = [];
  for (let i = 0; i < game.life.length; i++)
    if (game.isOpponentAlive(i)) events.push(OPPONENT_EVENT.MILL, i, 1);
  game.applyOpponentEvents(events);
  if (game.library.length)
    game.toGraveyard(game.takeTopCardsOfLibrary(1)[0], true);
  game.say('Syr Konrad {1}{B}: each player mills 1', libraries(game));
  return null;
}

/** Riverchurn Monument (it taps): exhaust {2}{U}{U} mills each opponent as many as their graveyard holds, {1} mills 2. */
function activateMonument(game: GaleGame, isExhaust: boolean): string | null {
  const monument = game.findPermanent(MONUMENT);
  if (!monument || monument.tapped) return `no untapped ${MONUMENT}`;
  if (isExhaust && monument.exhausted) return `${MONUMENT} is exhausted`;
  const cost = isExhaust ? COST_MONUMENT_EXHAUST : COST_MONUMENT;
  if (!game.pay(cost)) return `cannot pay ${cost} for ${MONUMENT}`;
  monument.tapped = true;
  if (isExhaust) monument.exhausted = true;
  game.applyOpponentStep([
    'eachOpponentMills',
    isExhaust ? 'graveyardSize' : 2,
  ]);
  game.say(
    isExhaust
      ? 'Riverchurn Monument exhaust {2}{U}{U}: each opponent mills their graveyard size'
      : 'Riverchurn Monument {1}: each opponent mills 2',
    libraries(game),
  );
  return null;
}

/** The Mindskinner attacks: its damage is prevented and each opponent mills that many. */
function attackWithMindskinner(game: GaleGame): string | null {
  const mindskinner = game.findPermanent(MINDSKINNER);
  if (!mindskinner || mindskinner.sick || game.attacked)
    return `${MINDSKINNER} cannot attack`;
  game.attacked = true;
  game.applyOpponentStep(['damageBiggestLibrary', 10]);
  game.sayEvent(
    'attack',
    'attack with The Mindskinner: each opponent mills 10',
    libraries(game),
  );
  return null;
}

// ---------------------------------------------------------------- spells
/** A spell from hand: paid, then Gale's recast from the graveyard, then the Guildmage drains in response, then it
 *  resolves. Jidoor's Overture is cast from the land card in hand. */
function castSpellFromHand(game: GaleGame, step: GaleKillStep): string | null {
  const name = step.card!;
  const variant = step.variant!;
  const card = cardInHand(game, name);
  if (!card) return `${name} is not in hand`;
  const isOverture = name === JIDOOR;
  // Overture is a sorcery: the instant and sorcery reducers count (Traumatize stands in for it)
  const costCard = isOverture ? C.get('Traumatize') : card;
  const cost = game.effectiveCost(
    costCard,
    isOverture ? OVERTURE_COST : costOfVariant(card, variant),
  );
  if (!game.pay(cost, true)) return `cannot pay ${cost} for ${name}`;
  game.takeCard(card, 'hand');
  game.sayEvent(
    'cast',
    'cast',
    isOverture ? 'Overture (from Jidoor)' : card,
    variantText(variant),
  );
  game.spellsCast += 1;
  game.onCastInstantOrSorcery(false);
  if (step.galeRecast) {
    const failure = recastWithGale(game, ...step.galeRecast);
    if (failure !== null) return failure;
  }
  for (
    let response = 0;
    response < (step.guildmageResponses ?? 0);
    response++
  ) {
    const failure = activateAbility(game, 'guildmageDrain');
    if (failure !== null) return failure;
  }
  const failure = resolveKillSpell(
    game,
    isOverture ? 'Overture' : name,
    card,
    variant,
  );
  game.putCard(card, 'graveyard');
  return failure;
}

/** Gale's trigger: cast an instant or sorcery from the graveyard (it is exiled afterwards). */
function recastWithGale(
  game: GaleGame,
  name: string,
  variant: string,
): string | null {
  if (!game.isOnBattlefield(GALE)) return 'Gale is not on the battlefield';
  return castFromGraveyard(game, name, variant, '  Gale recasts');
}

function castWithEmetSelch(
  game: GaleGame,
  name: string,
  variant: string,
): string | null {
  if (!game.isOnBattlefield(EMET_SELCH) || game.emetSelchUsed)
    return 'no Emet-Selch trigger';
  game.emetSelchUsed = true;
  return castFromGraveyard(game, name, variant, 'Emet-Selch casts');
}

function castFromGraveyard(
  game: GaleGame,
  name: string,
  variant: string,
  howText: string,
): string | null {
  const card = game.graveyard.find((otherCard) => otherCard.name === name);
  if (!card) return `${name} is not in the graveyard`;
  const cost = game.effectiveCost(card, costOfVariant(card, variant), true);
  if (!game.pay(cost, true))
    return `cannot pay ${cost} for ${name} from the graveyard`;
  game.takeCard(card, 'graveyard');
  game.say(howText, card, variantText(variant));
  game.spellsCast += 1;
  game.onCastInstantOrSorcery(true);
  const failure = resolveKillSpell(game, name, card, variant);
  game.putCard(card, 'exile');
  return failure;
}

/** Cast a cheap spell, then counter it with our own counterspell. Both casts can trigger Gale. An Offer You Can't
 *  Refuse gives us two Treasures (used at once), Unwind untaps three lands and Rewind four. */
function castAndCounterOwnSpell(
  game: GaleGame,
  step: GaleKillStep,
): string | null {
  const target = cardInHand(game, step.card!);
  if (!target) return `${step.card} is not in hand`;
  const targetCost = game.effectiveCost(target);
  if (!game.pay(targetCost, target.isInstantOrSorcery))
    return `cannot pay ${targetCost} for ${target.name}`;
  game.takeCard(target, 'hand');
  game.sayEvent('cast', 'cast', target, 'to counter it with our own');
  if (target.isInstantOrSorcery) {
    game.spellsCast += 1;
    game.onCastInstantOrSorcery(false);
  }
  if (step.galeRecast) {
    const failure = recastWithGale(game, ...step.galeRecast);
    if (failure !== null) return failure;
  }
  const counter = cardInHand(game, step.counter!);
  if (!counter) return `${step.counter} is not in hand`;
  const counterCost = game.effectiveCost(counter);
  if (!game.pay(counterCost, true))
    return `cannot pay ${counterCost} for ${counter.name}`;
  game.takeCard(counter, 'hand');
  game.sayEvent('cast', 'cast', counter, 'on', target);
  game.spellsCast += 1;
  game.onCastInstantOrSorcery(false);
  if (step.counterRecast) {
    const failure = recastWithGale(game, ...step.counterRecast);
    if (failure !== null) return failure;
  }
  game.putCards([target, counter], 'graveyard');
  if (counter.name === "An Offer You Can't Refuse") {
    game.pool.U += 1; // two Treasures, used this turn
    game.pool.B += 1;
  } else if (counter.name === 'Unwind') game.untapLands(3);
  else if (counter.name === 'Rewind') game.untapLands(4);
  return null;
}

/** The base cost of a way to cast a spell (kill-state.ts castVariants): kicked, or with an X. */
function costOfVariant(card: CardDef, variant: string): Cost {
  if (variant === 'kick') return card.cost.plus(new Cost(3, 1));
  const xMatch = /^X(\d+)$/.exec(variant);
  if (xMatch) return card.cost.plus(new Cost(parseInt(xMatch[1], 10)));
  return card.cost;
}

function variantText(variant: string): string {
  return variant === 'x' || variant === 'enabler' ? '' : `[${variant}]`;
}

/** What a spell of a kill line does. The mill, drain and poison spells hit the opponents by the search's rules;
 *  the rest is the engine's (rituals, High Tide, draw spells). Returns why it could not resolve, or null. */
function resolveKillSpell(
  game: GaleGame,
  name: string,
  card: CardDef,
  variant: string,
): string | null {
  switch (name) {
    case 'Maddening Cacophony':
    case 'Expansion Algorithm':
    case 'Extended Absence':
      game.applyKillSpellToOpponents(name, variant);
      break;
    case 'Traumatize':
    case 'Cut Your Losses':
    case 'Overture': {
      let copies = 1;
      if (variant === 'casualty') {
        if (!sacrificeForCasualty(game)) return 'no creature to sacrifice';
        copies = 2;
      }
      for (let copyNumber = 0; copyNumber < copies; copyNumber++)
        game.applyKillSpellToOpponents(name, 'single');
      break;
    }
    case 'Singularity Rupture':
      resolveSingularityRupture(game);
      break;
    case 'Unearth':
      return unearthCreature(game, variant);
    case 'Turnabout':
      game.untapLands(game.landsOnBattlefield().length);
      return null;
    default:
      game.resolve(card);
      return null;
  }
  game.say(`  ${name} resolves`, libraries(game));
  return null;
}

/** Casualty: sacrifice a creature with power 2 or more that isn't a combo piece, else the Guildmage. */
function sacrificeForCasualty(game: GaleGame): boolean {
  const fodder =
    game
      .creatures()
      .find(
        (permanent) =>
          game.power(permanent) >= 2 &&
          ![KONRAD, MINDSKINNER, GUILDMAGE].includes(permanent.card.name),
      ) ?? game.findPermanent(GUILDMAGE);
  if (!fodder) return false;
  game.sacrifice(fodder);
  return true;
}

/** Destroy all creatures, then each player mills half their library. Konrad sees every creature die (the search's
 *  rule hits the opponents), so ours go to the graveyard after him: none of them triggers him again. */
function resolveSingularityRupture(game: GaleGame): void {
  game.applyKillSpellToOpponents('Singularity Rupture', 'x');
  const konrad = game.findPermanent(KONRAD);
  if (konrad) game.dies(konrad);
  for (const creature of game.creatures()) game.dies(creature);
  for (const card of game.takeTopCardsOfLibrary(
    Math.floor(game.library.length / 2),
  ))
    game.toGraveyard(card, true);
}

/** Unearth the creature the line names. */
function unearthCreature(game: GaleGame, name: string): string | null {
  const creature = game.graveyard.find((card) => card.name === name);
  if (!creature) return `${name} is not in the graveyard`;
  game.takeCard(creature, 'graveyard');
  game.enter(creature, 'graveyard');
  if (game.isOnBattlefield(KONRAD))
    game.applyOpponentEvents([OPPONENT_EVENT.KONRAD, -1, 1]);
  return null;
}

function libraries(game: GaleGame): string {
  return `(opp life [${game.life.join(', ')}], libraries [${game.opponentLibrarySizes.join(', ')}])`;
}
