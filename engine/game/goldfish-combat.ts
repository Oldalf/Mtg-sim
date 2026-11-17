/**
 * Goldfish combat for creature decks (rules agreed for creature decks):
 * - flying attackers always connect; of the others, opponents block half (rounded down), the biggest ones;
 * - crackback: we take back what we dealt, minus a third for each untapped creature kept home
 *   (none if a fog creature such as Spore Frog stays home; it is sacrificed before our next turn);
 * - if attacking with everything wins, do it; otherwise the biggest attack that keeps us above
 *   config.combat_safety life (default 10).
 * Damage goes to the opponent closest to dead first, the rest to the next one. In a pod the attack goes to
 * arenaCombat instead. GameCore.creatureCombat calls this; a deck steers it with canAttack, fogBlocker, evasive,
 * winsWith, onAttack and onCombatDamage.
 */
import type { GameCore } from './game-core';
import { Permanent } from './game-types';
import { addFirebendingMana } from './firebending';

export function playGoldfishCombat(game: GameCore): void {
  if (game.attacked) return;
  const candidates = game
    .creatures()
    .filter((permanent) => game.canAttack(permanent));
  if (!candidates.length) return;
  if (game.inArena()) {
    game.arenaCombat(candidates);
    return;
  }
  const fog = game.fogBlocker();
  const pool = fog
    ? candidates.filter((permanent) => permanent !== fog)
    : candidates;
  pool.sort((first, second) => game.power(second) - game.power(first));
  const untappedOthers = (attacking: Set<Permanent>) =>
    game
      .creatures()
      .filter((permanent) => !permanent.tapped && !attacking.has(permanent))
      .length;
  const connecting = (attackers: Permanent[]) => {
    const fly = attackers.filter((permanent) => game.evasive(permanent)),
      ground = attackers.filter((permanent) => !game.evasive(permanent));
    const blocked = Math.floor(ground.length / 2);
    // opponents block the biggest ground attackers
    const permanents = ground
      .slice()
      .sort((first, second) => game.power(second) - game.power(first))
      .slice(blocked);
    return [...fly, ...permanents];
  };
  const deal = (attackers: Permanent[]) =>
    connecting(attackers).reduce(
      (total, permanent) => total + game.power(permanent),
      0,
    );
  const crackback = (attackers: Permanent[], damage: number) => {
    if (fog) return 0;
    const home = untappedOthers(new Set(attackers));
    return Math.round(damage * Math.max(0, 1 - home / 3));
  };
  const safety = (game.config.combat_safety as number) ?? 10;
  let best: Permanent[] = [],
    bestDmg = 0;
  for (let attackerCount = 1; attackerCount <= pool.length; attackerCount++) {
    const attackers = pool.slice(0, attackerCount);
    const damage = deal(attackers);
    if (game.winsWith(damage)) {
      best = attackers;
      bestDmg = damage;
      break;
    } // a winning attack: always take it
    if (
      game.myLife - crackback(attackers, damage) > safety &&
      damage > bestDmg
    ) {
      best = attackers;
      bestDmg = damage;
    }
  }
  if (!best.length) return;
  game.attacked = true;
  for (const otherPermanent of best) otherPermanent.tapped = true;
  addFirebendingMana(game, best);
  const all = [...best, ...game.onAttack(best)].filter((permanent) =>
    game.battlefield.includes(permanent),
  );
  let damage = deal(all);
  const total = damage;
  while (damage > 0) {
    const targetIndex = game.chooseTargetOpponent();
    if (targetIndex === null) break;
    const hit = Math.min(damage, game.life[targetIndex]);
    game.damageOpponent(targetIndex, hit);
    damage -= hit;
  }
  game.onCombatDamage(connecting(all), total);
  game.pendingCrackback += crackback(best, total);
  if (fog) game.fogUsed = true;
  game.sayEvent(
    'attack',
    `attack with ${all.length} creature(s): ${total} damage, ${game.describeOpponentLife()}` +
      (fog
        ? ` (${fog.card.name} stays home)`
        : `, crackback ${crackback(best, total)}`),
  );
}
