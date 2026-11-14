/** What Edgar's abilities and spells do when the AI picks them: sacrifice outlets, the all-in sacrifice turn,
 *  prepared spells and the activated abilities of permanents. */
import {
  EDGAR,
  EVERETH,
  NINE_LIVES_FAMILIAR,
  SKULLCLAMP,
  TOKENS,
  isVampire,
} from './cards';
import type { EdgarGame } from './game';
import { CardDef, Cost } from '../../engine/cards/cards';
import { Permanent } from '../../engine/game/game-types';

// ================================================================ sacrifice outlets
export interface Outlet {
  permanent: Permanent;
  cost: Cost;
}

/** Permanents that sacrifice a creature (or artifact) for an effect, with what the sacrifice costs. */
function outletCost(permanent: Permanent): Cost | null {
  switch (permanent.card.name) {
    case 'Viscera Seer':
    case "Ashnod's Altar":
    case 'Phyrexian Altar':
    case EVERETH:
      return new Cost();
    case 'Indulgent Aristocrat':
      return new Cost(2);
    case 'Pitiless Pontiff':
      return new Cost(1);
    case 'Vampiric Rites':
    case 'Baron Bertram Graywater':
      return Cost.parse('{1}{B}');
    default:
      return null;
  }
}

export function findOutlets(game: EdgarGame): Outlet[] {
  const outlets: Outlet[] = [];
  for (const permanent of game.battlefield) {
    const cost = outletCost(permanent);
    if (cost) outlets.push({ permanent, cost });
  }
  return outlets;
}

/** Does sacrificing into this outlet give something besides the death triggers? */
function outletGivesValue(outlet: Outlet): boolean {
  return [
    EVERETH,
    'Vampiric Rites',
    'Baron Bertram Graywater',
    'Indulgent Aristocrat',
    "Ashnod's Altar",
    'Phyrexian Altar',
  ].includes(outlet.permanent.card.name);
}

/** Pay for the outlet, sacrifice, and do what the outlet does. */
export function sacrificeInto(
  game: EdgarGame,
  outlet: Outlet,
  fodder: Permanent,
): boolean {
  if (fodder === outlet.permanent) return false;
  if (!game.battlefield.includes(outlet.permanent)) return false;
  if (!game.pay(outlet.cost, false)) return false;
  const name = outlet.permanent.card.name;
  game.say(`${name}: sacrifice`, fodder.card);
  game.sacrifice(fodder);
  switch (name) {
    case EVERETH:
      outlet.permanent.counters += 1;
      break;
    case "Ashnod's Altar":
      game.pool.C += 2;
      break;
    case 'Phyrexian Altar':
      game.pool.B += 1;
      break;
    case 'Indulgent Aristocrat':
      for (const vampire of game.vampires()) vampire.counters += 1;
      break;
    case 'Vampiric Rites':
      game.gainLife(1);
      game.draw(1);
      break;
    case 'Baron Bertram Graywater':
      game.draw(1);
      break;
  }
  return true;
}

// ================================================================ what to sacrifice
/** How much we mind losing this permanent (lower = sacrificed first). Infinity = never. */
export function sacrificeCost(game: EdgarGame, permanent: Permanent): number {
  const card = permanent.card;
  if (card.name === EDGAR || card === TOKENS.army) return Infinity;
  if (card.name === NINE_LIVES_FAMILIAR && permanent.marks > 0) return 4;
  if (card === TOKENS.servo) return 8;
  if (card === TOKENS.spawn) return game.turn < 6 ? 12 : 9;
  if (card === TOKENS.treasure) return game.turn < 7 ? 14 : 10;
  if (permanent.token)
    return 15 + game.power(permanent) + (card.flying ? 5 : 0);
  return game.battlefieldValue(card);
}

/** Spare permanents in the order we would sacrifice them. Without `allIn`, only the cheap ones: tokens that a drain
 *  engine or an outlet makes worth sacrificing. */
export function spareFodder(
  game: EdgarGame,
  exclude: Permanent[] = [],
  allIn = false,
): Permanent[] {
  const drain = game.drainPerDeath();
  const outletsValue = findOutlets(game).some(outletGivesValue);
  return game.battlefield
    .filter((permanent) => {
      if (exclude.includes(permanent) || permanent.land !== null) return false;
      if (!permanent.card.isCreature && permanent.card !== TOKENS.treasure)
        return false;
      const cost = sacrificeCost(game, permanent);
      if (allIn) return cost < Infinity && permanent.card.name !== EVERETH;
      if (cost > 16) return false;
      // a Vampire token also attacks and takes anthems: only worth two or more drains
      if (isVampire(permanent.card)) return drain >= 2;
      return drain >= 1 || outletsValue;
    })
    .sort(
      (first, second) =>
        sacrificeCost(game, first) - sacrificeCost(game, second),
    );
}

