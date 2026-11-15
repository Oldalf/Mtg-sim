/**
 * Interaction between the decks of a pod (the cards are listed in engine/game/answers.ts):
 *  - removal and board wipes cast after a player's own turn, aimed at the biggest threat;
 *  - answering a win declared in the middle of a turn, and countering a big spell;
 *  - the pod's rules for which opponent an attack goes at.
 * Every function takes the PodTable it works on.
 */
import { Answer } from '../game/answers';
import { CardDef } from '../cards/cards';
import { Game } from '../game/game';
import { Permanent, Target } from '../game/game-types';
import { PodTable } from './pod-table';

/** Targeted removal on one's own turn only goes for permanents worth at least this much (unless set in the deck's config). */
const DEFAULT_REMOVAL_MIN_VALUE = 45;
/** A board wipe is cast when the strongest opponent's creatures have this much power in all (unless set in the
 *  deck's config), and ours have at most half of that. */
const DEFAULT_WIPE_AT_POWER = 10;
/** Toxic Deluge is not cast if paying for it would leave us at this much life or less. */
const TOXIC_DELUGE_SAFE_LIFE = 10;

// ================================================================ removal

/** The best legal target among the opponents of a player: the biggest threat's most valuable permanent. */
export function bestRemovalTarget(
  table: PodTable,
  player: number,
  answer: Answer,
  minimumValue = 0,
): { owner: number; target: Target } | null {
  const biggestThreatFirst = table
    .livingOpponents(player)
    .sort((first, second) => table.threats[second] - table.threats[first]);
  for (const owner of biggestThreatFirst) {
    const targets = table.games[owner]
      .podTargets(answer)
      .filter(
        (target) =>
          (!target.token || target.power >= 4) &&
          (target.commander || target.value >= minimumValue),
      );
    if (targets.length)
      return {
        owner,
        target: targets.reduce((best, target) =>
          target.value > best.value ? target : best,
        ),
      };
  }
  return null;
}

/** A player's removal card hits another player's permanent, unless that player's Kira / Rainshaper / Stormtamer
 *  counters it. */
export function hitWithRemoval(
  table: PodTable,
  caster: number,
  cardName: string,
  owner: number,
  permanent: Permanent,
  answer: Answer,
): void {
  const shield = table.games[owner].podShield(permanent);
  const ownerName = table.playerName(owner);
  if (shield) {
    table.stats.shields[owner]++;
    table.sayAs(
      caster,
      `${cardName} on ${ownerName}'s ${permanent.card.name} is countered by ${shield}`,
      'answer',
      [cardName, permanent.card.name, shield],
    );
    return;
  }
  table.sayAs(
    caster,
    `${cardName} on ${ownerName}'s ${permanent.card.name} (${answer.how ?? 'destroy'})`,
    'answer',
    [cardName, permanent.card.name],
  );
  table.stats.removed[owner]++;
  table.games[owner].podSuffer(permanent, answer);
}

/** An enters-the-battlefield removal effect (Shriekmaw): hits the best target. Returns the name of what it hit. */
export function snipeBestTarget(
  table: PodTable,
  game: Game<unknown>,
  answer: Answer,
): string | null {
  const caster = table.playerOf(game);
  const hit = bestRemovalTarget(table, caster, answer);
  if (!hit) return null;
  hitWithRemoval(
    table,
    caster,
    'Shriekmaw',
    hit.owner,
    hit.target.permanent,
    answer,
  );
  return hit.target.name;
}

/** What Volatile Stormdrake's ability may target, as a removal spell would: one creature. */
const TAKE_A_CREATURE: Answer = {
  kind: 'removal',
  instant: false,
  hits: ['creature'],
};

/** Volatile Stormdrake's energy: what it gives when the exchange happens. */
const STORMDRAKE_ENERGY = 4;

/**
 * Volatile Stormdrake entered: exchange control of it and the biggest threat's most valuable creature that the
 * ability may target (no hexproof or shroud: "hexproof from abilities" counts too). The ability must target one if
 * there is one, so a small token is taken when nothing else is there. A shield of the owner's (Kira, Stormtamer...)
 * counters it. If the exchange happens: 4 energy, then the creature is sacrificed (to its owner's graveyard) unless
 * we pay energy equal to its mana value. One log line, so that it carries both players' card moves.
 */
