import { TOKENS } from './cards';
import type { MerenGame } from './game';
import { CardDef, Cost } from '../../engine/cards/cards';
import { Permanent } from '../../engine/game/game-types';
import { firstMin, sortDesc } from '../../engine/util/lists';
import { Answer } from '../../engine/game/answers';
import { fetchLand } from '../../engine/game/land-search';

/** Insidious Fungus in a pod: destroy target artifact or enchantment. */
const FUNGUS_DESTROY: Answer = {
  kind: 'removal',
  instant: false,
  hits: ['artifact', 'enchantment'],
  how: 'destroy',
};
/** Only a target its owner values at least this much (a mana rock or an engine, not a token). */
const FUNGUS_TARGET_MINIMUM_VALUE = 40;

// ---------------------------------------------------------------- actions
export function evokeCreature(game: MerenGame, card: CardDef): boolean {
  if (!game.pay(game.effectiveCost(card, Cost.parse('{1}{B}')), false))
    return false;
  game.takeCardIfThere(card, 'hand');
  game.say('evoke', card);
  game.podAnnounceCast(card);
  const permanent = game.enter(card, 'hand');
  game.sacrifice(permanent);
  return true;
}

export function sacrificeThenCast(
  game: MerenGame,
  card: CardDef,
  permanent: Permanent,
): boolean {
  if (
    !game.canPay(game.effectiveCost(card), card.isInstantOrSorcery) ||
    !game.battlefield.includes(permanent)
  )
    return false;
  game.sacrifice(permanent);
  return game.castInstantOrSorcery(card);
}

export function castEldritchEvolution(
  game: MerenGame,
  card: CardDef,
  permanent: Permanent,
): boolean {
  if (!game.pay(game.effectiveCost(card), true)) return false;
  game.takeCardIfThere(card, 'hand');
  const maxManaValue = permanent.card.manaValue + 2;
  game.sacrifice(permanent);
  game.podAnnounceCast(card);
  game.say(
    'cast',
    card,
    `(sacrifice ${permanent.card.name}: find mana value ${maxManaValue} or less)`,
  );
  const cards = game.library.filter(
    (candidate) => candidate.isCreature && candidate.manaValue <= maxManaValue,
  );
  if (cards.length) {
    const chosen =
      game.tutorTarget((candidate) => cards.includes(candidate), false) ??
      cards[0];
    game.takeCardIfThere(chosen, 'library');
    game.shuffle();
    game.enter(chosen, 'library');
  }
  game.putCard(card, 'exile');
  return true;
}

export function castSawInHalf(
  game: MerenGame,
  card: CardDef,
  permanent: Permanent,
): boolean {
  if (!game.pay(game.effectiveCost(card), true)) return false;
  game.takeCardIfThere(card, 'hand');
  game.say('cast', card, 'on our', permanent.card);
  game.onCastInstantOrSorcery(false);
  game.podAnnounceCast(card);
  const half =
    Math.ceil(game.power(permanent) / 2) -
    (permanent.card.power + permanent.counters);
  game.dies(permanent);
  for (const token of game.createTokens(permanent.card, 2))
    token.powerMod = half;
  game.putCard(card, 'graveyard');
  return true;
}

export function castBeastWithin(
  game: MerenGame,
  card: CardDef,
  permanent: Permanent,
): boolean {
  if (!game.pay(game.effectiveCost(card), true)) return false;
  game.takeCardIfThere(card, 'hand');
  game.podAnnounceCast(card);
  game.dies(permanent);
  game.createTokens(TOKENS.beast);
  game.putCard(card, 'graveyard');
  return true;
}

export function activatePriest(
  game: MerenGame,
  permanent: Permanent,
  firstSacrifice: Permanent,
  secondSacrifice: Permanent,
): boolean {
  permanent.tapped = true;
  game.sacrifice(firstSacrifice);
  game.sacrifice(secondSacrifice);
  game.drainEach(2);
  game.pool.B += 2;
  game.draw(1, 'Priest of Forgotten Gods');
  game.say('Priest of Forgotten Gods: each opponent loses 2');
  return true;
}

/** Wight of the Reliquary: tap it, sacrifice another creature, put a land onto the battlefield tapped. */
export function activateWight(
  game: MerenGame,
  wight: Permanent,
  toSacrifice: Permanent,
): boolean {
  wight.tapped = true;
  game.sacrifice(toSacrifice);
  game.say('Wight of the Reliquary fetches a land');
  fetchLand(game, 'any', true);
  return true;
}

