/**
 * Our side of a pod combat: which opponent to attack with which creatures, the creatures kept home as blockers, the
 * creatures that must attack, the attack itself, and casting blockers when the biggest opposing board is too much.
 * Game's methods of the same topic call these (game.ts); every step calls the game's own methods, so a deck's
 * overrides (fighter, strike, mustAttack, evasion, blockValue, onAttack...) run as before. The shared combat rules
 * (who blocks whom) are engine/pod/pod-blocking.ts, the defender's side engine/pod/pod-combat.ts.
 */
import type { Game } from './game';
import { addFirebendingMana } from './firebending';
import { Fighter, FightResult, Permanent } from './game-types';

/** A creature of ours as the pod's combat rules see it (pod-blocking.ts). */
export function describeFighter(
  game: Game<unknown>,
  permanent: Permanent,
  powerOf?: (otherPermanent: Permanent) => number,
  toughnessOf?: (otherPermanent: Permanent) => number,
): Fighter {
  const keywords = permanent.card.keywords;
  return {
    permanent: permanent,
    name: permanent.card.name,
    power: powerOf ? powerOf(permanent) : game.power(permanent),
    toughness: toughnessOf ? toughnessOf(permanent) : game.toughness(permanent),
    evasion: game.evasion(permanent),
    air: keywords.has('flying') || keywords.has('reach'),
    deathtouch: keywords.has('deathtouch'),
    value: game.blockValue(permanent),
    commander: game.isCommander(permanent),
    trample: keywords.has('trample'),
    first: keywords.has('first strike') || keywords.has('double strike'),
    menace: keywords.has('menace'),
    legendary: permanent.card.types.has('legendary'),
  };
}

/** See Game.strike. */
export function attackOpponentForReal(
  game: Game<unknown>,
  slot: number,
  attackers: Permanent[],
  powerOf?: (permanent: Permanent) => number,
  toughnessOf?: (permanent: Permanent) => number,
): { damage: number; connected: Permanent[] } {
  for (const attacker of attackers) game.attackersThisTurn.add(attacker);
  const fightResult = game.arena!.fight(
    game,
    slot,
    attackers.map((permanent) => game.fighter(permanent, powerOf, toughnessOf)),
    true,
  );
  if (fightResult.bounced)
    for (const row of fightResult.rows)
      game.podRemove(row.attacker.permanent, 'bounce');
  for (const row of fightResult.rows)
    if (row.attackerDies) game.dies(row.attacker.permanent);
  if (fightResult.kills)
    game.damageOpponent(slot, Math.max(fightResult.damage, game.life[slot]));
  else if (fightResult.damage > 0) game.combatHit(slot, fightResult.damage);
  return {
    damage: fightResult.damage,
    connected:
      fightResult.damage > 0
        ? fightResult.rows
            .filter((x) => x.blocker === null)
            .map((x) => x.attacker.permanent)
        : [],
  };
}

/** See Game.planAttack. */
export function planAttackOn(
  game: Game<unknown>,
  slot: number,
  pool: Permanent[],
  powerOf?: (permanent: Permanent) => number,
  toughnessOf?: (permanent: Permanent) => number,
): { attackers: Permanent[]; score: number; damage: number } {
  let attackers = pool.slice();
  let fightResult: FightResult = { rows: [], damage: 0, kills: false };
  for (let round = 0; round < 6 && attackers.length; round++) {
    fightResult = game.arena!.fight(
      game,
      slot,
      attackers.map((permanent) =>
        game.fighter(permanent, powerOf, toughnessOf),
      ),
      false,
    );
    if (fightResult.kills) break;
    const bad = new Set(
      fightResult.rows
        .filter(
          (x) =>
            x.blocker !== null &&
            (!x.blockerDies ||
              (x.attackerDies && x.blocker.value < x.attacker.value)),
        )
        .map((x) => x.attacker.permanent),
    );
    if (!bad.size) break;
    attackers = attackers.filter((permanent) => !bad.has(permanent));
  }
  if (!attackers.length) return { attackers: attackers, score: 0, damage: 0 };
  const gain = fightResult.rows.reduce(
    (total, x) =>
      total +
      (x.blockerDies ? x.blocker!.value : 0) -
      (x.attackerDies ? x.attacker.value : 0),
    0,
  );
  return {
    attackers: attackers,
    score:
      (fightResult.kills ? 1000 : 0) +
      fightResult.damage +
      gain / 20 -
      game.life[slot] / 1000,
    damage: fightResult.damage,
  };
}