export function exchangeForStormdrake(
  table: PodTable,
  game: Game<unknown>,
  stormdrake: Permanent,
): void {
  const taker = table.playerOf(game);
  const choice = bestCreatureToTake(
    table,
    taker,
    game.energyCounters + STORMDRAKE_ENERGY,
  );
  if (!choice) return;
  const { owner, creature } = choice;
  const ownerGame = table.games[owner];
  const stormdrakeName = stormdrake.card.name;
  const creatureName = creature.card.name;
  const ownerName = table.playerName(owner);
  const shield = ownerGame.podShield(creature);
  if (shield) {
    table.stats.shields[owner]++;
    table.sayAs(
      taker,
      `${stormdrakeName}'s exchange with ${ownerName}'s ${creatureName} is countered by ${shield}`,
      'answer',
      [stormdrakeName, creatureName, shield],
    );
    return;
  }
  game.giveControlTo(stormdrake, ownerGame);
  ownerGame.giveControlTo(creature, game);
  game.gainEnergy(STORMDRAKE_ENERGY);
  const energyToKeep = creature.card.manaValue;
  const isKept = game.energyCounters >= energyToKeep;
  if (isKept) game.payEnergy(energyToKeep);
  else game.dies(creature);
  table.sayAs(
    taker,
    `${stormdrakeName} takes ${ownerName}'s ${creatureName} and gives ${STORMDRAKE_ENERGY} energy: ` +
      (isKept
        ? `pays ${energyToKeep} energy to keep it`
        : `can't pay ${energyToKeep} energy, sacrifices it`),
    'answer',
    [stormdrakeName, creatureName],
  );
}

/** The creature to take: the biggest threat's most valuable one that an ability may target. One we can keep (its
 *  mana value is at most the energy we will have) counts double: the owner loses it and we gain it, where one we
 *  must sacrifice is only removal. */
function bestCreatureToTake(
  table: PodTable,
  taker: number,
  energyAfterExchange: number,
): { owner: number; creature: Permanent } | null {
  const worthToTaker = (target: Target) =>
    target.permanent.card.manaValue <= energyAfterExchange
      ? 2 * target.value
      : target.value;
  const biggestThreatFirst = table
    .livingOpponents(taker)
    .sort((first, second) => table.threats[second] - table.threats[first]);
  for (const owner of biggestThreatFirst) {
    const targets = table.games[owner]
      .podTargets(TAKE_A_CREATURE)
      .filter((target) => !hasHexproofOrShroud(target.permanent));
    if (targets.length)
      return {
        owner,
        creature: targets.reduce((best, target) =>
          worthToTaker(target) > worthToTaker(best) ? target : best,
        ).permanent,
      };
  }
  return null;
}

function hasHexproofOrShroud(permanent: Permanent): boolean {
  const keywords = permanent.card.keywords;
  return keywords.has('hexproof') || keywords.has('shroud');
}

/** Each opponent sacrifices its least valuable creature (only nontoken ones if `nontokenOnly`). */
export function makeOpponentsSacrifice(
  table: PodTable,
  game: Game<unknown>,
  nontokenOnly: boolean,
): void {
  for (const opponent of table.livingOpponents(table.playerOf(game))) {
    const opponentGame = table.games[opponent];
    const creatures = opponentGame
      .creatures()
      .filter((creature) => !nontokenOnly || !creature.token);
    if (!creatures.length) continue;
    const leastValuable = creatures.reduce((least, creature) =>
      opponentGame.blockValue(creature) < opponentGame.blockValue(least)
        ? creature
        : least,
    );
    table.sayAs(opponent, `sacrifices ${leastValuable.card.name}`, 'note', [
      leastValuable.card.name,
    ]);
    opponentGame.podRemove(leastValuable, 'sacrifice');
  }
}

/**
 * After its own turn, a player uses removal on the biggest threat and a board wipe when it is far behind on board.
 * An instant that could stop a win stays in hand unless there is a second answer.
 */
export function useRemovalAfterTurn(table: PodTable, player: number): void {
  const game = table.games[player];
  const isInstantKeptForDefence = (card: CardDef) => {
    const answer = game.answer(card);
    return !!answer && answer.instant && answer.kind !== 'wipe';
  };
  for (const card of game.hand.slice()) {
    const answer = game.answer(card);
    if (!answer || !game.hand.includes(card)) continue;
    if (answer.kind === 'removal') {
      const keepsItForDefence =
        answer.instant &&
        game.hand.filter(isInstantKeptForDefence).length < 2 &&
        !(
          table.settings.fireChance > 0 &&
          table.random.random() < table.settings.fireChance
        );
      if (!keepsItForDefence) castTargetedRemoval(table, player, card, answer);
    } else if (answer.kind === 'wipe' && answer.wipe !== 'attackers') {
      castBoardWipe(table, player, card, answer);
    }
  }
}

function castTargetedRemoval(
  table: PodTable,
  player: number,
  card: CardDef,
  answer: Answer,
): void {
  const game = table.games[player];
  const minimumValue =
    (game.config.removal_min as number) ?? DEFAULT_REMOVAL_MIN_VALUE;
  if (!bestRemovalTarget(table, player, answer, minimumValue)) return;
  if (!game.podCast(card)) return;
  table.stats.removals[player]++;
  for (let hitNumber = 0; hitNumber < (answer.count ?? 1); hitNumber++) {
    // only the first target has to be worth the card
    const hit = bestRemovalTarget(
      table,
      player,
      answer,
      hitNumber === 0 ? minimumValue : 0,
    );
    if (!hit) break;
    hitWithRemoval(
      table,
      player,
      card.name,
      hit.owner,
      hit.target.permanent,
      answer,
    );
  }
}

