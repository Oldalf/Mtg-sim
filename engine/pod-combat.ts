/**
 * One attack in a pod game: the defender answers with instant removal, blocks by the shared rule (pod-blocking.ts),
 * and the damage that gets through is worked out. Commander damage is counted here (21 from one commander kills).
 */
import { Fighter, FightResult, FightRow } from './game-types';
import { Game } from './game';
import { assignBlocks, duel } from './pod-blocking';
import { hitWithRemoval } from './pod-interaction';
import { PodTable } from './pod-table';

const COMMANDER_DAMAGE_TO_KILL = 21;
/** The defender starts answering attacks with removal when a hit would leave it this low (unless set in its config). */
const DEFAULT_CHUMP_LIFE = 10;
const MAX_REMOVAL_ANSWERS_PER_ATTACK = 3;

/**
 * `attackingGame` attacks the opponent in `slot` with these creatures. With apply = false it only forecasts the result.
 */
export function fightOpponent(
  table: PodTable,
  attackingGame: Game<unknown>,
  slot: number,
  attackersIn: Fighter[],
  apply: boolean,
): FightResult {
  const attackerPlayer = table.playerOf(attackingGame);
  const defenderPlayer = table.opponentsOf[attackerPlayer][slot];
  const defender = table.games[defenderPlayer];
  const defenderLife = attackingGame.life[slot];

  const commanderKey = (attacker: Fighter) =>
    `${defenderPlayer}|${attackerPlayer}|${attacker.name}`;
  const isLethal = (unblocked: Fighter[]) =>
    !table.fogActive &&
    (unblocked.reduce((total, fighter) => total + fighter.power, 0) >=
      defenderLife ||
      unblocked.some(
        (fighter) =>
          fighter.commander &&
          (table.commanderDamage.get(commanderKey(fighter)) ?? 0) +
            fighter.power >=
            COMMANDER_DAMAGE_TO_KILL,
      ));
  const blockers = defender
    .blockers()
    .filter((blocker) => !table.creaturesThatBlocked.has(blocker.permanent));
  const chumpLife =
    (defender.config.chump_life as number) ?? DEFAULT_CHUMP_LIFE;

  let attackers = attackersIn;
  if (apply && table.answersEnabled && !table.fogActive)
    attackers = removeAttackersWithInstants(
      table,
      attackingGame,
      defenderPlayer,
      attackers,
      blockers,
      defenderLife,
      isLethal,
      chumpLife,
    );

  const blocksByAttacker = assignBlocks(
    attackers,
    blockers,
    defenderLife,
    isLethal,
    chumpLife,
  );
  const rows: FightRow[] = attackers.map((attacker, index) => {
    const blocker = blocksByAttacker[index];
    const outcome =
      blocker && !table.fogActive
        ? duel(attacker, blocker)
        : { attackerDies: false, blockerDies: false };
    return {
      attacker,
      blocker,
      attackerDies: outcome.attackerDies,
      blockerDies: outcome.blockerDies,
    };
  });
  const unblocked = rows
    .filter((row) => row.blocker === null)
    .map((row) => row.attacker);
  // trample: what the blocker doesn't soak up goes through
  const trampleDamage = rows.reduce(
    (total, row) =>
      total +
      (row.blocker && row.attacker.trample
        ? Math.max(
            0,
            row.attacker.power -
              (row.attacker.deathtouch ? 1 : row.blocker.toughness),
          )
        : 0),
    0,
  );
  let damage = table.fogActive
    ? 0
    : unblocked.reduce((total, fighter) => total + fighter.power, 0) +
      trampleDamage;
  let isKill = isLethal(unblocked);
  if (!apply) return { rows, damage: damage, kills: isKill };

  for (const row of rows)
    if (row.blocker) table.creaturesThatBlocked.add(row.blocker.permanent);
  const defence = defendAgainstDamage(table, defenderPlayer, damage, isKill);
  if (defence === 'fog') {
    table.fogActive = true;
    damage = 0;
    isKill = false;
    for (const row of rows) row.attackerDies = row.blockerDies = false;
    table.sayAs(
      defenderPlayer,
      'prevents all combat damage this turn',
      'answer',
    );
  } else if (defence === 'bounce') {
    table.sayAs(
      defenderPlayer,
      "returns the attacking creatures to their owner's hand",
      'answer',
    );
    table.stats.removals[defenderPlayer]++;
    return {
      rows: rows.map((row) => ({
        ...row,
        attackerDies: false,
        blockerDies: false,
      })),
      damage: 0,
      kills: false,
      bounced: true,
    };
  }

  for (const row of rows) {
    if (!row.blocker) continue;
    const outcome =
      row.attackerDies && row.blockerDies
        ? ' (both die)'
        : row.attackerDies
          ? ' and kills it'
          : row.blockerDies
            ? ' and dies'
            : '';
    table.sayAs(
      defenderPlayer,
      `${row.blocker.name} blocks ${row.attacker.name}${outcome}`,
      'note',
      [row.blocker.name, row.attacker.name],
    );
    if (row.blockerDies) defender.dies(row.blocker.permanent);
  }
  if (damage > 0)
    for (const attacker of unblocked)
      if (attacker.commander)
        table.commanderDamage.set(
          commanderKey(attacker),
          (table.commanderDamage.get(commanderKey(attacker)) ?? 0) +
            attacker.power,
        );
  if (isKill && damage < defenderLife)
    table.commanderKilled.add(defenderPlayer);
  return { rows, damage: damage, kills: isKill };
}