/** The outlet to use for this sacrifice: free ones first, Evereth (it grows) before the others. */
export function chooseOutlet(
  game: EdgarGame,
  fodder: Permanent,
): Outlet | null {
  const usable = findOutlets(game).filter(
    (outlet) => outlet.permanent !== fodder && game.canPay(outlet.cost, false),
  );
  usable.sort((first, second) => outletRank(first) - outletRank(second));
  return usable[0] ?? null;
}
function outletRank(outlet: Outlet): number {
  if (outlet.permanent.card.name === EVERETH) return 0;
  return outlet.cost.manaValue === 0 ? 1 : 2 + outlet.cost.manaValue;
}

/** One sacrifice into an outlet, if there is something worth sacrificing. */
export function sacrificeOneSpare(game: EdgarGame): boolean {
  const fodder = spareFodder(game)[0];
  if (!fodder) return false;
  const outlet = chooseOutlet(game, fodder);
  return outlet !== null && sacrificeInto(game, outlet, fodder);
}

// ================================================================ the all-in turn
/** Is a sacrifice turn worth trying? A cheap guess at the damage it could do, before simulating it. */
export function mightWinBySacrificing(game: EdgarGame): boolean {
  if (findOutlets(game).length === 0) return false;
  const fodderCount = spareFodder(game, [], true).length;
  if (fodderCount < 2) return false;
  const alive = game.countOpponentsAlive();
  const everethPower = game.findPermanent(EVERETH)
    ? game.power(game.findPermanent(EVERETH)!) + fodderCount
    : 0;
  const potential =
    fodderCount * (game.drainPerDeath() + 1) + everethPower * alive;
  const lifeLeft = game.life.reduce(
    (total, life) => total + Math.max(0, life),
    0,
  );
  return potential >= lifeLeft * 0.7;
}

/** Sacrifice everything that is not needed for a drain, then Evereth itself (it hits each opponent for its power). */
export function sacrificeEverything(game: EdgarGame): void {
  const evereth = game.findPermanent(EVERETH);
  // Evereth needs another outlet to die with, and {1}{B} left to pay for its trigger
  const outletForEvereth = evereth
    ? findOutlets(game)
        .filter(
          (outlet) =>
            outlet.permanent !== evereth &&
            game.canPay(outlet.cost.plus(Cost.parse('{1}{B}')), false),
        )
        .sort((first, second) => outletRank(first) - outletRank(second))[0]
    : undefined;
  const kept = outletForEvereth ? [outletForEvereth.permanent] : [];
  const countersBefore = evereth?.counters ?? 0;
  for (let step = 0; step < 40 && !game.hasWon(); step++) {
    const fodder = spareFodder(game, kept, true)[0];
    if (!fodder) break;
    const outlet = chooseOutlet(game, fodder);
    if (!outlet || !sacrificeInto(game, outlet, fodder)) break;
  }
  if (!evereth || !outletForEvereth || game.hasWon()) return;
  // Sacrificing Evereth is a cost: nobody can respond to it. Only her own pumps use the stack, so the others can
  // answer only if she was pumped (exiling her in response).
  const wasPumped = evereth.counters > countersBefore;
  if (game.inArena() && wasPumped)
    declareExplosion(game, evereth, outletForEvereth);
  else sacrificeInto(game, outletForEvereth, evereth);
}

/** A pod: the others may answer Evereth's last pump (an exile or bounce effect on her in response), so she stays on
 *  the battlefield while the explosion is declared: we pay for it, deal the damage, and keep the life totals from
 *  before it (the engine puts them back if the win is stopped, see EdgarGame.winAttempt). What the pumps drained
 *  stays: it already happened. */
function declareExplosion(
  game: EdgarGame,
  evereth: Permanent,
  outlet: Outlet,
): void {
  if (!game.pay(outlet.cost.plus(Cost.parse('{1}{B}')), false)) return;
  game.podPre = [
    game.life.slice(),
    game.opponentLibrarySizes.slice(),
    game.poison.slice(),
  ];
  const power = game.power(evereth);
  game.say(`  Evereth is sacrificed: ${power} damage to each opponent`);
  game.withDamageSource('explosion', () =>
    game.drainAllOpponents(power, false),
  );
  game.explosionPending = evereth;
}