function castBoardWipe(
  table: PodTable,
  player: number,
  card: CardDef,
  answer: Answer,
): void {
  const game = table.games[player];
  const ownPower = table.boardPower(player);
  const topOpponentPower = Math.max(
    0,
    ...table
      .livingOpponents(player)
      .map((opponent) => table.boardPower(opponent)),
  );
  const wipeAtPower = (game.config.wipe_at as number) ?? DEFAULT_WIPE_AT_POWER;
  if (!(topOpponentPower >= wipeAtPower && ownPower * 2 <= topOpponentPower))
    return;

  const everyCreature = [player, ...table.livingOpponents(player)].flatMap(
    (owner) =>
      table.games[owner].creatures().map((creature) => ({
        owner,
        creature,
        power: table.games[owner].power(creature),
        toughness: table.games[owner].toughness(creature),
      })),
  );
  let lifeToPay = 0;
  if (card.name === 'Toxic Deluge') {
    lifeToPay = Math.max(
      0,
      ...everyCreature
        .filter((creature) => creature.owner !== player)
        .map((creature) => creature.toughness),
    );
    if (game.myLife - lifeToPay <= TOXIC_DELUGE_SAFE_LIFE) return;
  }
  const ownCreatures = everyCreature.filter(
    (creature) => creature.owner === player,
  );
  // a "bigger" wipe kills everything bigger than our smallest creature (or than anything, if we have none)
  const powerFloor = Math.min(
    ...(ownCreatures.length ? ownCreatures : everyCreature).map(
      (creature) => creature.power,
    ),
  );
  const dying = everyCreature.filter((creature) =>
    answer.wipe === 'power3'
      ? creature.power >= 3
      : answer.wipe === 'bigger'
        ? creature.power > powerFloor
        : true,
  );
  if (
    !dying.some((creature) => creature.owner !== player) ||
    !game.podCast(card)
  )
    return;

  if (lifeToPay) game.loseLife(lifeToPay);
  table.stats.removals[player]++;
  const bounces = answer.wipe === 'bounce';
  table.sayAs(
    player,
    `${card.name}: ${dying.length} creature(s) ${bounces ? 'return to hand' : 'die'}`,
    'answer',
    [card.name],
  );
  for (const creature of dying)
    table.games[creature.owner].podRemove(
      creature.creature,
      bounces ? 'bounce' : 'destroy',
    );
}

// ================================================================ answering a win, countering a spell

/** One answer an opponent used against a win attempt. */
interface UsedAnswer {
  owner: number; // the opponent who answered
  card: string;
  target: string;
  how: string;
  shield?: string; // set when the winner's Kira / Rainshaper / Stormtamer countered this answer
  answer: Answer;
}

/**
 * A player declared a win in the middle of its turn: the others may answer it now with the mana they left untapped.
 * Returns true if it was stopped (the turn goes on).
 */
export function answerWin(table: PodTable, game: Game<unknown>): boolean {
  if (!table.answersEnabled) return false;
  const player = table.playerOf(game);
  const attempt = game.winAttempt();
  if (!attempt || (!attempt.spells.length && !attempt.perms.length))
    return false;
  table.stats.tried[player]++;
  table.sayHighlight(player, 'goes for the win');

  const answersNeeded = attempt.backup + 1; // the winner may hold counterspells as backup
  const used: UsedAnswer[] = [];
  const answersStanding = () =>
    used.filter((usedAnswer) => !usedAnswer.shield).length;
  for (const opponent of table.opponentsOf[player]) {
    if (!table.isAlive[opponent] || answersStanding() >= answersNeeded)
      continue;
    for (const response of table.games[opponent].podRespond(
      attempt,
      answersNeeded - answersStanding(),
      game,
    ))
      used.push({ owner: opponent, ...response });
  }
  for (const answer of used) {
    table.stats.answers[answer.owner]++;
    if (answer.shield) {
      table.stats.shields[player]++;
      table.sayAs(
        answer.owner,
        `${answer.card} on ${answer.target} is countered by ${answer.shield}`,
        'answer',
        [answer.card, answer.target, answer.shield],
      );
    }
  }
  const unshielded = used.filter((usedAnswer) => !usedAnswer.shield);
  // the winner answers back with its own counterspells
  const counteredBack = game.podBurnCounters(
    unshielded.slice(0, attempt.backup).map((usedAnswer) => usedAnswer.card),
  );
  for (let index = 0; index < counteredBack.length; index++)
    table.sayAs(
      player,
      `counters ${table.playerName(unshielded[index].owner)}'s ${unshielded[index].card} with ${counteredBack[index]}`,
      'answer',
      [unshielded[index].card, counteredBack[index]],
    );
  const standing = unshielded.slice(counteredBack.length);
  if (!standing.length) return false;

  table.stats.stopped[player]++;
  const stopper = standing[0];
  game.podLose(stopper.target, stopper.how, stopper.answer);
  game.podWinStopped();
  table.sayAs(
    stopper.owner,
    `stops the win: ${stopper.card} on ${stopper.target}. ${table.playerName(player)} plays on.`,
    'answer',
    [stopper.card, stopper.target],
  );
  return true;
}

