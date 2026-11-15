/**
 * Dungeons, venture and the initiative (rules 309, 701.49 and 725).
 *
 * Venture into the dungeon: if we are in no dungeon, we enter the first room of one we choose (Lost Mine of
 * Phandelver, Dungeon of the Mad Mage or Tomb of Annihilation; GameCore.chooseDungeon); else we move to a room the
 * current one leads to (GameCore.chooseDungeonRoom). Each room's ability then triggers (twice with Hama Pashar, or
 * with Dungeon Delver and our commander out). The dungeon is completed once its last room's ability resolved.
 *
 * The initiative: whoever takes it ventures into Undercity (if in no dungeon; in another dungeon they move on in
 * that one), and again at their upkeep. A player who deals combat damage to its holder takes it (pod-combat.ts).
 * One player has it at a time: in a pod the table moves it (Arena.takeInitiative); in a goldfish game we keep it.
 *
 * The rooms are data; their effects are small functions over the game. Effects that only matter against real
 * opponents' creatures (Twisted Caverns, Fungi Cavern, Arena's goad) are logged and not modelled.
 */
import * as C from '../cards/cards';
import { CardDef, Cost } from '../cards/cards';
import type { GameCore } from './game-core';
import { Permanent } from './game-types';
import { firstMax } from '../util/lists';

export interface DungeonRoom {
  name: string;
  /** What the room does, as the log says it. */
  text: string;
  /** The rooms it leads to (none: the last room). */
  leadsTo: string[];
  /** How good the room is, for the default choice of path (higher is better). */
  value: number;
  act: (game: GameCore) => void;
}

export interface Dungeon {
  name: string;
  /** The first room comes first. */
  rooms: DungeonRoom[];
}

/** Where we are: the dungeon and the room. Replaced, never changed in place (a game copy shares it). */
export interface DungeonPosition {
  dungeon: string;
  room: string;
}

export const TREASURE = C.makeArtifactToken('Treasure');
const GOBLIN = C.makeToken('Goblin', 1, 1, 'red');
const SMALL_SKELETON = C.makeToken('Skeleton', 1, 1, 'black');
const BIG_SKELETON = C.makeToken('Skeleton', 4, 1, 'black', ['menace']);
const THE_ATROPAL = C.makeToken('The Atropal', 4, 4, 'black', ['deathtouch']);

// ---------------------------------------------------------------- room effects
const room = (
  name: string,
  text: string,
  leadsTo: string[],
  value: number,
  act: (game: GameCore) => void,
): DungeonRoom => ({ name, text, leadsTo, value, act });

const notModelled = (): void => {};

function counterOnBestCreature(game: GameCore, count: number): void {
  const creatures = game.creatures();
  if (!creatures.length) return;
  firstMax(creatures, (creature) => game.power(creature)).counters += count;
}

function eachOpponentLoses(game: GameCore, amount: number): void {
  for (let i = 0; i < game.life.length; i++)
    if (game.life[i] > 0) game.damageOpponent(i, amount);
}

/** "Target player loses 5 life": the living opponent closest to dying. */
function opponentClosestToDyingLoses(game: GameCore, amount: number): void {
  let target = -1;
  for (let i = 0; i < game.life.length; i++)
    if (game.life[i] > 0 && (target < 0 || game.life[i] < game.life[target]))
      target = i;
  if (target >= 0) game.damageOpponent(target, amount);
}

function basicLandToHand(game: GameCore): void {
  const basic = game.library.find((card) => card.land?.basic);
  if (!basic) return;
  game.takeCard(basic, 'library');
  game.putCard(basic, 'hand');
  game.shuffle();
}

/** We sacrifice the least valuable permanent of ours that matches (Oubliette). */
function sacrificeWorst(
  game: GameCore,
  matches: (permanent: Permanent) => boolean,
): void {
  const options = game.battlefield.filter(matches);
  if (!options.length) return;
  const worst = firstMax(options, (permanent) => -permanent.card.manaValue);
  game.takeFromBattlefield(worst);
  if (!worst.token) game.putCard(worst.card, 'graveyard');
  game.onLeave(worst);
}

/** Mad Wizard's Lair: draw three, cast the best nonland one of them for free. */
function drawThreeCastOneFree(game: GameCore): void {
  const handBefore = game.hand.slice();
  game.draw(3);
  const drawn = game.hand.filter(
    (card) => !handBefore.includes(card) && card.land === null,
  );
  if (!drawn.length) return;
  const best = firstMax(drawn, (card) => game.cardValue(card));
  game.say('  cast for free', best);
  if (best.isInstantOrSorcery)
    game.castInstantOrSorcery(best, false, new Cost());
  else {
    game.takeCard(best, 'hand');
    game.enter(best, 'hand');
  }
}

/** Throne of the Dead Three: the best creature of the top ten onto the battlefield with three +1/+1 counters. */
function bestOfTopTenOntoBattlefield(game: GameCore): void {
  const creatures = game.library.slice(0, 10).filter((card) => card.isCreature);
  if (creatures.length) {
    const best = firstMax(creatures, (card) => game.reanimationValue(card));
    game.takeCard(best, 'library');
    game.enter(best, 'library').counters += 3;
  }
  game.shuffle();
}

