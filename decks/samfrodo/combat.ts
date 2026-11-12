import { FOOD, FRODO, GOLLUM, SAM, isHalfling } from './cards';
import type { SamFrodoGame } from './game';
import { Cost } from '../../engine/cards';
import { Perm } from '../../engine/game-types';

// ================================================================ combat
/** Goldfish combat: only Frodo (for the Ring) and Gollum (for its end-step drain) attack, unless everything kills the table. */
export function playCombat(game: SamFrodoGame): void {
  game.phase = 'combat';
  if (game.isOnBattlefield(SAM)) game.makeTokens([FOOD]); // Sam: at the beginning of combat on your turn
  if (game.checkKill() === 2) return;
  if (game.inArena()) {
    playPodCombat(game);
    return;
  }
  if (tryAllInAttack(game)) return;
  const frodo = game.findPermanent(FRODO);
  const gollum = game.findPermanent(GOLLUM);
  const isReady = (permanent: Perm | null) =>
    permanent !== null && !permanent.sick && !permanent.tapped;
  // Frodo wants 3 life gained this turn before attacking: crack a Food (cheaper with Sam)
  if (isReady(frodo) && game.lifeGainedThisTurn < 3)
    eatFoodsToGainLife(game, 3 - game.lifeGainedThisTurn);
  const attackers: Perm[] = [];
  if (isReady(frodo) && (game.lifeGainedThisTurn >= 3 || game.ringTempts >= 1))
    attackers.push(frodo!);
  if (isReady(gollum)) attackers.push(gollum!);
  if (!attackers.length) return;
  game.attacked = true;
  for (const attacker of attackers)
    if (attacker !== frodo) attacker.tapped = true; // Frodo has vigilance
  if (attackers.some((permanent) => isHalfling(permanent.card)))
    makeFoodsForMeriadoc(game);
  let dealtDamage = false;
  if (attackers.includes(frodo!)) {
    resolveRingTemptation(game);
    const target = game.opponentWithMostLife();
    if (target !== null) {
      game.damageOpponent(target, game.power(frodo!));
      dealtDamage = true;
      if (game.ringTempts >= 4) game.drainEach(3);
    }
  }
  if (attackers.includes(gollum!)) {
    // skulk: it connects. Hit an opponent Gollum hasn't hit yet
    let target: number | null = null;
    for (let i = 0; i < game.life.length; i++)
      if (
        game.isOpponentAlive(i) &&
        !game.gollumHit[i] &&
        (target === null || game.life[i] > game.life[target])
      )
        target = i;
    if (target === null) target = game.opponentWithMostLife();
    if (target !== null) {
      game.damageOpponent(target, game.power(gollum!));
      game.gollumHit[target] = true;
      dealtDamage = true;
    }
  }
  if (dealtDamage) makeFoodsForRapaciousGuests(game);
  game.say(
    `attack with ${attackers.map((permanent) => permanent.card.name.split(',')[0]).join(' + ')}: opp life [${game.life.join(', ')}]`,
  );
  game.checkKill();
}

/** Meriadoc Brandybuck: a Food each time a Halfling attacks. */
function makeFoodsForMeriadoc(game: SamFrodoGame): void {
  for (const _ of game.battlefield.filter(
    (permanent) => permanent.card.name === 'Meriadoc Brandybuck',
  ))
    game.makeTokens([FOOD]);
}

/** Rapacious Guest: a Food each time a creature of ours deals combat damage to an opponent. */
function makeFoodsForRapaciousGuests(game: SamFrodoGame): void {
  for (const _ of game.battlefield.filter(
    (permanent) => permanent.card.name === 'Rapacious Guest',
  ))
    game.makeTokens([FOOD]);
}

/** Frodo attacks: with 3 life gained the Ring tempts us. The Ring's second ability (draw, then discard) only works if it
 *  was already there when Frodo attacked. */
