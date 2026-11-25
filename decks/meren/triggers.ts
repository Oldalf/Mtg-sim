/** What happens when a permanent enters the battlefield or dies: the engine's card rules (engine/card-rules/) in the
 *  order Meren had them, and the triggers of Meren's own cards (the ones other decks code too, or that hang on
 *  Meren's state and choices). */
import { DGHOR_BLOODLETTER, EDICT_ETB, GRAY_MERCHANT, MEREN } from './cards';
import type { MerenGame } from './game';
import { Permanent, Zone } from '../../engine/game/game-types';
import { firstMax } from '../../engine/util/lists';
import { drawWhenCreatureDies } from '../../engine/game/card-draw';
import { JUNJI, resolveJunjiDeath } from './junji';
import { triggersOfCreatureEntering } from '../../engine/game/creature-enter-triggers';
import {
  deathTriggerOfCommonCard,
  enterTriggerOfCommonCard,
  triggersOfOthersOnEnter,
  triggersOnDeath,
} from '../../engine/card-rules/card-rules';

// ================================================================ entering the battlefield
export function onPermanentEntered(
  game: MerenGame,
  permanent: Permanent,
  from: Zone,
): void {
  const name = permanent.card.name;
  if (name === MEREN && game.merenOut === null) game.merenOut = game.turn;
  if (from === 'graveyard' && !permanent.token) game.reanimated++;
  triggersOfOthersOnEnter(game, permanent, from); // Liliana, Packleader, Twilight Diviner
  triggersOfCreatureEntering(game, permanent); // Ayara
  // enters-the-battlefield effects (token copies have them too)
  if (resolveDrainOnEnter(game, permanent)) return;
  if (resolveCardAdvantageOnEnter(game, permanent)) return;
  if (resolveTokensOnEnter(game, permanent)) return;
  resolveRemovalOnEnter(game, permanent);
}

/** Gray Merchant. Returns true if the permanent was it. */
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
  return false;
}

/** Cards drawn, tutored, milled or returned from the graveyard when a creature enters. Returns true if handled. */
function resolveCardAdvantageOnEnter(
  game: MerenGame,
  permanent: Permanent,
): boolean {
  const name = permanent.card.name;
  if (name === 'Disciple of Bolas') {
    const sacrificed = game.chooseDiscipleSacrifice(permanent);
    if (sacrificed) {
      const power = game.power(sacrificed);
      game.sacrifice(sacrificed);
      game.gainLife(power);
      game.draw(power, 'Disciple of Bolas');
    }
  } else if (enterTriggerOfCommonCard(game, permanent)) {
    // the engine's rules (Satyr Wayfinder, Stitcher's Supplier, Vile Entomber, Grim Servant, Woe Strider, Grave
    // Titan, Shriekmaw, Lotleth Giant, Twilight Diviner, Solemn, the Witnesses...)
  } else if (name === 'Rune-Scarred Demon') {
    game.doTutor(() => true, false);
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
      for (const stolen of game.stealCreatures(Infinity, 1)) {
        stolen.sick = false; // it gains haste
        game.exileAtEnd.push(stolen);
      }
      return true;
    }
    case 'Sepulchral Primordial':
      game.stealCreatures(1);
      return true;
    default:
      return false;
  }
}

/** D'Ghor Bloodletter and the edicts (each player sacrifices a creature). */
function resolveRemovalOnEnter(game: MerenGame, permanent: Permanent): void {
  const name = permanent.card.name;
  if (name === DGHOR_BLOODLETTER && game.shouldShrinkWithBloodletter()) {
    // a pod with a wide board: all other creatures get -1/-1 (ours die too: Meren's experience)
    game.podShrinkCreatures(1, true, permanent, name);
  } else if (EDICT_ETB.has(name)) {
    if (game.inArena()) game.arena!.edict(game, name === 'Accursed Marauder'); // a pod: the opponents sacrifice too
    // each player sacrifices: we lose our worst creature (Accursed Marauder: a nontoken one)
    const choices = game
      .sacrificeOrder()
      .filter((candidate) => name !== 'Accursed Marauder' || !candidate.token);
    const sacrificed =
      choices[0] ??
      (name === 'Accursed Marauder' ||
      name === 'Fleshbag Marauder' ||
      name === DGHOR_BLOODLETTER
        ? permanent
        : null);
    if (sacrificed) game.sacrifice(sacrificed);
  }
}

// ================================================================ dying
export function onPermanentDied(game: MerenGame, permanent: Permanent): void {
  if (!permanent.card.land) game.leftThisTurn = true;
  triggersOnDeath(game, permanent); // Butcher of Malakir, Meren's experience, Grim Haruspex
  if (permanent.card.isCreature) {
    triggerMorbidOpportunist(game);
    drawWhenCreatureDies(game, permanent); // Midnight Reaper, Moldervine Reclamation
  }
  game.prepared.delete(permanent);
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

/** Morbid Opportunist: a creature died: draw a card (once each turn). Thantis codes it too (U1b step 3). */
function triggerMorbidOpportunist(game: MerenGame): void {
  if (game.isOnBattlefield('Morbid Opportunist') && !game.morbidUsed) {
    game.morbidUsed = true;
    game.draw(1, 'Morbid Opportunist');
  }
}

/** Vindictive Lich in a pod: each mode on a different opponent. The 5 life to the one closest to dead, the sacrifice
 *  to the one with the biggest board, the discard of two to the one with the most cards in hand. */
function resolveVindictiveLichInPod(game: MerenGame): void {
  const sourceName = 'Vindictive Lich';
  const arena = game.arena!;
  const loseLifeSlot = game.chooseTargetOpponent();
  if (loseLifeSlot !== null) game.damageOpponent(loseLifeSlot, 5);
  const otherSlots = game.life
    .map((_life, slot) => slot)
    .filter((slot) => slot !== loseLifeSlot && game.isOpponentAlive(slot));
  const boardPower = (slot: number) =>
    arena.board(game, slot).reduce((total, power) => total + power, 0);
  const slotsWithCreatures = otherSlots.filter(
    (slot) => arena.board(game, slot).length > 0,
  );
  const sacrificeSlot = slotsWithCreatures.length
    ? firstMax(slotsWithCreatures, boardPower)
    : null;
  if (sacrificeSlot !== null)
    arena.sacrificeOneOpponentsCreature(game, sacrificeSlot, sourceName);
  const discardSlots = otherSlots.filter(
    (slot) => slot !== sacrificeSlot && arena.handSize(game, slot) > 0,
  );
  if (discardSlots.length)
    arena.discardOneOpponentsCards(
      game,
      firstMax(discardSlots, (slot) => arena.handSize(game, slot)),
      2,
      sourceName,
    );
}

/** What the creature itself does when it dies (draw, drain, reanimate, put creatures onto the battlefield). */
function resolveDeathEffect(game: MerenGame, permanent: Permanent): void {
  const name = permanent.card.name;
  if (deathTriggerOfCommonCard(game, permanent)) {
    // the engine's rules (Simulacrum Shaper, Stitcher's Supplier, Protean Hulk, Solemn Simulacrum)
  } else if (name === 'Vindictive Lich') {
    if (game.inArena()) resolveVindictiveLichInPod(game);
    else {
      const target = game.chooseTargetOpponent();
      if (target !== null) game.damageOpponent(target, 5);
    }
  } else if (name === JUNJI) {
    resolveJunjiDeath(game);
  }
}
