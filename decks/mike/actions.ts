import * as C from '../../engine/cards';
import { MARK_UNBLOCKABLE_THIS_TURN } from './cards';
import type { MikeGame } from './game';
import { CardDef, Cost } from '../../engine/cards';
import { Perm } from '../../engine/game-types';
import { removeIfPresent } from '../../engine/lists';

export function castTreasureCruise(
  game: MikeGame,
  card: CardDef,
  delveCount: number,
): boolean {
  const base = game.effCost(card);
  const cost = base.withGeneric(base.g - delveCount);
  if (!game.pay(cost, true)) return false;
  for (let i = 0; i < delveCount; i++) game.exile.push(game.gy.pop()!);
  removeIfPresent(game.hand, card);
  game.say('cast Treasure Cruise (delve', delveCount + ')');
  game.spellsCast += 1;
  game.onCastIS(false);
  game.draw(3);
  game.exile.push(card);
  game.imitate(card, null);
  return true;
}

export function payAndTap(
  game: MikeGame,
  permanent: Perm,
  cost: string,
  effect: () => void,
): boolean {
  if (!game.pay(Cost.parse(cost))) return false;
  permanent.tapped = true;
  effect();
  return true;
}

export function levelUpWizardClass(
  game: MikeGame,
  permanent: Perm,
  cost: string,
  effect: () => void,
): boolean {
  if (!game.pay(Cost.parse(cost))) return false;
  permanent.counters += 1;
  effect();
  return true;
}

export function equipTo(
  game: MikeGame,
  permanent: Perm,
  carrier: Perm,
  mark: number,
): boolean {
  if (!game.pay(new Cost(2))) return false;
  for (const holder of game.bf) holder.marks &= ~mark;
  carrier.marks |= mark;
  game.say('equip', permanent.cd, 'to', carrier.cd);
  return true;
}

export function useRoguesPassage(
  game: MikeGame,
  permanent: Perm,
  blockedAttacker: Perm,
): boolean {
  if (!game.pay(Cost.parse('{4}'))) return false;
  permanent.tapped = true;
  blockedAttacker.marks |= MARK_UNBLOCKABLE_THIS_TURN;
  return true;
}

export function activateHarmonizedTrio(
  game: MikeGame,
  permanent: Perm,
  others: Perm[],
): boolean {
  if (!game.pay(Cost.parse('{U}'))) return false;
  permanent.tapped = true;
  others[0].tapped = true;
  others[1].tapped = true;
  game.say('Harmonized Trio: a copy of Brainstorm');
  game.spellsCast += 1;
  game.onCastIS(false);
  game.resolve(C.get('Brainstorm'));
  return true;
}

/** Jace +1: mill ourselves two (when the mill is the plan) and draw. */
export function activateJacePlusOne(game: MikeGame, permanent: Perm): boolean {
  permanent.exhausted = true;
  permanent.counters += 1;
  const mill = game.library.length > 3 && game.hasMillWinPiece();
  if (mill) {
    for (let i = 0; i < 2 && game.library.length; i++)
      game.toGy(game.library.shift()!);
  }
  game.say('Jace +1' + (mill ? ' (mills us two)' : ''));
  game.draw(1);
  return true;
}