// ---------------------------------------------------------------- the dungeons
export const LOST_MINE_OF_PHANDELVER: Dungeon = {
  name: 'Lost Mine of Phandelver',
  rooms: [
    room(
      'Cave Entrance',
      'scry 1',
      ['Goblin Lair', 'Mine Tunnels'],
      1,
      (game) => game.scry(1),
    ),
    room(
      'Goblin Lair',
      'create a 1/1 Goblin',
      ['Storeroom', 'Dark Pool'],
      3,
      (game) => void game.createTokens(GOBLIN),
    ),
    room(
      'Mine Tunnels',
      'create a Treasure',
      ['Dark Pool', 'Fungi Cavern'],
      2,
      (game) => void game.createTokens(TREASURE),
    ),
    room(
      'Storeroom',
      'a +1/+1 counter on a creature',
      ['Temple of Dumathoin'],
      2,
      (game) => counterOnBestCreature(game, 1),
    ),
    room(
      'Dark Pool',
      'each opponent loses 1 life, we gain 1',
      ['Temple of Dumathoin'],
      3,
      (game) => {
        eachOpponentLoses(game, 1);
        game.gainLife(1);
      },
    ),
    room(
      'Fungi Cavern',
      'a creature gets -4/-0 (not modelled)',
      ['Temple of Dumathoin'],
      0,
      notModelled,
    ),
    room('Temple of Dumathoin', 'draw a card', [], 4, (game) => game.draw(1)),
  ],
};

export const DUNGEON_OF_THE_MAD_MAGE: Dungeon = {
  name: 'Dungeon of the Mad Mage',
  rooms: [
    room('Yawning Portal', 'gain 1 life', ['Dungeon Level'], 0, (game) =>
      game.gainLife(1),
    ),
    room(
      'Dungeon Level',
      'scry 1',
      ['Goblin Bazaar', 'Twisted Caverns'],
      1,
      (game) => game.scry(1),
    ),
    room(
      'Goblin Bazaar',
      'create a Treasure',
      ['Lost Level'],
      2,
      (game) => void game.createTokens(TREASURE),
    ),
    room(
      'Twisted Caverns',
      "a creature can't attack (not modelled)",
      ['Lost Level'],
      0,
      notModelled,
    ),
    room(
      'Lost Level',
      'scry 2',
      ['Runestone Caverns', "Muiral's Graveyard"],
      1,
      (game) => game.scry(2),
    ),
    // exile the top two, we may play them this turn: counted as drawing them (a little generous)
    room(
      'Runestone Caverns',
      'exile the top two, we may play them (drawn)',
      ['Deep Mines'],
      4,
      (game) => game.draw(2),
    ),
    room(
      "Muiral's Graveyard",
      'create two 1/1 Skeletons',
      ['Deep Mines'],
      3,
      (game) => void game.createTokens(SMALL_SKELETON, 2),
    ),
    room('Deep Mines', 'scry 3', ["Mad Wizard's Lair"], 1, (game) =>
      game.scry(3),
    ),
    room(
      "Mad Wizard's Lair",
      'draw three, cast one of them for free',
      [],
      5,
      drawThreeCastOneFree,
    ),
  ],
};

export const TOMB_OF_ANNIHILATION: Dungeon = {
  name: 'Tomb of Annihilation',
  rooms: [
    room(
      'Trapped Entry',
      'each player loses 1 life',
      ['Veils of Fear', 'Oubliette'],
      0,
      (game) => {
        eachOpponentLoses(game, 1);
        game.loseLife(1);
      },
    ),
    // the opponents discard or sacrifice rather than lose life; we pay the cheapest way
    room(
      'Veils of Fear',
      'each player loses 2 life unless they discard',
      ['Sandfall Cell'],
      0,
      (game) => {
        if (game.hand.length) game.discard(1);
        else game.loseLife(2);
      },
    ),
    room(
      'Sandfall Cell',
      'each player loses 2 life unless they sacrifice a permanent',
      ['Cradle of the Death God'],
      0,
      (game) => game.loseLife(2),
    ),
    room(
      'Oubliette',
      'discard, sacrifice a creature, an artifact and a land',
      ['Cradle of the Death God'],
      -2,
      (game) => {
        if (game.hand.length) game.discard(1);
        sacrificeWorst(game, (permanent) => permanent.card.isCreature);
        sacrificeWorst(game, (permanent) =>
          permanent.card.types.has('artifact'),
        );
        sacrificeWorst(game, (permanent) => permanent.land !== null);
      },
    ),
    room(
      'Cradle of the Death God',
      'create The Atropal, a 4/4 deathtouch',
      [],
      4,
      (game) => void game.createTokens(THE_ATROPAL),
    ),
  ],
};

