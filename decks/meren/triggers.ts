/** What happens when a permanent enters the battlefield or dies: the triggers of Meren's creatures. */
import {
  DRAW_ON_DEATH,
  EDICT_ETB,
  GRAY_MERCHANT,
  LAND_ETB,
  MEREN,
  TOKENS,
} from './cards';
import type { MerenGame } from './game';
import { Permanent, Zone } from '../../engine/game-types';
import { firstMax, removeIfPresent } from '../../engine/lists';
import { SHRIEKMAW } from '../../engine/answers';

// ================================================================ entering the battlefield
export function onPermanentEntered(
  game: MerenGame,
  permanent: Permanent,
  from: Zone,
): void {
  const name = permanent.card.name;
  if (name === MEREN && game.merenOut === null) game.merenOut = game.turn;
  if (from === 'graveyard' && !permanent.token) game.reanimated++;
  if (permanent.card.isCreature || name === 'Grist, the Hunger Tide')
    triggerLilianaAndPackleader(game, permanent);
  triggerTwilightDiviner(game, permanent, from);
  // enters-the-battlefield effects (token copies have them too)
  if (resolveDrainOnEnter(game, permanent)) return;
  if (resolveCardAdvantageOnEnter(game, permanent)) return;
  if (resolveTokensOnEnter(game, permanent)) return;
  resolveRemovalOnEnter(game, permanent);
}

/** Liliana the Repentant (another creature or planeswalker enters: mill two) and Garruk's Packleader (power 3+: draw). */
function triggerLilianaAndPackleader(
  game: MerenGame,
  permanent: Permanent,
): void {
  const name = permanent.card.name;
  if (
    name !== 'Liliana the Repentant' &&
    game.isOnBattlefield('Liliana the Repentant')
  )
    game.millOurselves(2);
  if (
    permanent.card.isCreature &&
    name !== "Garruk's Packleader" &&
    game.isOnBattlefield("Garruk's Packleader") &&
    game.power(permanent) >= 3
  )
    game.draw(1);
}

/** Twilight Diviner: creatures entering from a graveyard make a token copy of one of them (once a turn). */
function triggerTwilightDiviner(
  game: MerenGame,
  permanent: Permanent,
  from: Zone,
): void {
  if (
    from === 'graveyard' &&
    permanent.card.isCreature &&
    permanent.card.name !== 'Twilight Diviner' &&
    !game.divinerUsed &&
    game.isOnBattlefield('Twilight Diviner')
  ) {
    game.divinerUsed = true;
    game.say('  Twilight Diviner copies', permanent.card);
    game.enter(permanent.card, 'token', { token: true });
  }
}

/** Gray Merchant and Lotleth Giant. Returns true if the permanent was one of them. */
function resolveDrainOnEnter(game: MerenGame, permanent: Permanent): boolean {
  const name = permanent.card.name;
  if (name === GRAY_MERCHANT) {
    const devotion = game.devotion('B');
    const drained = game.drainEach(devotion);
    game.gainLife(drained);
    game.say(
      `  Gray Merchant drains ${devotion} each (devotion ${devotion}), ${game.describeOpponentLife()}`,
    );
    return true;
  }
  if (name === 'Lotleth Giant') {
    const target = game.chooseTargetOpponent();
    if (target !== null)
      game.damageOpponent(target, game.creaturesInGraveyard());
    game.say(
      `  Lotleth Giant deals ${game.creaturesInGraveyard()}, ${game.describeOpponentLife()}`,
    );
    return true;
  }
  return false;
}

/** Cards drawn, tutored, milled or returned from the graveyard when a creature enters. Returns true if handled. */
function resolveCardAdvantageOnEnter(
  game: MerenGame,
  permanent: Permanent,
): boolean {
  const name = permanent.card.name;
  if (name === 'Twilight Diviner') {
    game.scry(2, true);
  } else if (name === 'Disciple of Bolas') {
    const sacrificed = game.sacrificeOrder([permanent])[0];
    if (sacrificed) {
      const power = game.power(sacrificed);
      game.sacrifice(sacrificed);
      game.gainLife(power);
      game.draw(power);
    }
  } else if (name === 'Satyr Wayfinder') {
    const top = game.library.splice(0, 4);
    const land = top.find((card) => card.land !== null);
    for (const card of top)
      if (card === land) game.hand.push(card);
      else game.toGraveyard(card, true);
  } else if (LAND_ETB.has(name)) {
    game.fetchBasic();
  } else if (name === 'Eternal Witness' || name === 'Timeless Witness') {
    if (game.graveyard.length) {
      const best = firstMax(
        game.graveyard,
        (card) => game.cardValue(card) + (card.isCreature ? 0 : 10),
      );
      removeIfPresent(game.graveyard, best);
      game.hand.push(best);
    }
  } else if (name === 'Gravedigger') {
    const best = game.bestCreatureInGraveyard(() => true);
    if (best) {
      removeIfPresent(game.graveyard, best);
      game.hand.push(best);
    }
  } else if (name === "Stitcher's Supplier") {
    game.millOurselves(3);
  } else if (name === 'Rune-Scarred Demon') {
    game.doTutor(() => true, false);
  } else if (name === 'Vile Entomber') {
    game.tutorToGraveyard(() => true);
  } else if (name === 'Grim Servant') {
    const devotion = game.devotion('B');
    game.doTutor((card) => card.manaValue <= devotion, false);
    game.loseLife(3);
  } else if (name === 'Studious First-Year') {
    game.prepared.add(permanent);
  } else {
    return false;
  }
  return true;
}