/** Would the all-in sacrifice turn win from here? Tried on a copy of the game. */
export function sacrificeTurnWins(game: EdgarGame): boolean {
  if (!mightWinBySacrificing(game)) return false;
  const copy = game.clone();
  sacrificeEverything(copy);
  return copy.hasWon();
}

// ================================================================ spells with a sacrifice cost
/** Corrupted Conviction / Diabolic Intent: sacrifice a creature as an additional cost, then cast. */
export function castWithSacrifice(
  game: EdgarGame,
  card: CardDef,
  fodder: Permanent,
): boolean {
  if (!game.canPay(game.effectiveCost(card), true)) return false;
  game.sacrifice(fodder);
  return game.castInstantOrSorcery(card);
}

/** Beseech the Mirror: bargain with a token or artifact, then cast the card found for free if its mana value is 4 or less. */
export function castBeseechTheMirror(
  game: EdgarGame,
  card: CardDef,
  bargainFodder: Permanent | null,
): boolean {
  if (!game.pay(game.effectiveCost(card), true)) return false;
  game.takeCard(card, 'hand');
  game.sayEvent('cast', 'cast', card, bargainFodder ? '(bargained)' : '');
  game.spellsCast += 1;
  if (bargainFodder) game.sacrifice(bargainFodder);
  const found = game.tutorTarget(() => true, false);
  game.putCard(card, 'graveyard');
  if (!found) return true;
  game.takeCard(found, 'library');
  game.shuffle();
  if (bargainFodder && found.manaValue <= 4 && found.land === null) {
    game.say('  cast for free', found);
    game.enter(found, 'hand');
    if (isVampire(found) && game.isEdgarAvailable())
      game.createTokens(TOKENS.vampire);
  } else game.putCard(found, 'hand');
  return true;
}

// ================================================================ prepared spells
/** Emeritus of Woe's Demonic Tutor and Scheming Silvertongue's Sign in Blood. */
export function castPreparedSpell(
  game: EdgarGame,
  permanent: Permanent,
): boolean {
  if (permanent.card.name === 'Emeritus of Woe') {
    if (!game.pay(Cost.parse('{1}{B}'), true)) return false;
    game.prepared.delete(permanent);
    game.say('Demonic Tutor (Emeritus of Woe)');
    game.doTutor(() => true, false);
    return true;
  }
  if (!game.pay(Cost.parse('{B}{B}'), true)) return false;
  game.prepared.delete(permanent);
  game.say('Sign in Blood (Scheming Silvertongue)');
  game.draw(2);
  game.loseLife(2);
  return true;
}

export function preparedSpellCost(permanent: Permanent): Cost {
  return Cost.parse(
    permanent.card.name === 'Emeritus of Woe' ? '{1}{B}' : '{B}{B}',
  );
}

// ================================================================ activated abilities
/** Bloodline Keeper: tap for a 2/2 flying Vampire. */
export function makeKeeperToken(game: EdgarGame, keeper: Permanent): boolean {
  if (keeper.tapped || keeper.sick) return false;
  keeper.tapped = true;
  game.createTokens(TOKENS.flyingVampire);
  return true;
}

/** Bloodline Keeper: {B}: transform with five or more Vampires (Lord of Lineage: Vampires get +2/+2). */
export function transformKeeper(game: EdgarGame, keeper: Permanent): boolean {
  if (!game.pay(Cost.parse('{B}'), false)) return false;
  keeper.transformed = true;
  game.say('Bloodline Keeper transforms into Lord of Lineage');
  return true;
}

/** Skullclamp: equip {1} to a creature with toughness 1: it dies and we draw two. */
export function skullclampToken(game: EdgarGame): Permanent | null {
  if (!game.isOnBattlefield(SKULLCLAMP)) return null;
  return (
    game
      .creatures()
      .filter(
        (permanent) =>
          permanent.token &&
          permanent.card !== TOKENS.army &&
          game.toughness(permanent) <= 1,
      )
      .sort((first, second) => game.power(first) - game.power(second))[0] ??
    null
  );
}

export function clampToken(game: EdgarGame, token: Permanent): boolean {
  if (!game.pay(new Cost(1), false)) return false;
  game.say('Skullclamp equips', token.card, 'and it dies');
  game.dies(token);
  game.draw(2);
  return true;
}

export function bloodlineKeeperTransformIsWorthIt(game: EdgarGame): boolean {
  return game.vampires().length >= 5;
}