export const UNDERCITY: Dungeon = {
  name: 'Undercity',
  rooms: [
    room(
      'Secret Entrance',
      'a basic land to hand',
      ['Forge', 'Lost Well'],
      1,
      basicLandToHand,
    ),
    room(
      'Forge',
      'two +1/+1 counters on a creature',
      ['Trap!', 'Arena'],
      2,
      (game) => counterOnBestCreature(game, 2),
    ),
    room('Lost Well', 'scry 2', ['Arena', 'Stash'], 1, (game) => game.scry(2)),
    room('Trap!', 'an opponent loses 5 life', ['Archives'], 3, (game) =>
      opponentClosestToDyingLoses(game, 5),
    ),
    room(
      'Arena',
      'goad a creature (not modelled)',
      ['Archives', 'Catacombs'],
      1,
      notModelled,
    ),
    room(
      'Stash',
      'create a Treasure',
      ['Catacombs'],
      2,
      (game) => void game.createTokens(TREASURE),
    ),
    room('Archives', 'draw a card', ['Throne of the Dead Three'], 3, (game) =>
      game.draw(1),
    ),
    room(
      'Catacombs',
      'create a 4/1 Skeleton with menace',
      ['Throne of the Dead Three'],
      3,
      (game) => void game.createTokens(BIG_SKELETON),
    ),
    room(
      'Throne of the Dead Three',
      'the best creature of the top ten onto the battlefield with three +1/+1 counters',
      [],
      5,
      bestOfTopTenOntoBattlefield,
    ),
  ],
};

/** The dungeons "venture into the dungeon" can enter (Undercity only through the initiative). */
export const DUNGEONS = [
  LOST_MINE_OF_PHANDELVER,
  DUNGEON_OF_THE_MAD_MAGE,
  TOMB_OF_ANNIHILATION,
];
const ALL_DUNGEONS = [...DUNGEONS, UNDERCITY];

export function dungeonNamed(name: string): Dungeon {
  const dungeon = ALL_DUNGEONS.find((each) => each.name === name);
  if (!dungeon) throw new Error(`no dungeon named ${name}`);
  return dungeon;
}

function roomNamed(dungeon: Dungeon, name: string): DungeonRoom {
  const found = dungeon.rooms.find((each) => each.name === name);
  if (!found) throw new Error(`no room ${name} in ${dungeon.name}`);
  return found;
}

// ---------------------------------------------------------------- venture
/** How many times a room ability triggers: Hama Pashar, and Dungeon Delver with our commander out, add one each. */
export function roomTriggerCount(game: GameCore): number {
  let count = 1;
  if (game.isOnBattlefield('Hama Pashar, Ruin Seeker')) count += 1;
  const hasCommanderCreatureOut = game.battlefield.some(
    (permanent) =>
      permanent.card.isCreature &&
      game.commanderNames.includes(permanent.card.name),
  );
  if (game.isOnBattlefield('Dungeon Delver') && hasCommanderCreatureOut)
    count += 1;
  return count;
}

/** Venture into the dungeon (intoUndercity: venture into Undercity, for the initiative). */
export function ventureIntoDungeon(
  game: GameCore,
  intoUndercity = false,
): void {
  let dungeon: Dungeon;
  let next: DungeonRoom;
  if (game.dungeonPosition === null) {
    dungeon = intoUndercity
      ? UNDERCITY
      : dungeonNamed(game.chooseDungeon(DUNGEONS));
    next = dungeon.rooms[0];
  } else {
    dungeon = dungeonNamed(game.dungeonPosition.dungeon);
    const current = roomNamed(dungeon, game.dungeonPosition.room);
    next = game.chooseDungeonRoom(
      current.leadsTo.map((name) => roomNamed(dungeon, name)),
    );
  }
  game.dungeonPosition = { dungeon: dungeon.name, room: next.name };
  game.sayEvent(
    'note',
    `ventures: ${dungeon.name}, ${next.name}: ${next.text}`,
  );
  const triggers = roomTriggerCount(game);
  for (let i = 0; i < triggers; i++) next.act(game);
  if (next.leadsTo.length === 0) {
    game.dungeonPosition = null;
    game.completedDungeons += 1;
    game.say(`  completes ${dungeon.name}`);
  }
}

/** The default choice of path: the room worth the most (the first one on a tie). */
export function bestRoom(rooms: DungeonRoom[]): DungeonRoom {
  return firstMax(rooms, (each) => each.value);
}

// ---------------------------------------------------------------- what cards say
/** "When this creature enters, venture into the dungeon" (also "enters or attacks": Nadaar). */
export function venturesOnEnter(card: CardDef): boolean {
  return /When(?:ever)? [^.\n]*\benters\b[^.\n]*, venture into the dungeon/.test(
    card.oracle,
  );
}

/** "When this enchantment enters, you take the initiative." */
export function takesInitiativeOnEnter(card: CardDef): boolean {
  return /When(?:ever)? [^.\n]*\benters\b[^.\n]*, you take the initiative/.test(
    card.oracle,
  );
}
