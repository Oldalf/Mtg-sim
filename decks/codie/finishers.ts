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
import type { CodieKillStep } from './solver';
import { Cost } from '../../engine/cards/cards';

// ---------------------------------------------------------------- the finishers
/** Does a counterspell / protection spell stay castable after this state? */
export function isBackupReady(game: CodieGame): boolean {
  for (const card of game.hand) {
    const backup = BACKUP[card.name];
    if (!backup) continue;
    if (backup[1] === 'commander' && !game.isOnBattlefield(CODIE)) continue;
    if (
      backup[1] === 'island' &&
      !game.landsOnBattlefield().some((permanent) => permanent.land?.island)
    )
      continue;
    if (game.canPay(Cost.parse(backup[0]), true)) return true;
  }
  return false;
}

/** How a spell gets its copies: Reiterate casts, Return the Favor casts, and what they cost together. */
interface CopyPlan {
  cost: Cost;
  reiterateCasts: number;
  favorCasts: number;
}

/** Copies of a spell: the cost of n resolutions (the original and n-1 copies): k Reiterate casts (each {1}{R}{R}, buyback {3} on all
 *  but the last) and maybe one Return the Favor ({R}{R} + {1} for the copy mode). Null if the cards in hand can't do it. */
export function reiterateCopyCost(
  game: CodieGame,
  resolutionCount: number,
): Cost | null {
  return planCopies(game, resolutionCount)?.cost ?? null;
}

function planCopies(game: CodieGame, resolutionCount: number): CopyPlan | null {
  if (resolutionCount <= 1)
    return { cost: new Cost(), reiterateCasts: 0, favorCasts: 0 };
  const hasR = game.inHand(REITERATE),
    hasF = game.inHand(RETURN_THE_FAVOR);
  let best: CopyPlan | null = null;
  for (const favorCasts of hasF ? [0, 1] : [0]) {
    const reiterateCasts = resolutionCount - 1 - favorCasts;
    if (reiterateCasts < 0 || (reiterateCasts > 0 && !hasR)) continue;
    const genericCost =
      reiterateCasts + 3 * Math.max(0, reiterateCasts - 1) + favorCasts;
    const cost = new Cost(
      genericCost,
      0,
      0,
      0,
      0,
      2 * reiterateCasts + 2 * favorCasts,
    );
    if (best === null || cost.manaValue < best.cost.manaValue)
      best = { cost, reiterateCasts, favorCasts };
  }
  return best;
}

/** The mana cost of a finisher with this X (the copies not included). */
function finisherCost(finisher: string, xValue: number): Cost {
  return finisher === CRACKLE_WITH_POWER
    ? new Cost(3 * xValue, 0, 0, 0, 0, 2)
    : new Cost(xValue, 0, 2);
}

/** The kill: the cheapest X spell (with the cheapest copies) that kills every opponent, payable now. */
export function findFinisherCast(
  game: CodieGame,
  needBackup: boolean,
): CodieKillStep | null {
  const life = Math.max(...game.life.filter((life) => life > 0), 1);
  const opponents = game.life.filter((life) => life > 0).length;
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
        if (
          !finisherKills(
            game,
            finisher,
            xValue,
            resolutionCount,
            life,
            opponents,
          )
        )
          continue;
        const cost = finisherCost(finisher, xValue).plus(copyCost);
        if (game.canPay(cost, true)) {
          if (needBackup) {
            const paidCopy = game.clone();
            paidCopy.pay(cost, true);
            if (!isBackupReady(paidCopy)) break;
          }
          return {
            kind: 'finisher',
            card: finisher,
            xValue,
            resolutionCount,
            text: `cast ${finisher} X=${xValue}${resolutionCount > 1 ? ` with ${resolutionCount - 1} cop${resolutionCount > 2 ? 'ies' : 'y'}` : ''} (${cost.manaValue} mana)`,
          };
        }
        break; // a bigger X for this n costs more: not payable
      }
    }
  }
  return null;
}

/** The kill line's last step, for real: the finisher is paid with its copies (the last Reiterate and Return the Favor go
 *  to the graveyard, a bought-back Reiterate stays in hand) and each resolution hits the opponents. */
export function castFinisher(
  game: CodieGame,
  step: CodieKillStep,
): string | null {
  const name = step.card!;
  const xValue = step.xValue!;
  const resolutionCount = step.resolutionCount!;
  const fromLibrary = !game.inHand(name);
  const card = fromLibrary
    ? game.digAll
      ? game.library.find((libraryCard) => libraryCard.name === name)
      : undefined
    : game.cardInHand(name);
  if (!card) return `${name} is not in hand`;
  const copies = planCopies(game, resolutionCount);
  if (copies === null) return `no way to copy ${name}`;
  const cost = finisherCost(name, xValue).plus(copies.cost);
  if (!game.pay(cost, true)) return `cannot pay ${cost} for ${name}`;
  game.takeCard(card, fromLibrary ? 'library' : 'hand');
  game.sayEvent('cast', step.text);
  game.spellsCast += 1;
  if (copies.reiterateCasts > 0) moveFromHandToGraveyard(game, REITERATE);
  if (copies.favorCasts > 0) moveFromHandToGraveyard(game, RETURN_THE_FAVOR);
  if (name === TORMENT_OF_HAILFIRE)
    resolveTorment(game, resolutionCount * xValue);
  else
    for (let resolution = 0; resolution < resolutionCount; resolution++)
      resolveFinisherOnce(game, name, xValue);
  game.putCard(card, 'graveyard');
  game.say(
    `  ${name} resolves ${resolutionCount} time(s): ${game.describeOpponentLife()}`,
  );
  return null;
}

function moveFromHandToGraveyard(game: CodieGame, name: string): void {
  const card = game.cardInHand(name);
  if (!card) return;
  game.takeCard(card, 'hand');
  game.putCard(card, 'graveyard');
}

/** Torment of Hailfire, all its resolutions together (as finisherKills counts them): each opponent pays (sacrifices,
 *  discards) the first times and loses 3 life for each of the rest. */
function resolveTorment(game: CodieGame, totalX: number): void {
  game.drainEach(3 * Math.max(0, totalX - game.tormentPayments()));
}

/** One resolution of a finisher. Exsanguinate: each opponent loses X, we gain it. Crackle with Power: 5 times X to each
 *  of up to X targets, the opponents with the most life first. */
function resolveFinisherOnce(
  game: CodieGame,
  name: string,
  xValue: number,
): void {
  if (name === EXSANGUINATE) {
    game.gainLife(game.drainEach(xValue));
    return;
  }
  const targets = game.life
    .map((life, slot) => ({ life, slot }))
    .filter(({ slot }) => game.isOpponentAlive(slot))
    .sort((first, second) => second.life - first.life)
    .slice(0, xValue);
  for (const { slot } of targets) game.damageOpponent(slot, 5 * xValue);
}

/** Does this finisher with X and n resolutions kill every opponent? */
export function finisherKills(
  game: CodieGame,
  finisher: string,
  xValue: number,
  resolutionCount: number,
  life: number,
  opponents: number,
): boolean {
  if (finisher === EXSANGUINATE) return resolutionCount * xValue >= life;
  if (finisher === TORMENT_OF_HAILFIRE)
    return (
      3 * Math.max(0, resolutionCount * xValue - game.tormentPayments()) >= life
    );
  // Crackle: five times X to each of up to X targets, n times
  const hits = Math.ceil(life / (5 * xValue));
  return hits * opponents <= resolutionCount * Math.min(xValue, opponents);
}
