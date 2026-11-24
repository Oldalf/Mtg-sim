/**
 * Aesi's combat: flyers attack whenever they can, ground creatures only when the attack kills the table (half of them
 * blocked), no crackback; and the Siege from Invasion of Zendikar (attacked with flyers until it is defeated, then it
 * becomes Awakened Skyclave). AesiGame's combat, attackSiege and defeatSiege call these.
 */
import type { AesiGame } from './game';
import { DRUID, INVASION, SKYCLAVE, TOK } from './cards';
import { Permanent } from '../../engine/game/game-types';

/** Flyers attack whenever they can; ground creatures only if attacking with everything kills the table
 *  (opponents block half of them, the biggest). No crackback. */
export function attackAsAesi(game: AesiGame): void {
  if (game.attacked) return;
  const ready = game
    .creatures()
    .filter(
      (permanent) =>
        !permanent.tapped &&
        (!permanent.sick || permanent.card.haste) &&
        game.power(permanent) > 0,
    );
  const flyers = ready.filter((permanent) => permanent.card.flying);
  const ground = ready
    .filter((permanent) => !permanent.card.flying)
    .sort(
      (permanent, otherPermanent) =>
        game.power(otherPermanent) - game.power(permanent),
    );
  let druidLandSize = 0;
  const druid = game.findPermanent(DRUID);
  if (druid && druid.counters >= 3)
    druidLandSize = game.landsOnBattlefield().length; // a land creature with haste
  const flyerDamage = flyers.reduce(
    (total, permanent) => total + game.power(permanent),
    0,
  );
  // lands that are 2/2 creatures (Nature's Revolt, Natural Affinity, Sylvan Awakening): untapped ones that
  // aren't summoning sick (Awakening gives haste)
  const landAttackers = game.landsCreatures()
    ? game
        .landsOnBattlefield()
        .filter(
          (permanent) =>
            !permanent.tapped && (!permanent.sick || game.awakened),
        )
    : [];
  if (game.inArena()) {
    // a pod: real blockers decide. Land creatures are 2/2; the Druid Class land is as big as our land count
    const anotherPermanent = druidLandSize
      ? (landAttackers[0] ??
        game.landsOnBattlefield().find((permanent) => !permanent.tapped) ??
        null)
      : null;
    const pool = [
      ...ready,
      ...landAttackers,
      ...(anotherPermanent && !landAttackers.includes(anotherPermanent)
        ? [anotherPermanent]
        : []),
    ];
    const size = (permanent: Permanent) =>
      permanent === anotherPermanent ? druidLandSize : 2;
    if (pool.length)
      game.arenaCombat(
        pool,
        (permanent) =>
          permanent.land !== null ? size(permanent) : game.power(permanent),
        (permanent) =>
          permanent.land !== null ? size(permanent) : game.toughness(permanent),
      );
    game.checkKill();
    return;
  }
  const attackPowers = [
    ...ground.map((permanent) => game.power(permanent)),
    ...(druidLandSize ? [druidLandSize] : []),
    ...landAttackers.map(() => 2),
  ].sort((first, second) => second - first);
  const groundDamage = attackPowers
    .slice(Math.floor(attackPowers.length / 2))
    .reduce((total, value) => total + value, 0);
  let attackers = flyers,
    damage = flyerDamage;
  const isAllIn =
    attackPowers.length > 0 && game.winsWith(flyerDamage + groundDamage);
  if (isAllIn) {
    attackers = [...flyers, ...ground, ...landAttackers];
    damage = flyerDamage + groundDamage;
  }
  if (damage <= 0) return;
  game.attacked = true;
  for (const attacker of attackers) attacker.tapped = true;
  const siege = game.findPermanent(INVASION);
  if (siege && !isAllIn) damage -= game.attackSiege(siege, flyers);
  let left = damage;
  while (left > 0) {
    const target = game.chooseTargetOpponent();
    if (target === null) break;
    const damageToOpponent = Math.min(left, game.life[target]);
    game.damageOpponent(target, damageToOpponent);
    left -= damageToOpponent;
  }
  game.say(
    `attack with ${attackers.length} creature(s)${druidLandSize && attackers.length > flyers.length ? ' + the Druid Class land' : ''}: ` +
      `${damage} damage, ${game.describeOpponentLife()}`,
  );
  game.checkKill();
}

/** Flyers attack Invasion of Zendikar first, the smallest ones until its defense is gone (the opponent
 *  protecting it can't block flyers in a goldfish game). Returns the power sent at it. */
export function attackTheSiege(
  game: AesiGame,
  siege: Permanent,
  flyers: Permanent[],
): number {
  const smallestFirst = flyers
    .filter((permanent) => permanent.card !== TOK.illusionArmy)
    .sort(
      (permanent, otherPermanent) =>
        game.power(permanent) - game.power(otherPermanent),
    );
  let powerSent = 0;
  for (const flyer of smallestFirst) {
    if (powerSent >= siege.counters) break;
    powerSent += game.power(flyer);
  }
  if (powerSent === 0) return 0;
  siege.counters -= powerSent;
  game.say(
    `attack Invasion of Zendikar with ${powerSent} power (defense ${Math.max(0, siege.counters)} left)`,
  );
  if (siege.counters <= 0) game.defeatSiege(siege);
  return powerSent;
}

/** A defeated Siege is exiled and cast transformed: Awakened Skyclave enters as a land (a landfall trigger). */
export function defeatTheSiege(game: AesiGame, siege: Permanent): void {
  game.takeFromBattlefieldIfThere(siege);
  game.putCard(siege.card, 'exile'); // for the log: the Siege goes to exile first
  game.takeCard(siege.card, 'exile');
  const skyclave = new Permanent(SKYCLAVE, SKYCLAVE.land);
  game.putOntoBattlefield(skyclave);
  game.say('Invasion of Zendikar defeated: cast Awakened Skyclave (a land)');
  game.onLandEnter(skyclave, false);
}