export function activateFaunaShaman(
  game: MerenGame,
  permanent: Permanent,
): boolean {
  const cards = game.hand.filter((card) => card.isCreature);
  if (!cards.length || !game.pay(new Cost(0, 0, 0, 0, 0, 0, 1), false))
    return false;
  permanent.tapped = true;
  const discarded = firstMin(cards, (card) => game.discardValue(card));
  game.takeCardIfThere(discarded, 'hand');
  game.toGraveyard(discarded);
  game.doTutor((card) => card.isCreature, false);
  return true;
}

export function activateLiliana(
  game: MerenGame,
  permanent: Permanent,
): boolean {
  if (!game.pay(Cost.parse('{5}{B}'), false)) return false;
  const card = game.bestCreatureInGraveyard();
  if (!card) return false;
  game.lilianaUsed = true;
  game.reanimate(card);
  permanent.counters += 1;
  return true;
}

export function castGrist(game: MerenGame, card: CardDef): boolean {
  if (!game.castPerm(card)) return false;
  const permanent = game.findPermanent(card.name);
  if (permanent) permanent.counters = 3; // loyalty
  return true;
}

export function activateGrist(game: MerenGame, permanent: Permanent): boolean {
  game.gristUsed = true;
  if (permanent.counters >= 5 && game.creaturesInGraveyard() >= 6) {
    permanent.counters -= 5;
    game.drainEach(game.creaturesInGraveyard());
    game.say(
      `Grist -5: each opponent loses ${game.creaturesInGraveyard()}, ${game.describeOpponentLife()}`,
    );
    if (permanent.counters <= 0) {
      game.takeFromBattlefieldIfThere(permanent);
      game.putCard(permanent.card, 'graveyard');
    }
  } else {
    permanent.counters += 1;
    game.createTokens(TOKENS.insect);
    game.millOurselves(1);
  }
  return true;
}

export function castPreparedSpell(
  game: MerenGame,
  permanent: Permanent,
): boolean {
  if (permanent.card.name === 'Studious First-Year') {
    if (!game.pay(Cost.parse('{1}{G}'), true)) return false;
    game.prepared.delete(permanent);
    game.say('Rampant Growth (Studious First-Year)');
    game.fetchBasic();
    return true;
  }
  if (!game.pay(Cost.parse('{B}'), true)) return false;
  const card = game.bestCreatureInGraveyard();
  if (!card) return false;
  game.prepared.delete(permanent);
  game.say('Reanimate (Grave Researcher)');
  game.reanimate(card);
  game.loseLife(card.manaValue);
  return true;
}

export function activateInsidiousFungus(
  game: MerenGame,
  permanent: Permanent,
): boolean {
  if (!game.pay(new Cost(2), false)) return false;
  game.sacrifice(permanent);
  // a pod: destroy an opponent's artifact or enchantment worth it; otherwise draw
  if (
    game.inArena() &&
    game.arena!.snipe(
      game,
      FUNGUS_DESTROY,
      'Insidious Fungus',
      FUNGUS_TARGET_MINIMUM_VALUE,
    )
  )
    return true;
  game.draw(1, 'Insidious Fungus');
  const land = game.hand.find((card) => card.land !== null);
  if (land) {
    game.takeCardIfThere(land, 'hand');
    const landPermanent = new Permanent(land, land.land, true);
    landPermanent.sick = false;
    game.putOntoBattlefield(landPermanent);
  }
  return true;
}

export function activateVampiricRites(
  game: MerenGame,
  permanent: Permanent,
): boolean {
  if (!game.pay(Cost.parse('{1}{B}'), false)) return false;
  game.sacrifice(permanent);
  game.gainLife(1);
  game.draw(1, 'Vampiric Rites');
  return true;
}

/** Grim Backwoods: {2}{B}{G}, {T}, sacrifice a creature: draw a card. The land taps as part of the cost, so it can't
 *  pay for it. */
export function activateGrimBackwoods(
  game: MerenGame,
  land: Permanent,
  creature: Permanent,
): boolean {
  if (land.tapped || !game.battlefield.includes(creature)) return false;
  land.tapped = true;
  if (!game.pay(Cost.parse('{2}{B}{G}'), false)) {
    land.tapped = false;
    return false;
  }
  game.sacrifice(creature);
  game.draw(1, 'Grim Backwoods');
  return true;
}

export function escapeWoeStrider(game: MerenGame, card: CardDef): boolean {
  if (!game.pay(game.effectiveCost(card, Cost.parse('{3}{B}{B}')), false))
    return false;
  const others = sortDesc(
    game.graveyard.filter(
      (candidate) => candidate !== card && !candidate.isCreature,
    ),
    (candidate) => -game.cardValue(candidate),
  ).slice(0, 4);
  for (const exiledCard of others) {
    game.takeCardIfThere(exiledCard, 'graveyard');
    game.putCard(exiledCard, 'exile');
  }
  const permanent = game.reanimate(card);
  permanent.counters += 2;
  return true;
}