/** What the defender's own deck does about the damage: 'fog' (prevent it), 'bounce' (return the attackers) or 'none'. */
function defendAgainstDamage(
  table: PodTable,
  defenderPlayer: number,
  damage: number,
  isKill: boolean,
): string {
  if (damage <= 0) return 'none';
  const defender = table.games[defenderPlayer];
  if (table.answersEnabled) return defender.podDefend(damage, isKill);
  return defender.fogPrevent(damage, isKill) ? 'fog' : 'none';
}

/**
 * The defender answers the attack: instant removal on the biggest attacker that would connect, if the hit is lethal or
 * leaves it low. Returns the attackers that are left.
 */
function removeAttackersWithInstants(
  table: PodTable,
  attackingGame: Game<unknown>,
  defenderPlayer: number,
  attackersIn: Fighter[],
  blockers: Fighter[],
  defenderLife: number,
  isLethal: (unblocked: Fighter[]) => boolean,
  chumpLife: number,
): Fighter[] {
  const attackerPlayer = table.playerOf(attackingGame);
  const defender = table.games[defenderPlayer];
  let attackers = attackersIn;
  for (let tries = 0; tries < MAX_REMOVAL_ANSWERS_PER_ATTACK; tries++) {
    const blocks = assignBlocks(
      attackers,
      blockers,
      defenderLife,
      isLethal,
      chumpLife,
    );
    const unblocked = attackers.filter((_, index) => !blocks[index]);
    const damage = unblocked.reduce(
      (total, fighter) => total + fighter.power,
      0,
    );
    const hitIsDangerous =
      isLethal(unblocked) || (damage > 0 && defenderLife - damage <= chumpLife);
    if (!hitIsDangerous) break;

    let castRemoval = false;
    const biggestFirst = unblocked
      .slice()
      .sort((first, second) => second.power - first.power);
    for (const attacker of biggestFirst) {
      const removalCard = defender.hand.find((card) => {
        const answer = defender.answer(card);
        return (
          answer?.kind === 'removal' &&
          answer.instant &&
          Game.permOk(answer, attacker.permanent.card.types) &&
          attackingGame.podCanTarget(attacker.permanent, answer) &&
          defender.canPay(defender.answerCost(card), true)
        );
      });
      if (!removalCard) continue;
      const answer = defender.answer(removalCard)!;
      defender.podCast(removalCard);
      table.stats.removals[defenderPlayer]++;
      hitWithRemoval(
        table,
        defenderPlayer,
        removalCard.name,
        attackerPlayer,
        attacker.permanent,
        answer,
      );
      if (!attackingGame.battlefield.includes(attacker.permanent))
        attackers = attackers.filter((fighter) => fighter !== attacker);
      castRemoval = true;
      break;
    }
    if (!castRemoval) break;
  }
  return attackers;
}