function resolveRingTemptation(game: SamFrodoGame): void {
  const hadSecondAbility = game.ringTempts >= 2;
  if (game.lifeGainedThisTurn >= 3) {
    game.ringTempts++;
    game.say(`the Ring tempts you (${game.ringTempts})`);
    if (game.ringTempts >= 2) game.draw(1); // Frodo: then if the Ring has tempted you twice, draw
  }
  if (hadSecondAbility) {
    game.draw(1);
    game.discard(1);
  }
}

/** Combat in a pod: Frodo and Gollum each pick an opponent whose blockers can't stop them; the rest of the team
 *  attacks by the shared rule (engine arenaCombat). Pippin's all-in pump isn't used in a pod yet. */
export function playPodCombat(game: SamFrodoGame): void {
  const frodo = game.findPermanent(FRODO);
  const gollum = game.findPermanent(GOLLUM);
  const isReady = (permanent: Perm | null) =>
    permanent !== null && !permanent.sick && !permanent.tapped;
  if (isReady(frodo) && game.lifeGainedThisTurn < 3)
    eatFoodsToGainLife(game, 3 - game.lifeGainedThisTurn);
  const frodoTarget =
    isReady(frodo) && (game.lifeGainedThisTurn >= 3 || game.ringTempts >= 1)
      ? game.pickDefender([frodo!])
      : null;
  const attackerNames: string[] = [];
  let dealtDamage = false;
  if (frodoTarget) {
    game.attacked = true;
    attackerNames.push('Frodo');
    makeFoodsForMeriadoc(game);
    resolveRingTemptation(game);
    if (game.strike(frodoTarget.slot, [frodo!]).damage > 0) {
      dealtDamage = true;
      if (game.ringTempts >= 4) game.drainEach(3);
    }
  }
  // Gollum: an opponent it hasn't hit yet first
  const gollumTarget =
    isReady(gollum) && game.battlefield.includes(gollum!)
      ? game.pickDefender([gollum!], (slot) => (game.gollumHit[slot] ? 0 : 50))
      : null;
  if (gollumTarget) {
    game.attacked = true;
    attackerNames.push('Gollum');
    gollum!.tapped = true;
    if (!frodoTarget && isHalfling(gollum!.card)) makeFoodsForMeriadoc(game);
    if (game.strike(gollumTarget.slot, [gollum!]).damage > 0) {
      game.gollumHit[gollumTarget.slot] = true;
      dealtDamage = true;
    }
  }
  if (dealtDamage) makeFoodsForRapaciousGuests(game);
  if (attackerNames.length)
    game.say(
      `attack with ${attackerNames.join(' + ')}: opp life [${game.life.join(', ')}]`,
    );
  const went = new Set<Perm>([
    ...(frodoTarget ? [frodo!] : []),
    ...(gollumTarget ? [gollum!] : []),
  ]);
  tryPippinPumpAttack(game, went);
  const rest = game
    .creatures()
    .filter(
      (permanent) =>
        game.canAttack(permanent) &&
        permanent !== frodo &&
        permanent !== gollum,
    );
  if (rest.length) game.arenaCombat(rest);
  game.checkKill();
}

