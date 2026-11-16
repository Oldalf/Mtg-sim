/**
 * Checks of dungeons, venture and the initiative (dungeons.ts): the rooms in order with the default path, a
 * completed dungeon, Hama Pashar doubling a room, the initiative venturing into Undercity at once and at the
 * upkeep, the card texts that venture or take the initiative, and in a pod, combat damage to the holder taking it.
 * Run: npm run pod -- --test
 */
import * as C from '../cards/cards';
import { Rng } from '../util/rng';
import { Deck } from '../run/runner';
import { podSpec, seatPlayers } from '../pod/pod';
import { Permanent } from './game-types';
import {
  takesInitiativeOnEnter,
  ventureIntoDungeon,
  venturesOnEnter,
} from './dungeons';

const VETERAN_DUNGEONEER = new C.CardDef('Veteran Dungeoneer', {
  mana_cost: '{3}{W}',
  type_line: 'Creature — Human Warrior',
  oracle:
    'When this creature enters, venture into the dungeon. (Enter the first room or advance to the next room.)',
  power: '3',
  toughness: '4',
});
const NADAAR = new C.CardDef('Nadaar, Selfless Paladin', {
  mana_cost: '{2}{W}',
  type_line: 'Legendary Creature — Dragon Knight',
  oracle:
    "Vigilance\nWhenever Nadaar enters or attacks, venture into the dungeon. (Enter the first room or advance to the next room.)\nOther creatures you control get +1/+1 as long as you've completed a dungeon.",
  power: '3',
  toughness: '3',
});
const WHITE_PLUME_ADVENTURER = new C.CardDef('White Plume Adventurer', {
  mana_cost: '{2}{W}',
  type_line: 'Creature — Orc Cleric',
  oracle:
    "When this creature enters, you take the initiative.\nAt the beginning of each opponent's upkeep, untap a creature you control. If you've completed a dungeon, untap all creatures you control instead.",
  power: '3',
  toughness: '3',
});
const HAMA_PASHAR = new C.CardDef('Hama Pashar, Ruin Seeker', {
  mana_cost: '{1}{W}{U}',
  type_line: 'Legendary Creature — Human Wizard',
  oracle: 'Room abilities of dungeons you own trigger an additional time.',
  power: '2',
  toughness: '3',
});

function newGame(allDecks: Record<string, Deck>) {
  const deck = allDecks.goldfish;
  return new deck.Game(
    [],
    new Array(60).fill('Island'),
    new Rng(1),
    { ...deck.config },
    false,
  );
}

function putOnBattlefield(
  game: ReturnType<typeof newGame>,
  card: C.CardDef,
): Permanent {
  const permanent = new Permanent(card, card.land);
  permanent.sick = false;
  game.putOntoBattlefield(permanent);
  return permanent;
}

const goblins = (game: ReturnType<typeof newGame>) =>
  game.battlefield.filter((permanent) => permanent.card.name === 'Goblin')
    .length;