/** See Game.pickDefender. */
export function bestOpponentToAttack(
  game: Game<unknown>,
  pool: Permanent[],
  prefer?: (slot: number) => number,
): { slot: number; attackers: Permanent[] } | null {
  let best: { slot: number; attackers: Permanent[] } | null = null,
    bestScore = 0;
  for (let i = 0; i < game.life.length; i++) {
    if (!game.isOpponentAlive(i)) continue;
    const plan = game.planAttack(i, pool);
    if (!plan.attackers.length) continue;
    const score =
      plan.score +
      (prefer ? prefer(i) : 0) +
      game.arena!.prefer(game, i) +
      0.01;
    if (best === null || score > bestScore) {
      best = { slot: i, attackers: plan.attackers };
      bestScore = score;
    }
  }
  return best;
}

/** See Game.homeGuard. */
export function creaturesToKeepHome(
  game: Game<unknown>,
  pool: Permanent[],
  powerOf: (permanent: Permanent) => number,
): Set<Permanent> {
  let need = 0;
  for (let i = 0; i < game.life.length; i++) {
    if (!game.isOpponentAlive(i)) continue;
    const opponentPowers = game
      .arena!.board(game, i)
      .sort((first, second) => second - first);
    let sum = opponentPowers.reduce((total, value) => total + value, 0),
      strongestRemoved = 0;
    while (sum >= game.myLife && strongestRemoved < opponentPowers.length)
      sum -= opponentPowers[strongestRemoved++];
    need = Math.max(need, strongestRemoved);
  }
  const stay = new Set<Permanent>();
  if (!need) return stay;
  const others = game
    .creatures()
    .filter(
      (permanent) => !permanent.tapped && !pool.includes(permanent),
    ).length;
  const vig = pool.filter((permanent) =>
    permanent.card.keywords.has('vigilance'),
  ).length;
  const hold = need - others - vig;
  if (hold <= 0 || hold > pool.length) return stay;
  for (const otherPermanent of pool
    .filter((permanent) => !permanent.card.keywords.has('vigilance'))
    .sort((first, second) => powerOf(first) - powerOf(second))
    .slice(0, hold))
    stay.add(otherPermanent);
  return stay;
}

/** See Game.mayAttackOpponent. */
export function mayAttackOpponentInSlot(
  game: Game<unknown>,
  creature: Permanent,
  slot: number,
): boolean {
  if (game.arena!.forbiddenAttackSlots(game, creature).includes(slot))
    return false;
  const goaderSlots = game.arena!.goaderSlots(game, creature);
  if (!goaderSlots.includes(slot)) return true;
  return !game.life.some(
    (_, otherSlot) =>
      game.isOpponentAlive(otherSlot) && !goaderSlots.includes(otherSlot),
  );
}

/** The creatures of the pool that may attack opponent `slot`. */
function allowedAttackers(
  game: Game<unknown>,
  pool: Permanent[],
  slot: number,
): Permanent[] {
  return pool.filter((creature) => game.mayAttackOpponent(creature, slot));
}

/** A forced attacker the plan left home joins a group attacking an opponent it may attack, or starts one at the
 *  opponent its controller would pick (the threat rule). */
function addForcedAttackers(
  game: Game<unknown>,
  groups: { slot: number; attackers: Permanent[] }[],
  pool: Permanent[],
  powerOf?: (permanent: Permanent) => number,
  toughnessOf?: (permanent: Permanent) => number,
): void {
  for (const creature of pool) {
    if (!game.mustAttack(creature)) continue;
    if (groups.some((group) => group.attackers.includes(creature))) continue;
    const group = groups.find((existing) =>
      game.mayAttackOpponent(creature, existing.slot),
    );
    if (group) {
      group.attackers.push(creature);
      continue;
    }
    let bestSlot = -1,
      bestScore = 0;
    for (let slot = 0; slot < game.life.length; slot++) {
      if (!game.isOpponentAlive(slot)) continue;
      if (!game.mayAttackOpponent(creature, slot)) continue;
      const score =
        game.planAttack(slot, [creature], powerOf, toughnessOf).score +
        game.arena!.prefer(game, slot);
      if (bestSlot < 0 || score > bestScore) {
        bestSlot = slot;
        bestScore = score;
      }
    }
    if (bestSlot >= 0) groups.push({ slot: bestSlot, attackers: [creature] });
  }
}

/** See Game.attackWithForcedCreatures. */
export function attackWithCreaturesThatMustAttack(game: Game<unknown>): void {
  if (game.inArena()) {
    const forced = game
      .creatures()
      .filter(
        (creature) =>
          !creature.tapped &&
          (!creature.sick || creature.card.haste) &&
          !game.attackersThisTurn.has(creature) &&
          game.mustAttack(creature),
      );
    if (forced.length) game.arenaCombat(forced);
  }
  game.attackersThisTurn.clear();
}