/** Pippin: sacrifice four Foods, the other creatures get +3/+3 and haste: only for an attack that kills a player. */
function tryPippinPumpAttack(
  game: SamFrodoGame,
  alreadyAttacked: Set<Perm>,
): void {
  const pippin = game.findPermanent('Pippin, Warden of Isengard');
  if (
    !pippin ||
    pippin.tapped ||
    pippin.sick ||
    game.foodsOnBattlefield().length < 4
  )
    return;
  const team = game
    .creatures()
    .filter(
      (permanent) =>
        !permanent.tapped &&
        permanent !== pippin &&
        !alreadyAttacked.has(permanent),
    );
  const pumpedPower = (permanent: Perm) => game.power(permanent) + 3;
  const pumpedToughness = (permanent: Perm) => game.toughness(permanent) + 3;
  for (let slot = 0; slot < game.life.length && team.length; slot++) {
    if (!game.isOpponentAlive(slot)) continue;
    const plan = game.planAttack(slot, team, pumpedPower, pumpedToughness);
    if (plan.score < 1000) continue;
    pippin.tapped = true;
    for (const food of game.foodsOnBattlefield().slice(0, 4))
      game.sacrifice(food);
    for (const attacker of plan.attackers) attacker.tapped = true;
    game.attacked = true;
    const result = game.strike(
      slot,
      plan.attackers,
      pumpedPower,
      pumpedToughness,
    );
    game.say(
      `Pippin: +3/+3 and haste, attack opponent ${slot + 1} with ${plan.attackers.length} creature(s): ${result.damage} damage`,
    );
    break;
  }
}

/** Eat Foods (gain 3 each) until we've gained `need` more life, if we can pay. */
export function eatFoodsToGainLife(game: SamFrodoGame, need: number): void {
  while (need > 0) {
    const permanent = game.foodsOnBattlefield()[0];
    if (!permanent || !eatFood(game, permanent)) return;
    need -= 3;
  }
}

export function eatFood(game: SamFrodoGame, permanent: Perm): boolean {
  if (!game.pay(new Cost(game.isOnBattlefield(SAM) ? 1 : 2))) return false;
  game.say('eat a Food');
  game.sacrifice(permanent);
  game.gainLife(3);
  return true;
}

/** Attack with everything if that kills the whole table (Pippin's +3/+3 and haste if needed).
 *  Opponents block half the ground attackers (rounded down), the biggest; flyers connect. */
export function tryAllInAttack(game: SamFrodoGame): boolean {
  if (!game.config.all_in) return false;
  const deal = (pump: boolean): [Perm[], number] => {
    const pip = game.findPermanent('Pippin, Warden of Isengard');
    const attackers = game
      .creatures()
      .filter(
        (permanent) =>
          !permanent.tapped &&
          permanent !== (pump ? pip : null) &&
          (pump || !permanent.sick || permanent.card.haste) &&
          game.power(permanent) + (pump ? 3 : 0) > 0,
      );
    const pumpedPower = (permanent: Perm) =>
      game.power(permanent) + (pump ? 3 : 0);
    const fly = attackers.filter((permanent) => permanent.card.flying),
      ground = attackers
        .filter((permanent) => !permanent.card.flying)
        .sort((first, second) => pumpedPower(second) - pumpedPower(first));
    const permanents = ground.slice(Math.floor(ground.length / 2));
    return [
      attackers,
      [...fly, ...permanents].reduce(
        (total, permanent) => total + pumpedPower(permanent),
        0,
      ),
    ];
  };
  let [attackers, damage] = deal(false);
  let pump = false;
  if (!game.winsWith(damage)) {
    const pip = game.findPermanent('Pippin, Warden of Isengard');
    if (!pip || pip.tapped || pip.sick || game.foodsOnBattlefield().length < 4)
      return false;
    [attackers, damage] = deal(true);
    if (!game.winsWith(damage)) return false;
    pump = true;
    pip.tapped = true;
    for (const food of game.foodsOnBattlefield().slice(0, 4))
      game.sacrifice(food);
    game.say('Pippin: other creatures get +3/+3 and haste');
  }
  game.attacked = true;
  for (const attacker of attackers) attacker.tapped = true;
  let left = damage;
  while (left > 0) {
    const target = game.chooseTargetOpponent();
    if (target === null) break;
    const hit = Math.min(left, game.life[target]);
    game.damageOpponent(target, hit);
    left -= hit;
  }
  game.allInWin = game.hasWon();
  game.say(
    `all-in attack${pump ? ' (Pippin)' : ''}: ${damage} damage, opp life [${game.life.join(', ')}]`,
  );
  game.checkKill();
  return true;
}
