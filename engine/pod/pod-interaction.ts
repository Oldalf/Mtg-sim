/**
 * Interaction between the decks of a pod (the cards are listed in engine/game/answers.ts):
 *  - removal and board wipes cast after a player's own turn, aimed at the biggest threat;
 *  - the pod's rules for which opponent an attack goes at.
 * Answering a win and countering a spell are in pod-win-answers.ts, what one card does to the others in
 * pod-card-effects.ts. Every function takes the PodTable it works on.
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
  const shield = table.games[owner].podShield(permanent, answer);
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

/** An enters-the-battlefield removal effect (Shriekmaw): hits the best target worth at least `minimumValue`.
 *  Returns the name of what it hit. */
export function snipeBestTarget(
  table: PodTable,
  game: Game<unknown>,
  answer: Answer,
  sourceName: string,
  minimumValue: number,
): string | null {
  const caster = table.playerOf(game);
  const hit = bestRemovalTarget(table, caster, answer, minimumValue);
  if (!hit) return null;
  hitWithRemoval(
    table,
    caster,
    sourceName,
    hit.owner,
    hit.target.permanent,
    answer,
  );
  return hit.target.name;
}

/** Every creature of every living opponent goes back to its owner's hand (Avatar's Wrath). */
export function bounceEveryOpponentsCreatures(
  table: PodTable,
  game: Game<unknown>,
  sourceName: string,
): void {
  const caster = table.playerOf(game);
  table.stats.removals[caster]++;
  for (const opponent of table.livingOpponents(caster)) {
    const opponentGame = table.games[opponent];
    const creatures = opponentGame.creatures();
    if (!creatures.length) continue;
    table.sayAs(
      caster,
      `${sourceName}: ${table.playerName(opponent)}'s ${creatures.length} creature(s) return to hand`,
      'answer',
      [sourceName],
    );
    table.stats.removed[opponent] += creatures.length;
    for (const creature of creatures)
      opponentGame.podRemove(creature, 'bounce');
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
  // (Toxic Deluge shrinks: indestructible does not help)
  const destroys = !bounces && card.name !== 'Toxic Deluge';
  const survivors = new Set<Permanent>();
  for (const [owner, ownerGame] of table.games.entries()) {
    const ownDying = dying
      .filter((creature) => creature.owner === owner)
      .map((creature) => creature.creature);
    for (const survivor of ownerGame.podAnswerWipe(ownDying, destroys))
      survivors.add(survivor);
  }
  for (const creature of dying.filter(
    (creature) => !survivors.has(creature.creature),
  ))
    table.games[creature.owner].podRemove(
      creature.creature,
      bounces ? 'bounce' : 'destroy',
    );
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
