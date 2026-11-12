/**
 * The shared combat rules of a pod game: who may block whom, who dies in a fight, and which blocks a defender
 * chooses. Pure functions of the creatures involved, so they are easy to test (see pod.test.ts).
 */
import { Fighter } from './game';

/** May this blocker block this attacker? */
function canBlock(blocker: Fighter, attacker: Fighter): boolean {
  if (attacker.evasion === 'unblockable') return false;
  if (attacker.evasion === 'flying') return blocker.air;
  if (attacker.evasion === 'skulk') return blocker.power <= attacker.power;
  return true;
}

/** Does this creature deal enough damage to kill the other one? */
function wouldKill(attacker: Fighter, victim: Fighter): boolean {
  return (
    attacker.power > 0 &&
    (attacker.power >= victim.toughness || attacker.deathtouch)
  );
}

/** An attacker and its blocker fight: who dies. First strike kills before the other deals damage. */
export function duel(
  attacker: Fighter,
  blocker: Fighter,
): { aDies: boolean; bDies: boolean } {
  const attackerKills = wouldKill(attacker, blocker);
  const blockerKills = wouldKill(blocker, attacker);
  if (attacker.first && !blocker.first && attackerKills)
    return { aDies: false, bDies: true };
  if (blocker.first && !attacker.first && blockerKills)
    return { aDies: true, bDies: false };
  return { aDies: blockerKills, bDies: attackerKills };
}

/** Does the blocker survive the block (and so is a "safe" block)? */
function survivesBlock(blocker: Fighter, attacker: Fighter): boolean {
  return !duel(attacker, blocker).bDies;
}

function cheapestOf(fighters: Fighter[]): Fighter {
  return fighters.reduce((cheapest, f) =>
    f.value < cheapest.value ? f : cheapest,
  );
}

/** Blockers this cheap (tokens, small creatures) are the ones we are willing to chump with. */
const CHEAP_BLOCKER_VALUE = 20;
/** An attacker with this much power is blocked by a cheap creature even when we would survive the hit. */
const HUGE_ATTACKER_POWER = 8;

/**
 * The shared blocking rule (one blocker per attacker). In order:
 * 1. a block the blocker survives (best if it also kills the attacker), biggest attackers first;
 * 2. a trade (both die) when the blocker is worth less than the attacker;
 * 3. if the damage still coming through is lethal: chump the biggest attackers, cheapest blockers first, with anything;
 * 4. if it leaves us at chumpLife or less, or an attacker has 8+ power: chump with tokens and cheap creatures only.
 * `isLethal(unblocked)` says whether the unblocked attackers kill the defender.
 * Returns, for each attacker, the creature that blocks it (null = unblocked).
 */
export function assignBlocks(
  attackers: Fighter[],
  blockers: Fighter[],
  life: number,
  isLethal: (unblocked: Fighter[]) => boolean,
  chumpLife = 10,
): (Fighter | null)[] {
  const blockerFor: (Fighter | null)[] = attackers.map(() => null);
  const freeBlockers = blockers.slice();

  /** Block attacker number `index` with `blocker`. A menace attacker takes a second blocker too (the cheapest other
   *  one): false if there is none. */
  const assign = (index: number, blocker: Fighter): boolean => {
    const attacker = attackers[index];
    if (attacker.menace) {
      const others = freeBlockers.filter(
        (other) => other !== blocker && canBlock(other, attacker),
      );
      if (!others.length) return false;
      freeBlockers.splice(freeBlockers.indexOf(cheapestOf(others)), 1);
    }
    blockerFor[index] = blocker;
    freeBlockers.splice(freeBlockers.indexOf(blocker), 1);
    return true;
  };

  const biggestAttackerFirst = attackers
    .map((_, index) => index)
    .sort((a, b) => attackers[b].power - attackers[a].power);
  const unblockedAttackers = () => attackers.filter((_, i) => !blockerFor[i]);
  const unblockedDamage = () =>
    unblockedAttackers().reduce((total, a) => total + a.power, 0);

  // 1. safe blocks
  for (const index of biggestAttackerFirst) {
    const attacker = attackers[index];
    const safe = freeBlockers.filter(
      (b) => canBlock(b, attacker) && survivesBlock(b, attacker),
    );
    if (!safe.length) continue;
    const killers = safe.filter((b) => duel(attacker, b).aDies);
    assign(index, cheapestOf(killers.length ? killers : safe));
  }

  // 2. trades
  for (const index of biggestAttackerFirst) {
    if (blockerFor[index]) continue;
    const attacker = attackers[index];
    const trades = freeBlockers.filter(
      (b) =>
        canBlock(b, attacker) &&
        duel(attacker, b).aDies &&
        b.value < attacker.value,
    );
    if (trades.length) assign(index, cheapestOf(trades));
  }

  /** Chump the biggest attackers with the cheapest allowed blockers until `enough()`. */
  const chump = (isAllowed: (b: Fighter) => boolean, enough: () => boolean) => {
    for (const index of biggestAttackerFirst) {
      if (enough()) return;
      if (blockerFor[index] || attackers[index].power <= 0) continue;
      const candidates = freeBlockers.filter(
        (b) => isAllowed(b) && canBlock(b, attackers[index]),
      );
      if (candidates.length) assign(index, cheapestOf(candidates));
    }
  };

  // 3. the rest of the damage is lethal: chump with anything
  if (isLethal(unblockedAttackers()))
    chump(
      () => true,
      () => !isLethal(unblockedAttackers()),
    );

  // 4. the damage leaves us low: chump with cheap creatures only
  const isCheap = (b: Fighter) => b.value <= CHEAP_BLOCKER_VALUE;
  if (!isLethal(unblockedAttackers()) && life - unblockedDamage() <= chumpLife)
    chump(isCheap, () => life - unblockedDamage() > chumpLife);

  // huge attackers are always chumped by a cheap creature if there is one
  for (const index of biggestAttackerFirst) {
    if (blockerFor[index] || attackers[index].power < HUGE_ATTACKER_POWER)
      continue;
    const candidates = freeBlockers.filter(
      (b) => isCheap(b) && canBlock(b, attackers[index]),
    );
    if (candidates.length) assign(index, cheapestOf(candidates));
  }
  return blockerFor;
}
