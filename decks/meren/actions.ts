import { TOKENS } from './cards';
import type { MerenGame } from './game';
import { CardDef, Cost } from '../../engine/cards';
import { Perm } from '../../engine/game-types';
import { firstMin, removeIfPresent, sortDesc } from '../../engine/lists';

// ---------------------------------------------------------------- actions
export function evokeCreature(game: MerenGame, card: CardDef): boolean {
  if (!game.pay(game.effCost(card, Cost.parse('{1}{B}')), false)) return false;
  removeIfPresent(game.hand, card);
  game.say('evoke', card);
  const permanent = game.enter(card, 'hand');
  game.sacrifice(permanent);
  return true;
}

export function sacrificeThenCast(
  game: MerenGame,
  card: CardDef,
  permanent: Perm,
): boolean {
  if (
    !game.canPay(game.effCost(card), card.isIS) ||
    !game.bf.includes(permanent)
  )
    return false;
  game.sacrifice(permanent);
  return game.castIS(card);
}

export function castEldritchEvolution(
  game: MerenGame,
  card: CardDef,
  permanent: Perm,
): boolean {
  if (!game.pay(game.effCost(card), true)) return false;
  removeIfPresent(game.hand, card);
  const maxManaValue = permanent.cd.mv + 2;
  game.sacrifice(permanent);
  game.say(
    'cast',
    card,
    `(sacrifice ${permanent.cd.name}: find mana value ${maxManaValue} or less)`,
  );
  const cards = game.library.filter(
    (candidate) => candidate.isCreature && candidate.mv <= maxManaValue,
  );
  if (cards.length) {
    const chosen =
      game.tutorTarget((candidate) => cards.includes(candidate), false) ??
      cards[0];
    removeIfPresent(game.library, chosen);
    game.shuffle();
    game.enter(chosen, 'library');
  }
  game.exile.push(card);
  return true;
}

export function castSawInHalf(
  game: MerenGame,
  card: CardDef,
  permanent: Perm,
): boolean {
  if (!game.pay(game.effCost(card), true)) return false;
  removeIfPresent(game.hand, card);
  game.say('cast', card, 'on our', permanent.cd);
  game.onCastIS(false);
  const half =
    Math.ceil(game.power(permanent) / 2) -
    (permanent.cd.power + permanent.counters);
  game.dies(permanent);
  for (const token of game.createTokens(permanent.cd, 2)) token.powerMod = half;
  game.gy.push(card);
  return true;
}

export function castBeastWithin(
  game: MerenGame,
  card: CardDef,
  permanent: Perm,
): boolean {
  if (!game.pay(game.effCost(card), true)) return false;
  removeIfPresent(game.hand, card);
  game.dies(permanent);
  game.createTokens(TOKENS.beast);
  game.gy.push(card);
  return true;
}

export function activatePriest(
  game: MerenGame,
  permanent: Perm,
  firstSacrifice: Perm,
  secondSacrifice: Perm,
): boolean {
  permanent.tapped = true;
  game.sacrifice(firstSacrifice);
  game.sacrifice(secondSacrifice);
  game.drainEach(2);
  game.pool.B += 2;
  game.draw(1);
  game.say('Priest of Forgotten Gods: each opponent loses 2');
  return true;
}

export function activateFaunaShaman(game: MerenGame, permanent: Perm): boolean {
  const cards = game.hand.filter((card) => card.isCreature);
  if (!cards.length || !game.pay(new Cost(0, 0, 0, 0, 0, 0, 1), false))
    return false;
  permanent.tapped = true;
  const discarded = firstMin(cards, (card) => game.discardValue(card));
  removeIfPresent(game.hand, discarded);
  game.toGy(discarded);
  game.doTutor((card) => card.isCreature, false);
  return true;
}

export function activateLiliana(game: MerenGame, permanent: Perm): boolean {
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
  const permanent = game.perm(card.name);
  if (permanent) permanent.counters = 3; // loyalty
  return true;
}

export function activateGrist(game: MerenGame, permanent: Perm): boolean {
  game.gristUsed = true;
  if (permanent.counters >= 5 && game.creaturesInGraveyard() >= 6) {
    permanent.counters -= 5;
    game.drainEach(game.creaturesInGraveyard());
    game.say(
      `Grist -5: each opponent loses ${game.creaturesInGraveyard()}, opp life [${game.life.join(', ')}]`,
    );
    if (permanent.counters <= 0) {
      removeIfPresent(game.bf, permanent);
      game.gy.push(permanent.cd);
    }
  } else {
    permanent.counters += 1;
    game.createTokens(TOKENS.insect);
    game.millOurselves(1);
  }
  return true;
}

export function castPreparedSpell(game: MerenGame, permanent: Perm): boolean {
  if (permanent.cd.name === 'Studious First-Year') {
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
  game.loseLife(card.mv);
  return true;
}

export function activateInsidiousFungus(
  game: MerenGame,
  permanent: Perm,
): boolean {
  if (!game.pay(new Cost(2), false)) return false;
  game.sacrifice(permanent);
  game.draw(1);
  const land = game.hand.find((card) => card.land !== null);
  if (land) {
    removeIfPresent(game.hand, land);
    const landPermanent = new Perm(land, land.land, true);
    landPermanent.sick = false;
    game.bf.push(landPermanent);
  }
  return true;
}

export function activateVampiricRites(
  game: MerenGame,
  permanent: Perm,
): boolean {
  if (!game.pay(Cost.parse('{1}{B}'), false)) return false;
  game.sacrifice(permanent);
  game.gainLife(1);
  game.draw(1);
  return true;
}

export function escapeWoeStrider(game: MerenGame, card: CardDef): boolean {
  if (!game.pay(game.effCost(card, Cost.parse('{3}{B}{B}')), false))
    return false;
  const others = sortDesc(
    game.gy.filter((candidate) => candidate !== card && !candidate.isCreature),
    (candidate) => -game.cardValue(candidate),
  ).slice(0, 4);
  for (const exiledCard of others) {
    removeIfPresent(game.gy, exiledCard);
    game.exile.push(exiledCard);
  }
  const permanent = game.reanimate(card);
  permanent.counters += 2;
  return true;
}