/** See Game.arenaCombat. */
export function attackInPod(
  game: Game<unknown>,
  pool: Permanent[],
  powerOf?: (permanent: Permanent) => number,
  toughnessOf?: (permanent: Permanent) => number,
): void {
  const power = powerOf ?? ((permanent: Permanent) => game.power(permanent));
  let best: {
    slot: number;
    attackers: Permanent[];
    score: number;
    damage: number;
  } | null = null;
  const stay = game.homeGuard(pool, power);
  for (const guard of stay) if (game.mustAttack(guard)) stay.delete(guard);
  for (const candidates of stay.size
    ? [pool, pool.filter((permanent) => !stay.has(permanent))]
    : [pool]) {
    for (let i = 0; i < game.life.length; i++) {
      if (!game.isOpponentAlive(i)) continue;
      const plan = game.planAttack(
        i,
        allowedAttackers(game, candidates, i),
        powerOf,
        toughnessOf,
      );
      // the whole team only for a kill; otherwise the guards stay home
      if (candidates === pool && stay.size && plan.score < 1000) continue;
      if (!plan.attackers.length || plan.score <= 0) continue;
      const score = plan.score + game.arena!.prefer(game, i);
      if (best === null || score > best.score)
        best = { slot: i, ...plan, score: score };
    }
    if (best) break;
  }
  if (!best && !pool.some((creature) => game.mustAttack(creature))) return;
  // the creatures that weren't sent may attack other opponents (the guards stay home)
  const groups: { slot: number; attackers: Permanent[] }[] = best ? [best] : [];
  const plannedAttackers = best ? best.attackers : [];
  const keepsGuardsHome = best === null || best.score < 1000;
  let rest = pool.filter(
    (permanent) =>
      !plannedAttackers.includes(permanent) &&
      !(stay.has(permanent) && keepsGuardsHome),
  );
  while (rest.length && groups.length < 3) {
    let next: {
      slot: number;
      attackers: Permanent[];
      score: number;
      damage: number;
    } | null = null;
    for (let i = 0; i < game.life.length; i++) {
      if (!game.isOpponentAlive(i) || groups.some((x) => x.slot === i))
        continue;
      const plan = game.planAttack(
        i,
        allowedAttackers(game, rest, i),
        powerOf,
        toughnessOf,
      );
      if (!plan.attackers.length || plan.score <= 0) continue;
      const score = plan.score + game.arena!.prefer(game, i);
      if (next === null || score > next.score)
        next = { slot: i, ...plan, score: score };
    }
    if (!next) break;
    groups.push(next);
    rest = rest.filter((permanent) => !next!.attackers.includes(permanent));
  }
  addForcedAttackers(game, groups, pool, powerOf, toughnessOf);
  if (!groups.length) return;
  game.attacked = true;
  const sent = groups.flatMap((x) => x.attackers);
  for (const permanent of sent)
    if (!permanent.card.keywords.has('vigilance')) permanent.tapped = true;
  addFirebendingMana(game, sent);
  const joined = game.onAttack(sent);
  const connected: Permanent[] = [];
  let total = 0;
  groups.forEach((group, groupIndex) => {
    const all = [
      ...group.attackers,
      ...(groupIndex === 0 ? joined : []),
    ].filter((permanent) => game.battlefield.includes(permanent));
    if (!all.length || !game.isOpponentAlive(group.slot)) return;
    const strikeResult = game.strike(group.slot, all, powerOf, toughnessOf);
    connected.push(...strikeResult.connected);
    total += strikeResult.damage;
    game.sayEvent(
      'attack',
      `attack ${game.opponentName(group.slot)} with ${all.length} creature(s): ${strikeResult.damage} damage (${game.opponentName(group.slot)} ${game.life[group.slot]})`,
    );
  });
  game.onCombatDamage(
    connected.filter((permanent) => game.battlefield.includes(permanent)),
    total,
  );
}

/** See Game.podDefence. */
export function castCreaturesAsBlockers(game: Game<unknown>): void {
  for (let round = 0; round < 4; round++) {
    const worst = game.biggestAttackNextTurn();
    if (
      worst <= 0 ||
      game.myLife - worst > ((game.config.chump_life as number) ?? 10)
    )
      return;
    const cards = game.hand
      .filter(
        (card) =>
          card.isCreature && game.canPay(game.effectiveCost(card), false),
      )
      .sort(
        (first, second) =>
          game.effectiveCost(first).manaValue -
          game.effectiveCost(second).manaValue,
      );
    if (!cards.length || !game.castPerm(cards[0])) return;
    game.say(
      '(a blocker: the biggest opposing board would leave us at',
      game.myLife - worst,
      'life)',
    );
  }
}

/** See Game.biggestAttackNextTurn. */
export function damageOfBiggestAttackNextTurn(game: Game<unknown>): number {
  const mine = game.creatures().filter((permanent) => !permanent.tapped).length;
  let worst = 0;
  for (let i = 0; i < game.life.length; i++) {
    if (!game.isOpponentAlive(i)) continue;
    const opponentPowers = game
      .arena!.board(game, i)
      .sort((first, second) => second - first)
      .slice(mine);
    worst = Math.max(
      worst,
      opponentPowers.reduce((total, value) => total + value, 0),
    );
  }
  return worst;
}
