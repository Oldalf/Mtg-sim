/**
 * What one player's card does to the others in a pod: Volatile Stormdrake's exchange, goad, weakening and hindering
 * creatures, edicts and discard, fight, the creature cards in the graveyards, bouncing every permanent of a colour, and
 * -X/-X to all creatures. Every function takes the PodTable it works on.
 */
import { Answer } from '../game/answers';
import { CardDef, coloursOf } from '../cards/cards';
import { Game } from '../game/game';
import { Permanent, Target } from '../game/game-types';
import { PodTable } from './pod-table';

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

/** The creature a dungeon room aims at (Fungi Cavern, Twisted Caverns, Arena): the most powerful one that an ability
 *  may target, among the biggest threat's. A shield (Kira...) counters the room's ability. */
function creatureForRoomToHinder(
  table: PodTable,
  player: number,
  roomName: string,
): { owner: number; creature: Permanent } | null {
  const biggestThreatFirst = table
    .livingOpponents(player)
    .sort((first, second) => table.threats[second] - table.threats[first]);
  for (const owner of biggestThreatFirst) {
    const targets = table.games[owner]
      .podTargets(TAKE_A_CREATURE)
      .filter((target) => !hasHexproofOrShroud(target.permanent));
    if (!targets.length) continue;
    const creature = targets.reduce((best, target) =>
      target.power > best.power ? target : best,
    ).permanent;
    const shield = table.games[owner].podShield(creature);
    if (shield) {
      table.stats.shields[owner]++;
      table.sayAs(
        player,
        `${roomName} on ${table.playerName(owner)}'s ${creature.card.name} is countered by ${shield}`,
        'answer',
        [roomName, creature.card.name, shield],
      );
      return null;
    }
    return { owner, creature };
  }
  return null;
}

/** Arena: goad the best creature of the biggest threat, until our next turn. */
export function goadBestCreature(table: PodTable, game: Game<unknown>): void {
  const goader = table.playerOf(game);
  const choice = creatureForRoomToHinder(table, goader, 'Arena');
  if (!choice) return;
  table.goad(goader, choice.creature);
  table.sayAs(
    goader,
    `Arena goads ${table.playerName(choice.owner)}'s ${choice.creature.card.name}`,
    'note',
    ['Arena', choice.creature.card.name],
  );
}

/** Fungi Cavern: the best creature of the biggest threat gets -4/-0 until our next turn. */
export function weakenBestCreature(
  table: PodTable,
  game: Game<unknown>,
  powerLoss: number,
): void {
  const player = table.playerOf(game);
  const choice = creatureForRoomToHinder(table, player, 'Fungi Cavern');
  if (!choice) return;
  const { owner, creature } = choice;
  creature.powerMod -= powerLoss;
  table.endAtNextTurnOf(player, () => (creature.powerMod += powerLoss));
  table.sayAs(
    player,
    `Fungi Cavern: ${table.playerName(owner)}'s ${creature.card.name} gets -${powerLoss}/-0`,
    'note',
    ['Fungi Cavern', creature.card.name],
  );
}

