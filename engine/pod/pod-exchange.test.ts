/**
 * Checks of Volatile Stormdrake's exchange of control in a pod, on a hand-built table: what it takes, the energy,
 * where a taken card goes when it leaves the battlefield, the log's boards, and a player leaving the game.
 * Run: npm run pod -- --test
 */
import * as C from '../cards/cards';
import { Game } from '../game/game';
import { Permanent } from '../game/game-types';
import { boardAt } from '../../shared/game-log-board';
import { Deck } from '../run/runner';
import { podSpec, seatPlayers } from './pod';

const MIKE = 0;
const MEREN = 1;
const STORMDRAKE = 'Volatile Stormdrake';
const PRIMORDIAL = 'Sepulchral Primordial';

/** Puts a card onto a player's battlefield, ready to attack. */
function putOnBattlefield(game: Game<unknown>, cardName: string): Permanent {
  const permanent = new Permanent(C.get(cardName));
  permanent.sick = false;
  game.putOntoBattlefield(permanent);
  return permanent;
}

const namesOnBattlefield = (game: Game<unknown>) =>
  game.battlefield.map((permanent) => permanent.card.name).sort();

export function runControlExchangeTests(
  allDecks: Record<string, Deck>,
): boolean {
  const spec = podSpec(allDecks, ['mike', 'meren', 'gale', 'aesi'], 17, {});
  const table = seatPlayers(allDecks, spec, 1, true);
  const mike = table.games[MIKE];
  const meren = table.games[MEREN];
  table.threats[MEREN] = 100; // Meren is the biggest threat: its creatures are taken
  table.startTurnLog(MIKE);
  table.refreshView(MIKE);
  const checks: [string, unknown, unknown][] = [];
  const check = (label: string, actual: unknown, expected: unknown) =>
    checks.push([label, actual, expected]);

  // with 4 energy, Eternal Witness (worth 68, mana value 3: kept) beats Grave Titan (worth 102, mana value 6:
  // it would die); Invisible Stalker has hexproof
  putOnBattlefield(meren, 'Invisible Stalker');
  putOnBattlefield(meren, 'Grave Titan');
  putOnBattlefield(meren, 'Eternal Witness');
  mike.enter(C.get(STORMDRAKE), 'hand');
  check('a creature we can keep is taken first', namesOnBattlefield(mike), [
    'Eternal Witness',
  ]);
  check('energy after keeping Eternal Witness', mike.energyCounters, 1);

  // only Grave Titan is left to take (the Stormdrake on Meren's side has hexproof): 5 energy is too little, it
  // dies and goes to its owner's graveyard
  mike.enter(C.get(STORMDRAKE), 'hand');
  check('energy kept when the creature costs too much', mike.energyCounters, 5);
  check(
    "a sacrificed Grave Titan goes to its owner's graveyard",
    [
      meren.graveyard.some((card) => card.name === 'Grave Titan'),
      mike.graveyard.some((card) => card.name === 'Grave Titan'),
    ],
    [true, false],
  );

  // the energy saved counts: 5 + 4 pays for Sepulchral Primordial's 7
  putOnBattlefield(meren, PRIMORDIAL);
  mike.enter(C.get(STORMDRAKE), 'hand');
  const takenPrimordial = mike.findPermanent(PRIMORDIAL);
  check('energy after keeping Sepulchral Primordial', mike.energyCounters, 2);
  check("Mike's battlefield", namesOnBattlefield(mike), [
    'Eternal Witness',
    PRIMORDIAL,
  ]);
  check("Meren's battlefield", namesOnBattlefield(meren), [
    'Invisible Stalker',
    STORMDRAKE,
    STORMDRAKE,
    STORMDRAKE,
  ]);
  check(
    'the taken creature keeps its owner',
    takenPrimordial?.owner === meren,
    true,
  );
  const merenSlot = table.opponentsOf[MIKE].indexOf(MEREN);
  const attack = mike.arena!.fight(
    mike,
    merenSlot,
    [mike.fighter(takenPrimordial!)],
    false,
  );
  check(
    'the taken creature attacks for Mike',
    attack.rows.map((row) => row.attacker.name),
    [PRIMORDIAL],
  );

  // the log's boards follow the exchange, and every move was recorded when it happened
  table.sayAs(MIKE, 'exchanges done');
  const boardsAfterExchange = boardAt(
    table.gameLog(),
    table.gameLog().events.length - 1,
  );
  const boardNames = (player: number) =>
    boardsAfterExchange[player].battlefield.map((permanent) => permanent.name);
  check('log board: Mike', boardNames(MIKE).sort(), [
    'Eternal Witness',
    PRIMORDIAL,
  ]);
  check('log board: Meren', boardNames(MEREN).sort(), [
    'Invisible Stalker',
    STORMDRAKE,
    STORMDRAKE,
    STORMDRAKE,
  ]);
  check("log board: Meren's graveyard", boardsAfterExchange[MEREN].graveyard, [
    'Grave Titan',
  ]);
  check('log board: energy', boardsAfterExchange[MIKE].playerCounters, {
    energy: 2,
  });

  // Mike leaves the game: Meren gets its creatures back, the Stormdrakes leave with Mike
  table.eliminate(MIKE, 'test');
  check("Meren's battlefield after Mike left", namesOnBattlefield(meren), [
    'Eternal Witness',
    'Invisible Stalker',
    PRIMORDIAL,
  ]);
  check(
    'Meren owns its creatures again',
    meren.battlefield.map((permanent) => permanent.owner),
    [null, null, null],
  );
  const unrecordedMoves = table.games.flatMap(
    (game) => game.unrecordedCardMoves,
  );
  check('moves not recorded when they happened', unrecordedMoves, []);

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
    `${isGood ? 'OK ' : 'BAD'} Volatile Stormdrake's exchange of control: ${wrong.length} wrong`,
  );
  for (const difference of wrong) console.log(`      ${difference}`);
  return isGood;
}
