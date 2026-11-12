import {
  BACKUP,
  CODIE,
  CRACKLE_WITH_POWER,
  EXSANGUINATE,
  FINISHERS,
  REITERATE,
  RETURN_THE_FAVOR,
  TORMENT_OF_HAILFIRE,
} from './cards';
import type { CodieGame } from './game';
import { Cost } from '../../engine/cards';

// ---------------------------------------------------------------- the finishers
/** Does a counterspell / protection spell stay castable after this state? */
export function isBackupReady(game: CodieGame): boolean {
  for (const card of game.hand) {
    const backup = BACKUP[card.name];
    if (!backup) continue;
    if (backup[1] === 'commander' && !game.onBf(CODIE)) continue;
    if (
      backup[1] === 'island' &&
      !game.landsBf().some((permanent) => permanent.land?.island)
    )
      continue;
    if (game.canPay(Cost.parse(backup[0]), true)) return true;
  }
  return false;
}

/** Copies of a spell: the cost of n resolutions (the original and n-1 copies): k Reiterate casts (each {1}{R}{R}, buyback {3} on all
 *  but the last) and maybe one Return the Favor ({R}{R} + {1} for the copy mode). Null if the cards in hand can't do it. */
export function reiterateCopyCost(
  game: CodieGame,
  resolutionCount: number,
): Cost | null {
  if (resolutionCount <= 1) return new Cost();
  const hasR = game.inHand(REITERATE),
    hasF = game.inHand(RETURN_THE_FAVOR);
  let best: Cost | null = null;
  for (const favorCount of hasF ? [0, 1] : [0]) {
    const reiterateCasts = resolutionCount - 1 - favorCount;
    if (reiterateCasts < 0 || (reiterateCasts > 0 && !hasR)) continue;
    const genericCost =
      reiterateCasts + 3 * Math.max(0, reiterateCasts - 1) + favorCount;
    const cost = new Cost(
      genericCost,
      0,
      0,
      0,
      0,
      2 * reiterateCasts + 2 * favorCount,
    );
    if (best === null || cost.mv < best.mv) best = cost;
  }
  return best;
}

/** The kill: the cheapest X spell (with the cheapest copies) that kills every opponent, payable now. */
export function findFinisherCast(
  game: CodieGame,
  needBackup: boolean,
): string[] | null {
  const life = Math.max(...game.life.filter((life) => life > 0), 1);
  const opps = game.life.filter((life) => life > 0).length;
  for (const finisher of FINISHERS) {
    if (
      !game.inHand(finisher) &&
      !(game.digAll && game.library.some((card) => card.name === finisher))
    )
      continue;
    for (let resolutionCount = 1; resolutionCount <= 6; resolutionCount++) {
      const copyCost = reiterateCopyCost(game, resolutionCount);
      if (copyCost === null) continue;
      for (let xValue = 1; xValue <= 80; xValue++) {
        if (!finisherKills(game, finisher, xValue, resolutionCount, life, opps))
          continue;
        const cost = (
          finisher === CRACKLE_WITH_POWER
            ? new Cost(3 * xValue, 0, 0, 0, 0, 2)
            : new Cost(xValue, 0, 2)
        ).plus(copyCost);
        if (game.canPay(cost, true)) {
          if (needBackup) {
            const paidCopy = game.clone();
            paidCopy.pay(cost, true);
            if (!isBackupReady(paidCopy)) break;
          }
          return [
            `cast ${finisher} X=${xValue}${resolutionCount > 1 ? ` with ${resolutionCount - 1} cop${resolutionCount > 2 ? 'ies' : 'y'}` : ''} (${cost.mv} mana)`,
          ];
        }
        break; // a bigger X for this n costs more: not payable
      }
    }
  }
  return null;
}

/** Does this finisher with X and n resolutions kill every opponent? */
export function finisherKills(
  game: CodieGame,
  finisher: string,
  xValue: number,
  resolutionCount: number,
  life: number,
  opps: number,
): boolean {
  if (finisher === EXSANGUINATE) return resolutionCount * xValue >= life;
  if (finisher === TORMENT_OF_HAILFIRE)
    return (
      3 * Math.max(0, resolutionCount * xValue - game.tormentPayments()) >= life
    );
  // Crackle: five times X to each of up to X targets, n times
  const hits = Math.ceil(life / (5 * xValue));
  return hits * opps <= resolutionCount * Math.min(xValue, opps);
}