/** Twisted Caverns: the best creature of the biggest threat can't attack us until our next turn. */
export function stopBestCreatureAttackingUs(
  table: PodTable,
  game: Game<unknown>,
): void {
  const player = table.playerOf(game);
  const choice = creatureForRoomToHinder(table, player, 'Twisted Caverns');
  if (!choice) return;
  table.forbidAttackingUntilNextTurn(player, choice.creature);
  table.sayAs(
    player,
    `Twisted Caverns: ${table.playerName(choice.owner)}'s ${choice.creature.card.name} can't attack us`,
    'note',
    ['Twisted Caverns', choice.creature.card.name],
  );
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

/** How much a defender minds losing a permanent: a token least, then its nonland permanents by value, then a land (losing lands
 *  hurts most), a commander last. Annihilator makes it sacrifice the lowest first. */
function sacrificeWorth(defender: Game<unknown>, permanent: Permanent): number {
  if (permanent.token) return 0;
  if (permanent.land !== null) return 3000;
  return (
    1000 +
    defender.cardValue(permanent.card) +
    (defender.isCommander(permanent) ? 5000 : 0)
  );
}

/** Annihilator: the defending player in `slot` sacrifices `count` permanents, the ones it minds least first. */
export function makeDefenderSacrifice(
  table: PodTable,
  game: Game<unknown>,
  slot: number,
  count: number,
  sourceName: string,
): void {
  const defenderPlayer = table.opponentsOf[table.playerOf(game)][slot];
  const defender = table.games[defenderPlayer];
  const sacrificed = defender.battlefield
    .slice()
    .sort(
      (first, second) =>
        sacrificeWorth(defender, first) - sacrificeWorth(defender, second),
    )
    .slice(0, count);
  if (!sacrificed.length) return;
  table.sayAs(
    defenderPlayer,
    `${sourceName}: sacrifices ${sacrificed.map((permanent) => permanent.card.name).join(', ')}`,
    'note',
    [sourceName, ...sacrificed.map((permanent) => permanent.card.name)],
  );
  for (const permanent of sacrificed)
    defender.podRemove(permanent, 'sacrifice');
}

// ================================================================ effects on one opponent (step 11, T4)

/** Opponent `slot` of a player sacrifices its least valuable creature (Vindictive Lich). Returns its name, or null. */
export function makeOneOpponentSacrifice(
  table: PodTable,
  game: Game<unknown>,
  slot: number,
  sourceName: string,
): string | null {
  const opponent = table.opponentsOf[table.playerOf(game)][slot];
  const opponentGame = table.games[opponent];
  const creatures = opponentGame.creatures();
  if (!creatures.length) return null;
  const leastValuable = creatures.reduce((least, creature) =>
    opponentGame.blockValue(creature) < opponentGame.blockValue(least)
      ? creature
      : least,
  );
  table.sayAs(
    opponent,
    `${sourceName}: sacrifices ${leastValuable.card.name}`,
    'note',
    [sourceName, leastValuable.card.name],
  );
  opponentGame.podRemove(leastValuable, 'sacrifice');
  return leastValuable.card.name;
}

/** Opponent `slot` discards `count` cards, the ones it wants least (Vindictive Lich). Returns how many. */
export function makeOneOpponentDiscard(
  table: PodTable,
  game: Game<unknown>,
  slot: number,
  count: number,
  sourceName: string,
): number {
  const opponent = table.opponentsOf[table.playerOf(game)][slot];
  const opponentGame = table.games[opponent];
  const discarded = Math.min(count, opponentGame.hand.length);
  table.sayAs(opponent, `${sourceName}: discards ${discarded}`, 'note', [
    sourceName,
  ]);
  opponentGame.discard(discarded);
  return discarded;
}

/** What a fight may target: one creature an opponent controls (Bushwhack). */
const FIGHT_TARGET: Answer = {
  kind: 'removal',
  instant: false,
  hits: ['creature'],
};

/** Our creature fights the best creature an opponent controls that it kills (each deals damage equal to its power to
 *  the other): the biggest threat's first, one that can't kill ours back preferred, then the most valuable. A shield
 *  (Kira...) may counter it. Returns the name of the creature it fought, or null when no fight kills one. */
export function fightBestCreature(
  table: PodTable,
  game: Game<unknown>,
  fighter: Permanent,
  sourceName: string,
): string | null {
  const caster = table.playerOf(game);
  const ourPower = game.power(fighter);
  const ourToughness = game.toughness(fighter);
  let best: { owner: number; creature: Permanent; score: number } | null = null;
  for (const owner of table.livingOpponents(caster)) {
    const ownerGame = table.games[owner];
    for (const creature of ownerGame.creatures()) {
      if (
        ownerGame.toughness(creature) > ourPower ||
        !ownerGame.podCanTarget(creature, FIGHT_TARGET)
      )
        continue;
      const fighterSurvives = ownerGame.power(creature) < ourToughness;
      const score =
        (fighterSurvives ? 1000 : 0) +
        ownerGame.cardValue(creature.card) +
        table.threats[owner];
      if (best === null || score > best.score)
        best = { owner, creature, score };
    }
  }
  if (best === null) return null;
  const ownerGame = table.games[best.owner];
  const ownerName = table.playerName(best.owner);
  const shield = ownerGame.podShield(best.creature, FIGHT_TARGET);
  if (shield) {
    table.stats.shields[best.owner]++;
    table.sayAs(
      caster,
      `${sourceName} on ${ownerName}'s ${best.creature.card.name} is countered by ${shield}`,
      'answer',
      [sourceName, best.creature.card.name, shield],
    );
    return null;
  }
  const theirPower = ownerGame.power(best.creature);
  table.sayAs(
    caster,
    `${sourceName}: ${fighter.card.name} fights ${ownerName}'s ${best.creature.card.name}`,
    'answer',
    [sourceName, fighter.card.name, best.creature.card.name],
  );
  table.stats.removed[best.owner]++;
  ownerGame.podRemove(best.creature, 'destroy');
  if (theirPower >= ourToughness) game.dies(fighter);
  return best.creature.card.name;
}

/** How many creature cards are in opponent `slot`'s graveyard (Crypt Incursion's choice of target). */
export function creatureCardsInGraveyard(
  table: PodTable,
  game: Game<unknown>,
  slot: number,
): number {
  const opponent = table.opponentsOf[table.playerOrCopyOf(game)][slot];
  return table.games[opponent].graveyard.filter((card) => card.isCreature)
    .length;
}

/** The creature cards in opponent `slot`'s graveyard. */
export function creatureCardsOfGraveyard(
  table: PodTable,
  game: Game<unknown>,
  slot: number,
): CardDef[] {
  const opponent = table.opponentsOf[table.playerOrCopyOf(game)][slot];
  return table.games[opponent].graveyard.filter((card) => card.isCreature);
}

/** A creature card leaves opponent `slot`'s graveyard: another player puts it onto the battlefield. */
export function takeCreatureCardFromGraveyard(
  table: PodTable,
  game: Game<unknown>,
  slot: number,
  card: CardDef,
): void {
  const opponent = table.opponentsOf[table.playerOf(game)][slot];
  table.games[opponent].moveCard(card, 'graveyard', 'exile');
  table.sayAs(
    table.playerOf(game),
    `takes ${card.name} from ${table.playerName(opponent)}'s graveyard`,
    'note',
    [card.name],
  );
}

/** Every creature card in opponent `slot`'s graveyard is exiled (Crypt Incursion). Returns how many. */
export function exileCreaturesFromGraveyard(
  table: PodTable,
  game: Game<unknown>,
  slot: number,
  sourceName: string,
): number {
  const opponent = table.opponentsOf[table.playerOf(game)][slot];
  const opponentGame = table.games[opponent];
  const creatureCards = opponentGame.graveyard.filter(
    (card) => card.isCreature,
  );
  for (const card of creatureCards)
    opponentGame.moveCard(card, 'graveyard', 'exile');
  table.sayAs(
    table.playerOf(game),
    `${sourceName}: exiles ${creatureCards.length} creature card(s) from ${table.playerName(opponent)}'s graveyard`,
    'answer',
    [sourceName],
  );
  return creatureCards.length;
}

/** Every permanent of this colour returns to its owner's hand, ours too (Wash Out). Returns how many each player
 *  lost: [us, then the opponents in slot order]. */
export function bounceEveryPermanentOfColour(
  table: PodTable,
  game: Game<unknown>,
  colour: 'W' | 'U' | 'B' | 'R' | 'G',
  sourceName: string,
): number[] {
  const caster = table.playerOf(game);
  const players = [caster, ...table.opponentsOf[caster]];
  const lost = players.map((player) => {
    if (!table.isAlive[player]) return 0;
    const playerGame = table.games[player];
    const permanents = playerGame.battlefield.filter((permanent) =>
      coloursOf(permanent.card).includes(colour),
    );
    for (const permanent of permanents)
      playerGame.podRemove(permanent, 'bounce');
    if (player !== caster) table.stats.removed[player] += permanents.length;
    return permanents.length;
  });
  table.sayAs(
    caster,
    `${sourceName} (${colour}): ${players.map((player, index) => `${table.playerName(player)} ${lost[index]}`).join(', ')} permanent(s) back to hand`,
    'answer',
    [sourceName],
  );
  return lost;
}

// ================================================================ -X/-X until end of turn

/** The opponents' creatures that a -`amount`/-`amount` would kill now. */
export function creaturesShrinkWouldKill(
  table: PodTable,
  game: Game<unknown>,
  amount: number,
): number {
  return table
    .livingOpponents(table.playerOf(game))
    .reduce(
      (killed, opponent) =>
        killed +
        table.games[opponent]
          .creatures()
          .filter(
            (creature) =>
              table.games[opponent].toughness(creature) - amount <= 0,
          ).length,
      0,
    );
}

/**
 * Massacre Wurm, D'Ghor Bloodletter: creatures get -`amount`/-`amount` until end of turn (the opponents', ours too if
 * `includeOwn`, never `except`). Those left with toughness 0 or less die; indestructible does not help. The change
 * ends when the next player's turn starts.
 */
export function shrinkCreatures(
  table: PodTable,
  game: Game<unknown>,
  amount: number,
  includeOwn: boolean,
  except: Permanent | null,
  sourceName: string,
): void {
  const player = table.playerOf(game);
  const owners = includeOwn
    ? [player, ...table.livingOpponents(player)]
    : table.livingOpponents(player);
  const activePlayer = table.currentPlayer >= 0 ? table.currentPlayer : player;
  const nextPlayer =
    table.opponentsOf[activePlayer].find((other) => table.isAlive[other]) ??
    activePlayer;
  const dyingByOwner = owners.map((owner) => {
    const ownerGame = table.games[owner];
    const shrunk = ownerGame
      .creatures()
      .filter((creature) => creature !== except);
    for (const creature of shrunk) {
      creature.powerMod -= amount;
      creature.toughnessMod -= amount;
    }
    table.endAtNextTurnOf(nextPlayer, () => {
      for (const creature of shrunk) {
        creature.powerMod += amount;
        creature.toughnessMod += amount;
      }
    });
    return {
      owner,
      dying: shrunk.filter((creature) => ownerGame.toughness(creature) <= 0),
    };
  });
  const dyingCount = dyingByOwner.reduce(
    (total, { dying }) => total + dying.length,
    0,
  );
  table.sayAs(
    player,
    `${sourceName}: -${amount}/-${amount}, ${dyingCount} creature(s) die`,
    'answer',
    [sourceName],
  );
  for (const { owner, dying } of dyingByOwner) {
    const ownerGame = table.games[owner];
    const survivors = new Set(ownerGame.podAnswerWipe(dying, false));
    for (const creature of dying)
      if (!survivors.has(creature)) ownerGame.podRemove(creature, 'destroy');
  }
}