/** Can `defender` counter this spell with a counterspell in hand and mana for it? */
function counterspellsAgainst(
  defender: Game<unknown>,
  spell: CardDef,
): CardDef[] {
  return defender.hand.filter((card) => {
    const answer = defender.answer(card);
    return (
      answer?.kind === 'counter' &&
      Game.spellOk(answer, spell) &&
      defender.canPay(defender.answerCost(card), true)
    );
  });
}

/** A player cast this spell (paid, on the stack): does an opponent counter it? */
export function counterSpell(
  table: PodTable,
  game: Game<unknown>,
  spell: CardDef,
): boolean {
  if (!table.answersEnabled) return false;
  const caster = table.playerOf(game);
  const weight = game.podWeight(spell);
  if (weight < table.settings.counterAtWeight) return false;
  for (const opponent of table.opponentsOf[caster]) {
    if (!table.isAlive[opponent]) continue;
    const opponentGame = table.games[opponent];
    const possibleCounters = counterspellsAgainst(opponentGame, spell);
    if (!possibleCounters.length) continue;
    const casterIsBiggestThreat = table
      .livingOpponents(opponent)
      .every(
        (other) =>
          other === caster || table.threats[other] <= table.threats[caster],
      );
    const counterspellsHeld = opponentGame.hand.filter(
      (card) => opponentGame.answer(card)?.kind === 'counter',
    ).length;
    const worthCountering =
      weight >= table.settings.counterAnyWeight ||
      (casterIsBiggestThreat && counterspellsHeld >= 2);
    if (!worthCountering) continue;

    const counter = possibleCounters[0];
    opponentGame.podCast(counter);
    table.stats.answers[opponent]++;
    const backupCounter = counterspellsAgainst(game, counter)[0];
    if (backupCounter) {
      game.podCast(backupCounter);
      table.sayAs(
        opponent,
        `${counter.name} on ${spell.name}; ${table.playerName(caster)} counters it with ${backupCounter.name}`,
        'answer',
        [counter.name, spell.name, backupCounter.name],
      );
      return false;
    }
    table.stats.countered[caster]++;
    table.sayAs(
      opponent,
      `counters ${spell.name} with ${counter.name}`,
      'answer',
      [spell.name, counter.name],
    );
    return true;
  }
  return false;
}

/** A deck found a kill without counter backup: should it go for it now? (the deck's pod policy) */
export function shouldGoForKill(table: PodTable, game: Game<unknown>): boolean {
  const player = table.playerOf(game);
  if (table.policyOf(player) !== 'window') return true;
  const noOneCanAnswer = table
    .livingOpponents(player)
    .every(
      (opponent) =>
        table.games[opponent].openMana() <= table.settings.windowMana ||
        table.games[opponent].hand.length === 0,
    );
  if (!noOneCanAnswer) game.mode = 'protected'; // keep the kill intact for the rest of the turn and look for backup
  return noOneCanAnswer;
}

// ================================================================ whom to attack

/** How much a player would rather attack the opponent in `slot` (the pod's threat rule). */
export function attackPreference(
  table: PodTable,
  game: Game<unknown>,
  slot: number,
): number {
  const player = table.playerOf(game);
  const target = table.opponentsOf[player][slot];
  const jitter = table.random.random() * 2; // breaks ties between equal targets
  // the initiative's holder is worth attacking: combat damage to them takes it
  const initiativeBonus = table.games[target].hasInitiative ? 6 : 0;
  return threatPreference(table, player, target, jitter) + initiativeBonus;
}

function threatPreference(
  table: PodTable,
  player: number,
  target: number,
  jitter: number,
): number {
  switch (table.settings.threatMode) {
    case 'leader': {
      const biggestThreat = Math.max(
        1,
        ...table.livingOpponents(player).map((other) => table.threats[other]),
      );
      return (12 * table.threats[target]) / biggestThreat + jitter;
    }
    case 'spread': // the player we have hurt least
      return -table.damageDealt[player][target] / 3 + jitter;
    case 'weakest': // the lowest life
      return 12 * (1 - table.games[target].myLife / 40) + jitter;
    default:
      return 0;
  }
}