/** Creatures that make tokens when they enter. Returns true if handled. */
function resolveTokensOnEnter(game: MerenGame, permanent: Permanent): boolean {
  switch (permanent.card.name) {
    case 'Puppeteer Clique': {
      const stolen = game.enter(TOKENS.stolen, 'graveyard', { token: true });
      stolen.sick = false; // it gains haste
      game.exileAtEnd.push(stolen);
      return true;
    }
    case 'Sepulchral Primordial':
      for (let i = 0; i < game.countOpponentsAlive(); i++)
        game.enter(TOKENS.stolen, 'graveyard', { token: true });
      return true;
    case 'Woe Strider':
      game.createTokens(TOKENS.goat);
      return true;
    case 'Grave Titan':
      game.createTokens(TOKENS.zombie, 2);
      return true;
    default:
      return false;
  }
}

/** Shriekmaw and the edicts (each player sacrifices a creature). */
function resolveRemovalOnEnter(game: MerenGame, permanent: Permanent): void {
  const name = permanent.card.name;
  if (name === 'Shriekmaw') {
    // a pod: destroy the biggest threat's best creature (nonartifact, nonblack isn't checked)
    if (game.inArena()) game.arena!.snipe(game, SHRIEKMAW);
  } else if (EDICT_ETB.has(name)) {
    if (game.inArena()) game.arena!.edict(game, name === 'Accursed Marauder'); // a pod: the opponents sacrifice too
    // each player sacrifices: we lose our worst creature (Accursed Marauder: a nontoken one)
    const choices = game
      .sacrificeOrder()
      .filter((candidate) => name !== 'Accursed Marauder' || !candidate.token);
    const sacrificed =
      choices[0] ??
      (name === 'Accursed Marauder' || name === 'Fleshbag Marauder'
        ? permanent
        : null);
    if (sacrificed) game.sacrifice(sacrificed);
  }
}

// ================================================================ dying
export function onPermanentDied(game: MerenGame, permanent: Permanent): void {
  const name = permanent.card.name;
  if (!permanent.card.land) game.leftThisTurn = true;
  if (permanent.card.isCreature) triggerCreatureDeathPayoffs(game, permanent);
  game.prepared.delete(permanent);
  if (
    name === 'Zulaport Cutthroat' ||
    game.isOnBattlefield('Zulaport Cutthroat')
  )
    game.drainEach(1);
  if (name === "Stitcher's Supplier") game.millOurselves(3);
  resolveDeathEffect(game, permanent);
  // persist: comes back with a -1/-1 counter if it had none
  if (
    !permanent.token &&
    permanent.card.keywords.has('persist') &&
    permanent.counters >= 0 &&
    game.graveyard.includes(permanent.card)
  ) {
    const returned = game.reanimate(permanent.card);
    returned.counters -= 1;
  }
}

/** Butcher of Malakir, Meren's experience, Morbid Opportunist and Grim Haruspex when a creature dies. */
function triggerCreatureDeathPayoffs(
  game: MerenGame,
  permanent: Permanent,
): void {
  const name = permanent.card.name;
  // a pod: Butcher of Malakir (it or another creature of ours dies: each opponent sacrifices a creature)
  if (
    game.inArena() &&
    (name === 'Butcher of Malakir' ||
      game.isOnBattlefield('Butcher of Malakir'))
  )
    game.arena!.edict(game, false);
  if (name !== MEREN && game.isOnBattlefield(MEREN)) game.experience++;
  if (game.isOnBattlefield('Morbid Opportunist') && !game.morbidUsed) {
    game.morbidUsed = true;
    game.draw(1);
  }
  if (
    !permanent.token &&
    name !== 'Grim Haruspex' &&
    game.isOnBattlefield('Grim Haruspex')
  )
    game.draw(1);
}

/** What the creature itself does when it dies (draw, drain, reanimate, put creatures onto the battlefield). */
function resolveDeathEffect(game: MerenGame, permanent: Permanent): void {
  const name = permanent.card.name;
  if (DRAW_ON_DEATH.has(name)) {
    game.draw(1);
  } else if (name === 'Vindictive Lich') {
    const target = game.chooseTargetOpponent();
    if (target !== null) game.damageOpponent(target, 5);
  } else if (name === 'Junji, the Midnight Sky') {
    const best = game.bestCreatureInGraveyard(
      (card) => card.name !== name && game.battlefieldValue(card) >= 60,
    );
    if (best) {
      game.reanimate(best);
      game.loseLife(2);
    } else game.drainEach(2);
  } else if (name === 'Protean Hulk') {
    // creatures with total mana value 6 or less onto the battlefield
    let budget = 6;
    for (;;) {
      const choices = game.library.filter(
        (card) => card.isCreature && card.manaValue <= budget,
      );
      if (!choices.length) break;
      const best = firstMax(choices, (card) => game.battlefieldValue(card));
      removeIfPresent(game.library, best);
      budget -= best.manaValue;
      game.enter(best, 'library');
    }
    game.shuffle();
  }
}