export function runDungeonTests(allDecks: Record<string, Deck>): boolean {
  const checks: [string, unknown, unknown][] = [];
  const check = (label: string, actual: unknown, expected: unknown) =>
    checks.push([label, actual, expected]);

  {
    const game = newGame(allDecks);
    ventureIntoDungeon(game);
    check('first venture: Lost Mine, Cave Entrance', game.dungeonPosition, {
      dungeon: 'Lost Mine of Phandelver',
      room: 'Cave Entrance',
    });
    ventureIntoDungeon(game);
    check(
      'then the Goblin Lair (a token beats a Treasure)',
      [game.dungeonPosition?.room, goblins(game)],
      ['Goblin Lair', 1],
    );
    const lifeBefore = game.life.slice();
    ventureIntoDungeon(game);
    check(
      'then the Dark Pool: each opponent loses 1',
      game.life.map((life, i) => lifeBefore[i] - life),
      [1, 1, 1],
    );
    const handBefore = game.hand.length;
    ventureIntoDungeon(game);
    check(
      'the Temple of Dumathoin draws a card and completes the dungeon',
      [
        game.hand.length - handBefore,
        game.dungeonPosition,
        game.completedDungeons,
      ],
      [1, null, 1],
    );
  }
  {
    const game = newGame(allDecks);
    putOnBattlefield(game, HAMA_PASHAR);
    ventureIntoDungeon(game);
    ventureIntoDungeon(game);
    check('Hama Pashar: the Goblin Lair makes two Goblins', goblins(game), 2);
  }
  {
    const game = newGame(allDecks);
    const handBefore = game.hand.length;
    game.takeInitiative();
    check(
      'the initiative: Undercity, Secret Entrance (a basic land to hand)',
      [
        game.hasInitiative,
        game.dungeonPosition?.room,
        game.hand.length - handBefore,
      ],
      [true, 'Secret Entrance', 1],
    );
    game.upkeepTriggersOfTheGame();
    check(
      'at the upkeep its holder ventures again',
      game.dungeonPosition?.dungeon === 'Undercity' &&
        game.dungeonPosition?.room !== 'Secret Entrance',
      true,
    );
  }
  {
    check(
      'Veteran Dungeoneer ventures as it enters (its text)',
      venturesOnEnter(VETERAN_DUNGEONEER),
      true,
    );
    check(
      'Nadaar ventures as it enters or attacks',
      venturesOnEnter(NADAAR),
      true,
    );
    check(
      'White Plume Adventurer takes the initiative',
      [
        takesInitiativeOnEnter(WHITE_PLUME_ADVENTURER),
        venturesOnEnter(WHITE_PLUME_ADVENTURER),
      ],
      [true, false],
    );
    const game = newGame(allDecks);
    game.enter(VETERAN_DUNGEONEER);
    check(
      'a Veteran Dungeoneer entering ventures',
      game.dungeonPosition?.room,
      'Cave Entrance',
    );
  }
  {
    // Throne of the Dead Three puts a Veteran Dungeoneer onto the battlefield: its venture, from the last room,
    // completes Undercity and starts Lost Mine
    const game = newGame(allDecks);
    game.library = [VETERAN_DUNGEONEER, ...game.library];
    game.dungeonPosition = { dungeon: 'Undercity', room: 'Archives' };
    ventureIntoDungeon(game, true);
    check(
      'a venture from the last room: that dungeon is completed, a new one starts',
      [game.completedDungeons, game.dungeonPosition],
      [1, { dungeon: 'Lost Mine of Phandelver', room: 'Cave Entrance' }],
    );
  }
  {
    // a pod: Meren deals combat damage to Mike, who has the initiative, and takes it
    const MIKE = 0;
    const MEREN = 1;
    const spec = podSpec(allDecks, ['mike', 'meren', 'gale', 'aesi'], 17, {
      pod_answers: false,
    });
    const table = seatPlayers(allDecks, spec, 1, false);
    table.takeInitiative(MIKE);
    table.startTurnLog(MEREN);
    table.refreshView(MEREN);
    const meren = table.games[MEREN];
    const witness = new Permanent(C.get('Eternal Witness'));
    witness.sick = false;
    meren.putOntoBattlefield(witness);
    meren.arenaCombat([witness]);
    check(
      'combat damage to the holder takes the initiative',
      [table.games[MEREN].hasInitiative, table.games[MIKE].hasInitiative],
      [true, false],
    );
  }
  {
    // the initiative's holder leaves the game on Meren's turn: Meren takes it and ventures (rule 726.4)
    const MIKE = 0;
    const MEREN = 1;
    const spec = podSpec(allDecks, ['mike', 'meren', 'gale', 'aesi'], 17, {
      pod_answers: false,
    });
    const table = seatPlayers(allDecks, spec, 1, false);
    table.takeInitiative(MIKE);
    table.startTurnLog(MEREN);
    table.refreshView(MEREN);
    table.eliminate(MIKE, 'test');
    check(
      'the holder leaves on Meren’s turn: Meren takes the initiative and ventures',
      [
        table.games[MEREN].hasInitiative,
        table.games[MIKE].hasInitiative,
        table.games[MEREN].dungeonPosition?.dungeon,
      ],
      [true, false, 'Undercity'],
    );
    // the active player is the one leaving: the next player in turn order takes it
    const secondTable = seatPlayers(allDecks, spec, 1, false);
    secondTable.takeInitiative(MEREN);
    secondTable.startTurnLog(MEREN);
    secondTable.eliminate(MEREN, 'test');
    const next = secondTable.opponentsOf[MEREN][0];
    check(
      'the active player holding it leaves: the next player in turn order takes it',
      secondTable.games.map((game) => game.hasInitiative),
      secondTable.games.map((_, player) => player === next),
    );
  }
  {
    // the rooms that hit a creature: Mike's Eternal Witness is the only target
    const MIKE = 0;
    const MEREN = 1;
    const spec = podSpec(allDecks, ['mike', 'meren', 'gale', 'aesi'], 17, {
      pod_answers: false,
    });
    const table = seatPlayers(allDecks, spec, 1, false);
    const witness = new Permanent(C.get('Eternal Witness'));
    table.games[MIKE].putOntoBattlefield(witness);
    table.startTurnLog(MEREN);
    table.refreshView(MEREN);
    const meren = table.games[MEREN];
    const mikeSlot = table.opponentsOf[MEREN].indexOf(MIKE);
    meren.podGoadBestCreature();
    check('Arena goads it', table.goaders.has(witness), true);
    meren.podWeakenBestCreature(4);
    check('Fungi Cavern: -4/-0', witness.powerMod, -4);
    meren.podStopBestCreatureAttackingUs();
    check(
      "Twisted Caverns: it can't attack Meren",
      table.forbiddenAttackSlots(MIKE, witness),
      [table.opponentsOf[MIKE].indexOf(MEREN)],
    );
    check('(Mike is the slot Meren sees)', mikeSlot >= 0, true);
    table.prepareTurn(MEREN);
    check(
      "at Meren's next turn all three end",
      [
        table.goaders.has(witness),
        witness.powerMod,
        table.forbiddenAttackSlots(MIKE, witness),
      ],
      [false, 0, []],
    );
  }

  const wrong = checks
    .map(([label, actual, expected]) => [
      label,
      JSON.stringify(actual),
      JSON.stringify(expected),
    ])
    .filter(([, actual, expected]) => actual !== expected)
    .map(
      ([label, actual, expected]) =>
        `${label}: ${actual}, expected ${expected}`,
    );
  const isGood = wrong.length === 0;
  console.log(
    `${isGood ? 'OK ' : 'BAD'} dungeons and the initiative: ${wrong.length} wrong of ${checks.length}`,
  );
  for (const difference of wrong) console.log(`      ${difference}`);
  return isGood;
}
